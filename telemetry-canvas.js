// telemetry-canvas.js
// Low-level canvas primitives for MoTeC-style telemetry rendering.
// Pure canvas 2D — no Chart.js, no SVG. Designed to stay fast with
// tens of thousands of samples, using simple polyline decimation.

;(function (root) {
  'use strict'

  const COLORS = {
    bg:        '#0a0a0a',
    grid:      '#1a1a1a',
    gridMajor: '#222',
    axis:      '#444',
    tick:      '#555',
    text:      '#888',
    lime:      '#C8FF00',
    blue:      '#3b8fff',
    red:       '#ff3b3b',
    orange:    '#ff8c00',
    white:     '#e8e8e8',
    muted:     '#555',
  }

  // Default palette for up to 6 laps (newest first)
  const LAP_COLORS = [
    '#C8FF00',  // lime  — current / newest
    '#3b8fff',  // blue
    '#ff8c00',  // orange
    '#ff3b3b',  // red
    '#a855f7',  // purple
    '#6b7280',  // muted
  ]

  // ─── DPI HELPERS ──────────────────────────────────────────────────────────
  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width  = Math.max(1, Math.round(rect.width  * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { ctx, w: rect.width, h: rect.height, dpr }
  }

  // FIX: always erase first with clearRect(), THEN repaint the background.
  // The old version used only fillRect(), which — when called with a fully-
  // transparent colour like 'rgba(0,0,0,0)' — draws nothing and leaves
  // previous pixels intact. That made the overlay canvas (used for the
  // cursor bar) accumulate every past draw into a ghost trail.
  //
  // Callers:
  //   clear(ctx, w, h)                    → clear + repaint default bg
  //   clear(ctx, w, h, COLORS.bg)         → clear + repaint given bg
  //   clear(ctx, w, h, 'rgba(0,0,0,0)')   → clear only (transparent overlay)
  function clear(ctx, w, h, color) {
    ctx.clearRect(0, 0, w, h)
    const fill = (color === undefined) ? COLORS.bg : color
    if (!fill) return
    // Skip the fill when the caller explicitly requested a transparent wipe.
    if (fill === 'transparent' || /rgba?\([^)]*,\s*0(\.0+)?\s*\)$/i.test(fill)) return
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, w, h)
  }

  // ─── AXES ─────────────────────────────────────────────────────────────────
  // Draws grid + Y labels. X labels are left to the caller (per-chart format).
  function drawGrid(ctx, box, opts) {
    const { x, y, w, h } = box
    const yMin = opts.yMin
    const yMax = opts.yMax
    const xMin = opts.xMin ?? 0
    const xMax = opts.xMax ?? 1
    const yTicks = opts.yTicks || 4
    const xTicks = opts.xTicks || 6

    ctx.save()
    ctx.font      = '10px "Barlow Condensed", sans-serif'
    ctx.fillStyle = COLORS.text
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 1

    // Horizontal grid lines
    for (let i = 0; i <= yTicks; i++) {
      const t  = i / yTicks
      const yy = y + h - t * h + 0.5
      ctx.beginPath()
      ctx.moveTo(x, yy)
      ctx.lineTo(x + w, yy)
      ctx.stroke()
      if (opts.yLabels !== false) {
        const val = yMin + t * (yMax - yMin)
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(opts.fmtY ? opts.fmtY(val) : Math.round(val), x - 4, yy)
      }
    }

    // Vertical grid lines
    for (let i = 0; i <= xTicks; i++) {
      const t  = i / xTicks
      const xx = x + t * w + 0.5
      ctx.beginPath()
      ctx.moveTo(xx, y)
      ctx.lineTo(xx, y + h)
      ctx.stroke()
    }

    // Frame
    ctx.strokeStyle = COLORS.axis
    ctx.strokeRect(x + 0.5, y + 0.5, w, h)
    ctx.restore()
  }

  // ─── TRACE (polyline) ─────────────────────────────────────────────────────
  // Renders a time-series (or distance-series) trace. Samples: [{x, y}].
  //
  // FIX: replaced the naive stride-based decimation (step = floor(N / 2w))
  // with a Min/Max per-pixel decimation. The old algorithm produced aliasing
  // and silently dropped peaks (suspension spikes, gear changes, etc.).
  //
  // Min/Max algo:
  //   - Walk samples in order, bucket by pixel column (floor(toX(s.x))).
  //   - In each bucket, track both yMin and yMax (px space).
  //   - When the bucket changes, draw a vertical line between yMin and yMax
  //     at the previous bucket's column — this preserves the visual envelope.
  //   - Connect across buckets with a lineTo to bucket's midpoint-ish Y.
  // Result : every peak that exists in the samples shows up on screen, even
  // with hundreds of samples per pixel.
  function drawTrace(ctx, box, samples, opts) {
    if (!samples || samples.length < 2) return
    const { x, y, w, h } = box
    const xMin = opts.xMin
    const xMax = opts.xMax
    const yMin = opts.yMin
    const yMax = opts.yMax
    const color = opts.color || COLORS.lime
    const lineWidth = opts.lineWidth ?? 1.3
    const dashed = !!opts.dashed
    const stepped = !!opts.stepped

    ctx.save()
    // clip
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()

    ctx.strokeStyle = color
    ctx.lineWidth   = lineWidth
    if (dashed) ctx.setLineDash([4, 3])

    const sx = w / (xMax - xMin || 1)
    const sy = h / (yMax - yMin || 1)
    const toX = (v) => x + (v - xMin) * sx
    const toY = (v) => y + h - (v - yMin) * sy

    // ── Pick rendering strategy ──────────────────────────────────────────
    // Few samples → classic polyline (cheaper, preserves exact vertex shape).
    // Many samples → Min/Max decimation to avoid aliasing / missed peaks.
    const useMinMax = samples.length > w * 2 && !stepped
    ctx.beginPath()

    if (!useMinMax) {
      // NEW: legacy path — render every sample (or every-Nth for stepped)
      // without lossy stride; this path is only hit when samples are sparse.
      let started = false
      let prevY = 0
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        if (s.x < xMin || s.x > xMax) continue
        const px = toX(s.x)
        const py = toY(s.y)
        if (!started) { ctx.moveTo(px, py); started = true }
        else if (stepped) { ctx.lineTo(px, prevY); ctx.lineTo(px, py) }
        else              { ctx.lineTo(px, py) }
        prevY = py
      }
    } else {
      // NEW: Min/Max decimation — one vertical segment per pixel column.
      let curBucket = -1
      let curMin = Infinity, curMax = -Infinity
      let curFirstPy = 0        // first py encountered in the bucket (for continuity)
      let curLastPy  = 0        // last  py encountered in the bucket
      let started = false

      // Emit helper: draws the accumulated bucket and leaves the path pen
      // at the bucket's LAST py (so the next bucket's first sample connects
      // visually without a stray diagonal across empty pixels).
      const flushBucket = () => {
        if (curBucket < 0 || curMin === Infinity) return
        if (!started) {
          ctx.moveTo(curBucket, curFirstPy)
          started = true
        } else {
          // Connect from previous bucket's last py to this bucket's first py.
          ctx.lineTo(curBucket, curFirstPy)
        }
        // Vertical line covering min..max, ensuring spikes are visible.
        if (curMin !== curMax) {
          ctx.lineTo(curBucket, curMin)
          ctx.lineTo(curBucket, curMax)
        }
        // Leave pen on the bucket's last-in-time py so continuity is preserved.
        ctx.lineTo(curBucket, curLastPy)
      }

      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        if (s.x < xMin) continue
        if (s.x > xMax) break
        const bucket = Math.floor(toX(s.x))
        const py = toY(s.y)
        if (bucket !== curBucket) {
          flushBucket()
          curBucket  = bucket
          curMin     = py
          curMax     = py
          curFirstPy = py
          curLastPy  = py
        } else {
          if (py < curMin) curMin = py
          if (py > curMax) curMax = py
          curLastPy = py
        }
      }
      flushBucket()
    }

    ctx.stroke()
    ctx.restore()
  }

  // ─── CROSSHAIR ────────────────────────────────────────────────────────────
  // NEW: now draws a MoTeC-style persistent cursor bar (solid by default,
  // thicker, higher opacity). Pass { dashed: true } for the old hover look.
  function drawCrosshair(ctx, box, px, opts) {
    if (px < box.x || px > box.x + box.w) return
    ctx.save()
    ctx.strokeStyle = opts?.color || 'rgba(255,221,0,.85)'
    ctx.lineWidth = opts?.width || 1.5
    if (opts?.dashed) ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(px + 0.5, box.y)
    ctx.lineTo(px + 0.5, box.y + box.h)
    ctx.stroke()
    ctx.restore()
  }

  // ─── LABEL / TITLE ────────────────────────────────────────────────────────
  function drawLabel(ctx, x, y, text, opts) {
    ctx.save()
    ctx.font = opts?.font || '9px "Barlow Condensed", sans-serif'
    ctx.fillStyle = opts?.color || COLORS.text
    ctx.textAlign = opts?.align || 'left'
    ctx.textBaseline = opts?.baseline || 'top'
    if (opts?.letterSpacing) ctx.letterSpacing = opts.letterSpacing
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  // ─── TRACK MAP (XY projection) ────────────────────────────────────────────
  function drawTrackMap(ctx, box, samples, opts) {
    if (!samples || samples.length < 2) return
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const s of samples) {
      if (s.pos_x < minX) minX = s.pos_x
      if (s.pos_x > maxX) maxX = s.pos_x
      if (s.pos_z < minZ) minZ = s.pos_z
      if (s.pos_z > maxZ) maxZ = s.pos_z
    }
    const spanX = maxX - minX || 1
    const spanZ = maxZ - minZ || 1
    const pad = 8
    const w2 = box.w - pad * 2
    const h2 = box.h - pad * 2
    const scale = Math.min(w2 / spanX, h2 / spanZ)
    const ox = box.x + pad + (w2 - spanX * scale) / 2
    const oy = box.y + pad + (h2 - spanZ * scale) / 2

    ctx.save()
    ctx.strokeStyle = opts?.color || COLORS.lime
    ctx.lineWidth = opts?.lineWidth || 1.4
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      const px = ox + (s.pos_x - minX) * scale
      const py = oy + (s.pos_z - minZ) * scale
      if (i === 0) ctx.moveTo(px, py)
      else         ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Optional "current position" marker
    if (opts?.markerIdx != null && samples[opts.markerIdx]) {
      const s = samples[opts.markerIdx]
      const px = ox + (s.pos_x - minX) * scale
      const py = oy + (s.pos_z - minZ) * scale
      ctx.fillStyle = opts.markerColor || COLORS.red
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // ─── RANGE UTILS ──────────────────────────────────────────────────────────
  function autoRange(samples, key, opts = {}) {
    if (!samples || !samples.length) return [0, 1]
    let lo = Infinity, hi = -Infinity
    for (const s of samples) {
      const v = s[key]
      if (v == null || Number.isNaN(v)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (lo === Infinity) return [0, 1]
    if (opts.padPct) {
      const pad = (hi - lo) * opts.padPct
      lo -= pad; hi += pad
    }
    if (opts.floor != null) lo = Math.min(lo, opts.floor)
    if (opts.ceil  != null) hi = Math.max(hi, opts.ceil)
    if (hi === lo) hi = lo + 1
    return [lo, hi]
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────
  root.TelemetryCanvas = {
    COLORS,
    LAP_COLORS,
    fitCanvas,
    clear,
    drawGrid,
    drawTrace,
    drawCrosshair,
    drawLabel,
    drawTrackMap,
    autoRange,
  }
})(typeof window !== 'undefined' ? window : globalThis)
