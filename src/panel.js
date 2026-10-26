/* global VSPresets, NoiseRenderer, icon */
(async function () {
  'use strict';
  const VP = VSPresets;
  const $ = (id) => document.getElementById(id);
  const isMac = navigator.platform.toLowerCase().includes('mac');

  // ---------- tiny DOM helpers ----------
  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    if (a) for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'disabled', 'hidden', 'draggable', 'title'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  function ic(name) { const t = document.createElement('template'); t.innerHTML = icon(name); return t.content.firstChild; }
  function hydrate(root) { root.querySelectorAll('[data-icon]').forEach((el) => { if (!el.firstChild) el.append(ic(el.dataset.icon)); }); }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('vs.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('vs.' + k, JSON.stringify(v)); } catch (_) { /* storage unavailable */ } }
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800); }
  const familyOf = (T) => VP.FAMILIES.find((f) => f.id === T.family);

  // ---------- state ----------
  let S = await window.vs.getSettings();
  let displays = await window.vs.getDisplays();
  const info = await window.vs.getInfo();
  let sel = S.layers[0] ? S.layers[0].id : null;
  const cur = () => S.layers.find((l) => l.id === sel);

  let pushTimer = null;
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => window.vs.setSettings(S), 30);
    if (pv) pv.setState(S);
  }
  function edited() { if (S.preset !== 'custom') { S.preset = 'custom'; renderPresetName(); } }
  function applyTheme() {
    if (S.theme === 'light' || S.theme === 'dark') document.documentElement.dataset.theme = S.theme;
    else delete document.documentElement.dataset.theme;
  }

  // ---------- formatting & sliders ----------
  function fmt(sp, v) {
    if (sp.options) return sp.options[Math.round(v)] || '';
    const x = v * (sp.scale || 1), ax = Math.abs(x);
    let d = sp.int ? 0 : ax >= 100 ? 0 : ax >= 10 ? 1 : ax >= 1 ? 1 : 2;
    if (sp.unit === '%') d = ax >= 10 ? 0 : ax >= 1 ? 1 : 2;
    if (sp.unit === '°') d = ax >= 10 ? 0 : 1;
    const n = String(+x.toFixed(d));
    const u = sp.unit || '';
    return n + (u === '%' || u === '°' || u === '×' || !u ? u : ' ' + u);
  }
  function parse(sp, txt) {
    const n = parseFloat(String(txt).replace(',', '.'));
    return isNaN(n) ? null : n / (sp.scale || 1);
  }
  function roundTo(sp, v) {
    v = clamp(v, sp.min, sp.max);
    if (sp.int) return Math.round(v);
    const st = sp.step || 0.01;
    const r = Math.round(v / st) * st;
    return +r.toFixed(Math.max(0, -Math.floor(Math.log10(st)) + 1));
  }
  const toPos = (sp, v) => sp.log ? Math.log(clamp(v, sp.min, sp.max) / sp.min) / Math.log(sp.max / sp.min) : (clamp(v, sp.min, sp.max) - sp.min) / (sp.max - sp.min);
  const fromPos = (sp, p) => sp.log ? sp.min * Math.pow(sp.max / sp.min, p) : sp.min + p * (sp.max - sp.min);

  // A labelled slider with typed value, keyboard steps, reset on double-click and a default tick.
  function sliderRow(sp, value, def, onChange, extraTitle) {
    const lab = h('span', { class: 'lab', text: sp.label, title: (extraTitle ? extraTitle + '\n' : '') + 'Double-click to reset' });
    const rng = h('input', { type: 'range', min: 0, max: 1000, step: 1, 'aria-label': sp.label });
    const tick = h('i', { class: 'tick' });
    const wrap = h('div', { class: 'range-wrap' }, rng, tick);
    const val = h('input', { class: 'val', spellcheck: 'false', 'aria-label': sp.label + ' value' });
    let v = value;
    function show() {
      const p = toPos(sp, v);
      rng.value = Math.round(p * 1000);
      rng.style.setProperty('--p', (p * 100).toFixed(2) + '%');
      if (document.activeElement !== val) val.value = fmt(sp, v);
    }
    function set(nv) { v = roundTo(sp, nv); show(); onChange(v); }
    if (def != null) tick.style.left = `calc(7px + (100% - 14px) * ${toPos(sp, def).toFixed(4)})`; else tick.hidden = true;
    rng.addEventListener('input', () => set(fromPos(sp, rng.value / 1000)));
    rng.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const small = sp.int && !sp.log && sp.max - sp.min <= 200;
      if (small) set(v + dir * (e.shiftKey ? 10 : 1));
      else set(fromPos(sp, clamp(toPos(sp, v) + dir * (e.shiftKey ? 0.1 : 0.01), 0, 1)));
    });
    const reset = () => { if (def != null) set(def); };
    lab.addEventListener('dblclick', reset);
    rng.addEventListener('dblclick', reset);
    val.addEventListener('focus', () => { val.value = fmt(sp, v).replace(/[^\d.\-]+$/, '').trim(); val.select(); });
    val.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') val.blur();
      if (e.key === 'Escape') { val.value = fmt(sp, v); val.blur(); }
    });
    val.addEventListener('blur', () => { const n = parse(sp, val.value); if (n != null) set(n); else show(); val.value = fmt(sp, v); });
    show();
    return h('div', { class: 'row' }, lab, wrap, val);
  }
  function segRow(label, options, value, onChange, title) {
    const seg = h('div', { class: 'seg full', role: 'radiogroup', 'aria-label': label });
    options.forEach((o, i) => {
      const b = h('button', { class: i === value ? 'on' : '', text: o, role: 'radio', 'aria-checked': String(i === value) });
      b.addEventListener('click', () => { [...seg.children].forEach((x, j) => { x.classList.toggle('on', j === i); x.setAttribute('aria-checked', String(j === i)); }); onChange(i); });
      seg.append(b);
    });
    return h('div', { class: 'row wide' }, h('span', { class: 'lab', text: label, title: title || null }), seg);
  }
  function switchRow(label, checked, onChange, title) {
    const inp = h('input', { type: 'checkbox', checked, 'aria-label': label });
    inp.addEventListener('change', () => onChange(inp.checked));
    return h('div', { class: 'row wide' }, h('span', { class: 'lab', text: label, title: title || null }),
      h('div', { style: 'display:flex;justify-content:flex-end' }, h('span', { class: 'switch' }, inp, h('span', { class: 'track' }))));
  }
  function switchEl(checked, onChange, label) {
    const inp = h('input', { type: 'checkbox', checked, 'aria-label': label || '' });
    inp.addEventListener('change', () => onChange(inp.checked, inp));
    return h('span', { class: 'switch' }, inp, h('span', { class: 'track' }));
  }

  // ---------- modals ----------
  function openModal(dlg) { hydrate(dlg); if (!dlg.open) dlg.showModal(); }
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d && d.id !== 'firstRunDlg') d.close(); });
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  });
  function ask({ title, body, ok = 'OK', danger = false, input = null }) {
    return new Promise((res) => {
      const d = $('askDlg');
      $('askTitle').textContent = title; $('askBody').textContent = body || '';
      const inp = $('askInput'); inp.hidden = input == null; if (input != null) inp.value = input;
      const okB = $('askOk'); okB.textContent = ok; okB.className = 'btn ' + (danger ? 'danger' : 'primary');
      d.returnValue = '';
      d.onclose = () => res(d.returnValue === 'ok' ? (input != null ? inp.value.trim() : true) : (input != null ? null : false));
      openModal(d);
      if (input != null) setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
  }
  const FLASH_WARNING = 'Flashing light can trigger migraine and, in people with photosensitive epilepsy, seizures. Keep opacity low. Stop if you feel unwell.';

  // ---------- context menu ----------
  const ctx = $('ctx');
  function showCtx(x, y, items) {
    ctx.innerHTML = '';
    items.forEach((it) => {
      if (it === '-') { ctx.append(h('hr')); return; }
      ctx.append(h('button', { class: it.danger ? 'danger' : '', onclick: () => { hideCtx(); it.fn(); } }, ic(it.icon), it.label));
    });
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    ctx.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  }
  function hideCtx() { ctx.hidden = true; }
  addEventListener('mousedown', (e) => { if (!ctx.contains(e.target)) hideCtx(); });
  addEventListener('blur', hideCtx);

  // ---------- preview ----------
  let pv = null;
  try { pv = new NoiseRenderer($('pv')); pv.setState(S); pv.start(); }
  catch (e) { $('preview').append(h('div', { class: 'list-empty', text: 'WebGL 2 is not available: ' + e.message })); }
  function setBg(v) {
    const p = $('preview');
    p.className = 'preview bg-' + v + (v === 'photo' && !$('photo').src ? ' no-photo' : '');
    [...$('bgSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    store.set('bg', v);
  }
  $('bgSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v === 'photo' && (!$('photo').src || $('preview').classList.contains('bg-photo'))) { $('photoInput').click(); }
    setBg(b.dataset.v);
  });
  $('photoInput').addEventListener('change', () => {
    const f = $('photoInput').files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { $('photo').src = rd.result; store.set('photo', rd.result.length < 4e6 ? rd.result : null); setBg('photo'); };
    rd.readAsDataURL(f);
  });
  const savedPhoto = store.get('photo', null); if (savedPhoto) $('photo').src = savedPhoto;
  setBg(store.get('bg', 'light'));
  function setZoom(z) {
    [...$('zoomSeg').children].forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === z));
    if (pv) pv.setZoom(z); store.set('zoom', z);
  }
  $('zoomSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setZoom(Number(b.dataset.v)); });
  setZoom(store.get('zoom', 1));
  setInterval(() => {
    if (!pv) return;
    const n = pv.layers.length;
    $('hud').textContent = `${pv.fps} fps · ${n} layer${n === 1 ? '' : 's'}${S.enabled ? '' : ' · overlay off'}`;
  }, 500);
  function renderStrength() {
    const sp = { label: 'Strength', min: 0, max: 1, step: 0.01, unit: '%', scale: 100 };
    const row = sliderRow(sp, S.globalOpacity, 1, (v) => { S.globalOpacity = v; push(); });
    row.className = 'strength';
    $('strength').replaceChildren(...row.children);
  }

  // ---------- top bar ----------
  function presetTitle() {
    if (S.preset && S.preset.startsWith('user:')) { const p = (S.userPresets || []).find((x) => 'user:' + x.id === S.preset); return p ? p.name : 'Custom'; }
    const b = VP.BUILTIN.find((x) => x.id === S.preset);
    return b ? b.name : 'Custom';
  }
  function renderPresetName() { $('presetName').textContent = presetTitle(); }
  function renderMaster() { $('enabled').checked = !!S.enabled; $('masterLabel').textContent = S.enabled ? 'Overlay on' : 'Overlay off'; }
  $('enabled').addEventListener('change', () => { S.enabled = $('enabled').checked; renderMaster(); push(); });
  $('presetBtn').addEventListener('click', openPresets);
  $('settingsBtn').addEventListener('click', () => openSettings('general'));

  // ---------- layer list ----------
  function summary(L) {
    const T = VP.BY_ID[L.type]; const parts = [T.name];
    if (T.uses.includes('size')) parts.push(fmt(VP.spec(L.type, 'size'), L.size));
    if (T.uses.includes('rate')) parts.push(fmt(VP.spec(L.type, 'rate'), L.rate));
    parts.push(Math.round(L.opacity * 100) + '%');
    return parts.join(' · ');
  }
  let dragIdx = -1;
  function renderLayers() {
    const ul = $('layerList'); ul.innerHTML = '';
    if (!S.layers.length) ul.append(h('li', { class: 'list-empty', text: 'No layers. The overlay is empty.' }));
    S.layers.forEach((L, i) => {
      const T = VP.BY_ID[L.type];
      const eye = h('button', { class: 'icon-btn sm eye', title: L.enabled ? 'Hide layer' : 'Show layer', 'aria-label': L.enabled ? 'Hide layer' : 'Show layer' }, ic(L.enabled ? 'eye' : 'eye-off'));
      eye.addEventListener('click', (e) => { e.stopPropagation(); L.enabled = !L.enabled; edited(); renderLayers(); push(); });
      const li = h('li', { class: 'layer' + (L.id === sel ? ' sel' : '') + (L.enabled ? '' : ' off'), draggable: true, tabindex: 0 },
        h('span', { class: 'grip' }, ic('grip-vertical')),
        h('span', { class: 'l-icon' }, ic(familyOf(T).icon)),
        h('div', { class: 'l-text' }, h('div', { class: 'l-name', text: L.name || T.name }), h('div', { class: 'l-sum', text: summary(L) })),
        eye);
      li.addEventListener('click', () => { if (sel !== L.id) { sel = L.id; renderLayers(); renderInspector(); } });
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault(); sel = L.id; renderLayers(); renderInspector();
        showCtx(e.clientX, e.clientY, [
          { label: 'Rename', icon: 'pencil', fn: () => { $('lname').focus(); $('lname').select(); } },
          { label: 'Change type…', icon: 'layers-2', fn: () => openTypes('change') },
          { label: 'Duplicate', icon: 'copy', fn: duplicate },
          { label: L.enabled ? 'Hide' : 'Show', icon: L.enabled ? 'eye-off' : 'eye', fn: () => { L.enabled = !L.enabled; edited(); renderLayers(); push(); } },
          '-',
          { label: 'Remove', icon: 'trash-2', danger: true, fn: remove }
        ]);
      });
      li.addEventListener('dragstart', (e) => { dragIdx = i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
      li.addEventListener('dragend', () => { dragIdx = -1; ul.querySelectorAll('.layer').forEach((x) => x.classList.remove('dragging', 'drag-over', 'after')); });
      li.addEventListener('dragover', (e) => {
        if (dragIdx < 0) return; e.preventDefault();
        const r = li.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
        ul.querySelectorAll('.layer').forEach((x) => x.classList.remove('drag-over', 'after'));
        li.classList.add('drag-over'); li.classList.toggle('after', after);
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault(); if (dragIdx < 0) return;
        const r = li.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
        let to = i + (after ? 1 : 0); const [m] = S.layers.splice(dragIdx, 1); if (dragIdx < to) to--;
        S.layers.splice(to, 0, m); dragIdx = -1; edited(); renderLayers(); push();
      });
      ul.append(li);
    });
    $('layerCount').textContent = `${S.layers.length} / ${VP.MAX_LAYERS}`;
    $('addLayer').disabled = S.layers.length >= VP.MAX_LAYERS;
  }
  let softT = null;
  function renderLayersSoft() { clearTimeout(softT); softT = setTimeout(renderLayers, 120); }
  $('addLayer').addEventListener('click', () => openTypes('add'));
  $('emptyAdd').addEventListener('click', () => openTypes('add'));

  function duplicate() {
    const L = cur(); if (!L || S.layers.length >= VP.MAX_LAYERS) return;
    const c = VP.migrateLayer(Object.assign(JSON.parse(JSON.stringify(L)), { id: VP.newId(), name: (L.name || '') + ' copy' }));
    S.layers.splice(S.layers.indexOf(L) + 1, 0, c); sel = c.id; edited(); renderLayers(); renderInspector(); push();
  }
  function remove() {
    const L = cur(); if (!L) return;
    const i = S.layers.indexOf(L); S.layers.splice(i, 1);
    sel = S.layers[Math.min(i, S.layers.length - 1)] ? S.layers[Math.min(i, S.layers.length - 1)].id : null;
    edited(); renderLayers(); renderInspector(); push();
  }
  $('dup').addEventListener('click', duplicate);
  $('del').addEventListener('click', remove);
  $('reseed').addEventListener('click', () => { const L = cur(); if (L) { L.seed = Math.floor(Math.random() * 100000); edited(); push(); } });
  $('lname').addEventListener('input', () => { const L = cur(); if (L) { L.name = $('lname').value; renderLayersSoft(); push(); } });
  $('lname').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lname').blur(); });
  $('typeBtn').addEventListener('click', () => openTypes('change'));

  // ---------- inspector ----------
  const MASKS = ['Full screen', 'Centre', 'Edges', 'Left side', 'Right side', 'Top', 'Bottom'];
  function group(id, title, rows, badge) {
    const closed = store.get('closed.' + id, false);
    const g = h('section', { class: 'group' + (closed ? ' closed' : '') });
    const head = h('button', { class: 'group-head', 'aria-expanded': String(!closed) }, ic('chevron-down'), title, badge ? h('span', { class: 'badge', text: badge }) : null);
    head.addEventListener('click', () => { const c = g.classList.toggle('closed'); head.setAttribute('aria-expanded', String(!c)); store.set('closed.' + id, c); });
    g.append(head, h('div', { class: 'group-body' }, rows));
    return g;
  }
  function arcminFor(px) {
    const d = displays.find((x) => x.primary) || displays[0]; if (!d) return '';
    const ppa = VP.pxPerArcmin(d.bounds.width * d.scaleFactor, d.bounds.height * d.scaleFactor, S.calibration.diagonalInches, S.calibration.distanceCm);
    return `${px} px ≈ ${(px / ppa).toFixed(1)} arcmin at your calibration`;
  }
  function renderInspector() {
    const L = cur();
    $('inspEmpty').hidden = !!L; $('inspBody').hidden = !L;
    if (!L) return;
    const T = VP.BY_ID[L.type]; const D = VP.layer(L.type); const uses = new Set(T.uses);
    const groupsEl = $('groups'); const keepScroll = groupsEl.scrollTop;
    if (document.activeElement !== $('lname')) $('lname').value = L.name || T.name;
    $('typeBtn').replaceChildren(ic(familyOf(T).icon), T.name, ic('chevron-down'));
    $('typeLook').textContent = T.look;
    const changed = (fn) => (v) => { fn(v); edited(); push(); renderLayersSoft(); };
    const param = (k) => sliderRow(VP.spec(L.type, k), L[k], D[k], changed((v) => (L[k] = v)), k === 'size' && L.size <= 8 ? arcminFor(L.size) : null);
    const out = [];

    const look = ['opacity', 'size', 'density', 'contrast', 'softness'].filter((k) => uses.has(k)).map(param);
    if (uses.has('polarity')) look.push(segRow('Dots', ['Both', 'Light', 'Dark'], L.polarity || 0, changed((v) => (L.polarity = v)), 'Which dots to draw. Both is the most common report.'));
    if (look.length) out.push(group('look', 'Look', look));

    if (uses.has('rate')) {
      out.push(group('timing', 'Timing', [
        param('rate'),
        switchRow('Refresh lock', !!L.rateLock, changed((v) => (L.rateLock = v)), 'Snap the rate to an even divisor of your display refresh rate. Removes beating on 60 and 144 Hz screens.')
      ]));
    }
    if (T.extra.length) {
      out.push(group('pattern', T.name, T.extra.map((e) => e.options
        ? segRow(e.label, e.options, Math.round(L[e.key] || 0), changed((v) => (L[e.key] = v)))
        : sliderRow(e, L[e.key], e.def, changed((v) => (L[e.key] = v))))));
    }

    const colour = [];
    if (uses.has('color')) {
      const sw = h('input', { type: 'color', value: '#' + L.color.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join(''), 'aria-label': 'Tint colour' });
      const mixSp = Object.assign({}, VP.PARAMS.colorMix, { label: 'Tint' });
      const mixRow = sliderRow(mixSp, L.colorMix, 0, changed((v) => (L.colorMix = v)));
      sw.addEventListener('input', () => {
        L.color = [1, 3, 5].map((i) => parseInt(sw.value.slice(i, i + 2), 16) / 255);
        if (!L.colorMix) { L.colorMix = 1; renderInspector(); }
        edited(); push();
      });
      mixRow.firstChild.replaceWith(h('div', { class: 'colour' }, h('span', { class: 'swatch' }, sw), h('span', { class: 'lab', text: 'Tint' })));
      colour.push(mixRow);
    }
    colour.push(segRow('Show', ['All', 'Lights', 'Darks'], L.blend || 0, changed((v) => (L.blend = v)),
      'Lights: only the light parts of this layer, so it shows on dark areas of the screen. Darks: only the dark parts, so it shows on light areas.'));
    out.push(group('colour', 'Colour', colour));

    if (uses.has('drift')) {
      const ds = (i, label) => sliderRow({ label, min: -300, max: 300, step: 1, unit: 'px/s', int: true }, L.drift[i], 0, changed((v) => (L.drift[i] = v)));
      out.push(group('motion', 'Motion', [ds(0, 'Drift right'), ds(1, 'Drift down')], L.drift[0] || L.drift[1] ? 'moving' : null));
    }

    const m = L.mask;
    const maskSel = h('select', { class: 'field', 'aria-label': 'Mask shape' }, MASKS.map((n, i) => h('option', { value: i, text: n })));
    maskSel.value = String(m.shape || 0);
    maskSel.addEventListener('change', () => { m.shape = Number(maskSel.value); edited(); push(); renderInspector(); });
    const maskRows = [h('div', { class: 'row wide' }, h('span', { class: 'lab', text: 'Area' }), maskSel)];
    if (m.shape) {
      maskRows.push(sliderRow({ label: m.shape <= 2 ? 'Radius' : 'Extent', min: 0.05, max: 1, step: 0.01, unit: '%', scale: 100 }, m.size, 0.5, changed((v) => (m.size = v))));
      maskRows.push(sliderRow({ label: 'Feather', min: 0, max: 1, step: 0.01, unit: '%', scale: 100 }, m.feather, 0.4, changed((v) => (m.feather = v))));
    }
    out.push(group('mask', 'Mask', maskRows, m.shape ? MASKS[m.shape] : null));

    const md = L.mod;
    const targets = ['Off', 'Opacity']; if (uses.has('density')) targets.push('Density'); if (uses.has('rate')) targets.push('Rate');
    const tIdx = ['Off', 'Opacity', 'Density', 'Rate'];
    const modRows = [segRow('Vary', targets, Math.max(0, targets.indexOf(tIdx[md.target || 0])), (i) => { md.target = tIdx.indexOf(targets[i]); edited(); push(); renderInspector(); },
      'Slowly raise and lower one setting over time, like snow that comes and goes.')];
    if (md.target) {
      modRows.push(sliderRow({ label: 'Amount', min: 0, max: 1, step: 0.01, unit: '%', scale: 100 }, md.depth, 0.5, changed((v) => (md.depth = v))));
      modRows.push(sliderRow({ label: 'Cycle', min: 5, max: 900, step: 1, unit: 's', log: true, int: true }, md.period, 60, changed((v) => (md.period = v))));
    }
    out.push(group('mod', 'Modulation', modRows, md.target ? tIdx[md.target] : null));

    const sc = L.schedule;
    const schRows = [switchRow('Only between', !!sc.on, (v) => { sc.on = v; edited(); push(); renderInspector(); }, 'Show this layer only during part of the day.')];
    if (sc.on) {
      const a = h('input', { type: 'time', class: 'field', value: sc.from, 'aria-label': 'From' });
      const b = h('input', { type: 'time', class: 'field', value: sc.to, 'aria-label': 'To' });
      a.addEventListener('change', () => { sc.from = a.value || '00:00'; edited(); push(); });
      b.addEventListener('change', () => { sc.to = b.value || '00:00'; edited(); push(); });
      schRows.push(h('div', { class: 'times' }, a, h('span', { text: 'to' }), b));
      const live = NoiseRenderer.scheduleActive(L);
      schRows.push(h('p', { class: 'hint', text: live ? 'Showing now.' : 'Hidden now. It will appear at ' + sc.from + '.' }));
    }
    out.push(group('schedule', 'Schedule', schRows, sc.on ? `${sc.from}–${sc.to}` : null));

    groupsEl.replaceChildren(...out);
    groupsEl.scrollTop = keepScroll;
  }

  // ---------- thumbnails ----------
  let thumbR = null;
  function thumbRenderer() {
    if (!thumbR) thumbR = new NoiseRenderer(document.createElement('canvas'), { preserve: true, pxScale: 0.4 });
    return thumbR;
  }
  function drawThumb(canvas, layers, t) {
    const dpr = devicePixelRatio || 1;
    const w = Math.max(64, Math.round(canvas.clientWidth * dpr)), hh = Math.max(36, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
    const r = thumbRenderer(); r.flickerUnlocked = S.flickerUnlocked;
    const ls = layers.filter((l) => l.enabled !== false).map((l) => Object.assign({}, l, { opacity: Math.min(1, l.opacity * 1.8), mask: { shape: 0 }, schedule: { on: false } }));
    r.snapshot(ls, t, w, hh);
    const c2 = canvas.getContext('2d'); c2.clearRect(0, 0, w, hh); c2.drawImage(r.canvas, 0, 0);
  }
  // Thumbnails are drawn a few per frame (each new type compiles a small shader once),
  // only while visible, and refreshed twice a second. Flicker types stay still.
  let thumbRaf = 0; let thumbJobs = []; let thumbIO = null;
  function runThumbs(jobs) {
    stopThumbs(); thumbJobs = jobs;
    thumbIO = new IntersectionObserver((es) => es.forEach((e) => { const j = jobs.find((x) => x.canvas === e.target); if (j) j.visible = e.isIntersecting; }));
    jobs.forEach((j) => { j.visible = false; j.at = -1; thumbIO.observe(j.canvas); });
    const step = () => {
      if (thumbJobs !== jobs) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 10) {
        const j = jobs.find((x) => x.visible && x.at < 0) || jobs.find((x) => x.visible && !x.still && t0 - x.at > 500);
        if (!j) break;
        drawThumb(j.canvas, j.layers(), j.still ? 0.37 : t0 / 1000);
        j.at = t0;
      }
      thumbRaf = requestAnimationFrame(step);
    };
    thumbRaf = requestAnimationFrame(step);
  }
  function stopThumbs() { cancelAnimationFrame(thumbRaf); if (thumbIO) thumbIO.disconnect(); thumbIO = null; thumbJobs = []; }

  // ---------- type gallery ----------
  let galMode = 'add'; let galFamily = store.get('galFamily', 'all');
  function openTypes(mode) {
    galMode = mode; if (mode === 'add' && S.layers.length >= VP.MAX_LAYERS) { toast('Eight layers is the limit'); return; }
    $('typeDlgTitle').textContent = mode === 'add' ? 'Add a layer' : 'Change layer type';
    const tabs = $('familyTabs'); tabs.innerHTML = '';
    [{ id: 'all', name: 'All', icon: 'sparkles' }, ...VP.FAMILIES].forEach((f) => {
      const b = h('button', { class: f.id === galFamily ? 'on' : '' }, ic(f.icon), f.name);
      b.addEventListener('click', () => { galFamily = f.id; store.set('galFamily', f.id); [...tabs.children].forEach((x) => x.classList.toggle('on', x === b)); renderTypeCards(); });
      tabs.append(b);
    });
    openModal($('typeDlg'));
    renderTypeCards();
  }
  function renderTypeCards() {
    const g = $('typeGallery'); g.innerHTML = ''; g.scrollTop = 0;
    const L = cur(); const jobs = [];
    VP.TYPES.filter((T) => galFamily === 'all' || T.family === galFamily).forEach((T) => {
      const cv = h('canvas');
      const card = h('button', { class: 'card' + (galMode === 'change' && L && L.type === T.id ? ' cur' : '') }, cv,
        T.flash ? h('span', { class: 'flag', text: 'Flicker' }) : null,
        h('div', { class: 'c-body' }, h('div', { class: 'c-name' }, ic(familyOf(T).icon), T.name), h('div', { class: 'c-desc', text: T.look })));
      card.addEventListener('click', () => pickType(T));
      g.append(card);
      const sample = VP.layer(T.id, { seed: 777 });
      jobs.push({ canvas: cv, layers: () => [sample], still: !!T.flash });
    });
    runThumbs(jobs);
  }
  $('typeDlg').addEventListener('close', stopThumbs);
  async function pickType(T) {
    if (T.id === 'strobe' && !(await ask({ title: 'Add a strobe layer?', body: FLASH_WARNING, ok: 'Add strobe' }))) return;
    if (galMode === 'add') {
      const L = VP.layer(T.id); S.layers.push(L); sel = L.id;
    } else {
      const L = cur(); if (!L) return;
      const oldT = VP.BY_ID[L.type];
      const keep = { id: L.id, enabled: L.enabled, seed: L.seed, mask: L.mask, mod: L.mod, schedule: L.schedule, blend: L.blend };
      const n = VP.layer(T.id, keep);
      n.name = !L.name || L.name === oldT.name ? T.name : L.name;
      if (!T.uses.includes('density') && n.mod.target === 2) n.mod.target = 0;
      if (!T.uses.includes('rate') && n.mod.target === 3) n.mod.target = 0;
      S.layers[S.layers.indexOf(L)] = n;
    }
    $('typeDlg').close(); edited(); renderLayers(); renderInspector(); push();
  }

  // ---------- presets ----------
  function openPresets() { renderPresetGallery(); openModal($('presetDlg')); }
  function applyPreset(id, layers) {
    S.layers = layers; S.preset = id; sel = S.layers[0] ? S.layers[0].id : null;
    renderPresetName(); renderLayers(); renderInspector(); push();
  }
  function renderPresetGallery() {
    const root = $('presetGallery'); root.innerHTML = ''; const jobs = [];
    const card = (name, desc, layersFn, onPick, isCur, onDelete) => {
      const cv = h('canvas');
      const c = h('button', { class: 'card' + (isCur ? ' cur' : '') }, cv, h('div', { class: 'c-body' }, h('div', { class: 'c-name', text: name }), h('div', { class: 'c-desc', text: desc })));
      c.addEventListener('click', onPick);
      if (onDelete) {
        const del = h('span', { class: 'icon-btn sm c-del', title: 'Delete preset', role: 'button' }, ic('trash-2'));
        del.addEventListener('click', (e) => { e.stopPropagation(); onDelete(); });
        c.append(del);
      }
      jobs.push({ canvas: cv, layers: layersFn, still: layersFn().some((l) => VP.BY_ID[l.type].flash) });
      return c;
    };
    if (S.userPresets && S.userPresets.length) {
      const grid = h('div', { class: 'grid' });
      S.userPresets.forEach((p) => grid.append(card(p.name, `${p.layers.length} layer${p.layers.length === 1 ? '' : 's'}`, () => p.layers,
        () => { applyPreset('user:' + p.id, p.layers.map((l) => VP.migrateLayer(Object.assign(JSON.parse(JSON.stringify(l)), { id: VP.newId() })))); $('presetDlg').close(); },
        S.preset === 'user:' + p.id,
        async () => {
          if (!(await ask({ title: `Delete “${p.name}”?`, ok: 'Delete', danger: true }))) return;
          S.userPresets = S.userPresets.filter((x) => x !== p); if (S.preset === 'user:' + p.id) S.preset = 'custom';
          push(); renderPresetName(); renderPresetGallery();
        })));
      root.append(h('div', { class: 'gal-group' }, h('h3', { text: 'Mine' }), grid));
    }
    VP.PRESET_GROUPS.forEach((gp) => {
      const grid = h('div', { class: 'grid' });
      VP.BUILTIN.filter((b) => b.group === gp.id).forEach((b) => {
        const sample = b.make();
        grid.append(card(b.name, b.desc, () => sample, () => { applyPreset(b.id, b.make()); $('presetDlg').close(); }, S.preset === b.id));
      });
      root.append(h('div', { class: 'gal-group' }, h('h3', { text: gp.name }), grid));
    });
    runThumbs(jobs);
  }
  $('presetDlg').addEventListener('close', stopThumbs);
  $('savePreset').addEventListener('click', async () => {
    const name = await ask({ title: 'Save as preset', body: 'Saves the current layers so you can come back to them.', ok: 'Save', input: 'My snow' });
    if (!name) { openModal($('presetDlg')); return; }
    const id = Date.now().toString(36);
    S.userPresets = S.userPresets || [];
    S.userPresets.push({ id, name, layers: JSON.parse(JSON.stringify(S.layers)) });
    S.preset = 'user:' + id; push(); renderPresetName(); toast('Preset saved');
    renderPresetGallery(); openModal($('presetDlg'));
  });
  $('exportPreset').addEventListener('click', async () => {
    const ok = await window.vs.exportSettings(JSON.stringify({ app: 'visual-snow-relief-kit', version: VP.SETTINGS_VERSION, name: presetTitle(), layers: S.layers, globalOpacity: S.globalOpacity }, null, 2));
    if (ok) toast('Exported');
  });
  $('importPreset').addEventListener('click', async () => {
    const r = await window.vs.importSettings();
    if (!r) return;
    if (r.error || !Array.isArray(r.layers)) { toast('That file is not a preset'); return; }
    const layers = r.layers.slice(0, VP.MAX_LAYERS).map((l) => VP.migrateLayer(Object.assign({}, l, { id: VP.newId() })));
    const id = Date.now().toString(36);
    S.userPresets = S.userPresets || [];
    S.userPresets.push({ id, name: String(r.name || 'Imported').slice(0, 60), layers: JSON.parse(JSON.stringify(layers)) });
    if (typeof r.globalOpacity === 'number') S.globalOpacity = clamp(r.globalOpacity, 0, 1);
    applyPreset('user:' + id, layers); renderStrength(); renderPresetGallery(); toast('Imported');
  });

  // ---------- settings dialog ----------
  let setTab = 'general';
  function openSettings(tab) {
    setTab = tab || setTab;
    [...$('settingsNav').children].forEach((b) => b.classList.toggle('on', b.dataset.tab === setTab));
    renderSettings(); openModal($('settingsDlg'));
  }
  $('settingsNav').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setTab = b.dataset.tab; [...$('settingsNav').children].forEach((x) => x.classList.toggle('on', x === b)); renderSettings();
  });
  const setRow = (t1, t2, ...ctl) => h('div', { class: 'set-row' }, h('div', { class: 'txt' }, h('div', { class: 't1', text: t1 }), t2 ? h('div', { class: 't2', text: t2 }) : null), h('div', { class: 'ctl' }, ctl));
  function prettyAccel(a) {
    if (!a) return 'Not set';
    return a.split('+').map((k) => ({ CommandOrControl: isMac ? '⌘' : 'Ctrl', Command: '⌘', Control: 'Ctrl', Alt: isMac ? '⌥' : 'Alt', Shift: isMac ? '⇧' : 'Shift' }[k] || k)).join(isMac ? '' : ' + ');
  }
  function accelFrom(e) {
    const mods = [];
    if (isMac ? e.metaKey : e.ctrlKey) mods.push('CommandOrControl');
    if (isMac && e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    const c = e.code;
    let k = null;
    if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
    else if (/^Digit\d$/.test(c)) k = c.slice(5);
    else if (/^F\d{1,2}$/.test(c)) k = c;
    else k = { Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert' }[c] || null;
    if (!k || !mods.length) return null;
    return [...mods, k].join('+');
  }
  function recorder(key) {
    const b = h('button', { class: 'btn recorder' }, h('span', { text: prettyAccel(S.hotkeys[key]) }), ic('keyboard'));
    b.addEventListener('click', () => {
      b.classList.add('rec'); b.firstChild.textContent = 'Press keys… (Esc to cancel)';
      window.vs.suspendHotkeys(true);
      const onKey = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') return done(null);
        if (e.key === 'Backspace' || e.key === 'Delete') return done('');
        const a = accelFrom(e); if (a) done(a);
      };
      const done = (a) => {
        removeEventListener('keydown', onKey, true); b.removeEventListener('blur', cancel);
        window.vs.suspendHotkeys(false);
        if (a != null) { S.hotkeys[key] = a; push(); }
        setTimeout(renderSettings, 150);
      };
      const cancel = () => done(null);
      addEventListener('keydown', onKey, true); b.addEventListener('blur', cancel);
    });
    return b;
  }
  async function renderSettings() {
    const c = $('settingsContent'); c.innerHTML = '';
    const head = (t, lead) => { c.append(h('h3', { text: t })); if (lead) c.append(h('p', { class: 'lead', text: lead })); };
    if (setTab === 'general') {
      head('General');
      const theme = h('div', { class: 'seg' });
      [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].forEach(([v, n]) => {
        const b = h('button', { class: S.theme === v ? 'on' : '', text: n });
        b.addEventListener('click', () => { S.theme = v; applyTheme(); push(); renderSettings(); });
        theme.append(b);
      });
      c.append(setRow('Theme', 'Follows your system unless you pick one.', theme));
      const fpsNum = h('span', { class: 'num', text: String(S.maxFps) });
      const fps = h('input', { type: 'range', min: 10, max: 144, step: 1, value: S.maxFps, 'aria-label': 'Frame rate cap' });
      const fpsFill = () => fps.style.setProperty('--p', ((S.maxFps - 10) / 134 * 100) + '%');
      fps.addEventListener('input', () => { S.maxFps = Number(fps.value); fpsNum.textContent = fps.value; fpsFill(); push(); });
      fpsFill();
      c.append(setRow('Frame rate cap', 'Upper limit for redraws. Layers that change less often redraw less.', fps, fpsNum));
      c.append(setRow('Keep on top', 'Re-assert the overlay above other windows every second.', switchEl(S.keepOnTop !== false, (v) => { S.keepOnTop = v; push(); })));
      const login = switchEl(!!S.launchAtLogin, (v) => { S.launchAtLogin = v; push(); });
      if (info.platform === 'linux') login.querySelector('input').disabled = true;
      c.append(setRow('Start at login', info.platform === 'linux' ? 'On Linux, add run.sh --hidden to your startup applications.' : 'Starts hidden in the tray.', login));
    } else if (setTab === 'displays') {
      head('Displays', 'Choose which screens show the overlay.');
      displays = await window.vs.getDisplays();
      c.append(setRow('All displays', 'Includes screens you plug in later.', switchEl(S.displays === 'all', (v) => { S.displays = v ? 'all' : displays.map((d) => d.id); push(); renderSettings(); })));
      displays.forEach((d, i) => {
        const on = S.displays === 'all' || (Array.isArray(S.displays) && S.displays.includes(d.id));
        const sw = switchEl(on, (v) => {
          let list = S.displays === 'all' ? displays.map((x) => x.id) : S.displays.slice();
          list = v ? [...new Set([...list, d.id])] : list.filter((x) => x !== d.id);
          S.displays = list.length === displays.length ? 'all' : list; push(); renderSettings();
        });
        c.append(setRow(d.label || `Display ${i + 1}`, `${Math.round(d.bounds.width * d.scaleFactor)} × ${Math.round(d.bounds.height * d.scaleFactor)} · ${d.scaleFactor * 100}% scale${d.primary ? ' · main' : ''}${d.hz ? ' · ' + d.hz + ' Hz' : ''}`, sw));
      });
    } else if (setTab === 'hotkeys') {
      head('Hotkeys', 'Work from any app. Click a shortcut, then press the new keys. Backspace clears it.');
      const st = await window.vs.hotkeyStatus();
      const bad = (k) => (st && st[k] === false ? h('span', { class: 'status-bad', text: 'In use by another app' }) : null);
      c.append(setRow('Overlay on or off', null, bad('toggle'), recorder('toggle')));
      c.append(setRow('Open this window', null, bad('panel'), recorder('panel')));
    } else if (setTab === 'calibration') {
      head('Calibration', 'Research measures snow in arcminutes of visual angle. Enter your screen size and how far you sit so sizes can be compared.');
      const d = displays.find((x) => x.primary) || displays[0];
      const diag = h('input', { type: 'number', class: 'field', min: 5, max: 100, step: 0.1, value: S.calibration.diagonalInches });
      const dist = h('input', { type: 'number', class: 'field', min: 20, max: 300, step: 1, value: S.calibration.distanceCm });
      const res = h('div', { class: 'result' });
      const calc = () => {
        if (!d) return;
        const ppa = VP.pxPerArcmin(d.bounds.width * d.scaleFactor, d.bounds.height * d.scaleFactor, S.calibration.diagonalInches, S.calibration.distanceCm);
        res.replaceChildren('One pixel on your main display is ', h('b', { text: (1 / ppa).toFixed(2) + ' arcmin' }), '. The research average dot is under 2 arcmin, so use a size of ', h('b', { text: Math.max(1, Math.floor(2 * ppa)) + ' px' }), ' or less to match it.');
      };
      diag.addEventListener('input', () => { S.calibration.diagonalInches = Number(diag.value) || 24; calc(); push(); });
      dist.addEventListener('input', () => { S.calibration.distanceCm = Number(dist.value) || 60; calc(); push(); });
      c.append(setRow('Screen diagonal', 'Inches, corner to corner.', diag));
      c.append(setRow('Viewing distance', 'Centimetres from your eyes to the screen.', dist));
      c.append(res); calc();
    } else if (setTab === 'safety') {
      head('Safety', FLASH_WARNING);
      const sw = switchEl(!!S.flickerUnlocked, async (v, inp) => {
        if (v && !(await ask({ title: 'Allow fast full-screen flicker?', body: FLASH_WARNING + ' Above 3 flashes a second is the level accessibility guidelines warn about.', ok: 'Allow', danger: true }))) { inp.checked = false; return; }
        S.flickerUnlocked = v; push(); if (thumbR) thumbR.flickerUnlocked = v;
      });
      c.append(setRow('Allow full-screen flicker above 3 Hz', 'Pulse, Flicker and Strobe are held to 3 flashes a second, and Flicker depth to 10 % above that, until you allow it.', sw));
      const again = h('button', { class: 'btn sm', text: 'Show' });
      again.addEventListener('click', () => { $('settingsDlg').close(); showFirstRun(); });
      c.append(setRow('Welcome screen', 'Show the first-run screen and safety note again.', again));
    } else if (setTab === 'about') {
      head('Visual Snow Relief Kit', `Version ${info.version} · Electron ${info.electron} · ${info.platform}`);
      c.append(h('p', { class: 'hint', text: 'Free and open source under the Apache License 2.0. Inter font under the SIL Open Font License. Lucide icons under the ISC licence.' }));
      c.append(setRow('Settings file', null));
      c.lastChild.querySelector('.txt').append(h('div', { class: 'mono', text: info.settingsPath }));
      const link = (label, url, ico) => { const b = h('button', { class: 'btn sm' }, ic(ico), label); b.addEventListener('click', () => window.vs.openExternal(url)); return b; };
      c.append(h('div', { class: 'about-links' },
        link('Source on GitHub', info.repo, 'external-link'),
        link('Releases', info.repo + '/releases', 'download'),
        link('Author on LinkedIn', 'https://www.linkedin.com/in/chris26/', 'external-link')));
    }
  }

  // ---------- first run ----------
  function showFirstRun() {
    $('frToggle').textContent = prettyAccel(S.hotkeys.toggle);
    $('frPanel').textContent = prettyAccel(S.hotkeys.panel);
    openModal($('firstRunDlg'));
  }
  $('frStart').addEventListener('click', () => { S.firstRunDone = true; push(); $('firstRunDlg').close(); });
  $('firstRunDlg').addEventListener('cancel', (e) => e.preventDefault());

  // ---------- keyboard ----------
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCtx();
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range';
    if (typing || document.querySelector('dialog[open]')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && cur()) { e.preventDefault(); remove(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
  });

  // ---------- sync from main ----------
  window.vs.onSettings((s) => {
    S = s; applyTheme();
    if (!S.layers.find((l) => l.id === sel)) sel = S.layers[0] ? S.layers[0].id : null;
    renderAll();
  });

  function renderAll() {
    applyTheme(); renderMaster(); renderPresetName(); renderLayers(); renderInspector(); renderStrength();
    if (pv) pv.setState(S);
  }
  hydrate(document.body);
  renderAll();
  if (!S.firstRunDone) showFirstRun();

  // test hook used by the smoke test
  window.__vs = {
    openTypes, openPresets, openSettings, renderAll, get S() { return S; }, get frames() { return pv ? pv.frames || 0 : 0; },
    setLayers: (ls) => { S.layers = ls; sel = ls[0] ? ls[0].id : null; renderAll(); push(); }
  };
})();
