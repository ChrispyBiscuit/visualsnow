/* global NoiseRenderer */
(function () {
  const displayId = Number(new URLSearchParams(location.search).get('display'));
  let r = null;
  try { r = new NoiseRenderer(document.getElementById('c')); } catch (e) { console.error(e); }
  function apply(s) {
    if (!r) return;
    const on = s.enabled && (s.displays === 'all' || (Array.isArray(s.displays) && s.displays.includes(displayId)));
    if (!on) { r.stop(); return; }
    r.setState(s);
    r.start();
  }
  window.vs.onSettings(apply);
  window.vs.getSettings().then(apply);
})();
