// Shared between main (CommonJS) and renderers (classic script).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VSPresets = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = [
    { id: 'snow', name: 'Snow (clinical)', desc: 'Sparse tiny dots, dark and light, each refreshing on its own clock.' },
    { id: 'static', name: 'TV static', desc: 'Dense grey noise, every cell updates together.' },
    { id: 'grain', name: 'Film grain', desc: 'Dense soft grain with a bell-shaped spread.' },
    { id: 'chroma', name: 'Colour chroma', desc: 'Dots in random saturated colours.' },
    { id: 'shimmer', name: 'Transparent shimmer', desc: 'Faint mid-grey dots that read as a shimmer.' },
    { id: 'sparkle', name: 'Flashing sparkles', desc: 'Rare bright dots that pop and fade.' },
    { id: 'floaters', name: 'Floaters', desc: 'Soft blobs that drift slowly and randomly.' },
    { id: 'fog', name: 'Fog swirl', desc: 'Large slow clouds.' },
    { id: 'scanlines', name: 'Scanlines', desc: 'Horizontal lines that flicker and roll.' },
    { id: 'pulse', name: 'Pulse', desc: 'Whole screen brightens and dims in a rhythm.' }
  ];
  const TYPE_INDEX = {};
  TYPES.forEach((t, i) => (TYPE_INDEX[t.id] = i));

  // Which controls matter for each type (others are hidden in the panel).
  const CONTROLS = {
    snow: ['opacity', 'size', 'rate', 'density', 'polarity', 'softness', 'color', 'colorMix', 'drift'],
    static: ['opacity', 'size', 'rate', 'contrast', 'color', 'colorMix', 'drift'],
    grain: ['opacity', 'size', 'rate', 'contrast', 'color', 'colorMix', 'drift'],
    chroma: ['opacity', 'size', 'rate', 'density', 'contrast', 'softness', 'drift'],
    shimmer: ['opacity', 'size', 'rate', 'density', 'softness', 'drift'],
    sparkle: ['opacity', 'size', 'rate', 'density', 'softness', 'color', 'colorMix'],
    floaters: ['opacity', 'size', 'rate', 'density', 'softness', 'polarity', 'color', 'colorMix', 'drift'],
    fog: ['opacity', 'size', 'rate', 'contrast', 'color', 'colorMix', 'drift'],
    scanlines: ['opacity', 'size', 'rate', 'contrast', 'color', 'colorMix', 'drift'],
    pulse: ['opacity', 'rate', 'color', 'colorMix']
  };

  let nextId = 1;
  function layer(type, overrides) {
    const base = {
      id: 'L' + Date.now().toString(36) + (nextId++).toString(36),
      name: TYPES[TYPE_INDEX[type]].name,
      type,
      enabled: true,
      opacity: 0.5,
      size: 1,
      rate: 18,
      density: 0.03,
      contrast: 0.5,
      polarity: 0, // 0 both, 1 light, 2 dark
      softness: 0.5,
      color: [1, 1, 1],
      colorMix: 0,
      drift: [0, 0],
      seed: Math.floor(Math.random() * 100000)
    };
    return Object.assign(base, overrides || {});
  }

  function defaults() {
    return {
      version: 1,
      enabled: true,
      maxFps: 60,
      globalOpacity: 1,
      displays: 'all',
      hotkeys: { toggle: 'CommandOrControl+Alt+V', panel: 'CommandOrControl+Alt+Shift+V' },
      launchAtLogin: false,
      calibration: { diagonalInches: 24, distanceCm: 60 },
      preset: 'clinical',
      layers: presetLayers('clinical'),
      userPresets: []
    };
  }

  const BUILTIN = [
    {
      id: 'clinical',
      name: 'Clinical match (research averages)',
      make: () => [
        layer('snow', { name: 'Snow 1–2 px, 18 Hz', size: 1, rate: 18, density: 0.03, opacity: 0.45, polarity: 0, seed: 11 })
      ]
    },
    {
      id: 'clinical-dense',
      name: 'Clinical, strong',
      make: () => [
        layer('snow', { size: 1, rate: 22, density: 0.08, opacity: 0.6, seed: 12 }),
        layer('snow', { name: 'Larger dots', size: 2, rate: 12, density: 0.01, opacity: 0.35, seed: 13 })
      ]
    },
    {
      id: 'bw-static',
      name: 'Black and white static',
      make: () => [layer('static', { size: 1, rate: 30, contrast: 0.9, opacity: 0.2, seed: 21 })]
    },
    {
      id: 'film',
      name: 'Film grain',
      make: () => [layer('grain', { size: 2, rate: 24, contrast: 0.7, opacity: 0.25, seed: 31 })]
    },
    {
      id: 'coloured',
      name: 'Coloured snow',
      make: () => [
        layer('snow', { size: 1, rate: 18, density: 0.03, opacity: 0.35, seed: 41 }),
        layer('chroma', { size: 1, rate: 15, density: 0.02, opacity: 0.45, contrast: 1, seed: 42 })
      ]
    },
    {
      id: 'transparent',
      name: 'Transparent shimmer',
      make: () => [layer('shimmer', { size: 2, rate: 14, density: 0.08, opacity: 0.18, softness: 0.7, seed: 51 })]
    },
    {
      id: 'flashing',
      name: 'Flashing dots',
      make: () => [
        layer('snow', { size: 1, rate: 18, density: 0.02, opacity: 0.35, seed: 61 }),
        layer('sparkle', { size: 3, rate: 2, density: 0.004, opacity: 0.8, softness: 0.8, seed: 62 })
      ]
    },
    {
      id: 'full',
      name: 'Full syndrome (snow + floaters + afterglow)',
      make: () => [
        layer('snow', { size: 1, rate: 18, density: 0.03, opacity: 0.45, seed: 71 }),
        layer('floaters', { size: 6, rate: 0.4, density: 0.15, opacity: 0.25, softness: 0.9, polarity: 2, seed: 72 }),
        layer('fog', { size: 320, rate: 0.15, contrast: 0.5, opacity: 0.08, color: [0.6, 0.5, 1], colorMix: 1, seed: 73 }),
        layer('sparkle', { size: 2, rate: 1.5, density: 0.002, opacity: 0.7, softness: 0.8, seed: 74 })
      ]
    },
    {
      id: 'dim-room',
      name: 'Dim room (low light, more visible)',
      make: () => [
        layer('snow', { size: 1, rate: 16, density: 0.05, opacity: 0.6, polarity: 1, seed: 81 }),
        layer('fog', { size: 400, rate: 0.1, contrast: 0.6, opacity: 0.1, color: [0.2, 0.3, 0.6], colorMix: 1, seed: 82 })
      ]
    },
    {
      id: 'crt',
      name: 'Old CRT',
      make: () => [
        layer('static', { size: 2, rate: 25, contrast: 0.7, opacity: 0.18, seed: 91 }),
        layer('scanlines', { size: 3, rate: 60, contrast: 0.8, opacity: 0.22, drift: [0, 20], seed: 92 }),
        layer('pulse', { rate: 0.8, opacity: 0.04, seed: 93 })
      ]
    },
    {
      id: 'mosaic',
      name: 'Big pixel mosaic',
      make: () => [layer('static', { size: 12, rate: 6, contrast: 0.6, opacity: 0.15, seed: 101 })]
    },
    {
      id: 'swirl',
      name: 'Eyes-closed swirls',
      make: () => [
        layer('fog', { size: 250, rate: 0.2, contrast: 0.8, opacity: 0.22, color: [0.9, 0.3, 0.6], colorMix: 1, seed: 111 }),
        layer('fog', { size: 160, rate: 0.3, contrast: 0.7, opacity: 0.18, color: [0.2, 0.6, 1], colorMix: 1, drift: [8, -5], seed: 112 }),
        layer('snow', { size: 1, rate: 12, density: 0.04, opacity: 0.4, seed: 113 })
      ]
    }
  ];

  function presetLayers(id) {
    const p = BUILTIN.find((b) => b.id === id);
    return p ? p.make() : BUILTIN[0].make();
  }

  // Pixels per arcminute for a display, from the panel calibration.
  function pxPerArcmin(widthPx, heightPx, diagonalInches, distanceCm) {
    const diagPx = Math.hypot(widthPx, heightPx);
    const pxSizeCm = (diagonalInches * 2.54) / diagPx;
    const arcminPerPx = (Math.atan(pxSizeCm / distanceCm) * 180 / Math.PI) * 60;
    return 1 / arcminPerPx;
  }

  return { TYPES, TYPE_INDEX, CONTROLS, BUILTIN, layer, defaults, presetLayers, pxPerArcmin };
});
