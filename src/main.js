const { app, BrowserWindow, Tray, Menu, nativeImage, screen, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Presets = require('./presets');

// Transparent windows on Linux need this before app is ready.
app.commandLine.appendSwitch('enable-transparent-visuals');

const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const isWin = process.platform === 'win32';

let settings = null;
let settingsPath = null;
let overlays = new Map(); // displayId -> BrowserWindow
let panel = null;
let tray = null;
let saveTimer = null;
let quitting = false;

// ---------- settings file ----------
function resolveSettingsPath() {
  const name = 'visual-snow-settings.json';
  if (!isMac && !process.defaultApp) {
    const exeDir = path.dirname(process.execPath);
    try {
      fs.accessSync(exeDir, fs.constants.W_OK);
      return path.join(exeDir, name); // portable mode
    } catch (_) { /* fall through */ }
  }
  return path.join(app.getPath('userData'), name);
}
function loadSettings() {
  settingsPath = resolveSettingsPath();
  const d = Presets.defaults();
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings = Object.assign(d, raw);
    settings.hotkeys = Object.assign(d.hotkeys, raw.hotkeys || {});
    settings.calibration = Object.assign(d.calibration, raw.calibration || {});
    if (!Array.isArray(settings.layers)) settings.layers = d.layers;
  } catch (_) {
    settings = d;
    saveSettings();
  }
}
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (e) { console.error('save failed', e); }
  }, 300);
}

// ---------- icon ----------
function makeIcon(size) {
  // Simple generated icon: dark rounded square with scattered white dots.
  const buf = Buffer.alloc(size * size * 4);
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const m = size * 0.12;
    const inside = x >= m * 0.3 && x < size - m * 0.3 && y >= m * 0.3 && y < size - m * 0.3;
    if (!inside) { buf[i + 3] = 0; continue; }
    const dot = rnd() < 0.08;
    const v = dot ? 235 : 40 + Math.floor(rnd() * 20);
    buf[i] = v; buf[i + 1] = v; buf[i + 2] = dot ? 255 : v + 10; buf[i + 3] = 255;
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// ---------- overlays ----------
function overlayFor(display) {
  const b = display.bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, hasShadow: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, show: false, enableLargerThanScreen: true,
    title: 'Visual Snow Relief Kit overlay',
    type: isLinux ? 'dock' : (isMac ? 'panel' : undefined),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false }
  });
  win.setIgnoreMouseEvents(true, { forward: false });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'overlay.html'), { query: { display: String(display.id) } });
  win.once('ready-to-show', () => {
    win.setBounds(b);
    win.showInactive();
  });
  win.on('closed', () => overlays.delete(display.id));
  return win;
}
function rebuildOverlays() {
  const displays = screen.getAllDisplays();
  const ids = new Set(displays.map((d) => d.id));
  for (const [id, w] of overlays) if (!ids.has(id)) { w.destroy(); overlays.delete(id); }
  for (const d of displays) {
    const w = overlays.get(d.id);
    if (w && !w.isDestroyed()) { w.setBounds(d.bounds); continue; }
    overlays.set(d.id, overlayFor(d));
  }
}
function broadcast() {
  for (const w of overlays.values()) if (!w.isDestroyed()) w.webContents.send('settings', settings);
  if (panel && !panel.isDestroyed()) panel.webContents.send('settings', settings);
  updateTray();
}
function setEnabled(on) {
  settings.enabled = !!on;
  saveSettings();
  broadcast();
}

// ---------- panel ----------
function showPanel() {
  if (panel && !panel.isDestroyed()) { panel.show(); panel.focus(); return; }
  panel = new BrowserWindow({
    width: 980, height: 720, minWidth: 760, minHeight: 520,
    title: 'Visual Snow Relief Kit — Control Panel',
    backgroundColor: '#14161a',
    icon: makeIcon(64),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  panel.setMenuBarVisibility(false);
  panel.loadFile(path.join(__dirname, 'panel.html'));
  panel.on('close', (e) => { if (!quitting) { e.preventDefault(); panel.hide(); } });
}

// ---------- tray ----------
function updateTray() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: settings.enabled ? 'Overlay: ON' : 'Overlay: OFF', enabled: false },
    { label: settings.enabled ? 'Turn off' : 'Turn on', accelerator: settings.hotkeys.toggle, click: () => setEnabled(!settings.enabled) },
    { label: 'Control panel…', accelerator: settings.hotkeys.panel, click: showPanel },
    { type: 'separator' },
    { label: 'Presets', submenu: Presets.BUILTIN.map((p) => ({ label: p.name, type: 'radio', checked: settings.preset === p.id, click: () => { settings.preset = p.id; settings.layers = Presets.presetLayers(p.id); saveSettings(); broadcast(); } })) },
    { type: 'separator' },
    { label: 'Open settings folder', click: () => shell.showItemInFolder(settingsPath) },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('Visual Snow Relief Kit — ' + (settings.enabled ? 'on' : 'off'));
}
function makeTray() {
  const img = makeIcon(isMac ? 22 : 32);
  if (isMac) img.setTemplateImage(false);
  tray = new Tray(img);
  tray.on('click', () => { if (isWin) showPanel(); });
  tray.on('double-click', showPanel);
  updateTray();
}

