const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  onMaximizeChange: (callback) => ipcRenderer.on('window-maximize-change', (_e, isMax) => callback(isMax)),
  close: () => ipcRenderer.send('window-close'),
  
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  
  // Window management
  openNewWindow: (data) => ipcRenderer.send('open-new-window', data),
  onPopoutStatusChange: (callback) => ipcRenderer.on('popout-status-change', callback),

  // Pop-out system
  openPopout: (data) => ipcRenderer.send('open-popout', data),
  closePopout: (viewId) => ipcRenderer.send('close-popout', viewId),
  closeAllPopouts: () => ipcRenderer.send('close-all-popouts'),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // System notifications
  showNotification: (opts) => ipcRenderer.send('show-notification', opts),

  // Telemetry
  openTelemetryWindow: () => ipcRenderer.send('open-telemetry-window'),

  // Hardware hotkeys (Phase 3 — button-box / wheel bridge)
  hardware: {
    sendInput:      (data)    => ipcRenderer.send('hw:input', data),
    reloadHotkeys:  ()        => ipcRenderer.send('hw:reloadHotkeys'),
  },

  // Overlays (Phase 1/4 — in-game widgets + designer)
  overlays: {
    getState:       ()                => ipcRenderer.invoke('overlays:getState'),
    saveConfig:     ()                => ipcRenderer.invoke('overlays:saveConfig'),
    toggle:         (id)              => ipcRenderer.send('overlays:toggle', id),
    showAll:        ()                => ipcRenderer.send('overlays:showAll'),
    hideAll:        ()                => ipcRenderer.send('overlays:hideAll'),
    setEditMode:    (enabled)         => ipcRenderer.send('overlays:setEditMode', !!enabled),
    setForceShow:   (enabled)         => ipcRenderer.send('overlays:setForceShow', !!enabled),
    setIgnoreMouse: (enabled)         => ipcRenderer.send('overlays:setIgnoreMouse', !!enabled),
    setEnabled:     (id, enabled)     => ipcRenderer.send('overlays:setEnabled', { id, enabled: !!enabled }),
    updateBounds:   (id, bounds)      => ipcRenderer.send('overlays:updateBounds', { id, bounds }),
    reload:         ()                => ipcRenderer.send('overlays:reload'),
    openDesigner:   ()                => ipcRenderer.send('overlays:openDesigner'),
    listHudAssets:  ()                => ipcRenderer.invoke('overlays:listHudAssets'),
    hotkeysGet:     ()                => ipcRenderer.invoke('hotkeys:get'),
    hotkeysSave:    (bindings)        => ipcRenderer.invoke('hotkeys:save', bindings),
    setFocus:       (id)              => ipcRenderer.send('overlays:setFocus', id),
    focusNext:      (dir)             => ipcRenderer.send('overlays:focusNext', dir || +1),
    cyclePage:      (dir)             => ipcRenderer.send('overlays:cyclePage', dir || +1),
    toggleShow:     ()                => ipcRenderer.send('overlays:toggleShow'),
    onHwInput:      (cb)              => ipcRenderer.on('hw:input-broadcast', (_e, data) => cb(data)),
    onEditMode:     (cb)              => ipcRenderer.on('overlay:edit-mode', (_e, enabled) => cb(enabled)),
    onForceShow:    (cb)              => ipcRenderer.on('overlay:force-show', (_e, enabled) => cb(enabled)),
    onFocus:        (cb)              => ipcRenderer.on('overlay:focus',     (_e, isFocused) => cb(isFocused)),
    onCyclePage:    (cb)              => ipcRenderer.on('overlay:cyclePage', (_e, dir) => cb(dir)),
    onSetPage:      (cb)              => ipcRenderer.on('overlay:setPage',   (_e, idx) => cb(idx)),
  },

  // Telemetry local storage (.pwtel files under userData/pitwall/telemetry/<lineupId>/)
  telemetry: {
    getDir:    ()        => ipcRenderer.invoke('telemetry:getDir'),
    save:      (args)    => ipcRenderer.invoke('telemetry:save',      args),
    load:      (args)    => ipcRenderer.invoke('telemetry:load',      args),
    list:      (args)    => ipcRenderer.invoke('telemetry:list',      args),
    remove:    (args)    => ipcRenderer.invoke('telemetry:remove',    args),
    importRaw: (args)    => ipcRenderer.invoke('telemetry:importRaw', args),
    // NEW: parse a MoTeC .ld/.ldx buffer via the local Python backend.
    // Main process POSTs the bytes to http://127.0.0.1:54345/api/telemetry/parse_motec
    // and returns the snapshot JSON (same shape as TelemetryBuffer.snapshot()).
    parseMotec: (args)   => ipcRenderer.invoke('telemetry:parseMotec', args),
  }
});
