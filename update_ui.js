const fs = require('fs');

function extractAndInject(sourceFile, targetFile) {
  const mainHtml = fs.readFileSync(sourceFile, 'utf8');
  let targetHtml = fs.readFileSync(targetFile, 'utf8');

  // Extract CSS
  const cssMatch = mainHtml.match(/<style>([\s\S]*?)<\/style>/);
  const cssMain = cssMatch ? cssMatch[1] : '';

  const cssParts = [
    '/* ── LAYOUT ── */',
    '.main-content {',
    '/* ── HERO BG ── */',
    '.hero-bg {',
    '/* ── TOPBAR ── */',
    '.topbar {',
    '/* ── SCROLLABLE CONTENT ── */',
    '.scroll-area {',
    '/* ── MODALS ── */', 
    '/* ── NOTIFICATION PANEL ── */',
    '[data-panel="notifications"] {',
    '/* ── PROFILE DROPDOWN ── */',
    '#profile-dropdown {',
    '/* Scrollbar customization for panels */',
    '[data-panel="notifications"]::-webkit-scrollbar'
  ];

  let extractedCss = '';
  let capture = false;
  const lines = cssMain.split('\n');
  for (const line of lines) {
    if (line.includes('/* ── SCROLLBAR ── */') || line.includes('/* ── LAYOUT ── */') || line.includes('/* ── MAIN CONTENT ── */') || line.includes('/* ── HERO BG ── */') || line.includes('/* ── TOPBAR ── */') || line.includes('/* ── SCROLLABLE CONTENT ── */') || line.includes('/* ── NOTIFICATION PANEL ── */') || line.includes('/* ── PROFILE DROPDOWN ── */') || line.includes('/* Scrollbar customization for panels */')) {
      capture = true;
    } else if (line.includes('/* ── HERO SECTION ── */') || line.includes('/* ── SECTION HEADER ── */') || line.includes('/* ── LOADING ── */') || line.includes('/* ── MODALS ── */')) {
      capture = false;
    }
    
    if (capture) {
      extractedCss += line + '\n';
    }
  }

  // Extract modals HTML
  const modalsHtmlMatch = mainHtml.match(/<!-- Notifications Panel -->[\s\S]*<!-- Profile Dropdown -->[\s\S]*?<\/div>\n/);
  const modalsHtml = modalsHtmlMatch ? modalsHtmlMatch[0] : '';

  // Extract JS
  const jsMatch = mainHtml.match(/<script>([\s\S]*?)<\/script>/);
  let jsExtracted = '';
  if (jsMatch) {
    const jsLines = jsMatch[1].split('\n');
    let jscapture = false;
    for (const line of jsLines) {
      if (line.includes('// Load random hero background image')) jscapture = true;
      if (line.includes('function populateProfileDropdown')) jscapture = true;
      if (line.includes('// Initialize notifications panel with empty state')) jscapture = true;
      if (line.includes('// Add notification to panel')) jscapture = true;
      if (line.includes('// Remove notification from panel')) jscapture = true;
      if (line.includes('// Get default icon')) jscapture = true;
      if (line.includes('// Logout user')) jscapture = true;
      if (line.includes('function goLocal()')) jscapture = true;
      
      if (line.includes('loadRandomHeroBg()')) jscapture = false;
      if (line.includes('if (!Auth.requireAuth()) throw')) jscapture = false;
      if (line.includes('async function load()')) jscapture = false;
      
      if (jscapture) jsExtracted += line + '\n';
    }
  }
  jsExtracted += `
function goLocal() {
  localStorage.removeItem('pw_active_lineup')
  localStorage.removeItem('pw_active_lineup_name')
  localStorage.removeItem('pw_nav_lineup_id')
  localStorage.removeItem('pw_nav_lineup_name')
  _navigate('pitwall.html')
}
function logoutUser() {
  Auth.logout()
}
`;

  // Build target HTML
  targetHtml = targetHtml.replace('<style>', '<style>\n' + extractedCss);

  const shellStart = `<div class="app-shell">
  <!-- ── MAIN CONTENT ── -->
  <main class="main-content">

    <!-- Hero background image -->
    <div class="hero-bg">
      <img id="hero-bg-img" src="assets/hero-bg.jpg" alt="" onerror="this.style.display='none'">
      <div class="hero-bg-overlay"></div>
    </div>

    <!-- Topbar -->
    <header class="topbar">
      <button class="topbar-btn" onclick="goLocal()" title="Local Mode">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
      </button>
      <button class="topbar-btn" style="position:relative" onclick="SidebarManager.toggle('notifications')" title="Notifications">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
        <span class="topbar-notif-dot"></span>
      </button>
      <button class="topbar-btn" id="topbar-user-btn" onclick="SidebarManager.toggle('profile')" title="Profile Menu">
        <div id="topbar-avatar-wrap" style="display:flex;align-items:center;gap:8px;">
          <div style="width:28px;height:28px;border-radius:6px;background:var(--border);"></div>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </button>
    </header>

    <!-- Scrollable area -->
    <div class="scroll-area">`;

  targetHtml = targetHtml.replace(
    /<div class="app-shell"[^>]*>\s*<div id="app-header"><\/div>/,
    shellStart
  );

  targetHtml = targetHtml.replace(
    /  <\/div>\n<\/div>\n\n<script>/,
    '  </div>\n    </div><!-- /scroll-area -->\n  </main>\n</div><!-- /app-shell -->\n\n' + modalsHtml + '\n<script>\n' + jsExtracted
  );

  const populateCall = `
  const profile = JSON.parse(localStorage.getItem('pw_driver_profile') || '{}')
  if (user.steam_avatar) {
    const wrap = document.getElementById('topbar-avatar-wrap');
    if (wrap) {
      wrap.innerHTML = \`<img class="topbar-avatar" src="\${esc(user.steam_avatar)}" alt="">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>\`;
    }
  }

  populateProfileDropdown(user, profile)
  initNotificationsPanel()
  loadRandomHeroBg()
`;

  // Inject populate call into the load function or DOMContentLoaded
  // For settings it's DOMContentLoaded
  if (targetFile.includes('settings')) {
    targetHtml = targetHtml.replace(
      /await renderSidebar\('settings', 'main'\)\n  I18n\.apply\(\)/,
      "await renderSidebar('settings', 'main')\n  I18n.apply()\n" + populateCall
    );
  } else if (targetFile.includes('subscription')) {
    targetHtml = targetHtml.replace(
      /renderSidebar\('plans', 'main'\)\nI18n\.apply\(\)/,
      "renderSidebar('plans', 'main')\nI18n.apply()\n\nAuth.getUser().then(data => {\n  if(data) {\n    const {user} = data;\n" + populateCall + "\n  }\n})\n"
    );
  }

  fs.writeFileSync(targetFile, targetHtml);
  console.log('Updated ' + targetFile);
}

extractAndInject('frontend/main.html', 'frontend/main-settings.html');
extractAndInject('frontend/main.html', 'frontend/main-subscription.html');
