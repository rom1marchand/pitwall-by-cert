const { app, BrowserWindow, ipcMain, dialog, net, shell, protocol } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const http = require('http');
const overlayManager = require('./overlay-manager');
const BACKEND_HTTP_PORT = 54345;

// --- HANDLERS GLOBAUX (Fichiers, fenêtres, notifications) ---

ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
});
ipcMain.on('window-toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        win.isMaximized() ? win.unmaximize() : win.maximize();
    }
});
ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        win.isMaximized() ? win.unmaximize() : win.maximize();
    }
});
ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
});

// ─── FILE LOGGER (visible en version compilée) ────────────────────────────
const LOG_FILE = path.join(app.getPath('userData'), 'pitwall-shutdown.log');

function writeLog(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line); // garde la console en dev
    try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
}

// ─── HARDWARE HOTKEYS — 5 global actions model ──────────────────────────────
// Binds HW_INPUT events from the Python backend (joy_id + button_id) to global overlay actions.
// Schema: { toggleShow: {joy_id,button_id}, focusNext: {...}, focusPrev: {...}, pageNext: {...}, pagePrev: {...} }
// Each value can be null (unassigned).
const HOTKEYS_FILE = path.join(__dirname, 'overlay-hotkeys.json');
const HOTKEY_ACTIONS = ['toggleShow', 'focusNext', 'focusPrev', 'pageNext', 'pagePrev'];
let hotkeyBindings = {};   // action -> {joy_id, button_id} | null
let _isQuitting = false; // ← flag anti-boucle

function _emptyBindings() {
    const out = {};
    for (const a of HOTKEY_ACTIONS) out[a] = null;
    return out;
}

function _migrateLegacy(parsed) {
    // Migration from legacy array format [{joy_id, button_id, action, target}, ...]
    // → new keyed format. We try a best-effort: the first `toggle` binding with no target
    // becomes toggleShow; cyclePage/prevPage become pageNext/pagePrev.
    const out = _emptyBindings();
    const list = Array.isArray(parsed) ? parsed : (parsed.bindings || []);
    if (!Array.isArray(list)) return out;
    for (const b of list) {
        if (!b || typeof b.joy_id !== 'number' || typeof b.button_id !== 'number') continue;
        const slot = { joy_id: b.joy_id, button_id: b.button_id };
        if (b.action === 'toggle' && !out.toggleShow)      out.toggleShow = slot;
        else if (b.action === 'cyclePage' && !out.pageNext) out.pageNext = slot;
        else if (b.action === 'prevPage' && !out.pagePrev)  out.pagePrev = slot;
    }
    return out;
}

