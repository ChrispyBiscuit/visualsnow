/* global VSPresets, NoiseRenderer, icon */
(async function () {
  'use strict';
  const VP = VSPresets;
  const $ = (id) => document.getElementById(id);
  const isMac = navigator.platform.toLowerCase().includes('mac');

  // ---------- DOM helpers ----------
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

  // Fine matte grain behind everything, like the faceplate texture.
  (function grain() {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const g = c.getContext('2d'); const im = g.createImageData(160, 160);
      for (let i = 0; i < im.data.length; i += 4) {
        if (Math.random() < 0.5) continue;
        const w = Math.random() < 0.5 ? 255 : 0;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = w; im.data[i + 3] = Math.round((0.012 + Math.random() * 0.02) * 255);
      }
      g.putImageData(im, 0, 0);
      document.body.style.setProperty('--grain', `url(${c.toDataURL()})`);
    } catch (_) { /* cosmetic only */ }
  })();

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
    renderReadout();
  }
  function edited() { if (S.preset !== 'custom') { S.preset = 'custom'; renderPresetName(); } }

  // ---------- value formatting ----------
  function fmt(sp, v) {
    if (sp.options) return sp.options[Math.round(v)] || '';
    const x = v * (sp.scale || 1), ax = Math.abs(x);
    let d = sp.int ? 0 : ax >= 100 ? 0 : ax >= 10 ? 1 : ax >= 1 ? 1 : 2;
    if (sp.unit === '%') d = ax >= 10 ? 0 : ax >= 1 ? 1 : 2;
    if (sp.unit === '°') d = ax >= 10 ? 0 : 1;
    const n = String(+x.toFixed(d));
    const u = sp.unit || '';
    return n + (u === '%' || u === '°' || u === '×' || !u ? (u === '%' ? ' %' : u) : ' ' + u);
  }
  function parse(sp, txt) {
    const n = parseFloat(String(txt).replace(',', '.'));
    return isNaN(n) ? null : n / (sp.scale || 1);
  }
  function roundTo(sp, v) {
    v = clamp(v, sp.min, sp.max);
    if (sp.int) return Math.round(v);
    const st = sp.step || 0.01;
    return +(Math.round(v / st) * st).toFixed(Math.max(0, -Math.floor(Math.log10(st)) + 1));
  }
  const toPos = (sp, v) => sp.log ? Math.log(clamp(v, sp.min, sp.max) / sp.min) / Math.log(sp.max / sp.min) : (clamp(v, sp.min, sp.max) - sp.min) / (sp.max - sp.min);
  const fromPos = (sp, p) => sp.log ? sp.min * Math.pow(sp.max / sp.min, p) : sp.min + p * (sp.max - sp.min);

  // ---------- dial ----------
  // Drag up or down (Shift for fine), scroll, arrow keys (Shift for ×10), Home/End,
  // double-click to reset, click the value to type one.
  const A0 = -135, A1 = 135;
  function polar(r, deg) { const a = (deg - 90) * Math.PI / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; }
  function arcPath(r, a0, a1) {
    if (Math.abs(a1 - a0) < 0.5) return '';
    const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function dial(sp, value, def, onChange, opts = {}) {
    const size = opts.size || 'sm';
    const root = h('div', { class: 'dial ' + size + (opts.off ? ' off' : ''), title: opts.title || null });
    const lab = h('div', { class: 'd-lab', text: sp.label });
    const knob = h('div', { class: 'd-knob', tabindex: opts.off ? -1 : 0, role: 'slider', 'aria-label': sp.label });
    knob.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><path class="d-track" d="${arcPath(48, A0, A1)}"/><path class="d-arc"/></svg><div class="d-body"><div class="d-cap"></div><div class="d-ptr"></div></div>`;
    const arc = knob.querySelector('.d-arc'), ptr = knob.querySelector('.d-ptr');
    const val = h('input', { class: 'd-val', spellcheck: 'false', 'aria-label': sp.label + ' value', disabled: !!opts.off });
    root.append(lab, knob, val);
    let v = value;
    function show() {
      const p = toPos(sp, v), ang = A0 + p * (A1 - A0), from = opts.bipolar ? 0 : A0;
      arc.setAttribute('d', arcPath(48, Math.min(from, ang), Math.max(from, ang)));
      ptr.style.transform = `rotate(${ang}deg)`;
      knob.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      knob.setAttribute('aria-valuetext', fmt(sp, v));
      if (document.activeElement !== val) val.value = fmt(sp, v);
    }
    function set(nv) { const r = roundTo(sp, nv); if (r === v) return; v = r; show(); onChange(v); }
    if (!opts.off) {
      let drag = null;
      knob.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); knob.focus(); knob.setPointerCapture(e.pointerId);
        drag = { y: e.clientY, p: toPos(sp, v) };
      });
      knob.addEventListener('pointermove', (e) => {
        if (!drag) return;
        drag.p = clamp(drag.p + (drag.y - e.clientY) / 220 * (e.shiftKey ? 0.1 : 1), 0, 1); drag.y = e.clientY;
        set(fromPos(sp, drag.p));
      });
      const end = () => { drag = null; };
      knob.addEventListener('pointerup', end); knob.addEventListener('pointercancel', end);
      knob.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = e.shiftKey ? 0.002 : 0.01;
        set(fromPos(sp, clamp(toPos(sp, v) - Math.sign(e.deltaY) * step, 0, 1)));
      }, { passive: false });
      knob.addEventListener('keydown', (e) => {
        const small = sp.int && !sp.log && sp.max - sp.min <= 200;
        const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (dir) {
          e.preventDefault();
          if (small) set(v + dir * (e.shiftKey ? 10 : 1));
          else set(fromPos(sp, clamp(toPos(sp, v) + dir * (e.shiftKey ? 0.1 : 0.01), 0, 1)));
        } else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); set(fromPos(sp, clamp(toPos(sp, v) + (e.key === 'PageUp' ? 0.1 : -0.1), 0, 1))); }
        else if (e.key === 'Home') { e.preventDefault(); set(sp.min); }
        else if (e.key === 'End') { e.preventDefault(); set(sp.max); }
      });
      const reset = () => { if (def != null) set(def); };
      knob.addEventListener('dblclick', reset);
      lab.addEventListener('dblclick', reset);
      lab.title = 'Double-click to reset';
      val.addEventListener('focus', () => { val.value = fmt(sp, v).replace(/[^\d.\-]+$/, '').trim(); val.select(); });
      val.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') val.blur();
        if (e.key === 'Escape') { val.value = fmt(sp, v); val.blur(); }
      });
      val.addEventListener('blur', () => { const n = parse(sp, val.value); if (n != null) set(n); val.value = fmt(sp, v); });
    }
    show();
    return root;
  }
  function seg(el, options, value, onChange) {
    el.replaceChildren();
    el.setAttribute('role', 'radiogroup');
    options.forEach((o, i) => {
      const b = h('button', { class: i === value ? 'on' : '', text: o, role: 'radio', 'aria-checked': String(i === value) });
      b.addEventListener('click', () => { [...el.children].forEach((x, j) => { x.classList.toggle('on', j === i); x.setAttribute('aria-checked', String(j === i)); }); onChange(i); });
      el.append(b);
    });
    return el;
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
      ctx.append(h('button', { class: it.danger ? 'danger' : '', text: it.label, onclick: () => { hideCtx(); it.fn(); } }));
    });
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    ctx.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  }
  function hideCtx() { ctx.hidden = true; }
  addEventListener('mousedown', (e) => { if (!ctx.contains(e.target)) hideCtx(); });
  addEventListener('blur', hideCtx);

  // ---------- preview display ----------
  let pv = null;
  try { pv = new NoiseRenderer($('pv')); pv.setState(S); pv.start(); }
  catch (e) { $('preview').append(h('div', { class: 'list-empty cap faint', text: 'WebGL 2 is not available: ' + e.message })); }
  function setBg(v) {
    $('preview').className = 'screen bg-' + v + (v === 'photo' && !$('photo').src ? ' no-photo' : '');
    [...$('bgSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    store.set('bg', v);
  }
  $('bgSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v === 'photo' && (!$('photo').src || $('preview').classList.contains('bg-photo'))) $('photoInput').click();
    setBg(b.dataset.v);
  });
  $('photoInput').addEventListener('change', () => {
    const f = $('photoInput').files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { $('photo').src = rd.result; store.set('photo', rd.result.length < 4e6 ? rd.result : null); setBg('photo'); };
    rd.readAsDataURL(f);
  });
  const savedPhoto = store.get('photo', null); if (savedPhoto) $('photo').src = savedPhoto;
  setBg(store.get('bg', 'dark'));
  function setZoom(z) {
    [...$('zoomSeg').children].forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === z));
    if (pv) pv.setZoom(z); store.set('zoom', z);
  }
  $('zoomSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setZoom(Number(b.dataset.v)); });
  setZoom(store.get('zoom', 1));

  const roItem = (label, value) => h('span', { class: 'ro-item' }, h('span', { class: 'cap', text: label }), h('b', { text: value }));
  function arcmin(px) {
    const d = displays.find((x) => x.primary) || displays[0]; if (!d) return null;
    const ppa = VP.pxPerArcmin(d.bounds.width * d.scaleFactor, d.bounds.height * d.scaleFactor, S.calibration.diagonalInches, S.calibration.distanceCm);
    return px / ppa;
  }
  function renderReadout() {
    const L = cur(); const left = [];
    if (L) {
      const T = VP.BY_ID[L.type];
      left.push(h('span', { class: 'cap faint', text: L.name || T.name }));
      if (T.uses.includes('size')) {
        const am = arcmin(L.size);
        left.push(roItem('Size', fmt(VP.spec(L.type, 'size'), L.size) + (am != null && L.size <= 8 ? ` · ${am.toFixed(1)}′` : '')));
      }
      if (T.uses.includes('rate')) left.push(roItem('Rate', fmt(VP.spec(L.type, 'rate'), L.rate)));
      if (T.uses.includes('density')) left.push(roItem('Density', fmt(VP.spec(L.type, 'density'), L.density)));
      left.push(roItem('Opacity', fmt(VP.spec(L.type, 'opacity'), L.opacity)));
    } else left.push(h('span', { class: 'cap faint', text: 'Preview' }));
    $('roLeft').replaceChildren(...left);
  }
  function renderStatus() {
    if (!pv) return;
    const n = pv.layers.length;
    $('roRight').replaceChildren(roItem('Layers', String(n)), roItem('Frames', pv.fps + ' /s'), h('span', { class: 'cap ' + (S.enabled ? 'accent' : 'faint'), text: S.enabled ? 'Overlay on' : 'Overlay off' }));
  }
  setInterval(renderStatus, 500);

  // ---------- header ----------
  function presetList() {
    return [...VP.BUILTIN.map((b) => ({ id: b.id, name: b.name, cat: (VP.PRESET_GROUPS.find((g) => g.id === b.group) || {}).name, make: b.make })),
      ...(S.userPresets || []).map((p) => ({ id: 'user:' + p.id, name: p.name, cat: 'Mine', make: () => p.layers.map((l) => VP.migrateLayer(Object.assign(JSON.parse(JSON.stringify(l)), { id: VP.newId() }))) }))];
  }
  function renderPresetName() {
    const p = presetList().find((x) => x.id === S.preset);
    $('presetCat').textContent = p ? p.cat : 'Custom';
    $('presetName').textContent = p ? p.name : 'Edited';
    $('deletePresetBtn').disabled = !(S.preset && S.preset.startsWith('user:'));
  }
  function stepPreset(d) {
    const ps = presetList(); let i = ps.findIndex((x) => x.id === S.preset);
    i = i < 0 ? (d > 0 ? 0 : ps.length - 1) : (i + d + ps.length) % ps.length;
    applyPreset(ps[i].id, ps[i].make());
  }
  $('prevPreset').addEventListener('click', () => stepPreset(-1));
  $('nextPreset').addEventListener('click', () => stepPreset(1));
  $('presetBtn').addEventListener('click', openPresets);
  $('savePresetBtn').addEventListener('click', () => savePreset(false));
  $('deletePresetBtn').addEventListener('click', async () => {
    const p = (S.userPresets || []).find((x) => 'user:' + x.id === S.preset); if (!p) return;
    if (!(await ask({ title: `Delete “${p.name}”?`, ok: 'Delete', danger: true }))) return;
    S.userPresets = S.userPresets.filter((x) => x !== p); S.preset = 'custom'; push(); renderPresetName();
  });
  function renderMaster() { $('enabled').checked = !!S.enabled; $('masterLabel').textContent = S.enabled ? 'Overlay on' : 'Overlay off'; }
  $('enabled').addEventListener('change', () => { S.enabled = $('enabled').checked; renderMaster(); push(); renderStatus(); });
  $('settingsBtn').addEventListener('click', () => openSettings('general'));

  // ---------- layers plate ----------
  function summary(L) {
    const T = VP.BY_ID[L.type]; const parts = [T.name];
    if (T.uses.includes('rate')) parts.push(fmt(VP.spec(L.type, 'rate'), L.rate));
    else if (T.uses.includes('size')) parts.push(fmt(VP.spec(L.type, 'size'), L.size));
    parts.push(Math.round(L.opacity * 100) + ' %');
    return parts.join(' · ');
  }
  let dragIdx = -1;
  function renameInline(li, L) {
    const nameEl = li.querySelector('.lname');
    const inp = h('input', { class: 'field', value: L.name || VP.BY_ID[L.type].name, spellcheck: 'false', style: 'height:24px;font-size:14px;padding:0 6px' });
    nameEl.replaceWith(inp); inp.focus(); inp.select();
    let finished = false;
    const done = (save) => { if (finished) return; finished = true; if (save) { L.name = inp.value.trim() || VP.BY_ID[L.type].name; push(); } renderLayers(); renderReadout(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => done(true));
    inp.addEventListener('click', (e) => e.stopPropagation());
  }
  function renderLayers() {
    const ul = $('layerList'); ul.innerHTML = '';
    if (!S.layers.length) ul.append(h('li', { class: 'list-empty cap faint', text: 'No layers' }));
    S.layers.forEach((L, i) => {
      const T = VP.BY_ID[L.type];
      const led = h('button', { class: 'led' + (L.enabled ? ' on' : ''), title: L.enabled ? 'On. Click to hide.' : 'Hidden. Click to show.', 'aria-label': L.enabled ? 'Hide layer' : 'Show layer', 'aria-pressed': String(!!L.enabled) });
      led.addEventListener('click', (e) => { e.stopPropagation(); L.enabled = !L.enabled; edited(); renderLayers(); push(); });
      const li = h('li', { class: 'lrow' + (L.id === sel ? ' sel' : '') + (L.enabled ? '' : ' off'), draggable: true, tabindex: 0 },
        led,
        h('div', { class: 'ltext' }, h('div', { class: 'lname', text: L.name || T.name }), h('div', { class: 'lsub', text: summary(L) })),
        h('span', { class: 'grip' }, ic('grip-vertical')));
      li.addEventListener('click', () => { if (sel !== L.id) { sel = L.id; renderLayers(); renderControls(); renderReadout(); } });
      li.addEventListener('dblclick', (e) => { if (!e.target.closest('.led')) renameInline(li, L); });
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } if (e.key === 'F2') renameInline(li, L); });
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault(); sel = L.id; renderLayers(); renderControls(); renderReadout();
        const row = $('layerList').children[S.layers.indexOf(L)];
        showCtx(e.clientX, e.clientY, [
          { label: 'Rename', fn: () => renameInline(row, L) },
          { label: 'Change type…', fn: () => openTypes('change') },
          { label: 'Duplicate', fn: duplicate },
          { label: L.enabled ? 'Hide' : 'Show', fn: () => { L.enabled = !L.enabled; edited(); renderLayers(); push(); } },
          '-',
          { label: 'Remove', danger: true, fn: remove }
        ]);
      });
      li.addEventListener('dragstart', (e) => { dragIdx = i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
      li.addEventListener('dragend', () => { dragIdx = -1; ul.querySelectorAll('.lrow').forEach((x) => x.classList.remove('dragging', 'drag-over', 'after')); });
      li.addEventListener('dragover', (e) => {
        if (dragIdx < 0) return; e.preventDefault();
        const r = li.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
        ul.querySelectorAll('.lrow').forEach((x) => x.classList.remove('drag-over', 'after'));
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
  function renderMasterDial() {
    const sp = { label: 'Master', min: 0, max: 1, step: 0.005, unit: '%', scale: 100 };
    $('masterDial').replaceChildren(dial(sp, S.globalOpacity, 1, (v) => { S.globalOpacity = v; push(); }, { size: 'md', title: 'Strength of all layers together' }));
  }

  function duplicate() {
    const L = cur(); if (!L || S.layers.length >= VP.MAX_LAYERS) return;
    const c = VP.migrateLayer(Object.assign(JSON.parse(JSON.stringify(L)), { id: VP.newId(), name: (L.name || '') + ' copy' }));
    S.layers.splice(S.layers.indexOf(L) + 1, 0, c); sel = c.id; edited(); renderAllLayerViews(); push();
  }
  function remove() {
    const L = cur(); if (!L) return;
    const i = S.layers.indexOf(L); S.layers.splice(i, 1);
    const n = S.layers[Math.min(i, S.layers.length - 1)]; sel = n ? n.id : null;
    edited(); renderAllLayerViews(); push();
  }
  $('dup').addEventListener('click', duplicate);
  $('del').addEventListener('click', remove);
  $('reseed').addEventListener('click', () => { const L = cur(); if (L) { L.seed = Math.floor(Math.random() * 100000); edited(); push(); toast('New pattern'); } });
  $('typeBtn').addEventListener('click', () => openTypes('change'));

  // ---------- layer controls ----------
  const MASKS = ['Full screen', 'Centre', 'Edges', 'Left side', 'Right side', 'Top', 'Bottom'];
  const MODS = ['Off', 'Opacity', 'Density', 'Rate'];
  MASKS.forEach((n, i) => $('maskSel').append(h('option', { value: i, text: n })));
  let advOpen = store.get('adv', false);
  $('advToggle').checked = advOpen;
  $('advToggle').addEventListener('change', () => { advOpen = $('advToggle').checked; store.set('adv', advOpen); renderAdvanced(); });

  const changed = (fn) => (v) => { fn(v); edited(); push(); renderLayersSoft(); };
  function renderControls() {
    const L = cur();
    $('ctlEmpty').hidden = !!L; $('ctlBody').hidden = !L;
    if (!L) { $('advanced').hidden = true; return; }
    const T = VP.BY_ID[L.type]; const D = VP.layer(L.type); const uses = new Set(T.uses);
    $('typeBtn').replaceChildren(h('span', { text: T.name }), ic('chevron-down'));
    $('typeLook').textContent = T.look;
    $('polField').hidden = !uses.has('polarity');
    if (uses.has('polarity')) seg($('polSeg'), ['Both', 'Light', 'Dark'], L.polarity || 0, changed((v) => (L.polarity = v)));
    seg($('showSeg'), ['All', 'Lights', 'Darks'], L.blend || 0, changed((v) => (L.blend = v)));
    $('showSeg').title = 'Lights: only the light parts, so the layer shows on dark areas of the screen. Darks: only the dark parts, so it shows on light areas.';
    $('lockSw').hidden = !uses.has('rate');
    $('rateLock').checked = !!L.rateLock;

    const big = ['opacity', 'size', 'density', 'rate'].filter((k) => uses.has(k));
    if (!uses.has('density') && uses.has('contrast')) big.splice(Math.min(2, big.length), 0, 'contrast');
    const bigKeys = big.slice(0, 4);
    const param = (k, size) => {
      const sp = VP.spec(L.type, k);
      const am = k === 'size' && L.size <= 8 ? arcmin(L.size) : null;
      return dial(sp, L[k], D[k], changed((v) => { L[k] = v; }),
        { size, title: am != null ? `${L.size} px is about ${am.toFixed(1)} arcmin at your calibration. Research average: under 2.` : null });
    };
    $('primary').replaceChildren(...bigKeys.map((k) => param(k, 'lg')));
    const small = ['contrast', 'softness'].filter((k) => uses.has(k) && !bigKeys.includes(k)).map((k) => param(k, 'sm'));
    T.extra.forEach((e) => {
      if (e.options) {
        const s = h('div', { class: 'seg col' });
        seg(s, e.options, Math.round(L[e.key] || 0), changed((v) => (L[e.key] = v)));
        small.push(h('div', { class: 'optctl' }, h('div', { class: 'd-lab', text: e.label }), s));
      } else small.push(dial(e, L[e.key], e.def, changed((v) => (L[e.key] = v)), { size: 'sm' }));
    });
    $('secondary').replaceChildren(...small);
    renderAdvanced();
  }
  $('rateLock').addEventListener('change', () => { const L = cur(); if (L) { L.rateLock = $('rateLock').checked; edited(); push(); } });

  function renderAdvanced() {
    const L = cur();
    $('advanced').hidden = !L || !advOpen;
    const badges = [];
    if (L) {
      if (L.mask.shape) badges.push('Mask');
      if (L.mod.target) badges.push('Vary');
      if (L.schedule.on) badges.push('Schedule');
      if (L.drift[0] || L.drift[1]) badges.push('Drift');
      if (L.colorMix) badges.push('Tint');
    }
    $('advBadges').textContent = advOpen ? '' : badges.join(' · ');
    if (!L || !advOpen) return;
    const T = VP.BY_ID[L.type]; const uses = new Set(T.uses);
    $('swatch').value = '#' + L.color.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
    $('swatchWrap').classList.toggle('off', !uses.has('color'));
    $('maskSel').value = String(L.mask.shape || 0);
    const modOpts = MODS.filter((m, i) => i <= 1 || (i === 2 && uses.has('density')) || (i === 3 && uses.has('rate')));
    $('modSel').replaceChildren(...modOpts.map((m) => h('option', { value: MODS.indexOf(m), text: m })));
    $('modSel').value = String(modOpts.includes(MODS[L.mod.target]) ? L.mod.target : 0);
    $('schedOn').checked = !!L.schedule.on;
    $('schedFrom').value = L.schedule.from; $('schedTo').value = L.schedule.to;
    $('schedFrom').disabled = $('schedTo').disabled = !L.schedule.on;

    const pct = (label) => ({ label, min: 0, max: 1, step: 0.01, unit: '%', scale: 100 });
    const drift = { min: -300, max: 300, step: 1, unit: 'px/s', int: true };
    const ds = [
      dial(Object.assign({}, VP.PARAMS.colorMix, { label: 'Tint' }), L.colorMix, 0, changed((v) => (L.colorMix = v)), { off: !uses.has('color') }),
      dial(Object.assign({ label: 'Drift →' }, drift), L.drift[0], 0, changed((v) => (L.drift[0] = v)), { bipolar: true, off: !uses.has('drift') }),
      dial(Object.assign({ label: 'Drift ↓' }, drift), L.drift[1], 0, changed((v) => (L.drift[1] = v)), { bipolar: true, off: !uses.has('drift') }),
      dial(Object.assign(pct(L.mask.shape > 0 && L.mask.shape <= 2 ? 'Mask radius' : 'Mask extent'), { min: 0.05 }), L.mask.size, 0.5, changed((v) => (L.mask.size = v)), { off: !L.mask.shape }),
      dial(pct('Mask feather'), L.mask.feather, 0.4, changed((v) => (L.mask.feather = v)), { off: !L.mask.shape }),
      dial(pct('Vary amount'), L.mod.depth, 0.5, changed((v) => (L.mod.depth = v)), { off: !L.mod.target }),
      dial({ label: 'Vary cycle', min: 5, max: 900, step: 1, unit: 's', log: true, int: true }, L.mod.period, 60, changed((v) => (L.mod.period = v)), { off: !L.mod.target })
    ];
    $('advDials').replaceChildren(...ds);
    $('advNote').textContent = L.schedule.on ? (NoiseRenderer.scheduleActive(L) ? 'Showing now' : 'Hidden until ' + L.schedule.from) : '';
  }
  $('swatch').addEventListener('input', () => {
    const L = cur(); if (!L) return;
    L.color = [1, 3, 5].map((i) => parseInt($('swatch').value.slice(i, i + 2), 16) / 255);
    if (!L.colorMix) { L.colorMix = 1; renderAdvanced(); }
    edited(); push();
  });
  $('maskSel').addEventListener('change', () => { const L = cur(); if (L) { L.mask.shape = Number($('maskSel').value); edited(); push(); renderAdvanced(); } });
  $('modSel').addEventListener('change', () => { const L = cur(); if (L) { L.mod.target = Number($('modSel').value); edited(); push(); renderAdvanced(); } });
  $('schedOn').addEventListener('change', () => { const L = cur(); if (L) { L.schedule.on = $('schedOn').checked; edited(); push(); renderAdvanced(); } });
  $('schedFrom').addEventListener('change', () => { const L = cur(); if (L) { L.schedule.from = $('schedFrom').value || '00:00'; edited(); push(); renderAdvanced(); } });
  $('schedTo').addEventListener('change', () => { const L = cur(); if (L) { L.schedule.to = $('schedTo').value || '00:00'; edited(); push(); renderAdvanced(); } });

  function renderAllLayerViews() { renderLayers(); renderControls(); renderReadout(); }

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
  // Drawn a few per frame (each new type compiles a small shader once), only while visible,
  // refreshed twice a second. Flicker types stay still.
  let thumbRaf = 0; let thumbJobs = []; let thumbIO = null;
  function runThumbs(jobs) {
    stopThumbs(); thumbJobs = jobs;
    thumbIO = new IntersectionObserver((es) => es.forEach((e) => { const j = jobs.find((x) => x.canvas === e.target); if (j) j.visible = e.isIntersecting; }));
    jobs.forEach((j) => { j.visible = null; j.at = -1; thumbIO.observe(j.canvas); });
    // Until the observer reports, treat a canvas as visible if it is laid out in view.
    const inView = (j) => { if (j.visible != null) return j.visible; const r = j.canvas.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
    const step = () => {
      if (thumbJobs !== jobs) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 10) {
        const j = jobs.find((x) => inView(x) && x.at < 0) || jobs.find((x) => inView(x) && !x.still && t0 - x.at > 500);
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
    const tabs = h('div', { class: 'seg' });
    [{ id: 'all', name: 'All' }, ...VP.FAMILIES].forEach((f) => {
      const b = h('button', { class: f.id === galFamily ? 'on' : '', text: f.name });
      b.addEventListener('click', () => { galFamily = f.id; store.set('galFamily', f.id); [...tabs.children].forEach((x) => x.classList.toggle('on', x === b)); renderTypeCards(); });
      tabs.append(b);
    });
    $('familyTabs').replaceChildren(tabs);
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
        h('div', { class: 'c-body' }, h('div', { class: 'c-fam', text: familyOf(T).name }), h('div', { class: 'c-name', text: T.name }), h('div', { class: 'c-desc', text: T.look })));
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
    $('typeDlg').close(); edited(); renderAllLayerViews(); push();
  }

  // ---------- presets ----------
  function openPresets() { openModal($('presetDlg')); renderPresetGallery(); }
  function applyPreset(id, layers) {
    S.layers = layers; S.preset = id; sel = S.layers[0] ? S.layers[0].id : null;
    renderPresetName(); renderAllLayerViews(); push();
  }
  function renderPresetGallery() {
    const root = $('presetGallery'); root.innerHTML = ''; const jobs = [];
    const card = (cat, name, desc, layersFn, onPick, isCur, onDelete) => {
      const cv = h('canvas');
      const c = h('button', { class: 'card' + (isCur ? ' cur' : '') }, cv, h('div', { class: 'c-body' }, h('div', { class: 'c-fam', text: cat }), h('div', { class: 'c-name', text: name }), h('div', { class: 'c-desc', text: desc })));
      c.addEventListener('click', onPick);
      if (onDelete) {
        const del = h('span', { class: 'btn sq c-del', title: 'Delete preset', role: 'button' }, ic('x'));
        del.addEventListener('click', (e) => { e.stopPropagation(); onDelete(); });
        c.append(del);
      }
      jobs.push({ canvas: cv, layers: layersFn, still: layersFn().some((l) => VP.BY_ID[l.type].flash) });
      return c;
    };
    if (S.userPresets && S.userPresets.length) {
      const grid = h('div', { class: 'grid' });
      S.userPresets.forEach((p) => grid.append(card('Mine', p.name, `${p.layers.length} layer${p.layers.length === 1 ? '' : 's'}`, () => p.layers,
        () => { applyPreset('user:' + p.id, p.layers.map((l) => VP.migrateLayer(Object.assign(JSON.parse(JSON.stringify(l)), { id: VP.newId() })))); $('presetDlg').close(); },
        S.preset === 'user:' + p.id,
        async () => {
          if (!(await ask({ title: `Delete “${p.name}”?`, ok: 'Delete', danger: true }))) { openModal($('presetDlg')); return; }
          S.userPresets = S.userPresets.filter((x) => x !== p); if (S.preset === 'user:' + p.id) S.preset = 'custom';
          push(); renderPresetName(); openModal($('presetDlg')); renderPresetGallery();
        })));
      root.append(h('div', { class: 'gal-group' }, h('span', { class: 'cap', text: 'Mine' }), grid));
    }
    VP.PRESET_GROUPS.forEach((gp) => {
      const grid = h('div', { class: 'grid' });
      VP.BUILTIN.filter((b) => b.group === gp.id).forEach((b) => {
        const sample = b.make();
        grid.append(card(gp.name, b.name, b.desc, () => sample, () => { applyPreset(b.id, b.make()); $('presetDlg').close(); }, S.preset === b.id));
      });
      root.append(h('div', { class: 'gal-group' }, h('span', { class: 'cap', text: gp.name }), grid));
    });
    runThumbs(jobs);
  }
  $('presetDlg').addEventListener('close', stopThumbs);
  async function savePreset(fromGallery) {
    const base = presetList().find((x) => x.id === S.preset);
    const name = await ask({ title: 'Save as preset', body: 'Saves the current layers so you can come back to them.', ok: 'Save', input: base ? base.name + ' (mine)' : 'My snow' });
    if (name) {
      const id = Date.now().toString(36);
      S.userPresets = S.userPresets || [];
      S.userPresets.push({ id, name, layers: JSON.parse(JSON.stringify(S.layers)) });
      S.preset = 'user:' + id; push(); renderPresetName(); toast('Preset saved');
    }
    if (fromGallery) { openModal($('presetDlg')); renderPresetGallery(); }
  }
  $('savePreset').addEventListener('click', () => savePreset(true));
  $('exportPreset').addEventListener('click', async () => {
    const p = presetList().find((x) => x.id === S.preset);
    const ok = await window.vs.exportSettings(JSON.stringify({ app: 'visual-snow-relief-kit', version: VP.SETTINGS_VERSION, name: p ? p.name : 'Custom', layers: S.layers, globalOpacity: S.globalOpacity }, null, 2));
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
    applyPreset('user:' + id, layers); renderMasterDial(); renderPresetGallery(); toast('Imported');
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
  function pill(checked, onChange, label) {
    const inp = h('input', { type: 'checkbox', checked, 'aria-label': label || '' });
    inp.addEventListener('change', () => onChange(inp.checked, inp));
    return h('label', { class: 'pill-switch' }, inp, h('span', { class: 'pill' }));
  }
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
    const b = h('button', { class: 'btn recorder' }, h('span', { text: prettyAccel(S.hotkeys[key]) }), h('span', { class: 'cap faint', text: 'Change' }));
    b.addEventListener('click', () => {
      b.classList.add('rec'); b.firstChild.textContent = 'Press keys… Esc cancels';
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
      const fps = h('div', { class: 'seg' });
      [30, 60, 90, 120, 144].forEach((v) => {
        const b = h('button', { class: S.maxFps === v ? 'on' : '', text: String(v) });
        b.addEventListener('click', () => { S.maxFps = v; push(); renderSettings(); });
        fps.append(b);
      });
      c.append(setRow('Frame rate cap', 'Upper limit for redraws, per second. Layers that change less often redraw less.', fps));
      c.append(setRow('Keep on top', 'Re-assert the overlay above other windows every second.', pill(S.keepOnTop !== false, (v) => { S.keepOnTop = v; push(); }, 'Keep on top')));
      const login = pill(!!S.launchAtLogin, (v) => { S.launchAtLogin = v; push(); }, 'Start at login');
      if (info.platform === 'linux') login.querySelector('input').disabled = true;
      c.append(setRow('Start at login', info.platform === 'linux' ? 'On Linux, add run.sh --hidden to your startup applications.' : 'Starts hidden in the tray.', login));
    } else if (setTab === 'displays') {
      head('Displays', 'Choose which screens show the overlay.');
      displays = await window.vs.getDisplays();
      c.append(setRow('All displays', 'Includes screens you plug in later.', pill(S.displays === 'all', (v) => { S.displays = v ? 'all' : displays.map((d) => d.id); push(); renderSettings(); }, 'All displays')));
      displays.forEach((d, i) => {
        const on = S.displays === 'all' || (Array.isArray(S.displays) && S.displays.includes(d.id));
        const sw = pill(on, (v) => {
          let list = S.displays === 'all' ? displays.map((x) => x.id) : S.displays.slice();
          list = v ? [...new Set([...list, d.id])] : list.filter((x) => x !== d.id);
          S.displays = list.length === displays.length ? 'all' : list; push(); renderSettings();
        }, d.label || `Display ${i + 1}`);
        c.append(setRow(d.label || `Display ${i + 1}`, `${Math.round(d.bounds.width * d.scaleFactor)} × ${Math.round(d.bounds.height * d.scaleFactor)} · ${Math.round(d.scaleFactor * 100)} % scale${d.primary ? ' · main' : ''}${d.hz ? ' · ' + d.hz + ' Hz' : ''}`, sw));
      });
    } else if (setTab === 'hotkeys') {
      head('Hotkeys', 'They work from any app. Click a shortcut, then press the new keys. Backspace clears it.');
      const st = await window.vs.hotkeyStatus();
      const bad = (k) => (st && st[k] === false ? h('span', { class: 'status-bad', text: 'In use by another app' }) : null);
      c.append(setRow('Overlay on or off', null, bad('toggle'), recorder('toggle')));
      c.append(setRow('Open this window', null, bad('panel'), recorder('panel')));
    } else if (setTab === 'calibration') {
      head('Calibration', 'Research measures snow in arcminutes of visual angle. Enter your screen size and how far you sit, so sizes mean the same on any screen.');
      const d = displays.find((x) => x.primary) || displays[0];
      const diag = h('input', { type: 'number', class: 'field', min: 5, max: 100, step: 0.1, value: S.calibration.diagonalInches, 'aria-label': 'Screen diagonal in inches' });
      const dist = h('input', { type: 'number', class: 'field', min: 20, max: 300, step: 1, value: S.calibration.distanceCm, 'aria-label': 'Viewing distance in centimetres' });
      const res = h('div', { class: 'result' });
      const calc = () => {
        if (!d) return;
        const ppa = VP.pxPerArcmin(d.bounds.width * d.scaleFactor, d.bounds.height * d.scaleFactor, S.calibration.diagonalInches, S.calibration.distanceCm);
        res.replaceChildren('One pixel on your main display is ', h('b', { text: (1 / ppa).toFixed(2) + ' arcmin' }), '. The research average dot is under 2 arcmin, so a size of ', h('b', { text: Math.max(1, Math.floor(2 * ppa)) + ' px' }), ' or less matches it.');
      };
      diag.addEventListener('input', () => { S.calibration.diagonalInches = Number(diag.value) || 24; calc(); push(); });
      dist.addEventListener('input', () => { S.calibration.distanceCm = Number(dist.value) || 60; calc(); push(); });
      c.append(setRow('Screen diagonal', 'Inches, corner to corner.', diag));
      c.append(setRow('Viewing distance', 'Centimetres from your eyes to the screen.', dist));
      c.append(res); calc();
    } else if (setTab === 'safety') {
      head('Safety', FLASH_WARNING);
      const sw = pill(!!S.flickerUnlocked, async (v, inp) => {
        if (v && !(await ask({ title: 'Allow fast full-screen flicker?', body: FLASH_WARNING + ' Above 3 flashes a second is the level accessibility guidelines warn about.', ok: 'Allow', danger: true }))) { inp.checked = false; return; }
        S.flickerUnlocked = v; push(); if (thumbR) thumbR.flickerUnlocked = v;
      }, 'Allow full-screen flicker above 3 Hz');
      c.append(setRow('Allow full-screen flicker above 3 Hz', 'Pulse, Flicker and Strobe are held to 3 flashes a second, and Flicker depth to 10 % above that, until you allow it.', sw));
      const again = h('button', { class: 'btn', text: 'Show' });
      again.addEventListener('click', () => { $('settingsDlg').close(); showFirstRun(); });
      c.append(setRow('Welcome screen', 'Show the first-run screen and safety note again.', again));
    } else if (setTab === 'about') {
      head('Visual Snow Relief Kit', `Version ${info.version} · Electron ${info.electron} · ${info.platform}`);
      c.append(h('p', { class: 'hint', text: 'Free and open source under the Apache License 2.0. Barlow typeface under the SIL Open Font License. Lucide icons under the ISC licence.' }));
      const pathRow = setRow('Settings file', null);
      pathRow.querySelector('.txt').append(h('div', { class: 'mono', text: info.settingsPath }));
      c.append(pathRow);
      const link = (label, url) => { const b = h('button', { class: 'btn' }, label, ic('external-link')); b.addEventListener('click', () => window.vs.openExternal(url)); return b; };
      c.append(h('div', { class: 'about-links' }, link('Source', info.repo), link('Releases', info.repo + '/releases'), link('Author', 'https://www.linkedin.com/in/chris26/')));
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
    const a = document.activeElement;
    const typing = /INPUT|SELECT|TEXTAREA/.test(a.tagName) || a.classList.contains('d-knob');
    if (typing || document.querySelector('dialog[open]')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && cur()) { e.preventDefault(); remove(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
  });

  // ---------- sync from main ----------
  window.vs.onSettings((s) => {
    S = s;
    if (!S.layers.find((l) => l.id === sel)) sel = S.layers[0] ? S.layers[0].id : null;
    renderAll();
  });

  function renderAll() {
    renderMaster(); renderPresetName(); renderAllLayerViews(); renderMasterDial(); renderStatus();
    if (pv) pv.setState(S);
  }
  hydrate(document.body);
  renderAll();
  if (!S.firstRunDone) showFirstRun();

  // test hook used by the smoke test
  window.__vs = {
    openTypes, openPresets, openSettings, renderAll, get S() { return S; }, get frames() { return pv ? pv.frames || 0 : 0; },
    setLayers: (ls) => { S.layers = ls; sel = ls[0] ? ls[0].id : null; renderAll(); push(); },
    setAdvanced: (on) => { $('advToggle').checked = on; $('advToggle').dispatchEvent(new Event('change')); }
  };
})();
