/* ────────────────────────────────────────────────────────────────────────────
 * overlay-common.js
 * Shared helpers for all PitWall overlays.
 * Exposes window.Overlay = { state, onData, live, fmt, init }
 * ────────────────────────────────────────────────────────────────────────── */
(function () {
  // WS URL comes from config.js (loaded before this script in every overlay HTML).
  // Fallback kept as a safety net if config.js is not yet wired on some page.
  const WS_URL = (typeof window !== 'undefined' && window.PITWALL && window.PITWALL.WS_URL)
    || 'ws://localhost:54345';

  const state = {
    session:   {},
    driver:    {},
    standings: [],
    strategy:  {},
    connected: false,
  };

  const listeners = [];
  function notify() { for (const fn of listeners) { try { fn(state); } catch (e) { console.error(e); } } }

  // Event listeners — called with ({name, data, ts}) on every WS event message
  const eventListeners = [];
  function notifyEvent(name, data) {
    const evt = { name, data: data || null, ts: Date.now() };
    for (const fn of eventListeners) { try { fn(evt); } catch (e) { console.error(e); } }
  }

  // Timestamp of last driver payload — used as freshness proof that we're driving
  let _lastDriverTs = 0;

  // ─── Pages registry ──────────────────────────────────────────────────────
  // Overlays that support multi-page navigation call Overlay.registerPages([
  //   { id:'main', label:'Main', onEnter(host) { ... }, onLeave(host) { ... } },
  //   ...
  // ]).
  // The helper manages currentPage, wraps cyclePage / setPage from hotkeys,
  // and renders a tiny breadcrumb in the .hdr (e.g. "1/3").
  const _pages = [];
  let _pageIdx = 0;
  let _pageHost = null;   // DOM element where pages mount (default: first .page-host or body)
  let _crumbEl  = null;   // breadcrumb span in header
  const _pageListeners = [];

  function _ensureCrumb() {
    if (_crumbEl) return _crumbEl;
    const hdr = document.querySelector('.hdr');
    if (!hdr) return null;
    const span = document.createElement('span');
    span.className = 'page-crumb';
    span.style.cssText = 'font-size:8px; font-weight:900; letter-spacing:0.14em; color:var(--muted); margin-left:auto; padding:0 6px; font-variant-numeric:tabular-nums;';
    // Insert before the status dot if present
    const dot = hdr.querySelector('.dot');
    if (dot) hdr.insertBefore(span, dot);
    else hdr.appendChild(span);
    _crumbEl = span;
    return span;
  }

  function _updateCrumb() {
    const c = _ensureCrumb();
    if (!c) return;
    if (_pages.length <= 1) { c.textContent = ''; return; }
    c.textContent = `${_pageIdx + 1}/${_pages.length}`;
  }

  function _setPage(idx) {
    if (!_pages.length) return;
    const n = _pages.length;
    // Wrap around
    const next = ((idx % n) + n) % n;
    if (next === _pageIdx && _pages[_pageIdx]?._mounted) return;
    const prev = _pages[_pageIdx];
    const cur  = _pages[next];
    try { if (prev && typeof prev.onLeave === 'function') prev.onLeave(_pageHost); } catch (e) { console.warn(e); }
    // Hide all, show target
    for (let i = 0; i < n; i++) {
      const pg = _pages[i];
      if (pg._el) pg._el.style.display = (i === next) ? '' : 'none';
    }
    _pageIdx = next;
    try { if (cur && typeof cur.onEnter === 'function') cur.onEnter(_pageHost); } catch (e) { console.warn(e); }
    cur._mounted = true;
    _updateCrumb();
    for (const fn of _pageListeners) { try { fn(cur, _pageIdx); } catch (e) { console.error(e); } }
  }

  function applySnapshot(data) {
    if (!data) return;
    if (data.session)   state.session   = data.session;
    if (data.driver)    { state.driver    = data.driver;    if (Object.keys(data.driver).length) _lastDriverTs = Date.now(); }
    if (data.standings) state.standings = data.standings;
    if (data.strategy)  state.strategy  = data.strategy;
    applyDrivingGate();
  }
  function applyUpdate(topic, data) {
    if (!data) return;
    if (topic === 'driver')         { state.driver    = { ...(state.driver    || {}), ...data }; _lastDriverTs = Date.now(); }
    else if (topic === 'session')   state.session   = { ...(state.session   || {}), ...data };
    else if (topic === 'standings') state.standings = data;
    else if (topic === 'strategy')  state.strategy  = data;
    if (topic === 'session' || topic === 'driver') applyDrivingGate();
  }

  // ─── Auto-hide gate ──────────────────────────────────────────────────────
  // The backend ONLY emits driver telemetry when the player is in realtime
  // (lmu_reader.py returns None otherwise). So the mere presence of fresh
  // driver data IS proof that we are driving.
  // Fallback to explicit flags if ever present.
  // Exceptions: edit mode (designer) or force-show (manual toggle).
  function applyDrivingGate() {
    const s = state.session || {};
    const d = state.driver  || {};
    // Explicit override if backend sets the flag (belt & braces)
    const explicit = s.is_driving ?? d.is_driving;
    let driving;
    if (explicit === 1 || explicit === true || explicit === '1') driving = true;
    else if (explicit === 0 || explicit === false || explicit === '0') driving = false;
    else {
      // Implicit: driver payload fresh (< 2s) AND non-empty → we are driving
      const hasDriver = d && Object.keys(d).length > 0;
      const fresh = (Date.now() - _lastDriverTs) < 2000;
      driving = hasDriver && fresh;
    }
    document.body.classList.toggle('driving', driving);
    document.body.classList.toggle('not-driving', !driving);
  }

  // Re-evaluate freshness periodically (so we hide ~2s after data stops flowing)
  setInterval(() => { applyDrivingGate(); }, 500);

  let ws = null, reconnectT = null;
  let liveEl = null;
  function setLive(on) {
    state.connected = !!on;
    if (liveEl) liveEl.classList.toggle('live', !!on);
  }

  function connect() {
    try { ws = new WebSocket(WS_URL); }
    catch (e) { return scheduleReconnect(); }
    ws.onopen    = () => setLive(true);
    ws.onclose   = () => { setLive(false); scheduleReconnect(); };
    ws.onerror   = () => { setLive(false); try { ws.close(); } catch (_) {} };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || !msg.type) return;
      if (msg.type === 'snapshot')    applySnapshot(msg.data);
      else if (msg.type === 'update') applyUpdate(msg.topic, msg.data);
      else if (msg.type === 'event')  { notifyEvent(msg.event, msg.data); return; }
      notify();
    };
  }
  function scheduleReconnect() {
    if (reconnectT) return;
    reconnectT = setTimeout(() => { reconnectT = null; connect(); }, 1500);
  }

  // ─── Formatting helpers ──────────────────────────────────────────────────
  const fmt = {
    num(v, d = 1, fb = '—') { return (v == null || !Number.isFinite(v)) ? fb : v.toFixed(d); },
    int(v, fb = '—')        { return (v == null || !Number.isFinite(v)) ? fb : Math.round(v).toString(); },
    pct(v, fb = '—')        { return (v == null || !Number.isFinite(v)) ? fb : Math.round(v) + '%'; },
    // Lap time: 1:23.456 or 23.456
    lap(sec, fb = '—') {
      if (sec == null || !Number.isFinite(sec) || sec <= 0) return fb;
      const m = Math.floor(sec / 60);
      const s = sec - m * 60;
      return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
    },
    // Remaining time: h:mm:ss or m:ss
    dur(sec, fb = '—') {
      if (sec == null || !Number.isFinite(sec) || sec < 0) return fb;
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
    },
    // Signed delta: -0.125 / +0.250
    delta(v, d = 3, fb = '—') {
      if (v == null || !Number.isFinite(v)) return fb;
      const sign = v > 0 ? '+' : (v < 0 ? '' : ' ');
      return sign + v.toFixed(d);
    },
    // Gap in seconds or laps: "+0.5" / "+1L"
    gap(v, fb = '—') {
      if (v == null || !Number.isFinite(v)) return fb;
      if (Math.abs(v) > 60) return `${v > 0 ? '+' : ''}${(v/60).toFixed(1)}m`;
      return `${v > 0 ? '+' : ''}${v.toFixed(3)}`;
    },
  };

  // ─── Public API ──────────────────────────────────────────────────────────
  const Overlay = {
    state,
    fmt,
    /**
     * Initialise the overlay: wire edit mode, pick the live dot, start WS.
     * @param {Object} opts
     * @param {HTMLElement} [opts.liveDot] — element that gets `.live` when connected
     * @param {Function} [opts.onData] — called with state on every update
     */
    init(opts = {}) {
      liveEl = opts.liveDot || null;
      if (typeof opts.onData === 'function') listeners.push(opts.onData);

      // Edit-mode sync from main process
      if (window.electronAPI && window.electronAPI.overlays) {
        if (window.electronAPI.overlays.onEditMode) {
          window.electronAPI.overlays.onEditMode((enabled) => {
            document.body.classList.toggle('edit', !!enabled);
          });
        }
        // Force-show sync (manual "Show on screen" toggle from main app)
        if (window.electronAPI.overlays.onForceShow) {
          window.electronAPI.overlays.onForceShow((enabled) => {
            document.body.classList.toggle('force-show', !!enabled);
          });
        }
        // Focus ring sync (hotkey cycles focus between overlays)
        if (window.electronAPI.overlays.onFocus) {
          window.electronAPI.overlays.onFocus((isFocused) => {
            document.body.classList.toggle('focused', !!isFocused);
          });
        }
        // Page cycle & set — delegate to Overlay.pages if registered
        if (window.electronAPI.overlays.onCyclePage) {
          window.electronAPI.overlays.onCyclePage((dir) => {
            if (_pages.length) _setPage(_pageIdx + (dir > 0 ? +1 : -1));
          });
        }
        if (window.electronAPI.overlays.onSetPage) {
          window.electronAPI.overlays.onSetPage((idx) => {
            if (_pages.length) _setPage(idx);
          });
        }
      }
      // Default: not-driving until the first snapshot tells otherwise
      document.body.classList.add('not-driving');
      // Preview mode (designer iframe) → always force-show, no WS (no data needed)
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('preview') === '1') {
          document.body.classList.add('force-show', 'preview');
          return Overlay; // skip WS connect
        }
      } catch (_) {}
      connect();
      return Overlay;
    },
    onData(fn) { if (typeof fn === 'function') listeners.push(fn); return Overlay; },
    /**
     * Subscribe to backend events: engineer, new_lap, pit_entry/exit, HW_INPUT, etc.
     * Handler receives { name, data, ts }.
     */
    onEvent(fn) { if (typeof fn === 'function') eventListeners.push(fn); return Overlay; },

    /**
     * Register the pages this overlay supports.
     * @param {Array} pages — [{id, label, el?, onEnter?, onLeave?}]
     * @param {Object} [opts]
     * @param {HTMLElement} [opts.host] — container; defaults to <div class="pages"> or .widget
     * @param {number} [opts.initial=0] — starting page index
     * Pages can either supply `el` (a DOM element that already exists) or rely on onEnter/onLeave.
     */
    registerPages(pages, opts = {}) {
      if (!Array.isArray(pages) || !pages.length) return Overlay;
      _pages.length = 0;
      for (const p of pages) _pages.push({ ...p, _mounted: false });
      _pageHost = opts.host || document.querySelector('.pages') || document.querySelector('.widget');
      // Resolve element references: accept el as HTMLElement or selector string
      for (const p of _pages) {
        if (typeof p.el === 'string') p._el = document.querySelector(p.el);
        else if (p.el instanceof HTMLElement) p._el = p.el;
        else p._el = null;
      }
      _pageIdx = Math.max(0, Math.min(_pages.length - 1, opts.initial | 0));
      // Hide everything then show initial
      for (let i = 0; i < _pages.length; i++) {
        if (_pages[i]._el) _pages[i]._el.style.display = (i === _pageIdx) ? '' : 'none';
      }
      _updateCrumb();
      const cur = _pages[_pageIdx];
      try { if (cur && typeof cur.onEnter === 'function') cur.onEnter(_pageHost); } catch (e) { console.warn(e); }
      if (cur) cur._mounted = true;
      for (const fn of _pageListeners) { try { fn(cur, _pageIdx); } catch (e) { console.error(e); } }
      return Overlay;
    },
    /** Navigate pages programmatically (useful for in-widget buttons) */
    nextPage() { _setPage(_pageIdx + 1); return Overlay; },
    prevPage() { _setPage(_pageIdx - 1); return Overlay; },
    setPage(idx) { _setPage(idx | 0); return Overlay; },
    get currentPageIdx() { return _pageIdx; },
    get currentPage() { return _pages[_pageIdx] || null; },
    /** Subscribe to page changes; handler receives (page, idx) */
    onPageChange(fn) { if (typeof fn === 'function') _pageListeners.push(fn); return Overlay; },
  };

  window.Overlay = Overlay;
})();