function loadHotkeys() {
    try {
        const raw = fs.readFileSync(HOTKEYS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        // New format: top-level object keyed by action name
        const isNewFormat = parsed && typeof parsed === 'object'
            && !Array.isArray(parsed) && !Array.isArray(parsed.bindings)
            && HOTKEY_ACTIONS.some(a => a in parsed);
        if (isNewFormat) {
            hotkeyBindings = _emptyBindings();
            for (const a of HOTKEY_ACTIONS) {
                const v = parsed[a];
                if (v && typeof v.joy_id === 'number' && typeof v.button_id === 'number') {
                    hotkeyBindings[a] = { joy_id: v.joy_id, button_id: v.button_id };
                }
            }
        } else {
            // Legacy array — migrate & immediately rewrite
            hotkeyBindings = _migrateLegacy(parsed);
            try { fs.writeFileSync(HOTKEYS_FILE, JSON.stringify(hotkeyBindings, null, 2), 'utf8'); } catch (_) {}
            console.log('[Hotkeys] Migrated legacy bindings to 5-action format');
        }
        const count = HOTKEY_ACTIONS.filter(a => hotkeyBindings[a]).length;
        console.log(`[Hotkeys] Loaded ${count}/5 global action(s)`);
    } catch (err) {
        console.warn(`[Hotkeys] No bindings loaded (${err.message})`);
        hotkeyBindings = _emptyBindings();
    }
}

function broadcastHwInput(data) {
    // Relay raw HW input to every renderer (used by the designer's "Assign" mode)
    const wins = BrowserWindow.getAllWindows();
    console.log(`[HW] broadcast joy=${data.joy_id} btn=${data.button_id} → ${wins.length} window(s)`);
    for (const w of wins) {
        if (w.isDestroyed()) continue;
        try { w.webContents.send('hw:input-broadcast', data); } catch (_) {}
    }
}

function saveHotkeys(bindings) {
    try {
        // Normalize: only keep the 5 known keys, each with {joy_id,button_id} or null
        const clean = _emptyBindings();
        if (bindings && typeof bindings === 'object') {
            for (const a of HOTKEY_ACTIONS) {
                const v = bindings[a];
                if (v && typeof v.joy_id === 'number' && typeof v.button_id === 'number') {
                    clean[a] = { joy_id: v.joy_id, button_id: v.button_id };
                }
            }
        }
        fs.writeFileSync(HOTKEYS_FILE, JSON.stringify(clean, null, 2), 'utf8');
        hotkeyBindings = clean;
        return true;
    } catch (err) {
        console.error('[Hotkeys] save failed:', err.message);
        return false;
    }
}

function _matchAction(joy_id, button_id) {
    for (const a of HOTKEY_ACTIONS) {
        const b = hotkeyBindings[a];
        if (b && b.joy_id === joy_id && b.button_id === button_id) return a;
    }
    return null;
}

function dispatchHwInput({ joy_id, button_id }) {
    broadcastHwInput({ joy_id, button_id });
    const action = _matchAction(joy_id, button_id);
    if (!action) return;
    console.log(`[Hotkeys] joy=${joy_id} btn=${button_id} → ${action}`);

    switch (action) {
        case 'toggleShow': overlayManager.toggleShowAll(); break;
        case 'focusNext':  overlayManager.focusNext(+1);   break;
        case 'focusPrev':  overlayManager.focusNext(-1);   break;
        case 'pageNext':   overlayManager.cycleFocusedPage(+1); break;
        case 'pagePrev':   overlayManager.cycleFocusedPage(-1); break;
    }
}

let mainWindow;
let apiProcess;
let openWindows = {};
let callbackServer = null;

// ─── SINGLE INSTANCE ─────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
    const url = commandLine.find(arg => arg.startsWith('pitwall://'));
    if (url) handlePitwallCallback(url);
});

app.on('open-url', (event, url) => {
    event.preventDefault();
    handlePitwallCallback(url);
});

function handlePitwallCallback(token) {
    try {
        if (token && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(
                `localStorage.setItem('pw_token', '${token}'); window.location.reload();`
            );
        }
    } catch(e) {
        console.error('Erreur callback pitwall://', e);
    }
}

// ─── SERVEUR LOCAL CALLBACK STEAM ────────────────────────────────────────────
// En mode dev, Steam redirige vers http://localhost:9876/callback?token=XXX
// Ce petit serveur récupère le token et le passe à Electron.
// Les sockets actives sont trackées pour permettre une destruction immédiate
// au shutdown (sans ça, callbackServer.close() bloque indéfiniment sur Windows).

