// overlay-manager.js — Phase 1 : système de fenêtrage des overlays in-game
// Lit overlays-config.json et spawn une BrowserWindow transparente par widget.

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_FILE = 'overlays-config.json';

class OverlayManager {
    constructor() {
        this.widgets = {};          // id -> BrowserWindow
        this.configs = {};          // id -> widget config
        this.editMode = false;
        this.forceShow = false;     // manual "Show on Screen" override
        this.globallyHidden = false; // toggleShow state (user pressed hide)
        this.focusedId = null;      // which overlay is currently focused (ring visible)
        this.configPath = null;
        this._preloadPath = null;
    }

    // ─── INIT ────────────────────────────────────────────────────────────────
    init({ baseDir, preloadPath }) {
        this.configPath = path.join(baseDir, CONFIG_FILE);
        this._preloadPath = preloadPath;
        this.loadConfig();
        this.spawnAll();
    }

    loadConfig() {
        try {
            const raw = fs.readFileSync(this.configPath, 'utf8');
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed) ? parsed : (parsed.widgets || []);
            this.configs = {};
            for (const w of list) this.configs[w.id] = w;
            console.log(`[OverlayManager] Loaded ${list.length} widget(s) from ${CONFIG_FILE}`);
        } catch (err) {
            console.warn(`[OverlayManager] No config loaded (${err.message}) — starting empty.`);
            this.configs = {};
        }
    }

    saveConfig() {
        try {
            const list = Object.values(this.configs);
            fs.writeFileSync(this.configPath, JSON.stringify({ widgets: list }, null, 2), 'utf8');
        } catch (err) {
            console.error('[OverlayManager] saveConfig failed:', err.message);
        }
    }

    // ─── LIFECYCLE ───────────────────────────────────────────────────────────
    spawnAll() {
        for (const cfg of Object.values(this.configs)) {
            if (cfg.enabled === false) continue;
            this.createWidget(cfg);
        }
    }

    createWidget(cfg) {
        if (this.widgets[cfg.id]) return this.widgets[cfg.id];

        const htmlFile = path.join(path.dirname(this.configPath), `${cfg.type}.html`);
        if (!fs.existsSync(htmlFile)) {
            console.warn(`[OverlayManager] Widget "${cfg.id}" skipped — missing ${cfg.type}.html`);
            return null;
        }

        const displays = screen.getAllDisplays();
        const target = displays[cfg.displayIndex] || screen.getPrimaryDisplay();

        const win = new BrowserWindow({
            width: cfg.w,
            height: cfg.h,
            x: target.bounds.x + (cfg.x || 0),
            y: target.bounds.y + (cfg.y || 0),
            frame: false,
            transparent: true,
            resizable: false,
            movable: true,
            skipTaskbar: true,
            focusable: false,
            hasShadow: false,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: this._preloadPath
            }
        });

        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        win.setIgnoreMouseEvents(!this.editMode, { forward: true });
        win.loadFile(htmlFile);

        win.once('ready-to-show', () => {
            win.show();
            // Sync current edit / force-show / focus state to the freshly loaded widget
            try {
                win.webContents.send('overlay:edit-mode', this.editMode);
                win.webContents.send('overlay:force-show', this.forceShow);
                win.webContents.send('overlay:focus', this.focusedId === cfg.id);
            } catch (_) {}
        });
        win.on('closed', () => { delete this.widgets[cfg.id]; });

        this.widgets[cfg.id] = win;
        return win;
    }

    destroyWidget(id) {
        const win = this.widgets[id];
        if (win && !win.isDestroyed()) win.destroy();
        delete this.widgets[id];
    }

    destroyAll() {
        const ids = Object.keys(this.widgets);
        for (const id of ids) {
            const win = this.widgets[id];
            try {
                if (win && !win.isDestroyed()) {
                    win.webContents.forcefullyCrashRenderer(); // ← force kill du renderer process
                    win.destroy();
                }
            } catch (_) {}
            delete this.widgets[id];
        }
    }

    // ─── ACTIONS ─────────────────────────────────────────────────────────────
    toggleWidget(id) {
        const win = this.widgets[id];
        if (!win) {
            const cfg = this.configs[id];
            if (cfg) this.createWidget(cfg);
            return;
        }
        if (win.isVisible()) win.hide(); else win.show();
    }

    showAll() { this.globallyHidden = false; for (const w of Object.values(this.widgets)) w.show(); }
    hideAll() { this.globallyHidden = true;  for (const w of Object.values(this.widgets)) w.hide(); }

    // Global Show/Hide toggle — bound to hotkey `toggleShow`
    toggleShowAll() {
        if (this.globallyHidden) this.showAll(); else this.hideAll();
    }

    // Ordered list of enabled widget ids (used by focusNext)
    _enabledOrder() {
        return Object.values(this.configs)
            .filter(c => c.enabled !== false)
            .map(c => c.id);
    }

    // Broadcast focus ring to every widget (each decides whether to show its ring)
    _broadcastFocus() {
        for (const [id, win] of Object.entries(this.widgets)) {
            if (win.isDestroyed()) continue;
            try { win.webContents.send('overlay:focus', id === this.focusedId); } catch (_) {}
        }
    }

    setFocus(id) {
        this.focusedId = id || null;
        this._broadcastFocus();
    }

    // Cycle focus through enabled overlays. dir = +1 or -1
    focusNext(dir = +1) {
        const order = this._enabledOrder();
        if (!order.length) return;
        const idx = order.indexOf(this.focusedId);
        // If no focus yet → start at 0 (next) or last (prev)
        let nextIdx;
        if (idx < 0) nextIdx = dir > 0 ? 0 : order.length - 1;
        else         nextIdx = (idx + dir + order.length) % order.length;
        this.focusedId = order[nextIdx];
        this._broadcastFocus();
    }

    // Send page cycle to the focused widget (no-op if none)
    cycleFocusedPage(dir = +1) {
        if (!this.focusedId) {
            // No focus yet → auto-focus first enabled overlay
            this.focusNext(+1);
            if (!this.focusedId) return;
        }
        this.sendToWidget(this.focusedId, 'overlay:cyclePage', dir);
    }

    // Click-through global : true = les clics traversent, false = interactif
    setIgnoreMouse(enabled) {
        for (const w of Object.values(this.widgets)) {
            if (!w.isDestroyed()) w.setIgnoreMouseEvents(!!enabled, { forward: true });
        }
    }

    // Edit mode : overlays capturent les clics, bordure visible dans le widget
    setEditMode(enabled) {
        this.editMode = !!enabled;
        this.setIgnoreMouse(!this.editMode);
        for (const w of Object.values(this.widgets)) {
            if (!w.isDestroyed()) w.webContents.send('overlay:edit-mode', this.editMode);
        }
    }

    // Force-show : manual override that bypasses the is_driving auto-hide gate
    setForceShow(enabled) {
        this.forceShow = !!enabled;
        for (const w of Object.values(this.widgets)) {
            if (!w.isDestroyed()) w.webContents.send('overlay:force-show', this.forceShow);
        }
    }

    // Replace bounds of a widget (used by the designer in Phase 4)
    updateWidgetBounds(id, { displayIndex, x, y, w, h }) {
        const cfg = this.configs[id];
        if (!cfg) return;
        if (displayIndex != null) cfg.displayIndex = displayIndex;
        if (x != null) cfg.x = x;
        if (y != null) cfg.y = y;
        if (w != null) cfg.w = w;
        if (h != null) cfg.h = h;

        const win = this.widgets[id];
        if (win && !win.isDestroyed()) {
            const displays = screen.getAllDisplays();
            const target = displays[cfg.displayIndex] || screen.getPrimaryDisplay();
            win.setBounds({
                x: target.bounds.x + cfg.x,
                y: target.bounds.y + cfg.y,
                width: cfg.w,
                height: cfg.h
            });
        }
        this.saveConfig();
    }

    getState() {
        return {
            editMode: this.editMode,
            forceShow: this.forceShow,
            focusedId: this.focusedId,
            globallyHidden: this.globallyHidden,
            widgets: Object.values(this.configs).map(cfg => ({
                ...cfg,
                running: !!this.widgets[cfg.id],
                visible: !!(this.widgets[cfg.id] && this.widgets[cfg.id].isVisible())
            })),
            displays: screen.getAllDisplays().map((d, i) => ({
                index: i,
                id: d.id,
                bounds: d.bounds,
                workArea: d.workArea,
                scaleFactor: d.scaleFactor,
                primary: d.id === screen.getPrimaryDisplay().id
            }))
        };
    }

    // Send a custom IPC message to a single widget (e.g. page switch from hardware)
    sendToWidget(id, channel, payload) {
        const win = this.widgets[id];
        if (!win || win.isDestroyed()) return;
        try { win.webContents.send(channel, payload); }
        catch (err) { console.warn(`[OverlayManager] sendToWidget ${id}/${channel} failed:`, err.message); }
    }

    // Enable/disable a widget (creates or destroys its BrowserWindow accordingly)
    setEnabled(id, enabled) {
        const cfg = this.configs[id];
        if (!cfg) return;
        cfg.enabled = !!enabled;
        if (cfg.enabled) {
            if (!this.widgets[id]) this.createWidget(cfg);
        } else {
            this.destroyWidget(id);
        }
        this.saveConfig();
    }

    // ─── IPC BINDINGS ────────────────────────────────────────────────────────
    registerIpc() {
        ipcMain.handle('overlays:getState',       () => this.getState());
        ipcMain.handle('overlays:saveConfig',     () => { this.saveConfig(); return true; });
        ipcMain.on('overlays:toggle',             (_e, id) => this.toggleWidget(id));
        ipcMain.on('overlays:showAll',            () => this.showAll());
        ipcMain.on('overlays:hideAll',            () => this.hideAll());
        ipcMain.on('overlays:setEditMode',        (_e, enabled) => this.setEditMode(enabled));
        ipcMain.on('overlays:setForceShow',       (_e, enabled) => this.setForceShow(enabled));
        ipcMain.on('overlays:setIgnoreMouse',     (_e, enabled) => this.setIgnoreMouse(enabled));
        ipcMain.on('overlays:setEnabled',         (_e, { id, enabled }) => this.setEnabled(id, enabled));
        ipcMain.on('overlays:updateBounds',       (_e, { id, bounds }) => this.updateWidgetBounds(id, bounds || {}));
        ipcMain.on('overlays:reload',             () => { this.destroyAll(); this.loadConfig(); this.spawnAll(); });
        ipcMain.on('overlays:setFocus',           (_e, id) => this.setFocus(id));
        ipcMain.on('overlays:focusNext',          (_e, dir) => this.focusNext(dir || +1));
        ipcMain.on('overlays:cyclePage',          (_e, dir) => this.cycleFocusedPage(dir || +1));
        ipcMain.on('overlays:toggleShow',         () => this.toggleShowAll());
    }
}

module.exports = new OverlayManager();
