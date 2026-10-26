const { app, BrowserWindow, Tray, Menu, nativeImage, nativeTheme, screen, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Presets = require('./presets');

const REPO_URL = 'https://github.com/ChrispyBiscuit/visualsnow';

// Transparent windows on Linux need this before app is ready.
app.commandLine.appendSwitch('enable-transparent-visuals');
if (process.env.VS_USERDATA) app.setPath('userData', process.env.VS_USERDATA);

const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const isWin = process.platform === 'win32';

let settings = null;
let settingsPath = null;
const overlays = new Map(); // displayId -> BrowserWindow
let panel = null;
let tray = null;
let saveTimer = null;
let quitting = false;
let hotkeyStatus = {};
let hotkeysSuspended = false;

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
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) { raw = null; }
  settings = Presets.migrateSettings(raw);
  saveSettings();
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
// Rounded square, blue-to-navy, with a fixed scatter of dots. Supersampled for clean edges.
const ICON_DOTS = [[0.22, 0.30, 0.07], [0.68, 0.24, 0.06], [0.74, 0.62, 0.075], [0.40, 0.78, 0.06], [0.46, 0.46, 0.055], [0.18, 0.66, 0.05]];
function makeIcon(size, off) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4, r = 0.24;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cov = 0, dot = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
      const qx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (Math.hypot(qx, qy) <= r) {
        cov++;
        if (ICON_DOTS.some(([dx, dy, dr]) => Math.hypot(u - dx, v - dy) <= dr * (size < 24 ? 1.25 : 1))) dot++;
      }
    }
    const i = (y * size + x) * 4;
    const a = cov / (SS * SS); const d = cov ? dot / cov : 0;
    const t = (x + y) / (2 * size);
    let R = 74 + (29 - 74) * t, G = 99 + (35 - 99) * t, B = 216 + (64 - 216) * t;
    if (off) { const g = (R + G + B) / 3; R = G = B = g * 0.8; }
    buf[i] = Math.round(R + (255 - R) * d);
    buf[i + 1] = Math.round(G + (255 - G) * d);
    buf[i + 2] = Math.round(B + (255 - B) * d);
    buf[i + 3] = Math.round(255 * a * (off ? 0.6 : 1));
  }
  // nativeImage wants BGRA on all platforms
  for (let i = 0; i < buf.length; i += 4) { const t = buf[i]; buf[i] = buf[i + 2]; buf[i + 2] = t; }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}