function startCallbackServer() {
    callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost:9876');
        const token = url.searchParams.get('token');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <html>
            <head><title>Pitwall — Connected</title></head>
            <body style="background:#0a0a0a;color:#C8FF00;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:18px;">
                <div style="text-align:center">
                    <div style="font-size:64px;margin-bottom:16px;">✓</div>
                    <div style="font-family:'Arial Black',sans-serif;font-size:24px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;">CONNECTED</div>
                    <div style="color:#444;font-size:13px;margin-top:12px;letter-spacing:.05em;">You can close this tab.</div>
                </div>
            </body></html>
        `);

        if (token) {
            console.log('[AUTH] Token reçu, injection dans Electron...');
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.executeJavaScript(
                        `localStorage.setItem('pw_token', '${token}'); location.href = 'main.html';`
                    );
                }
            }, 300);
        }
    });

    // ✅ Tracker toutes les sockets actives dès leur création
    // Sans ça, callbackServer.close() attend qu'elles se ferment toutes seules
    // ce qui peut ne jamais arriver sur Windows → Electron reste bloqué au shutdown
    callbackServer._activeSockets = new Set();

    callbackServer.on('connection', (socket) => {
        callbackServer._activeSockets.add(socket);
        socket.on('close', () => callbackServer._activeSockets.delete(socket));
    });

    callbackServer.listen(9876, '127.0.0.1', () => {
        console.log('[AUTH] Serveur callback local démarré sur http://localhost:9876');
    });

    callbackServer.on('error', (err) => {
        console.error('[AUTH] Erreur serveur callback:', err.message);
    });
}


// --- GESTIONNAIRE DE FICHIERS ---
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Motec Data', extensions: ['ld', 'ldx'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (canceled) return null;
    return filePaths[0];
});

ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return filePaths[0];
});

// --- WINDOW CONTROLS (Removed duplicates) ---

// --- SYSTEM NOTIFICATIONS (Windows toast) ---
ipcMain.on('show-notification', (event, opts) => {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
        const notif = new Notification({
            title: opts.title || 'Pitwall',
            body: opts.body || '',
            icon: path.join(__dirname, opts.icon || 'assets/icon.png'),
            silent: true, // we play our own sound
        });
        notif.show();
    }
});

ipcMain.on('open-telemetry-window', () => {
    const telemetryWin = new BrowserWindow({
        width: 800, height: 600,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
    });
    telemetryWin.loadFile('telemetry_standalone.html'); // Une page dédiée juste aux graphs
});

// ─── TELEMETRY LOCAL STORAGE (.pwtel) ────────────────────────────────────────
// Layout: <userData>/pitwall/telemetry/<lineup_id>/<recording_id>.pwtel
function _telemetryRoot() {
    const dir = path.join(app.getPath('userData'), 'pitwall', 'telemetry');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    return dir;
}
function _telemetryLineupDir(lineupId) {
    if (!lineupId || /[\\/:*?"<>|]/.test(lineupId)) throw new Error('invalid lineupId');
    const dir = path.join(_telemetryRoot(), lineupId);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    return dir;
}
function _telemetryFile(lineupId, recId) {
    if (!recId || /[\\/:*?"<>|]/.test(recId)) throw new Error('invalid recId');
    return path.join(_telemetryLineupDir(lineupId), `${recId}.pwtel`);
}

ipcMain.handle('telemetry:getDir', () => _telemetryRoot());

ipcMain.handle('telemetry:save', async (_e, { lineupId, recId, json }) => {
    const file = _telemetryFile(lineupId, recId);
    await fs.promises.writeFile(file, json, 'utf8');
    const st = await fs.promises.stat(file);
    return { id: recId, path: file, size_bytes: st.size };
});

ipcMain.handle('telemetry:load', async (_e, { lineupId, recId }) => {
    const file = _telemetryFile(lineupId, recId);
    return await fs.promises.readFile(file, 'utf8');
});

ipcMain.handle('telemetry:list', async (_e, { lineupId }) => {
    const dir = _telemetryLineupDir(lineupId);
    let entries = [];
    try { entries = await fs.promises.readdir(dir); } catch (_) { return []; }
    const out = [];
    for (const name of entries) {
        if (!name.endsWith('.pwtel')) continue;
        const file = path.join(dir, name);
        try {
            const st = await fs.promises.stat(file);
            // Read file head to extract meta; files are small enough (< 100 MB) and usually much less.
            const json = await fs.promises.readFile(file, 'utf8');
            const obj = JSON.parse(json);
            out.push({
                id:           name.replace(/\.pwtel$/, ''),
                name:         (obj.meta && obj.meta.name) || obj.name || name,
                track:        (obj.meta && obj.meta.track) || obj.track || '',
                car:          (obj.meta && obj.meta.car) || obj.car || '',
                session_type: obj.session_type || '',
                lap_count:    obj.lap_count || (obj.laps ? obj.laps.length : 0),
                sample_count: obj.sample_count || 0,
                duration_sec: obj.duration_sec || 0,
                size_bytes:   st.size,
                saved_at:     (obj.meta && obj.meta.saved_at) || st.mtimeMs,
            });
        } catch (err) {
            // Skip unreadable/corrupt files silently
        }
    }
    out.sort((a, b) => b.saved_at - a.saved_at);
    return out;
});

ipcMain.handle('telemetry:remove', async (_e, { lineupId, recId }) => {
    const file = _telemetryFile(lineupId, recId);
    try { await fs.promises.unlink(file); } catch (_) {}
    return { success: true };
});

ipcMain.handle('telemetry:importRaw', async (_e, { lineupId, recId, bytes }) => {
    const file = _telemetryFile(lineupId, recId);
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    await fs.promises.writeFile(file, buf);
    const st = await fs.promises.stat(file);
    return { id: recId, path: file, size_bytes: st.size };
});


ipcMain.handle('telemetry:parseMotec', async (_e, { bytes, filename }) => {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const safeName = (filename || 'recording.ld').replace(/[^\w.\-]/g, '_');

    const doRequest = () => new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: 5000,
            method: 'POST',
            path: '/api/telemetry/parse_motec?filename=' + encodeURIComponent(safeName),
            headers: {
                'Content-Type':   'application/octet-stream',
                'Content-Length': buf.length,
            },
            // Parsing a full endurance session can take several seconds on
            // big .ld files — give the backend room to finish.
            timeout: 120000,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error('Invalid JSON from backend: ' + e.message)); }
                } else {
                    reject(new Error(`Backend returned ${res.statusCode}: ${body.slice(0, 300)}`));
                }
            });
        });
        req.on('timeout', () => { req.destroy(new Error('parse_motec timed out')); });
        req.on('error', reject);
        req.write(buf);
        req.end();
    });

    // Retry loop: ECONNREFUSED means the backend isn't up yet.
    let lastErr = null;
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            return await doRequest();
        } catch (e) {
            lastErr = e;
            if (e && (e.code === 'ECONNREFUSED' || /ECONNREFUSED/.test(String(e)))) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            throw e;
        }
    }
    throw new Error('Python backend unreachable on :5000 — ' + (lastErr ? lastErr.message : 'unknown'));
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 800,
        frame: false, // Remove default frame for custom titlebar
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
    });

    mainWindow.loadFile('index.html');

    // Notify renderer when window maximize state changes
    const sendMaxState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximize-change', mainWindow.isMaximized());
        }
    };
    mainWindow.on('maximize', sendMaxState);
    mainWindow.on('unmaximize', sendMaxState);

    // ─── INTERCEPT STEAM CALLBACK ─────────────────────────────────────────────
    // Méthode la plus fiable : on intercepte avant que la redirection parte
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('pitwall://')) {
            event.preventDefault();
            handlePitwallCallback(url);
        }
    });

    mainWindow.webContents.on('will-redirect', (event, url) => {
        if (url.startsWith('pitwall://')) {
            event.preventDefault();
            handlePitwallCallback(url);
        }
    });

    // --- PROTECTION FERMETURE ---
    mainWindow.on('close', (e) => {
        const hasOpenWindows = Object.values(openWindows).some(win => win !== null);
        if (hasOpenWindows) {
            e.preventDefault();
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['Cancel', 'Close All'],
                title: 'Warning',
                message: 'Pop-out windows are still open!',
                detail: 'Closing the main app will close all strategy/telemetry windows. Are you sure?'
            }).then(({ response }) => {
                if (response === 1) {
                    Object.values(openWindows).forEach(win => { if (win) win.destroy(); });
                    openWindows = {};
                    mainWindow.destroy();
                }
            });
        }
    });

    // ✅ ICI : déclenche app.quit() quand mainWindow se ferme
    // sans attendre window-all-closed qui ne viendra jamais (overlays vivants)
    mainWindow.on('closed', () => {
        mainWindow = null;
        app.quit(); // → déclenche before-quit → logs + cleanup + process.exit(0)
    });

} 

// --- GESTIONNAIRE DE FENÊTRES POP-OUT AMÉLIORÉ ---
// Legacy handler (kept for backwards compat)
ipcMain.on('open-new-window', (event, data) => {
    ipcMain.emit('open-popout', event, { view: data.view, href: `stint-plan.html?teamId=${data.teamId}&raceId=${data.raceId}&view=${data.view}&mode=popout` });
});

// New generic pop-out system — any page can be popped out
ipcMain.on('open-popout', (event, data) => {
    // Si la fen��tre existe déjà, on la met juste au premier plan
    if (openWindows[data.view]) {
        openWindows[data.view].focus();
        return;
    }

    const newWin = new BrowserWindow({
        width: 1200, height: 800, autoHideMenuBar: true,
        frame: false,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
    });

    openWindows[data.view] = newWin;

    // Notify popout renderer when its window state changes
    const sendPopoutMaxState = () => {
        if (!newWin.isDestroyed()) newWin.webContents.send('window-maximize-change', newWin.isMaximized());
    };
    newWin.on('maximize', sendPopoutMaxState);
    newWin.on('unmaximize', sendPopoutMaxState);

    if (mainWindow) mainWindow.webContents.send('popout-status-change', { view: data.view, isOpen: true });

    // Build URL — href is relative page name with optional query params (e.g. 'live-timing.html?lineup_id=xxx')
    const qIdx = data.href.indexOf('?');
    const fileName = qIdx >= 0 ? data.href.substring(0, qIdx) : data.href;
    const existingQuery = qIdx >= 0 ? data.href.substring(qIdx + 1) : '';
    const fullQuery = existingQuery ? `${existingQuery}&mode=popout` : 'mode=popout';
    // Use loadFile for reliability on Windows, pass query as search param
    newWin.loadFile(path.join(__dirname, fileName), { search: '?' + fullQuery });
    console.log(`[Popout] Opening ${fileName} with query: ?${fullQuery}`);

    newWin.on('closed', () => {
        openWindows[data.view] = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('popout-status-change', { view: data.view, isOpen: false });
        }
    });
});

// Close a specific pop-out by view id
ipcMain.on('close-popout', (event, viewId) => {
    if (openWindows[viewId]) {
        openWindows[viewId].destroy();
        openWindows[viewId] = null;
    }
});

// Close ALL pop-out windows (called on navigation away from lineup)
ipcMain.on('close-all-popouts', () => {
    Object.keys(openWindows).forEach(key => {
        if (openWindows[key]) {
            openWindows[key].destroy();
            openWindows[key] = null;
        }
    });
});

// --- LANCEMENT DU BACKEND PYTHON ---
// DANS main.js

function startPythonBackend() {
    let scriptPath;
    let command;
    let args = [];
    let cwd;

    console.log("--- DÉMARRAGE DU BACKEND ---");

    // 1. Détection du mode (Prod vs Dev)
    if (app.isPackaged) {
        // --- MODE PRODUCTION (L'application installée .exe) ---
        scriptPath = path.join(process.resourcesPath, 'py_dist', 'api.exe');
        command = scriptPath;
        args = ['--parent-pid', process.pid.toString()];
        cwd = path.dirname(scriptPath);
        console.log("Mode PROD detected.");
    } else {
        // --- MODE DEVELOPPEMENT (npm start) ---
        // Lance le nouveau backend: py -m pitwall --port 54345
        // NOTE: Keep this port in sync with frontend/config.js (PITWALL.WS_PORT).
        scriptPath = path.join(__dirname, '..', 'backend');
        command = 'py';
        args = ['-m', 'pitwall', '--port', '54345', '--parent-pid', process.pid.toString()];
        cwd = scriptPath;
        console.log("Mode DEV detected.");
    }

    console.log(`Checking backend path: ${scriptPath}`);

    // 2. Vérification de l'existence du dossier/fichier
    if (!fs.existsSync(scriptPath)) {
        console.error(`ERREUR CRITIQUE : Le backend est introuvable ici : ${scriptPath}`);
        dialog.showErrorBox("Erreur Backend", `Impossible de trouver le backend ici :\n${scriptPath}`);
        return;
    }

    console.log(`🚀 Lancement de la commande : ${command} ${args.join(' ')}`);

    // 3. Lancement du processus
    apiProcess = spawn(command, args, {
        cwd: cwd,
        detached: false,
        shell: false,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    apiProcess.unref();

    // 4. Écoute des logs Python (IMPORTANT POUR LE DEBUG)
    apiProcess.stdout.on('data', (data) => {
        const msg = `API (stdout): ${data}`;
        console.log(msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(
                `console.log('[Backend] ' + ${JSON.stringify(data.toString())})`
            ).catch(() => {});
        }
    });

    apiProcess.stderr.on('data', (data) => {
        const msg = `API (stderr): ${data}`;
        console.error(msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(
                `console.error('[Backend ERROR] ' + ${JSON.stringify(data.toString())})`
            ).catch(() => {});
        }
    });

    apiProcess.on('error', (err) => {
        console.error('❌ FAILED TO SPAWN PYTHON:', err);
        dialog.showErrorBox("Erreur Lancement", "Le backend Python n'a pas pu démarrer.\n" + err.message);
    });

    apiProcess.on('close', (code) => {
        console.log(`API process exited with code ${code}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(
                `console.warn('[Backend] Process exited with code ${code}')`
            ).catch(() => {});
        }
    });
}

