const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vs', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.send('settings:set', s),
  getDisplays: () => ipcRenderer.invoke('displays:get'),
  getInfo: () => ipcRenderer.invoke('app:info'),
  toggle: () => ipcRenderer.send('overlay:toggle'),
  quit: () => ipcRenderer.send('app:quit'),
  hidePanel: () => ipcRenderer.send('panel:hide'),
  exportSettings: (json) => ipcRenderer.invoke('settings:export', json),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onDisplay: (cb) => ipcRenderer.on('display', (_e, d) => cb(d))
});
