// telemetry-buffer.js
// Rolling buffer of the last N laps worth of driver samples, fed by the WS stream.
//
// Usage:
//   const buf = new TelemetryBuffer({ keepLaps: 3 })
//   const handlers = buf.wrap({
//     onSession(s) { ... },
//     onDriver(d)  { ... },
//     onEvent(ev, data) { ... },
//   })
//   socket = new LocalSocket(handlers)  // or PitwallSocket
//
//   // Later:
//   const snapshot = buf.snapshot()   // { laps, track, car, startedAt, sampleCount }
//   buf.reset()

;(function (root) {
  'use strict'

  // Fields we store per sample (subset of driver payload).
  // Keep narrow to control file size — 100 MB cap on upload.
  const SAMPLE_FIELDS = [
    'speed_kmh', 'rpm', 'throttle', 'brake', 'gear',
    'steering', 'fuel_liters', 'virtual_energy',
    'tyre_temp_fl', 'tyre_temp_fr', 'tyre_temp_rl', 'tyre_temp_rr',
    'in_pits', 'pit_limiter', 'abs_active', 'tc_active',
    'pos_x', 'pos_y', 'pos_z', 'lap_distance',
  ]

  class TelemetryBuffer {
    constructor(opts = {}) {
      this.keepLaps     = opts.keepLaps || 3
      this.sampleHzCap  = opts.sampleHzCap || 30 // throttle samples to ~30 Hz
      this._lastT       = 0
      this._startedAt   = Date.now()
      this._currentLap  = null   // lap number of the lap currently being recorded
      this._laps        = []     // [{ lap_num, samples: [...] }], oldest first
      this._meta        = { track: '', car: '', session_type: '' }
    }

    reset() {
      this._lastT      = 0
      this._startedAt  = Date.now()
      this._currentLap = null
      this._laps       = []
      this._meta       = { track: '', car: '', session_type: '' }
    }

    // Wrap an existing handlers object so our buffer taps into driver/session/event
    // without replacing the consumer's logic.
    wrap(handlers = {}) {
      const self = this
      return {
        ...handlers,
        onSession(s) {
          if (s) {
            if (s.track)        self._meta.track        = s.track
            if (s.session_type) self._meta.session_type = s.session_type
            if (s.car)          self._meta.car          = s.car
          }
          if (handlers.onSession) handlers.onSession(s)
        },
        onDriver(d) {
          self._ingestDriver(d)
          if (handlers.onDriver) handlers.onDriver(d)
        },
        onEvent(evt, data) {
          if (evt === 'new_lap') self._rollLap(data)
          if (handlers.onEvent) handlers.onEvent(evt, data)
        },
      }
    }

    _ingestDriver(d) {
      if (!d || typeof d !== 'object') return
      const now = performance.now()
      // Throttle to ~sampleHzCap
      const minDt = 1000 / this.sampleHzCap
      if (this._lastT && (now - this._lastT) < minDt) return
      this._lastT = now

      // Ensure we have a current lap bucket
      if (this._currentLap === null) {
        const lapNum = typeof d.lap_number === 'number' ? d.lap_number : 0
        this._currentLap = lapNum
        this._laps.push({ lap_num: lapNum, samples: [] })
      }

      const lap = this._laps[this._laps.length - 1]
      const sample = { t: Math.round(now - this._startedAt) } // ms since buffer start
      for (const k of SAMPLE_FIELDS) {
        if (k in d) sample[k] = d[k]
      }
      lap.samples.push(sample)
    }

    _rollLap(data) {
      const newLapNum = (data && typeof data.lap_number === 'number')
        ? data.lap_number
        : (this._currentLap !== null ? this._currentLap + 1 : 1)
      this._currentLap = newLapNum
      this._laps.push({ lap_num: newLapNum, samples: [] })
      // Drop oldest lap(s) if we exceed keepLaps
      while (this._laps.length > this.keepLaps) this._laps.shift()
    }

    // Current snapshot (safe to JSON.stringify). Does NOT reset the buffer.
    snapshot() {
      const sampleCount = this._laps.reduce((a, l) => a + l.samples.length, 0)
      // Approximate duration: from first sample of oldest lap to last sample of newest
      let durationMs = 0
      const firstLap = this._laps[0]
      const lastLap  = this._laps[this._laps.length - 1]
      if (firstLap && firstLap.samples.length && lastLap && lastLap.samples.length) {
        durationMs = lastLap.samples[lastLap.samples.length - 1].t - firstLap.samples[0].t
      }
      return {
        version:      1,
        startedAt:    this._startedAt,
        track:        this._meta.track,
        car:          this._meta.car,
        session_type: this._meta.session_type,
        lap_count:    this._laps.length,
        sample_count: sampleCount,
        duration_sec: durationMs / 1000,
        laps:         this._laps.map(l => ({ lap_num: l.lap_num, samples: l.samples.slice() })),
      }
    }

    get laps()        { return this._laps }
    get currentLap()  { return this._currentLap }
    get sampleCount() { return this._laps.reduce((a, l) => a + l.samples.length, 0) }
  }

  root.TelemetryBuffer = TelemetryBuffer
})(typeof window !== 'undefined' ? window : globalThis)