// --- FERMETURE PROPRE ---
function shutdownApi() {
    return new Promise((resolve) => {
        const request = net.request({
            method: 'POST',
            protocol: 'http:',
            hostname: '127.0.0.1',
            port: BACKEND_HTTP_PORT,
            path: '/api/shutdown'
        });
        
        request.on('response', (response) => {
            console.log('API Shutdown sent: ' + response.statusCode);
            resolve();
        });
        
        request.on('error', (error) => {
            console.log('API déjà éteinte ou injoignable.');
            resolve();
        });
        
        request.end();
        // Give it a bit more time to process the shutdown request and exit itself
        setTimeout(resolve, 2000); 
    });
}

app.whenReady().then(() => {
    // Démarre le serveur callback pour l'auth Steam
    startCallbackServer();

    // Enregistre le protocole pitwall:// (pour la version compilée)
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('pitwall', process.execPath, [path.resolve(process.argv[1])]);
        }
    } else {
        app.setAsDefaultProtocolClient('pitwall');
    }

    // Handler pour ouvrir des URLs externes depuis le renderer
    ipcMain.handle('open-external', (event, url) => {
        shell.openExternal(url);
    });

    startPythonBackend();
    createWindow();

    // ─── OVERLAYS IN-GAME (Phase 1) ──────────────────────────────────────────
    overlayManager.registerIpc();
    overlayManager.init({
        baseDir: __dirname,
        preloadPath: path.join(__dirname, 'preload.js')
    });

    // ─── HARDWARE HOTKEYS (Phase 3) ──────────────────────────────────────────
    loadHotkeys();
    ipcMain.on('hw:input', (_e, data) => {
        if (data && typeof data.joy_id === 'number' && typeof data.button_id === 'number') {
            dispatchHwInput(data);
        }
    });
    ipcMain.on('hw:reloadHotkeys', () => loadHotkeys());
    ipcMain.handle('hotkeys:get',  () => hotkeyBindings);
    ipcMain.handle('hotkeys:save', (_e, bindings) => saveHotkeys(bindings));

    // Liste les PNG disponibles dans assets/overlay/ pour le preview du designer
    ipcMain.handle('overlays:listHudAssets', () => {
        const dir = path.join(__dirname, 'assets', 'overlay');
        try {
            return fs.readdirSync(dir)
                .filter(f => f.toLowerCase().endsWith('.png'))
                .map(f => ({
                    file: f,
                    key:  f.replace(/_lmu\.png$/i, '').replace(/\.png$/i, '').toLowerCase(),
                }));
        } catch (_) { return []; }
    });

    // ─── OVERLAY DESIGNER WINDOW (Phase 4) ───────────────────────────────────
    let designerWin = null;
    ipcMain.on('overlays:openDesigner', () => {
        if (designerWin && !designerWin.isDestroyed()) { designerWin.focus(); return; }
        designerWin = new BrowserWindow({
            width: 1500, height: 950,
            minWidth: 1200, minHeight: 780,
            title: 'Overlay Layout — Pitwall',
            icon: path.join(__dirname, 'assets', 'icon.png'),
            backgroundColor: '#0a0a0a',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });
        designerWin.loadFile('overlay-designer.html');
        designerWin.on('closed', () => {
            designerWin = null;
            overlayManager.setEditMode(false);
        });
    });
});



