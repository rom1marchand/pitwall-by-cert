// ─────────────────────────────────────────────────────────────────────────────
// PITWALL SIDEBAR ECOSYSTEM
// ─────────────────────────────────────────────────────────────────────────────
// 
// ARCHITECTURE OVERVIEW:
// ├── Sidebar Module
// │   └── Navigation rendering (main, team, event contexts)
// │
// ├── SidebarManager (Centralized Panel Control)
// │   ├── Notifications Panel        [data-panel="notifications"]
// │   ├── Profile Dropdown           [#profile-dropdown]
// │   ├── Overlay Panels             [data-panel="overlay"]
// │   ├── Custom Menus               [data-panel="menu"]
// │   └── Future Extensions          (use .register() to add)
// │
// └── Topbar Module
//     └── Title, subtitle, and toolbar actions
//
// USAGE:
//   SidebarManager.toggle('notifications')  - Open/close notifications
//   SidebarManager.toggle('profile')        - Open/close profile menu
//   SidebarManager.register('custom', '#my-panel') - Add new panel
//   SidebarManager.closeAll()               - Close all open panels
//   SidebarManager.getActive()              - Get currently active panel
//
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PITWALL SIDEBAR MODULE
// ─────────────────────────────────────────────────────────────────────────────

const Sidebar = (() => {

  // ── CSS ──────────────────────────────────────────────────────────────────
  const CSS = `
  /* ═══════════════════════════════════
     PITWALL SIDEBAR
  ═══════════════════════════════════ */
  :root {
    --sb-w:        64px;
    --sb-w-open:   220px;
    --sb-bg:       #0e0e0e;
    --sb-border:   #222222;
    --sb-lime:     #C8FF00;
    --sb-lime-dim: rgba(200,255,0,0.08);
    --sb-muted:    #666666;
    --sb-muted-hi: #999999;
    --sb-text:     #FFFFFF;
    --sb-ease:     280ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  #app-sidebar {
    position: fixed;
    left: 0; top: 0;
    width: var(--sb-w);
    height: 100vh;
    background: var(--sb-bg);
    border-right: 1px solid var(--sb-border);
    display: flex;
    flex-direction: column;
    z-index: 200;
    transition: width var(--sb-ease);
    overflow: hidden;
  }

  #app-sidebar:hover,
  #app-sidebar.sb-open {
    width: var(--sb-w-open);
  }

  #app-sidebar::after {
    content: '';
    position: absolute;
    top: 0; right: 0;
    width: 1px; height: 100%;
    background: linear-gradient(to bottom,
      transparent 0%,
      var(--sb-lime) 25%,
      var(--sb-lime) 75%,
      transparent 100%);
    opacity: 0;
    transition: opacity var(--sb-ease);
    pointer-events: none;
  }
  #app-sidebar:hover::after,
  #app-sidebar.sb-open::after { opacity: 0.2; }

  .app-shell { margin-left: var(--sb-w); transition: margin-left var(--sb-ease); }

  /* ── Logo ── */
  .sb-logo {
    height: 60px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    overflow: hidden;
    border-bottom: 1px solid var(--sb-border);
  }

  .sb-logo-icon {
    width: var(--sb-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--sb-lime);
  }

  .sb-logo-text {
    opacity: 0;
    transform: translateX(-8px);
    transition: opacity var(--sb-ease), transform var(--sb-ease);
    white-space: nowrap;
  }

  #app-sidebar:hover .sb-logo-text,
  #app-sidebar.sb-open .sb-logo-text { opacity: 1; transform: translateX(0); }

  .sb-logo-text strong {
    display: block;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 21px;
    font-weight: 900;
    font-style: italic;
    color: var(--sb-lime);
    line-height: 1;
    letter-spacing: -0.01em;
  }

  .sb-logo-text small {
    display: block;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--sb-muted-hi);
    margin-top: 3px;
  }

  /* ── Nav ── */
  .sb-nav {
    flex: 1;
    padding: 10px 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .sb-item {
    position: relative;
    display: flex;
    align-items: center;
    height: 44px;
    cursor: pointer;
    text-decoration: none;
    color: var(--sb-muted-hi);
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    transition: color 160ms ease;
    overflow: hidden;
    padding: 0;
    font-family: inherit;
  }

  .sb-item::before {
    content: '';
    position: absolute;
    left: 0; top: 50%;
    transform: translateY(-50%);
    width: 2px; height: 0;
    background: var(--sb-lime);
    border-radius: 0 2px 2px 0;
    transition: height 200ms ease;
  }

  .sb-item:hover::before,
  .sb-item.sb-active::before { height: 20px; }

  .sb-item::after {
    content: '';
    position: absolute;
    inset: 2px 6px;
    border-radius: 6px;
    background: var(--sb-lime-dim);
    opacity: 0;
    transition: opacity 160ms ease;
  }

  .sb-item:hover::after,
  .sb-item.sb-active::after { opacity: 1; }

  .sb-icon {
    width: var(--sb-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 160ms ease;
    position: relative;
    z-index: 1;
  }

  .sb-item:hover .sb-icon,
  .sb-item.sb-active .sb-icon { color: var(--sb-lime); }

  .sb-label {
    opacity: 0;
    transform: translateX(-6px);
    transition: opacity var(--sb-ease), transform var(--sb-ease);
    white-space: nowrap;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    position: relative;
    z-index: 1;
  }

  .sb-item.sb-active .sb-label { color: var(--sb-lime); }
  .sb-item:hover:not(.sb-active) .sb-label { color: var(--sb-text); }

  #app-sidebar:hover .sb-label,
  #app-sidebar.sb-open .sb-label { opacity: 1; transform: translateX(0); }

  .sb-nav .sb-item:nth-child(1) .sb-label { transition-delay: 0ms; }
  .sb-nav .sb-item:nth-child(2) .sb-label { transition-delay: 25ms; }
  .sb-nav .sb-item:nth-child(3) .sb-label { transition-delay: 50ms; }
  .sb-nav .sb-item:nth-child(4) .sb-label { transition-delay: 75ms; }
  .sb-nav .sb-item:nth-child(5) .sb-label { transition-delay: 100ms; }

  .sb-badge {
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: var(--sb-border);
    color: var(--sb-muted-hi);
    position: relative; z-index: 1;
    opacity: 0;
    transition: opacity var(--sb-ease);
    transition-delay: 100ms;
  }

  #app-sidebar:hover .sb-badge,
  #app-sidebar.sb-open .sb-badge { opacity: 1; }

  /* ── Bottom ── */
  .sb-bottom {
    flex-shrink: 0;
    border-top: 1px solid var(--sb-border);
    padding: 8px 0;
  }

  .sb-section-label {
    height: 28px;
    display: flex;
    align-items: flex-end;
    padding: 0 0 4px 0;
    overflow: hidden;
  }

  .sb-section-label span {
    opacity: 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--sb-muted);
    padding-left: var(--sb-w);
    white-space: nowrap;
    transition: opacity var(--sb-ease);
    transition-delay: 80ms;
  }

  #app-sidebar:hover .sb-section-label span,
  #app-sidebar.sb-open .sb-section-label span { opacity: 1; }
  `;

  // ── Icônes SVG ───────────────────────────────────────────
  const ICONS = {
    home: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    layout: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="21"/></svg>`,
    plans: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
    team: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="23" y2="8"/><line x1="21" y1="6" x2="21" y2="10"/></svg>`,
    settings: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    localmode: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    pitwall: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    telemetry: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M2 20h.01M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>`,
    strategy: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    back: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  };

  const LOGO_ICON = `<img src="assets/icon_transparent.png" alt="Pitwall Logo" style="width: 24px; height: 24px; object-fit: contain;">`;

  // ── Navigational Contexts ────────────────────────────────────
  const NAV_CONFIGS = {
    main: [
      { id: 'home',           label: 'Home',            href: 'main.html',             icon: 'home' },
      { id: 'layout-designer',label: 'Layout Designer', href: 'overlay-designer.html', icon: 'layout' },
      { id: 'plans',          label: 'Plans',           href: 'main-subscription.html',icon: 'plans', badge: 'Pro' },
      { id: 'join-team',      label: 'Join a Team',     action: "showModal('modal-join-team')", icon: 'team' },
      { id: 'settings',       label: 'Settings',        href: 'main-settings.html',    icon: 'settings' },
    ],
    team: [
      { id: 'home',           label: 'Home',            action: "const tId = Nav.getParam('team_id') || (typeof eventData !== 'undefined' && eventData ? eventData.team_id : null); if(tId) Nav.goTeam(tId); else location.href='main.html';", icon: 'home' },
      { id: 'plans',          label: 'Plans',           href: 'main-subscription.html',icon: 'plans', badge: 'Pro' },
      { id: 'garage',         label: 'Garage',          action: "const gtId = Nav.getParam('team_id') || (typeof eventData !== 'undefined' && eventData ? eventData.team_id : null); location.href='team-garage.html' + (gtId ? '?team_id='+gtId : '');", icon: 'strategy' },
      { id: 'copy-code',      label: 'Copy Team Code',  action: "if(window.copyCode) window.copyCode(); else alert('Team code not available on this page.');", icon: 'team' },
      { id: 'settings',       label: 'Settings',        href: 'main-settings.html',    icon: 'settings' },
    ],
    event: [
      { id: 'home',           label: 'Home',            action: "const tId = Nav.getParam('team_id') || (typeof eventData !== 'undefined' && eventData ? eventData.team_id : null); if(tId) Nav.goTeam(tId); else location.href='main.html';", icon: 'home' },
      { id: 'team',           label: 'Team',            action: "const tId = Nav.getParam('team_id') || (typeof eventData !== 'undefined' && eventData ? eventData.team_id : null); if(tId) Nav.goTeam(tId); else location.href='team.html';", icon: 'team' },
      { id: 'garage',         label: 'Garage',          action: "const gtId = Nav.getParam('team_id') || (typeof eventData !== 'undefined' && eventData ? eventData.team_id : null); location.href='team-garage.html' + (gtId ? '?team_id='+gtId : '');", icon: 'strategy' },
      { id: 'copy-code',      label: 'Copy Team Code',  action: "if(window.copyCode) window.copyCode(); else alert('Team code not available on this page.');", icon: 'team' },
      { id: 'settings',       label: 'Settings',        href: 'main-settings.html',    icon: 'settings' },
    ],
  };

  const BOTTOM_ITEMS = [
    { id: 'localmode', label: 'Local Mode', icon: 'localmode', action: 'goLocal()' },
  ];

  function itemHTML(item, activeId) {
    const isActive = item.id === activeId;
    const cls = `sb-item${isActive ? ' sb-active' : ''}`;
    const badge = item.badge ? `<span class="sb-badge">${item.badge}</span>` : '';
    const inner = `
      <span class="sb-icon">${ICONS[item.icon] || ''}</span>
      <span class="sb-label">${item.label}${badge}</span>`;

    if (item.action) {
      return `<button class="${cls}" onclick="${item.action};return false">${inner}</button>`;
    }
    return `<a class="${cls}" href="${item.href}">${inner}</a>`;
  }

  let _cssInjected = false;
  function injectCSS() {
    if (_cssInjected) return;
    const style = document.createElement('style');
    style.id = 'pitwall-sidebar-css';
    style.textContent = CSS;
    document.head.appendChild(style);
    _cssInjected = true;
  }

  function render(activeId = '', context = 'main') {
    injectCSS();
    const el = document.getElementById('app-sidebar');
    if (!el) {
      console.warn('[Sidebar] #app-sidebar not found in DOM');
      return;
    }
    const navItems = NAV_CONFIGS[context] || NAV_CONFIGS.main;

    el.innerHTML = `
      <div class="sb-logo">
        <span class="sb-logo-icon">${LOGO_ICON}</span>
        <div class="sb-logo-text">
          <strong>PITWALL</strong>
          <small>by CERT</small>
        </div>
      </div>
      <nav class="sb-nav">
        ${navItems.map(item => itemHTML(item, activeId)).join('\n        ')}
      </nav>
      <div class="sb-bottom">
        ${BOTTOM_ITEMS.map(item => itemHTML(item, activeId)).join('\n        ')}
      </div>
    `;
  }

  return { render, ICONS };
})();

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR PANEL MANAGER - Centralizes all sidebar panels & overlays
// ─────────────────────────────────────────────────────────────────────────────

const SidebarManager = (() => {
  // Registry of all panels managed by sidebar
  const panels = {
    notifications: { selector: '[data-panel="notifications"]', element: null },
    profile: { selector: '#profile-dropdown', element: null },
    overlay: { selector: '[data-panel="overlay"]', element: null },
    menu: { selector: '[data-panel="menu"]', element: null },
  };

  const activePanel = { current: null };

  // Initialize panel reference
  function initPanel(panelKey) {
    if (!panels[panelKey]) return false;
    if (!panels[panelKey].element) {
      panels[panelKey].element = document.querySelector(panels[panelKey].selector);
    }
    return panels[panelKey].element !== null;
  }

  // Open a specific panel (close others if exclusive)
  function open(panelKey, exclusive = true) {
    if (!initPanel(panelKey)) return;

    if (exclusive && activePanel.current && activePanel.current !== panelKey) {
      close(activePanel.current);
    }

    const panel = panels[panelKey].element;
    if (panel) {
      panel.classList.add('active');
      activePanel.current = panelKey;
      console.log(`[Sidebar] Opened panel: ${panelKey}`);
    }
  }

  // Close a specific panel
  function close(panelKey) {
    if (!initPanel(panelKey)) return;

    const panel = panels[panelKey].element;
    if (panel) {
      panel.classList.remove('active');
      if (activePanel.current === panelKey) {
        activePanel.current = null;
      }
      console.log(`[Sidebar] Closed panel: ${panelKey}`);
    }
  }

  // Toggle a panel
  function toggle(panelKey, exclusive = true) {
    if (!initPanel(panelKey)) return;

    const panel = panels[panelKey].element;
    if (!panel) return;

    const isVisible = panel.classList.contains('active');
    if (isVisible) {
      close(panelKey);
    } else {
      open(panelKey, exclusive);
    }
  }

  // Close all panels
  function closeAll() {
    Object.keys(panels).forEach(key => close(key));
  }

  // Get currently active panel
  function getActive() {
    return activePanel.current;
  }

  // Register a new panel (for future extensions)
  function register(panelKey, selector) {
    panels[panelKey] = { selector, element: null };
    console.log(`[Sidebar] Registered panel: ${panelKey}`);
  }

  // Get panel element (for direct manipulation if needed)
  function getPanel(panelKey) {
    if (initPanel(panelKey)) {
      return panels[panelKey].element;
    }
    return null;
  }

  // Setup global close handlers
  function setupCloseHandlers() {
    document.addEventListener('click', (e) => {
      // Don't close if clicking on control buttons (TopBar buttons that toggle panels)
      if (e.target.closest('.topbar-btn')) return;
      
      // Don't close if clicking inside an active panel or on sidebar
      const sidebar = document.getElementById('app-sidebar');
      const activeKey = getActive();

      if (!activeKey) return;
      if (sidebar && sidebar.contains(e.target)) return;

      const activePanel = getPanel(activeKey);
      if (activePanel && activePanel.contains(e.target)) return;

      // Close on outside click
      closeAll();
    });
  }

  // Initialize on demand
  let initialized = false;
  function init() {
    if (initialized) return;
    setupCloseHandlers();
    initialized = true;
    console.log('[Sidebar] Manager initialized');
  }

  return {
    open,
    close,
    toggle,
    closeAll,
    getActive,
    getPanel,
    register,
    init,
  };
})();

function renderSidebar(activeId, context = 'main') {
  SidebarManager.init();
  return Sidebar.render(activeId, context);
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW CONTROLS MODULE (Electron window management)
// ─────────────────────────────────────────────────────────────────────────────

const WindowControls = (() => {
  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI;

  function minimize() {
    if (isElectron && window.electronAPI.minimize) {
      window.electronAPI.minimize();
    } else if (window.ipcRenderer) {
      window.ipcRenderer.send('window-minimize');
    }
    console.log('[WindowControls] Minimize requested');
  }

  function toggleMaximize() {
    if (isElectron && window.electronAPI.maximize) {
      window.electronAPI.maximize();
    } else if (window.ipcRenderer) {
      window.ipcRenderer.send('window-toggle-maximize');
    }
    console.log('[WindowControls] Toggle maximize requested');
  }

  function close() {
    if (isElectron && window.electronAPI.close) {
      window.electronAPI.close();
    } else if (window.ipcRenderer) {
      window.ipcRenderer.send('window-close');
    }
    console.log('[WindowControls] Close requested');
  }

  function injectGlobalControls() {
    if (document.getElementById('global-window-controls')) return;
    
    const style = document.createElement('style');
    style.textContent = `
      #global-window-controls {
        position: fixed;
        top: 0;
        right: 0;
        display: flex;
        align-items: center;
        z-index: 99999;
        -webkit-app-region: no-drag;
      }
      .gwc-btn {
        background: transparent;
        border: none;
        color: #999999;
        width: 40px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 100ms ease;
      }
      .gwc-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #FFFFFF;
      }
      .gwc-btn.close:hover {
        background: rgba(239, 68, 68, 0.9);
        color: #FFFFFF;
      }
      .gwc-btn svg {
        width: 16px;
        height: 16px;
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'global-window-controls';
    container.innerHTML = `
      <button class="gwc-btn minimize" onclick="WindowControls.minimize()" title="Minimize">
        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
      </button>
      <button class="gwc-btn maximize" onclick="WindowControls.toggleMaximize()" title="Maximize">
        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M3 3v18h18V3H3zm16 16H5V5h14v14z"/></svg>
      </button>
      <button class="gwc-btn close" onclick="WindowControls.close()" title="Close">
        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
      </button>
    `;
    document.body.appendChild(container);
  }

  // Auto-inject when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectGlobalControls);
  } else {
    injectGlobalControls();
  }

  return {
    minimize,
    toggleMaximize,
    close,
    isElectron
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// PITWALL TOPBAR MODULE
// ─────────────────────────────────────────────────────────────────────────────

const Topbar = (() => {
  const CSS = `
  /* ═══════════════════════════════════
     PITWALL TOPBAR
  ═══════════════════════════════════ */
  :root {
    --tb-h: 60px;
    --tb-bg: var(--sb-bg, #0e0e0e);
    --tb-border: var(--sb-border, #222222);
    --tb-text: var(--sb-text, #FFFFFF);
    --tb-muted: var(--sb-muted-hi, #999999);
  }

  #app-topbar {
    position: fixed;
    top: 0;
    left: var(--sb-w, 64px);
    right: 0;
    height: var(--tb-h);
    background: var(--tb-bg);
    border-bottom: 1px solid var(--tb-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    z-index: 100;
    transition: left var(--sb-ease, 280ms cubic-bezier(0.4, 0, 0.2, 1));
    -webkit-app-region: drag;
  }

  #app-sidebar:hover ~ #app-topbar,
  #app-sidebar.sb-open ~ #app-topbar {
    left: var(--sb-w-open, 220px);
  }

  .tb-left {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .tb-title {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--tb-text);
    line-height: 1.1;
  }

  .tb-subtitle {
    font-size: 11px;
    font-weight: 600;
    color: var(--tb-muted);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-top: 2px;
  }

  .tb-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    -webkit-app-region: no-drag;
  }

  .tb-btn {
    background: transparent;
    border: 1px solid var(--tb-border);
    color: var(--tb-muted);
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tb-btn svg {
    width: 14px;
    height: 14px;
  }

  .tb-btn:hover {
    color: var(--sb-lime, #C8FF00);
    border-color: var(--sb-lime, #C8FF00);
    background: var(--sb-lime-dim, rgba(200,255,0,0.08));
  }

  /* Window control buttons */
  .tb-window-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    -webkit-app-region: no-drag;
  }

  .tb-win-btn {
    background: transparent;
    border: none;
    color: var(--tb-muted);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 100ms ease;
    font-size: 16px;
  }

  .tb-win-btn:hover {
    color: var(--sb-lime, #C8FF00);
    background: rgba(200, 255, 0, 0.08);
  }

  .tb-win-btn:active {
    background: rgba(200, 255, 0, 0.15);
  }

  .tb-win-btn.close:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
  }

  /* To be used on the main content wrapper when a topbar is present */
  .app-shell.with-topbar {
    padding-top: var(--tb-h);
  }
  `;

  let _cssInjected = false;
  function injectCSS() {
    if (_cssInjected) return;
    const style = document.createElement('style');
    style.id = 'pitwall-topbar-css';
    style.textContent = CSS;
    document.head.appendChild(style);
    _cssInjected = true;
  }

  function render(title = 'Dashboard', subtitle = '', actions = []) {
    injectCSS();
    let el = document.getElementById('app-topbar');
    if (!el) {
      // Try to inject topbar in pages that use #app-header or have .app-shell
      const headerHost = document.getElementById('app-header') || document.querySelector('.app-shell');
      el = document.createElement('div');
      el.id = 'app-topbar';
      if (headerHost && headerHost.parentNode) {
        // insert after headerHost for proper layout
        headerHost.parentNode.insertBefore(el, headerHost.nextSibling);
      } else {
        document.body.appendChild(el);
      }
      console.log('[Topbar] Injected #app-topbar into DOM');

      // Ensure the main wrapper accounts for the topbar height
      const shell = document.querySelector('.app-shell');
      if (shell && !shell.classList.contains('with-topbar')) shell.classList.add('with-topbar');
    }

    let actionsHtml = actions.map(act => {
      const iconHtml = act.icon && Sidebar.ICONS ? (Sidebar.ICONS[act.icon] || '') : '';
      return `<button class="tb-btn" onclick="${act.action}">${iconHtml} ${act.label}</button>`;
    }).join('');

    const subtitleHtml = subtitle ? `<div class="tb-subtitle">${subtitle}</div>` : '';

    el.innerHTML = `
      <div class="tb-left">
        <div class="tb-title">${title}</div>
        ${subtitleHtml}
      </div>
      <div class="tb-actions">
        ${actionsHtml}
      </div>
    `;
  }

  return { render };
})();

function renderTopbar(title, subtitle = '', actions = []) {
  return Topbar.render(title, subtitle, actions);
}