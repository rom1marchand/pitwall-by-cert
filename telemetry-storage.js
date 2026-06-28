// telemetry-storage.js
// Renderer-side wrapper around the Electron IPC bridge for local .pwtel files.
//
// Files live under: <userData>/pitwall/telemetry/<lineup_id>/<recording_id>.pwtel
// Each file = UTF-8 JSON matching TelemetryBuffer.snapshot() + { meta: {...} }.
//
// Usage (renderer):
//   const rec = await TelemetryStorage.save(lineupId, snapshot, { name, track, car })
//   const list = await TelemetryStorage.list(lineupId)
//   const data = await TelemetryStorage.load(lineupId, recId)
//   await TelemetryStorage.remove(lineupId, recId)

;(function (root) {
  'use strict'

  const api = (root.electronAPI && root.electronAPI.telemetry) || null

  function _ensure() {
    if (!api) throw new Error('TelemetryStorage: electronAPI.telemetry bridge not available')
  }

  function _genId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let s = 'rec_'
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  const TelemetryStorage = {
    /**
     * Save a snapshot locally.
     * @param {string} lineupId
     * @param {object} snapshot  result of TelemetryBuffer.snapshot()
     * @param {object} meta      { name, track, car, recId? }
     * @returns {Promise<{id, path, size_bytes}>}
     */
    async save(lineupId, snapshot, meta = {}) {
      _ensure()
      if (!lineupId) throw new Error('lineupId required')
      const recId = meta.recId || _genId()
      const payload = {
        ...snapshot,
        meta: {
          name:  meta.name  || snapshot.name  || 'Recording',
          track: meta.track || snapshot.track || '',
          car:   meta.car   || snapshot.car   || '',
          saved_at: Date.now(),
        },
      }
      const json = JSON.stringify(payload)
      return api.save({ lineupId, recId, json })
    },

    /** List all local recordings for a lineup (metadata only, no samples). */
    async list(lineupId) {
      _ensure()
      return api.list({ lineupId })
    },

    /** Load the full recording JSON. */
    async load(lineupId, recId) {
      _ensure()
      const json = await api.load({ lineupId, recId })
      return JSON.parse(json)
    },

    /** Delete a local recording file. */
    async remove(lineupId, recId) {
      _ensure()
      return api.remove({ lineupId, recId })
    },

    /** Import an arbitrary raw buffer (e.g. .pwtel received via VPS download). */
    async importRaw(lineupId, recId, bytes) {
      _ensure()
      return api.importRaw({ lineupId, recId, bytes })
    },

    /** Return the absolute folder path where telemetry is stored (for display). */
    async getDir() {
      _ensure()
      return api.getDir()
    },

    /**
     * NEW: Parse a MoTeC .ld/.ldx file via the Electron main process
     * (no more HTTP call to localhost:5000). The main process spawns the
     * Python ldparser as a short-lived subprocess and returns a snapshot-
     * compatible object identical to TelemetryBuffer.snapshot().
     *
     * Requires preload.js to expose `electronAPI.telemetry.parseMotec` and
     * main.js to register the `telemetry:parseMotec` IPC handler.
     *
     * @param {ArrayBuffer|Uint8Array} buffer  raw file contents
     * @param {string} filename                original file name (for suffix detection)
     * @returns {Promise<object>}              parsed snapshot
     */
    async parseMotec(buffer, filename) {
      _ensure()
      if (!api.parseMotec) throw new Error('TelemetryStorage: parseMotec bridge not wired up in preload.js')
      // Normalize to Uint8Array before crossing the IPC boundary — ArrayBuffer
      // survives structured clone, but some Electron versions clone slowly; the
      // view keeps the payload compact and lets main pass it straight to Python.
      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
      return api.parseMotec({ bytes, filename })
    },
  }

  root.TelemetryStorage = TelemetryStorage
})(typeof window !== 'undefined' ? window : globalThis)