app.on('before-quit', (event) => {
    event.preventDefault();

    if (_isQuitting) {
        writeLog('[QUIT] Already quitting, ignoring.');
        return;
    }
    _isQuitting = true;
    writeLog('[QUIT] ==================== SHUTDOWN START ====================');

    const forceExitTimer = setTimeout(() => {
        writeLog('[QUIT] ⚠ Force exit after timeout — something blocked shutdown');
        process.exit(0);
    }, 5000);

    (async () => {
        try {
            // 1. CallbackServer
            writeLog('[QUIT] Step 1: closing callbackServer...');
            if (callbackServer) {
                for (const socket of callbackServer._activeSockets) socket.destroy();
                callbackServer.close();
                callbackServer = null;
                writeLog('[QUIT] Step 1: callbackServer closed.');
            } else {
                writeLog('[QUIT] Step 1: no callbackServer.');
            }

            // 2. Overlays
            writeLog('[QUIT] Step 2: destroying overlays...');
            try {
                const ids = Object.keys(overlayManager.widgets);
                writeLog(`[QUIT] Step 2: ${ids.length} overlay(s) to destroy: ${ids.join(', ')}`);
                overlayManager.destroyAll();
                await new Promise(r => setTimeout(r, 200));
                const remaining = Object.keys(overlayManager.widgets);
                writeLog(`[QUIT] Step 2: done. Remaining: ${remaining.length} — ${remaining.join(', ')}`);
            } catch (e) {
                writeLog(`[QUIT] Step 2 error: ${e}`);
            }

            // 3. Pop-outs
            writeLog('[QUIT] Step 3: destroying pop-out windows...');
            for (const key in openWindows) {
                try {
                    if (openWindows[key] && !openWindows[key].isDestroyed()) {
                        writeLog(`[QUIT] Step 3: destroying popout "${key}"...`);
                        openWindows[key].destroy();
                    }
                } catch (e) {
                    writeLog(`[QUIT] Step 3 error on "${key}": ${e}`);
                }
                openWindows[key] = null;
            }
            writeLog('[QUIT] Step 3: done.');

            // 4. API process
            writeLog(`[QUIT] Step 4: killing apiProcess (PID: ${apiProcess?.pid})...`);
            if (apiProcess) {
                await new Promise((resolve) => {
                    if (process.platform === 'win32') {
                        exec(`taskkill /F /T /PID ${apiProcess.pid}`, (err, stdout, stderr) => {
                            if (err) writeLog(`[QUIT] Step 4: taskkill error: ${err.message}`);
                            if (stdout) writeLog(`[QUIT] Step 4: taskkill stdout: ${stdout.trim()}`);
                            resolve();
                        });
                        setTimeout(resolve, 2000);
                    } else {
                        try { apiProcess.kill('SIGKILL'); } catch (_) {}
                        setTimeout(resolve, 100);
                    }
                });
                apiProcess = null;
                writeLog('[QUIT] Step 4: done.');
            } else {
                writeLog('[QUIT] Step 4: no apiProcess.');
            }

            // Step 5 — force kill tous les renderers encore vivants
            const allWins = BrowserWindow.getAllWindows();
            writeLog(`[QUIT] Step 5: ${allWins.length} window(s) still alive.`);
            for (const w of allWins) {
                try {
                    if (!w.isDestroyed()) {
                        writeLog(`[QUIT] Step 5: crashing renderer id=${w.id}`);
                        w.webContents.forcefullyCrashRenderer();
                        w.destroy();
                    }
                } catch (_) {}
            }
            // Laisser Electron enregistrer les destructions
            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            writeLog(`[QUIT] Unexpected error: ${e}`);
        } finally {
            writeLog('[QUIT] ==================== CALLING process.exit(0) ====================');
            clearTimeout(forceExitTimer);
            process.exit(0);
        }
    })();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});