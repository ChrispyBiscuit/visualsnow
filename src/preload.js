const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vs', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.send('settings:set', s),
  getDisplays: () => ipcRenderer.invoke('displays:get'),
  getInfo: () => ipcRenderer.invoke('app:info'),
  hotkeyStatus: () => ipcRenderer.invoke('hotkeys:status'),
  suspendHotkeys: (on) => ipcRenderer.send('hotkeys:suspend', !!on),
  toggle: () => ipcRenderer.send('overlay:toggle'),
  quit: () => ipcRenderer.send('app:quit'),
  hidePanel: () => ipcRenderer.send('panel:hide'),
  openExternal: (url) => ipcRenderer.send('shell:open', url),
  exportSettings: (json) => ipcRenderer.invoke('settings:export', json),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s))
});
