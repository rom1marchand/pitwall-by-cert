// telemetry-vps.js
// Thin client for the VPS telemetry API (recordings + annotations).
// Depends on the global API constant and Auth (from pitwall.js).

;(function (root) {
  'use strict'

  const API_BASE = (typeof root.API === 'string' && root.API) || 'https://pitwall.cert-team.fr'

  function _token() {
    return (root.Auth && root.Auth.getToken && root.Auth.getToken()) || ''
  }

  async function _json(res) {
    const txt = await res.text()
    try { return JSON.parse(txt) } catch { return { raw: txt } }
  }

  const TelemetryVPS = {
    // ── Recordings ──
    async list(lineupId) {
      const url = `${API_BASE}/api/telemetry/list?lineup_id=${encodeURIComponent(lineupId)}&token=${encodeURIComponent(_token())}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`list failed: HTTP ${res.status}`)
      return res.json()   // { recordings: [...], quota: {used, limit} }
    },

    /**
     * Upload a recording to VPS.
     * @param {string} lineupId
     * @param {Blob|File|Uint8Array|string} file  the .pwtel payload (JSON string ok)
     * @param {object} meta   { name, track, car, lap_count, duration_sec, force? }
     * @returns {Promise<{id, expires_at, size_bytes}>}
     * Throws on quota exceeded with err.data = {error, used, limit, oldest, message}.
     */
    async upload(lineupId, file, meta = {}) {
      const fd = new FormData()
      fd.append('lineup_id',    lineupId)
      fd.append('token',        _token())
      fd.append('name',         meta.name || 'Recording')
      fd.append('track',        meta.track || '')
      fd.append('car',          meta.car || '')
      fd.append('lap_count',    String(meta.lap_count || 0))
      fd.append('duration_sec', String(meta.duration_sec || 0))
      if (meta.force) fd.append('force', '1')

      let blob = file
      if (typeof file === 'string')       blob = new Blob([file], { type: 'application/json' })
      else if (file instanceof Uint8Array) blob = new Blob([file], { type: 'application/octet-stream' })
      fd.append('file', blob, `${meta.name || 'recording'}.pwtel`)

      const res = await fetch(`${API_BASE}/api/telemetry/upload`, { method: 'POST', body: fd })
      if (res.status === 409) {
        const body = await _json(res)
        const err = new Error('quota_exceeded')
        err.status = 409
        err.data = body?.detail || body
        throw err
      }
      if (!res.ok) {
        const body = await _json(res)
        throw new Error(`upload failed: HTTP ${res.status} ${JSON.stringify(body)}`)
      }
      return res.json()
    },

    async download(recId) {
      const url = `${API_BASE}/api/telemetry/download/${encodeURIComponent(recId)}?token=${encodeURIComponent(_token())}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
      return await res.arrayBuffer()
    },

    async rename(recId, patch) {
      const res = await fetch(`${API_BASE}/api/telemetry/${encodeURIComponent(recId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _token(), ...patch }),
      })
      if (!res.ok) throw new Error(`rename failed: HTTP ${res.status}`)
      return res.json()
    },

    async remove(recId) {
      const url = `${API_BASE}/api/telemetry/${encodeURIComponent(recId)}?token=${encodeURIComponent(_token())}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error(`delete failed: HTTP ${res.status}`)
      return res.json()
    },

    // ── Annotations ──
    async listAnnotations(recId) {
      const url = `${API_BASE}/api/telemetry/${encodeURIComponent(recId)}/annotations?token=${encodeURIComponent(_token())}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`annotations list failed: HTTP ${res.status}`)
      return res.json()
    },

    async createAnnotation(recId, ann) {
      const res = await fetch(`${API_BASE}/api/telemetry/${encodeURIComponent(recId)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _token(), ...ann }),
      })
      if (!res.ok) throw new Error(`annotation create failed: HTTP ${res.status}`)
      return res.json()
    },

    async updateAnnotation(annId, patch) {
      const res = await fetch(`${API_BASE}/api/telemetry/annotations/${encodeURIComponent(annId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _token(), ...patch }),
      })
      if (!res.ok) throw new Error(`annotation update failed: HTTP ${res.status}`)
      return res.json()
    },

    async deleteAnnotation(annId) {
      const url = `${API_BASE}/api/telemetry/annotations/${encodeURIComponent(annId)}?token=${encodeURIComponent(_token())}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error(`annotation delete failed: HTTP ${res.status}`)
      return res.json()
    },
  }

  root.TelemetryVPS = TelemetryVPS
})(typeof window !== 'undefined' ? window : globalThis)