// ---------- hotkeys ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const tryReg = (acc, fn) => { try { if (acc) globalShortcut.register(acc, fn); } catch (e) { console.error('hotkey failed', acc, e.message); } };
  tryReg(settings.hotkeys.toggle, () => setEnabled(!settings.enabled));
  tryReg(settings.hotkeys.panel, showPanel);
}

function applyLoginItem() {
  if (isLinux || process.defaultApp) return;
  try { app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin, args: ['--hidden'] }); } catch (_) {}
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('displays:get', () => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor, label: d.label || '', internal: d.internal, primary: d.id === screen.getPrimaryDisplay().id })));
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, settingsPath, electron: process.versions.electron }));
ipcMain.on('settings:set', (_e, s) => {
  const prevHot = JSON.stringify(settings.hotkeys);
  const prevLogin = settings.launchAtLogin;
  settings = s;
  saveSettings();
  if (JSON.stringify(settings.hotkeys) !== prevHot) registerHotkeys();
  if (settings.launchAtLogin !== prevLogin) applyLoginItem();
  for (const w of overlays.values()) if (!w.isDestroyed()) w.webContents.send('settings', settings);
  updateTray();
});
ipcMain.on('overlay:toggle', () => setEnabled(!settings.enabled));
ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
ipcMain.on('panel:hide', () => panel && panel.hide());
ipcMain.handle('settings:export', async (_e, json) => {
  const r = await dialog.showSaveDialog(panel, { defaultPath: 'visual-snow-preset.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, json);
  return true;
});
ipcMain.handle('settings:import', async () => {
  const r = await dialog.showOpenDialog(panel, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch (e) { return { error: e.message }; }
});

// ---------- smoke test (VS_SMOKE=<outdir>) ----------
function smokeTest() {
  const outDir = process.env.VS_SMOKE;
  const log = (m) => console.log('[smoke]', m);
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (_ev, level, msg, line, src) => log(`console[${level}] ${path.basename(src)}:${line} ${msg}`));
    wc.on('render-process-gone', (_ev, d) => log('renderer gone ' + JSON.stringify(d)));
  });
  setTimeout(async () => {
    try {
      let i = 0;
      for (const w of overlays.values()) {
        const img = await w.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `overlay${i++}.png`), img.toPNG());
        log(`overlay bounds ${JSON.stringify(w.getBounds())} ignoreMouse ok`);
      }
      if (panel) {
        const img = await panel.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, 'panel.png'), img.toPNG());
        // walk through every preset and type to shake out shader/UI errors
        for (const p of Presets.BUILTIN) {
          await panel.webContents.executeJavaScript(`(()=>{const s=document.getElementById('preset');s.value=${JSON.stringify(p.id)};s.dispatchEvent(new Event('change'));})()`);
          await new Promise((r) => setTimeout(r, 250));
        }
        await panel.webContents.executeJavaScript(`(()=>{document.querySelector('[data-bg=scene]').click();})()`);
        await new Promise((r) => setTimeout(r, 1200));
        log('dom ' + await panel.webContents.executeJavaScript(`JSON.stringify({enabled: document.getElementById('enabled').checked, preview: document.getElementById('preview').className, layers: document.querySelectorAll('#layers li').length})`));
        const img2 = await panel.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, 'panel2.png'), img2.toPNG());
        if (process.env.VS_SMOKE_TYPES) {
          for (const bg of ['light', 'dark']) {
            await panel.webContents.executeJavaScript(`document.querySelector('[data-bg=${bg}]').click()`);
            for (const t of Presets.TYPES) {
              await panel.webContents.executeJavaScript(`(()=>{while(document.querySelector('#del')&&document.querySelectorAll('#layers li').length){document.querySelector('#del').click();}const s=document.getElementById('addType');s.value=${JSON.stringify(t.id)};document.getElementById('add').click();})()`);
              await new Promise((r) => setTimeout(r, 1500));
              const rect = await panel.webContents.executeJavaScript(`(()=>{const r=document.getElementById('preview').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()`);
              const im = await panel.webContents.capturePage(rect);
              fs.writeFileSync(path.join(outDir, `type-${t.id}-${bg}.png`), im.toPNG());
            }
          }
        }
      }
      log('settings file ' + settingsPath + ' exists=' + fs.existsSync(settingsPath));
      log('done');
    } catch (e) { log('ERROR ' + e.stack); }
    quitting = true; app.quit();
  }, 4000);
}

// ---------- lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', showPanel);
  app.whenReady().then(() => {
    loadSettings();
    if (isMac && app.dock) app.dock.hide();
    makeTray();
    registerHotkeys();
    applyLoginItem();
    const start = () => {
      rebuildOverlays();
      if (!process.argv.includes('--hidden')) showPanel();
    };
    // Linux transparency needs a short delay after ready.
    if (isLinux) setTimeout(start, 400); else start();
    if (process.env.VS_SMOKE) smokeTest();
    screen.on('display-added', rebuildOverlays);
    screen.on('display-removed', rebuildOverlays);
    screen.on('display-metrics-changed', rebuildOverlays);
  });
  app.on('window-all-closed', (e) => { /* keep running in tray */ });
  app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); });
  app.on('activate', showPanel);
}
