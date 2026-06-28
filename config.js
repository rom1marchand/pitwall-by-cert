/* ────────────────────────────────────────────────────────────────────────────
 * config.js
 * Single source of truth for networking constants shared by every front-end
 * script (overlays, main window, pitwall workspace).
 *
 * Load this BEFORE any script that opens a WebSocket:
 *   <script src="config.js"></script>
 *
 * Rationale for 54345: chosen in the IANA dynamic/private range (49152-65535)
 * to guarantee no conflict with registered services. Keep this file in sync
 * with `backend/pitwall/main.py` default (and the --port arg that
 * frontend/main.js passes when spawning the backend).
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  const PITWALL = global.PITWALL || {};
  PITWALL.WS_HOST = 'localhost';
  PITWALL.WS_PORT = 54345;
  PITWALL.WS_URL  = `ws://${PITWALL.WS_HOST}:${PITWALL.WS_PORT}`;
  PITWALL.HTTP_URL = `http://${PITWALL.WS_HOST}:${PITWALL.WS_PORT}`;
  global.PITWALL = PITWALL;
})(typeof window !== 'undefined' ? window : globalThis);