function trayImage(off) {
  const img = makeIcon(isMac ? 18 : 16, off);
  const hi = makeIcon(isMac ? 36 : 32, off);
  img.addRepresentation({ scaleFactor: 2, width: hi.getSize().width, height: hi.getSize().height, buffer: hi.toBitmap() });
  return img;
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
  win.once('ready-to-show', () => { win.setBounds(b); win.showInactive(); });
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
// Other topmost windows, the Start menu, UAC prompts and some games push the
// overlay down the topmost stack and nothing puts it back. Re-assert on a timer.
let topTimer = null;
function keepOnTop() {
  clearInterval(topTimer);
  if (settings.keepOnTop === false) return;
  topTimer = setInterval(() => {
    if (!settings.enabled) return;
    for (const w of overlays.values()) {
      if (w.isDestroyed() || !w.isVisible()) continue;
      try {
        if (!w.isAlwaysOnTop()) w.setAlwaysOnTop(true, 'screen-saver', 1);
        w.moveTop();
      } catch (_) { /* window closing */ }
    }
  }, 1000);
}
function sendOverlays() { for (const w of overlays.values()) if (!w.isDestroyed()) w.webContents.send('settings', settings); }
function broadcast() {
  sendOverlays();
  if (panel && !panel.isDestroyed()) panel.webContents.send('settings', settings);
  updateTray();
}
function setEnabled(on) { settings.enabled = !!on; saveSettings(); broadcast(); }

// ---------- panel ----------
// The panel has one look, dark. Keep native menus and dialogs dark to match.
function applyTheme() { nativeTheme.themeSource = 'dark'; }
function showPanel() {
  if (panel && !panel.isDestroyed()) { panel.show(); panel.focus(); return; }
  panel = new BrowserWindow({
    width: 1280, height: 880, minWidth: 1080, minHeight: 720,
    title: 'Visual Snow Relief Kit',
    backgroundColor: '#121315',
    icon: makeIcon(128),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  panel.setMenuBarVisibility(false);
  panel.loadFile(path.join(__dirname, 'panel.html'));
  panel.once('ready-to-show', () => panel.show());
  panel.on('close', (e) => { if (!quitting) { e.preventDefault(); panel.hide(); } });
  panel.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// ---------- tray ----------
function updateTray() {
  if (!tray) return;
  const presetItems = Presets.PRESET_GROUPS.map((g) => ({
    label: g.name,
    submenu: Presets.BUILTIN.filter((p) => p.group === g.id).map((p) => ({
      label: p.name, type: 'radio', checked: settings.preset === p.id,
      click: () => { settings.preset = p.id; settings.layers = Presets.presetLayers(p.id); saveSettings(); broadcast(); }
    }))
  }));
  const menu = Menu.buildFromTemplate([
    { label: settings.enabled ? 'Overlay on' : 'Overlay off', type: 'checkbox', checked: !!settings.enabled, accelerator: settings.hotkeys.toggle || undefined, click: () => setEnabled(!settings.enabled) },
    { label: 'Open Visual Snow Relief Kit…', accelerator: settings.hotkeys.panel || undefined, click: showPanel },
    { type: 'separator' },
    { label: 'Presets', submenu: presetItems },
    { type: 'separator' },
    { label: 'Open settings folder', click: () => shell.showItemInFolder(settingsPath) },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.setImage(trayImage(!settings.enabled));
  tray.setToolTip('Visual Snow Relief Kit · ' + (settings.enabled ? 'on' : 'off'));
}
function makeTray() {
  tray = new Tray(trayImage(!settings.enabled));
  tray.on('click', () => { if (isWin) showPanel(); });
  tray.on('double-click', showPanel);
  updateTray();
}

// ---------- hotkeys ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  hotkeyStatus = {};
  if (hotkeysSuspended) return;
  const tryReg = (key, fn) => {
    const acc = settings.hotkeys[key];
    if (!acc) return;
    try { hotkeyStatus[key] = globalShortcut.register(acc, fn); } catch (_) { hotkeyStatus[key] = false; }
  };
  tryReg('toggle', () => setEnabled(!settings.enabled));
  tryReg('panel', showPanel);
}

function applyLoginItem() {
  if (isLinux || process.defaultApp) return;
  try { app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin, args: ['--hidden'] }); } catch (_) { /* unsupported */ }
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('displays:get', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor, label: d.label || '', internal: d.internal, primary: d.id === primary, hz: Math.round(d.displayFrequency || 0) || null }));
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, settingsPath, electron: process.versions.electron, repo: REPO_URL }));
ipcMain.handle('hotkeys:status', () => hotkeyStatus);
ipcMain.on('hotkeys:suspend', (_e, on) => { hotkeysSuspended = !!on; registerHotkeys(); });
ipcMain.on('settings:set', (_e, s) => {
  const prev = settings;
  settings = Presets.migrateSettings(s);
  saveSettings();
  if (JSON.stringify(settings.hotkeys) !== JSON.stringify(prev.hotkeys)) registerHotkeys();
  if (settings.launchAtLogin !== prev.launchAtLogin) applyLoginItem();
  keepOnTop();
  sendOverlays();
  updateTray();
});
ipcMain.on('overlay:toggle', () => setEnabled(!settings.enabled));
ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
ipcMain.on('panel:hide', () => panel && panel.hide());
ipcMain.on('shell:open', (_e, url) => { if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('settings:export', async (_e, json) => {
  const r = await dialog.showSaveDialog(panel, { defaultPath: 'visual-snow-preset.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
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
  const log = (m) => { console.log('[smoke]', m); try { fs.appendFileSync(path.join(outDir, 'log.txt'), m + '\n'); } catch (_) {} };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (_ev, level, msg, line, src) => { if (level >= 2) log(`console[${level}] ${path.basename(src || '')}:${line} ${msg}`); });
    wc.on('render-process-gone', (_ev, d) => log('renderer gone ' + JSON.stringify(d)));
  });
  setTimeout(async () => {
    try {
      const js = (code) => panel.webContents.executeJavaScript(code);
      const shot = async (name, rect) => fs.writeFileSync(path.join(outDir, name + '.png'), (await panel.webContents.capturePage(rect)).toPNG());
      log('migrated layers ' + JSON.stringify(settings.layers.map((l) => [l.type, l.mask && l.mask.shape, l.mod && l.mod.target])));
      for (const [i, w] of [...overlays.values()].entries()) {
        fs.writeFileSync(path.join(outDir, `overlay${i}.png`), (await w.webContents.capturePage()).toPNG());
        log(`overlay ${i} bounds ${JSON.stringify(w.getBounds())}`);
      }
      log('dlg ' + await js(`(()=>{const d=document.querySelector('dialog[open]'); return d ? d.id + ' op=' + getComputedStyle(d).opacity + ' disp=' + getComputedStyle(d).display + ' rect=' + JSON.stringify(d.getBoundingClientRect()) : 'none';})()`));
      await shot('firstrun');
      await js(`document.getElementById('frStart').click()`);
      await wait(1500); await shot('panel');
      await js(`window.__vs.openTypes('add')`); await wait(4000); await shot('types');
      await js(`document.getElementById('typeDlg').close()`);
      await js(`window.__vs.openPresets()`); await wait(4000); await shot('presets');
      await js(`document.getElementById('presetDlg').close()`);
      for (const tab of ['general', 'hotkeys', 'calibration', 'safety', 'about']) { await js(`window.__vs.openSettings('${tab}')`); await wait(300); await shot('settings-' + tab); }
      await js(`document.getElementById('settingsDlg').close()`);
      // one layer with every advanced feature in use
      await js(`(()=>{const L=VSPresets.layer('patchy',{mask:{shape:2,size:0.4,feather:0.5},mod:{target:2,depth:0.6,period:30},schedule:{on:true,from:'08:00',to:'20:00'},drift:[12,0]});window.__vs.setLayers([L]);window.__vs.setAdvanced(true);})()`);
      await wait(1500); await shot('advanced');
      await js(`window.__vs.setAdvanced(false)`);
      if (process.env.VS_SMOKE_TYPES) {
        const rect = await js(`(()=>{const r=document.getElementById('preview').getBoundingClientRect();return {x:Math.round(r.x)+1,y:Math.round(r.y)+1,width:480,height:300};})()`);
        for (const bg of ['light', 'dark']) {
          await js(`document.querySelector('#bgSeg [data-v=${bg}]').click()`);
          for (const t of Presets.TYPES) {
            await js(`window.__vs.setLayers([VSPresets.layer('${t.id}',{seed:4242,opacity:Math.min(1,VSPresets.layer('${t.id}').opacity*1.6)})])`);
            const f0 = await js('window.__vs.frames');
            for (let k = 0; k < 60 && (await js('window.__vs.frames')) < f0 + 3; k++) await wait(100);
            await wait(300);
            await shot(`type-${String(Presets.TYPE_INDEX[t.id]).padStart(2, '0')}-${t.id}-${bg}`, rect);
          }
        }
      }
      for (const [id, bg] of [['full', 'dark'], ['crt', 'scene'], ['film', 'light']]) {
        await js(`(()=>{window.__vs.setLayers(VSPresets.presetLayers('${id}')); document.querySelector('#bgSeg [data-v=${bg}]').click();})()`);
        await wait(1800); await shot('panel-' + id);
      }
      log('dom ' + await js(`JSON.stringify({layers: document.querySelectorAll('#layerList .layer').length, groups: [...document.querySelectorAll('.group-head')].map(x=>x.textContent)})`));
      log('shader ' + await js(`(()=>{const r=new NoiseRenderer(document.createElement('canvas')); r._use(VSPresets.TYPES.map((_,i)=>i)); return NoiseRenderer.caseCount()+' cases, all-types program compiled in '+r.compileMs.toFixed(0)+' ms';})()`));
      log('settings file ' + settingsPath + ' exists=' + fs.existsSync(settingsPath));
      log('done');
    } catch (e) { log('ERROR ' + e.stack); }
    quitting = true; app.quit();
  }, 6000);
}

// ---------- documentation screenshots (VS_DOCS=<outdir>) ----------
// Captures every screen, every noise type and every preset for docs/FEATURES.md.
function docShots() {
  const out = process.env.VS_DOCS;
  const img = path.join(out, 'images');
  for (const d of ['', 'types', 'presets']) fs.mkdirSync(path.join(img, d), { recursive: true });
  const log = (m) => { console.log('[docs]', m); try { fs.appendFileSync(path.join(out, 'docs-log.txt'), m + '\n'); } catch (_) {} };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  setTimeout(async () => {
    try {
      const js = (code) => panel.webContents.executeJavaScript(code);
      const shot = async (file, rect) => { fs.writeFileSync(path.join(img, file), (await panel.webContents.capturePage(rect)).toPNG()); log('wrote ' + file); };
      const settle = async (n = 3) => {
        const f0 = await js('window.__vs.frames');
        for (let k = 0; k < 120 && (await js('window.__vs.frames')) < f0 + n; k++) await wait(100);
        await js('window.__vs.renderStatus()'); await wait(1500);
      };
      const thumbs = async () => { for (let k = 0; k < 400 && (await js('window.__vs.thumbsPending()')) > 0; k++) await wait(250); await wait(900); };
      const rectOf = (sel) => js(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()`);
      await js('window.__vsHideFps = true');
      await wait(3000); await shot('first-run.png');
      await js(`document.getElementById('frStart').click()`); await wait(500);

      const scene = async (preset, bg, file, extra) => {
        await js(`(()=>{window.__vs.setAdvanced(false); window.__vs.setZoom(1); window.__vs.setPreset('${preset}'); window.__vs.setBg('${bg}'); ${extra || ''}})()`);
        await settle(); await shot(file);
      };
      await scene('full', 'dark', 'panel.png');
      await scene('clinical', 'scene', 'panel-scene.png');
      await scene('film', 'light', 'panel-light.png');
      await scene('eyes-closed', 'dark', 'panel-eyes-closed.png');
      await js(`(()=>{window.__vs.setLayers([VSPresets.layer('snow',{name:'Peripheral snow',density:0.06,opacity:0.6,mask:{shape:2,size:0.45,feather:0.6},mod:{target:2,depth:0.6,period:45},color:[0.85,0.8,1],colorMix:0.4})]); window.__vs.setBg('scene'); window.__vs.setAdvanced(true);})()`);
      await settle(); await shot('panel-advanced.png');
      await js(`(()=>{window.__vs.setAdvanced(false); window.__vs.setPreset('clinical'); window.__vs.setBg('dark'); window.__vs.setZoom(4);})()`);
      await settle(); await shot('zoom-4x.png', await rectOf('#display'));
      await js('window.__vs.setZoom(1)');

      await js(`window.__vs.setPreset('full')`); await settle();
      await js(`(()=>{const li=document.querySelector('.lrow'); const r=li.getBoundingClientRect(); li.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.x+120,clientY:r.y+30}));})()`);
      await wait(2500); log('menu hidden=' + await js(`document.getElementById('ctx').hidden`)); await shot('layer-menu.png');
      await js(`document.getElementById('ctx').hidden = true`);

      await js(`window.__vs.openTypes('add')`); await thumbs(); await shot('gallery-types.png');
      const fams = await js('VSPresets.FAMILIES.map(f=>f.id)');
      for (let i = 0; i < fams.length; i++) {
        await js(`document.querySelectorAll('#familyTabs button')[${i + 1}].click()`); await thumbs(); await shot(`gallery-${fams[i]}.png`);
      }
      await js(`document.querySelectorAll('#familyTabs button')[0].click(); document.getElementById('typeDlg').close()`);
      await js(`window.__vs.openPresets()`); await thumbs(); await shot('gallery-presets.png');
      await js(`document.getElementById('presetDlg').close()`);
      for (const tab of ['general', 'displays', 'hotkeys', 'calibration', 'safety', 'about']) {
        await js(`window.__vs.openSettings('${tab}')`); await wait(2000); await shot(`settings-${tab}.png`);
      }
      await js(`document.getElementById('settingsDlg').close()`);

      // Every type and preset on a split background: dark on the left, light on the right.
      await js(`(()=>{window.__vs.setBg('dark'); const p=document.getElementById('preview'); p.style.background='linear-gradient(90deg,#08090a 0 50%,#f4f3ef 50% 100%)';})()`);
      const prev = await rectOf('#preview');
      const types = await js('VSPresets.TYPES.map(t=>t.id)');
      for (let i = 0; i < types.length; i++) {
        await js(`window.__vs.setLayers([VSPresets.layer('${types[i]}',{seed:4242,opacity:Math.min(1,VSPresets.layer('${types[i]}').opacity*1.5)})])`);
        await settle(); await shot(`types/${String(i).padStart(2, '0')}-${types[i]}.png`, prev);
      }
      const presets = await js('VSPresets.BUILTIN.map(b=>b.id)');
      for (const id of presets) { await js(`window.__vs.setPreset('${id}')`); await settle(); await shot(`presets/${id}.png`, prev); }
      await js(`document.getElementById('preview').style.background=''`);
      fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
        families: Presets.FAMILIES.map((f) => ({ id: f.id, name: f.name, desc: f.desc })),
        types: Presets.TYPES.map((t, i) => ({ i, id: t.id, name: t.name, family: t.family, look: t.look, flash: !!t.flash })),
        groups: Presets.PRESET_GROUPS,
        presets: Presets.BUILTIN.map((b) => ({ id: b.id, group: b.group, name: b.name, desc: b.desc, layers: b.make().map((l) => Presets.BY_ID[l.type].name) }))
      }, null, 2));
      log('done');
    } catch (e) { log('ERROR ' + e.stack); }
    quitting = true; app.quit();
  }, 6000);
}

// ---------- lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', showPanel);
  app.whenReady().then(() => {
    loadSettings();
    applyTheme();
    if (isMac && app.dock) app.dock.hide();
    makeTray();
    registerHotkeys();
    applyLoginItem();
    const start = () => {
      rebuildOverlays();
      keepOnTop();
      if (!process.argv.includes('--hidden')) showPanel();
    };
    // Linux transparency needs a short delay after ready.
    if (isLinux) setTimeout(start, 400); else start();
    if (process.env.VS_SMOKE) smokeTest();
    if (process.env.VS_DOCS) docShots();
    screen.on('display-added', rebuildOverlays);
    screen.on('display-removed', rebuildOverlays);
    screen.on('display-metrics-changed', rebuildOverlays);
  });
  app.on('window-all-closed', () => { /* keep running in tray */ });
  app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); });
  app.on('activate', showPanel);
}
