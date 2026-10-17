/* global VSPresets, NoiseRenderer */
(async function () {
  const $ = (id) => document.getElementById(id);
  const P = VSPresets;
  let S = await window.vs.getSettings();
  let displays = await window.vs.getDisplays();
  const info = await window.vs.getInfo();
  let sel = S.layers[0] ? S.layers[0].id : null;
  let pushTimer = null;

  // ---------- preview ----------
  let pv = null;
  try { pv = new NoiseRenderer($('pv')); pv.start(60); } catch (e) { $('preview').innerHTML = '<div class="hint" style="padding:12px">WebGL2 not available: ' + e.message + '</div>'; }
  $('bgSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...$('bgSeg').children].forEach((x) => x.classList.toggle('on', x === b));
    $('preview').className = 'preview bg-' + b.dataset.bg;
  });

  // ---------- helpers ----------
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => window.vs.setSettings(S), 40);
    if (pv) pv.setLayers(S.layers, S.globalOpacity);
    renderStatus();
  }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800); }
  const cur = () => S.layers.find((l) => l.id === sel);
  const rgb2hex = (c) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  function fmt(v, d) { return Number(v).toFixed(d == null ? 2 : d); }

  // ---------- status / about ----------
  function renderStatus() {
    const on = S.layers.filter((l) => l.enabled).length;
    $('status').textContent = (S.enabled ? 'Overlay on' : 'Overlay off') + ' · ' + on + ' active layer' + (on === 1 ? '' : 's') + ' · ' + displays.length + ' display' + (displays.length === 1 ? '' : 's');
    $('enabled').checked = S.enabled;
  }
  $('about').innerHTML = 'Version ' + info.version + ' · Electron ' + info.electron + ' · ' + info.platform + '<br>Settings file: <code>' + info.settingsPath + '</code>';

  // ---------- presets ----------
  function renderPresets() {
    const sel_ = $('preset'); sel_.innerHTML = '';
    const g1 = document.createElement('optgroup'); g1.label = 'Built in';
    P.BUILTIN.forEach((p) => { const o = new Option(p.name, p.id); g1.appendChild(o); });
    sel_.appendChild(g1);
    if (S.userPresets && S.userPresets.length) {
      const g2 = document.createElement('optgroup'); g2.label = 'Mine';
      S.userPresets.forEach((p) => g2.appendChild(new Option(p.name, 'user:' + p.id)));
      sel_.appendChild(g2);
    }
    sel_.appendChild(new Option('Custom (edited)', 'custom'));
    sel_.value = S.preset || 'custom';
    if (![...sel_.options].some((o) => o.value === sel_.value)) sel_.value = 'custom';
    $('deletePreset').hidden = !String(sel_.value).startsWith('user:');
  }
  $('preset').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'custom') return;
    if (v.startsWith('user:')) {
      const p = S.userPresets.find((x) => x.id === v.slice(5));
      if (p) S.layers = JSON.parse(JSON.stringify(p.layers)).map((l) => Object.assign(P.layer(l.type), l, { id: P.layer(l.type).id }));
    } else S.layers = P.presetLayers(v);
    S.preset = v;
    sel = S.layers[0] ? S.layers[0].id : null;
    renderAll(); push();
  });
  function askName(def) {
    return new Promise((res) => {
      const dlg = $('nameDlg'); $('nameInput').value = def;
      dlg.onclose = () => res(dlg.returnValue === 'ok' ? $('nameInput').value.trim() : '');
      dlg.showModal();
    });
  }
  $('savePreset').addEventListener('click', async () => {
    const name = await askName('My snow');
    if (!name) return;
    const id = Date.now().toString(36);
    S.userPresets = S.userPresets || [];
    S.userPresets.push({ id, name, layers: JSON.parse(JSON.stringify(S.layers)) });
    S.preset = 'user:' + id;
    renderPresets(); push(); toast('Saved preset');
  });
  $('deletePreset').addEventListener('click', () => {
    const v = $('preset').value; if (!v.startsWith('user:')) return;
    S.userPresets = S.userPresets.filter((p) => p.id !== v.slice(5));
    S.preset = 'custom'; renderPresets(); push();
  });
  $('export').addEventListener('click', async () => {
    const ok = await window.vs.exportSettings(JSON.stringify({ version: 1, name: 'Visual Snow export', layers: S.layers, globalOpacity: S.globalOpacity }, null, 2));
    if (ok) toast('Exported');
  });
  $('import').addEventListener('click', async () => {
    const r = await window.vs.importSettings();
    if (!r) return;
    if (r.error || !Array.isArray(r.layers)) { toast('Could not read that file'); return; }
    S.layers = r.layers.map((l) => Object.assign(P.layer(l.type in P.TYPE_INDEX ? l.type : 'snow'), l));
    if (typeof r.globalOpacity === 'number') S.globalOpacity = r.globalOpacity;
    S.preset = 'custom'; sel = S.layers[0] ? S.layers[0].id : null;
    renderAll(); push(); toast('Imported');
  });
  function markCustom() { S.preset = 'custom'; $('preset').value = 'custom'; $('deletePreset').hidden = true; }

  // ---------- layer list ----------
  function renderLayers() {
    const ul = $('layers'); ul.innerHTML = '';
    S.layers.forEach((L, i) => {
      const li = document.createElement('li');
      li.className = (L.id === sel ? 'sel ' : '') + (L.enabled ? '' : 'off');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = L.enabled; cb.title = 'Enable';
      cb.addEventListener('click', (e) => { e.stopPropagation(); L.enabled = cb.checked; markCustom(); renderLayers(); push(); });
      const t = document.createElement('div'); t.className = 't';
      const tname = P.TYPES[P.TYPE_INDEX[L.type]].name;
      t.innerHTML = '<b></b><small></small>';
      t.querySelector('b').textContent = L.name || tname;
      t.querySelector('small').textContent = tname + ' · ' + L.size + ' px · ' + fmt(L.rate, L.rate < 1 ? 2 : 0) + ' Hz · ' + Math.round(L.opacity * 100) + '%';
      const up = document.createElement('button'); up.className = 'mini'; up.textContent = '↑'; up.title = 'Move up'; up.disabled = i === 0;
      up.addEventListener('click', (e) => { e.stopPropagation(); S.layers.splice(i - 1, 0, S.layers.splice(i, 1)[0]); markCustom(); renderLayers(); push(); });
      const dn = document.createElement('button'); dn.className = 'mini'; dn.textContent = '↓'; dn.title = 'Move down'; dn.disabled = i === S.layers.length - 1;
      dn.addEventListener('click', (e) => { e.stopPropagation(); S.layers.splice(i + 1, 0, S.layers.splice(i, 1)[0]); markCustom(); renderLayers(); push(); });
      li.append(cb, t, up, dn);
      li.addEventListener('click', () => { sel = L.id; renderLayers(); renderControls(); });
      ul.appendChild(li);
    });
    $('layerCount').textContent = S.layers.length + ' / 8';
    $('add').disabled = S.layers.length >= 8;
  }
  P.TYPES.forEach((t) => { $('addType').appendChild(new Option(t.name, t.id)); $('ltype').appendChild(new Option(t.name, t.id)); });
  $('add').addEventListener('click', () => {
    if (S.layers.length >= 8) return;
    const L = P.layer($('addType').value, typeDefaults($('addType').value));
    S.layers.push(L); sel = L.id; markCustom(); renderLayers(); renderControls(); push();
  });
  function typeDefaults(type) {
    return {
      snow: { size: 1, rate: 18, density: 0.03, opacity: 0.45 },
      static: { size: 1, rate: 30, contrast: 0.9, opacity: 0.2 },
      grain: { size: 2, rate: 24, contrast: 0.7, opacity: 0.25 },
      chroma: { size: 1, rate: 15, density: 0.02, opacity: 0.45, contrast: 1 },
      shimmer: { size: 2, rate: 14, density: 0.08, opacity: 0.18, softness: 0.7 },
      sparkle: { size: 3, rate: 2, density: 0.004, opacity: 0.8, softness: 0.8 },
      floaters: { size: 6, rate: 0.4, density: 0.15, opacity: 0.3, softness: 0.9, polarity: 0 },
      fog: { size: 300, rate: 0.15, contrast: 0.5, opacity: 0.1, color: [0.6, 0.5, 1], colorMix: 1 },
      scanlines: { size: 3, rate: 60, contrast: 0.8, opacity: 0.2 },
      pulse: { rate: 0.8, opacity: 0.05 }
    }[type] || {};
  }

  // ---------- per-layer controls ----------
  const DEF = {
    opacity: { label: 'Opacity', min: 0, max: 1, step: 0.005, fmt: (v) => Math.round(v * 100) + '%' },
    size: { label: 'Grain size', min: 1, max: 64, step: 1, fmt: (v) => v + ' px' + arcmin(v), log: true, maxFor: { fog: 1200, floaters: 60 } },
    rate: { label: 'Update rate', min: 0.05, max: 60, step: 0.05, fmt: (v) => (v < 1 ? fmt(v, 2) : fmt(v, 1)) + ' Hz', log: true },
    density: { label: 'Density', min: 0.001, max: 1, step: 0.001, fmt: (v) => fmt(v * 100, v < 0.1 ? 1 : 0) + '%', log: true },
    contrast: { label: 'Contrast', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
    softness: { label: 'Softness', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
    colorMix: { label: 'Tint amount', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' }
  };
  function arcmin(px) {
    const d = displays[0]; if (!d) return '';
    const ppa = P.pxPerArcmin(d.bounds.width * d.scaleFactor, d.bounds.height * d.scaleFactor, S.calibration.diagonalInches, S.calibration.distanceCm);
    return ' ≈ ' + fmt(px / ppa, 1) + '′';
  }
  // log-slider mapping
  const toSlider = (v, d) => d.log ? Math.log(v / d.min) / Math.log(d.max / d.min) : v;
  const fromSlider = (x, d) => d.log ? d.min * Math.pow(d.max / d.min, x) : x;

  function renderControls() {
    const L = cur(); const card = $('layerCard');
    if (!L) { card.style.display = 'none'; return; }
    card.style.display = '';
    $('lname').value = L.name || '';
    $('ltype').value = L.type;
    $('ldesc').textContent = P.TYPES[P.TYPE_INDEX[L.type]].desc;
    const wrap = $('controls'); wrap.innerHTML = '';
    const grid = document.createElement('div'); grid.className = 'grid2'; wrap.appendChild(grid);
    for (const key of P.CONTROLS[L.type]) {
      if (key === 'color') {
        const lab = document.createElement('label'); lab.innerHTML = '<div class="lab"><span>Tint colour</span></div>';
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = rgb2hex(L.color);
        inp.addEventListener('input', () => { L.color = hex2rgb(inp.value); if (L.colorMix === 0) { L.colorMix = 1; renderControls(); } markCustom(); push(); });
        lab.appendChild(inp); grid.appendChild(lab); continue;
      }
      if (key === 'polarity') {
        const lab = document.createElement('label'); lab.innerHTML = '<div class="lab"><span>Dot polarity</span></div>';
        const s = document.createElement('select');
        [['0', 'Dark and light'], ['1', 'Light only'], ['2', 'Dark only']].forEach(([v, n]) => s.appendChild(new Option(n, v)));
        s.value = String(L.polarity || 0);
        s.addEventListener('change', () => { L.polarity = Number(s.value); markCustom(); push(); });
        lab.appendChild(s); grid.appendChild(lab); continue;
      }
      if (key === 'drift') {
        [['x', 'Drift → (px/s)'], ['y', 'Drift ↓ (px/s)']].forEach(([ax, name], i) => {
          const lab = document.createElement('label');
          lab.innerHTML = '<div class="lab"><span>' + name + '</span><span></span></div>';
          const inp = document.createElement('input'); inp.type = 'range'; inp.min = -200; inp.max = 200; inp.step = 1; inp.value = L.drift ? L.drift[i] : 0;
          const out = lab.querySelector('.lab span:last-child'); out.textContent = inp.value;
          inp.addEventListener('input', () => { L.drift = L.drift || [0, 0]; L.drift[i] = Number(inp.value); out.textContent = inp.value; markCustom(); push(); });
          inp.addEventListener('dblclick', () => { inp.value = 0; inp.dispatchEvent(new Event('input')); });
          lab.appendChild(inp); grid.appendChild(lab);
        });
        continue;
      }
      const d = Object.assign({}, DEF[key]);
      if (d.maxFor && d.maxFor[L.type]) d.max = d.maxFor[L.type];
      const lab = document.createElement('label');
      lab.innerHTML = '<div class="lab"><span>' + d.label + '</span><span></span></div>';
      const out = lab.querySelector('.lab span:last-child');
      const inp = document.createElement('input'); inp.type = 'range';
      if (d.log) { inp.min = 0; inp.max = 1; inp.step = 0.001; } else { inp.min = d.min; inp.max = d.max; inp.step = d.step; }
      inp.value = toSlider(Math.min(Math.max(L[key], d.min), d.max), d);
      out.textContent = d.fmt(L[key]);
      inp.addEventListener('input', () => {
        let v = fromSlider(Number(inp.value), d);
        if (key === 'size') v = Math.round(v);
        else v = Math.round(v / d.step) * d.step;
        L[key] = v; out.textContent = d.fmt(v); markCustom(); push(); renderLayersSoft();
      });
      lab.appendChild(inp); grid.appendChild(lab);
    }
  }
  let softTimer = null;
  function renderLayersSoft() { clearTimeout(softTimer); softTimer = setTimeout(renderLayers, 150); }
  $('lname').addEventListener('input', () => { const L = cur(); if (L) { L.name = $('lname').value; renderLayersSoft(); push(); } });
  $('ltype').addEventListener('change', () => { const L = cur(); if (!L) return; L.type = $('ltype').value; Object.assign(L, typeDefaults(L.type)); L.name = P.TYPES[P.TYPE_INDEX[L.type]].name; markCustom(); renderLayers(); renderControls(); push(); });
  $('reseed').addEventListener('click', () => { const L = cur(); if (L) { L.seed = Math.floor(Math.random() * 100000); push(); } });
  $('dup').addEventListener('click', () => { const L = cur(); if (!L || S.layers.length >= 8) return; const c = Object.assign(P.layer(L.type), JSON.parse(JSON.stringify(L)), { id: P.layer(L.type).id, name: L.name + ' copy' }); S.layers.splice(S.layers.indexOf(L) + 1, 0, c); sel = c.id; markCustom(); renderLayers(); renderControls(); push(); });
  $('del').addEventListener('click', () => { const L = cur(); if (!L) return; S.layers = S.layers.filter((x) => x !== L); sel = S.layers[0] ? S.layers[0].id : null; markCustom(); renderLayers(); renderControls(); push(); });

  // ---------- general ----------
  $('enabled').addEventListener('change', () => { S.enabled = $('enabled').checked; push(); });
  $('hide').addEventListener('click', () => window.vs.hidePanel());
  $('quit').addEventListener('click', () => window.vs.quit());
  function renderGeneral() {
    $('gop').value = S.globalOpacity; $('gopOut').textContent = Math.round(S.globalOpacity * 100) + '%';
    $('fps').value = S.maxFps; $('fpsOut').textContent = S.maxFps;
    $('hkToggle').value = S.hotkeys.toggle; $('hkPanel').value = S.hotkeys.panel;
    $('login').checked = !!S.launchAtLogin;
    $('keepTop').checked = S.keepOnTop !== false;
    $('diag').value = S.calibration.diagonalInches; $('dist').value = S.calibration.distanceCm;
    renderDisplays(); renderCalib();
  }
  $('gop').addEventListener('input', () => { S.globalOpacity = Number($('gop').value); $('gopOut').textContent = Math.round(S.globalOpacity * 100) + '%'; push(); });
  $('fps').addEventListener('input', () => { S.maxFps = Number($('fps').value); $('fpsOut').textContent = S.maxFps; push(); });
  $('hkToggle').addEventListener('change', () => { S.hotkeys.toggle = $('hkToggle').value.trim(); push(); toast('Hotkey updated'); });
  $('hkPanel').addEventListener('change', () => { S.hotkeys.panel = $('hkPanel').value.trim(); push(); toast('Hotkey updated'); });
  $('login').addEventListener('change', () => { S.launchAtLogin = $('login').checked; push(); });
  $('keepTop').addEventListener('change', () => { S.keepOnTop = $('keepTop').checked; push(); });
  $('diag').addEventListener('input', () => { S.calibration.diagonalInches = Number($('diag').value) || 24; renderCalib(); renderControls(); push(); });
  $('dist').addEventListener('input', () => { S.calibration.distanceCm = Number($('dist').value) || 60; renderCalib(); renderControls(); push(); });
  function renderDisplays() {
    const box = $('displays'); box.innerHTML = '';
    const all = document.createElement('label'); all.className = 'chip';
    all.innerHTML = '<input type="radio" name="disp"' + (S.displays === 'all' ? ' checked' : '') + '> All displays';
    all.querySelector('input').addEventListener('change', () => { S.displays = 'all'; renderDisplays(); push(); });
    box.appendChild(all);
    displays.forEach((d, i) => {
      const c = document.createElement('label'); c.className = 'chip';
      const on = S.displays === 'all' || (Array.isArray(S.displays) && S.displays.includes(d.id));
      c.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') + '> ' + (d.label || 'Display ' + (i + 1)) + ' · ' + Math.round(d.bounds.width * d.scaleFactor) + '×' + Math.round(d.bounds.height * d.scaleFactor) + (d.primary ? ' · primary' : '');
      c.querySelector('input').addEventListener('change', (e) => {
        let list = S.displays === 'all' ? displays.map((x) => x.id) : S.displays.slice();
        list = e.target.checked ? [...new Set([...list, d.id])] : list.filter((x) => x !== d.id);
        S.displays = list.length === displays.length ? 'all' : list;
        renderDisplays(); push();
      });
      box.appendChild(c);
    });
  }
  function renderCalib() {
    const d = displays[0]; if (!d) return;
    const ppa = P.pxPerArcmin(d.bounds.width * d.scaleFactor, d.bounds.height * d.scaleFactor, S.calibration.diagonalInches, S.calibration.distanceCm);
    $('calib').textContent = 'On your primary display one device pixel is about ' + fmt(1 / ppa, 2) + ' arcmin. The research average dot is under 2 arcmin, so use a grain size of ' + Math.max(1, Math.round(2 * ppa)) + ' px or less to match it.';
  }

  // ---------- init ----------
  function renderAll() { renderPresets(); renderLayers(); renderControls(); renderGeneral(); renderStatus(); if (pv) pv.setLayers(S.layers, S.globalOpacity); }
  window.vs.onSettings((s) => { S = s; if (!S.layers.find((l) => l.id === sel)) sel = S.layers[0] ? S.layers[0].id : null; renderAll(); });
  renderAll();
})();
