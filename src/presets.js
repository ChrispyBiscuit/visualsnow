// Noise type catalog, presets, defaults and settings migration.
// Shared by the main process (CommonJS) and the renderers (classic script).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VSPresets = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const SETTINGS_VERSION = 2;
  const MAX_LAYERS = 8;
  const FLASH_CAP_HZ = 3;

  const FAMILIES = [
    { id: 'dots', name: 'Dots', icon: 'circle-dot', desc: 'The visual snow core: small dots on their own clocks.' },
    { id: 'grain', name: 'Grain & static', icon: 'film', desc: 'Analog media: film, TV, print and tape.' },
    { id: 'fields', name: 'Fields', icon: 'cloud-fog', desc: 'Clouds, swirls, cells and waves.' },
    { id: 'shapes', name: 'Floaters & shapes', icon: 'droplets', desc: 'Things that drift: floaters, blobs, particles.' },
    { id: 'flicker', name: 'Flicker', icon: 'zap', desc: 'Whole-screen brightness changes.' },
    { id: 'lines', name: 'Lines & structure', icon: 'rows-3', desc: 'Scanlines, grids, streaks.' }
  ];

  // Generic parameters. Types can relabel them and change their range.
  const PARAMS = {
    opacity: { label: 'Opacity', min: 0, max: 1, step: 0.005, unit: '%', scale: 100, group: 'look' },
    size: { label: 'Size', min: 1, max: 64, step: 1, unit: 'px', log: true, int: true, group: 'look' },
    density: { label: 'Density', min: 0.001, max: 1, step: 0.0005, unit: '%', scale: 100, log: true, group: 'look' },
    contrast: { label: 'Contrast', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, group: 'look' },
    softness: { label: 'Softness', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, group: 'look' },
    rate: { label: 'Rate', min: 0.02, max: 60, step: 0.01, unit: 'Hz', log: true, group: 'timing' },
    colorMix: { label: 'Tint', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, group: 'colour' }
  };
  const DOT = ['opacity', 'size', 'density', 'softness', 'polarity', 'rate', 'color', 'drift'];
  const GRAIN = ['opacity', 'size', 'contrast', 'rate', 'color', 'drift'];
  const FIELD = ['opacity', 'size', 'contrast', 'rate', 'color', 'drift'];

  // index in this array == shader type id. Never reorder; append only.
  const TYPES = [
    // ---- Dots
    { id: 'snow', name: 'Snow', family: 'dots', async: true, look: 'Sparse tiny dots, dark and light, each refreshing on its own clock.', uses: DOT,
      def: { size: 1, rate: 18, density: 0.03, opacity: 0.45 } },
    { id: 'even', name: 'Even snow', family: 'dots', async: true, look: 'Same density as Snow but evenly spread, no clumps or gaps.', uses: DOT,
      extra: [{ key: 'p1', label: 'Jitter', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 1 }],
      def: { size: 1, rate: 18, density: 0.03, opacity: 0.45 } },
    { id: 'fixed', name: 'Fixed shimmer', family: 'dots', async: true, look: 'Dots stay put and only twinkle, like a screen door.', uses: DOT,
      over: { rate: { label: 'Twinkle rate' } },
      extra: [{ key: 'p1', label: 'Twinkle depth', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.8 }],
      def: { size: 1, rate: 12, density: 0.04, opacity: 0.5 } },
    { id: 'pulsedots', name: 'Pulsing dots', family: 'dots', continuous: true, look: 'Dots fade in and out smoothly instead of switching.', uses: DOT,
      over: { rate: { label: 'Pulse rate' } },
      extra: [{ key: 'p1', label: 'Fade sharpness', min: 0.3, max: 4, step: 0.05, unit: '×', def: 1 }],
      def: { size: 2, rate: 3, density: 0.03, opacity: 0.55, softness: 0.6 } },
    { id: 'patchy', name: 'Patchy snow', family: 'dots', continuous: true, look: 'Snow that is denser in slow drifting patches.', uses: DOT,
      extra: [
        { key: 'p1', label: 'Patch scale', min: 40, max: 1500, step: 1, unit: 'px', log: true, int: true, def: 300 },
        { key: 'p2', label: 'Patch contrast', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.8 },
        { key: 'p3', label: 'Patch speed', min: 0.005, max: 1, step: 0.005, unit: 'Hz', log: true, def: 0.05 }
      ],
      def: { size: 1, rate: 18, density: 0.04, opacity: 0.5 } },
    { id: 'falling', name: 'Falling snow', family: 'dots', continuous: true, look: 'Dots drifting one way at different depths, like snowfall or stars.',
      uses: ['opacity', 'size', 'density', 'softness', 'polarity', 'color'],
      extra: [
        { key: 'p1', label: 'Direction', min: -180, max: 180, step: 1, unit: '°', def: 0 },
        { key: 'p2', label: 'Speed', min: 1, max: 600, step: 1, unit: 'px/s', log: true, def: 40 },
        { key: 'p3', label: 'Wobble', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.3 }
      ],
      def: { size: 2, density: 0.02, opacity: 0.6, polarity: 1, softness: 0.7 } },
    { id: 'burst', name: 'Bursts', family: 'dots', continuous: true, look: 'Waves of dense static, then quiet.', uses: DOT,
      extra: [
        { key: 'p1', label: 'Burst rate', min: 0.02, max: 4, step: 0.01, unit: 'Hz', log: true, def: 0.4 },
        { key: 'p2', label: 'Burst length', min: 0.05, max: 0.95, step: 0.01, unit: '%', scale: 100, def: 0.3 }
      ],
      def: { size: 1, rate: 20, density: 0.05, opacity: 0.5 } },
    { id: 'chroma', name: 'Colour dots', family: 'dots', async: true, look: 'Dots in random saturated colours.',
      uses: ['opacity', 'size', 'density', 'contrast', 'softness', 'rate', 'drift'], over: { contrast: { label: 'Saturation' } },
      def: { size: 1, rate: 15, density: 0.02, opacity: 0.45, contrast: 1 } },
    { id: 'shimmer', name: 'Transparent', family: 'dots', async: true, look: 'Faint mid-grey dots that read as a shimmer.',
      uses: ['opacity', 'size', 'density', 'softness', 'rate', 'drift'],
      def: { size: 2, rate: 14, density: 0.08, opacity: 0.18, softness: 0.7 } },
    { id: 'sparkle', name: 'Flashing sparkles', family: 'dots', continuous: true, look: 'Rare bright dots that pop and fade.',
      uses: ['opacity', 'size', 'density', 'softness', 'rate', 'color'], over: { rate: { label: 'Pop rate' } },
      def: { size: 3, rate: 2, density: 0.004, opacity: 0.8, softness: 0.8 } },

    // ---- Grain & static
    { id: 'static', name: 'TV static', family: 'grain', look: 'Dense grey noise, every cell changes together.', uses: GRAIN,
      def: { size: 1, rate: 30, contrast: 0.9, opacity: 0.2 } },
    { id: 'grain', name: 'Film grain', family: 'grain', look: 'Dense soft grain with a bell-shaped spread.', uses: GRAIN,
      extra: [{ key: 'p1', label: 'Colour grain', options: ['Off', 'On'], def: 0 }],
      def: { size: 2, rate: 24, contrast: 0.7, opacity: 0.25 } },
    { id: 'bluegrain', name: 'Fine grain', family: 'grain', look: 'Blue-noise grain with no clumps. Smooth at the same strength.', uses: GRAIN,
      def: { size: 1, rate: 24, contrast: 0.8, opacity: 0.3 } },
    { id: 'halftone', name: 'Halftone', family: 'grain', continuous: true, look: 'Print dot screen. Dot size follows a slow drifting field.',
      uses: ['opacity', 'size', 'contrast', 'polarity', 'rate', 'color'],
      over: { size: { label: 'Pitch', min: 3, max: 40, log: false }, rate: { label: 'Drift rate', min: 0.005, max: 2 } },
      extra: [
        { key: 'p1', label: 'Angle', min: 0, max: 90, step: 1, unit: '°', def: 45 },
        { key: 'p2', label: 'Field scale', min: 50, max: 2000, step: 1, unit: 'px', log: true, int: true, def: 400 }
      ],
      def: { size: 6, rate: 0.1, contrast: 0.8, opacity: 0.18, polarity: 2 } },
    { id: 'dither', name: 'Ordered dither', family: 'grain', look: 'Bayer pattern that flickers between two phases.',
      uses: ['opacity', 'size', 'density', 'polarity', 'rate', 'color'], over: { density: { label: 'Coverage' } },
      extra: [{ key: 'p1', label: 'Matrix', options: ['4×4', '8×8'], def: 1 }],
      def: { size: 2, rate: 12, density: 0.3, opacity: 0.2 } },
    { id: 'dust', name: 'Dust & scratches', family: 'grain', look: 'Specks and hairlines that last a few frames, like projected film.',
      uses: ['opacity', 'size', 'softness', 'polarity', 'rate', 'color'],
      over: { rate: { label: 'Frame rate' } },
      extra: [
        { key: 'p1', label: 'Specks', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.4 },
        { key: 'p2', label: 'Scratches', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.3 },
        { key: 'p3', label: 'Scratch length', min: 0.05, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.5 }
      ],
      def: { size: 2, rate: 24, opacity: 0.5, softness: 0.5 } },
    { id: 'vhs', name: 'VHS tracking', family: 'grain', continuous: true, look: 'Rolling bands of torn static and a tracking line.',
      uses: ['opacity', 'size', 'contrast', 'rate', 'color'],
      extra: [
        { key: 'p1', label: 'Band height', min: 4, max: 300, step: 1, unit: 'px', log: true, int: true, def: 40 },
        { key: 'p2', label: 'Roll speed', min: 0, max: 400, step: 1, unit: 'px/s', def: 60 },
        { key: 'p3', label: 'Band amount', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.3 }
      ],
      def: { size: 2, rate: 30, contrast: 0.9, opacity: 0.25 } },
    { id: 'interlace', name: 'Interlace', family: 'grain', look: 'Alternate lines flicker in opposite phase.',
      uses: ['opacity', 'size', 'contrast', 'rate', 'color'], over: { size: { label: 'Line height', max: 16 } },
      def: { size: 1, rate: 30, contrast: 0.6, opacity: 0.12 } },

    // ---- Fields
    { id: 'fog', name: 'Fog', family: 'fields', continuous: true, look: 'Large slow clouds.', uses: FIELD,
      over: { size: { label: 'Cloud scale', min: 20, max: 1500 }, rate: { label: 'Evolve rate' } },
      def: { size: 300, rate: 0.15, contrast: 0.5, opacity: 0.1, color: [0.6, 0.5, 1], colorMix: 1 } },
    { id: 'warp', name: 'Marbled swirl', family: 'fields', continuous: true, look: 'Clouds folded through themselves. Like closed-eye swirls.', uses: FIELD,
      over: { size: { label: 'Scale', min: 30, max: 1500 }, rate: { label: 'Flow rate' } },
      extra: [
        { key: 'p1', label: 'Warp', min: 0, max: 3, step: 0.01, unit: '×', def: 1.2 },
        { key: 'p2', label: 'Colour spread', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.8 }
      ],
      def: { size: 350, rate: 0.08, contrast: 0.6, opacity: 0.14 } },
    { id: 'cells', name: 'Cells', family: 'fields', continuous: true, look: 'Soft bubbles or a honeycomb mesh that drifts and merges.', uses: FIELD,
      over: { size: { label: 'Cell size', min: 10, max: 800 }, rate: { label: 'Drift rate' } },
      extra: [
        { key: 'p1', label: 'Mode', options: ['Bubbles', 'Edges'], def: 1 },
        { key: 'p2', label: 'Edge width', min: 0.01, max: 0.5, step: 0.01, unit: '%', scale: 100, def: 0.08 }
      ],
      def: { size: 120, rate: 0.2, contrast: 0.8, opacity: 0.16, color: [0.55, 0.6, 0.72], colorMix: 1 } },
    { id: 'ripples', name: 'Ripples', family: 'fields', continuous: true, look: 'Rings spreading from random points.',
      uses: ['opacity', 'size', 'density', 'contrast', 'color', 'drift'],
      over: { size: { label: 'Region', min: 60, max: 1500 }, density: { label: 'Spawn chance', min: 0.02 } },
      extra: [
        { key: 'p1', label: 'Ring spacing', min: 4, max: 120, step: 1, unit: 'px', def: 24 },
        { key: 'p2', label: 'Spawn rate', min: 0.02, max: 2, step: 0.01, unit: 'Hz', log: true, def: 0.2 },
        { key: 'p3', label: 'Speed', min: 10, max: 800, step: 1, unit: 'px/s', log: true, def: 120 }
      ],
      def: { size: 400, density: 0.5, contrast: 0.8, opacity: 0.16, color: [0.55, 0.6, 0.72], colorMix: 1 } },
    { id: 'interference', name: 'Interference', family: 'fields', continuous: true, look: 'Two drifting gratings. Moiré bands and beats.',
      uses: ['opacity', 'size', 'contrast', 'rate', 'color'],
      over: { size: { label: 'Spacing', min: 2, max: 100 }, rate: { label: 'Drift rate', max: 5 } },
      extra: [
        { key: 'p1', label: 'Angle', min: 0, max: 180, step: 1, unit: '°', def: 15 },
        { key: 'p2', label: 'Angle offset', min: 0, max: 20, step: 0.1, unit: '°', def: 3 }
      ],
      def: { size: 6, rate: 0.2, contrast: 0.8, opacity: 0.1 } },
    { id: 'plasma', name: 'Plasma', family: 'fields', continuous: true, look: 'Smooth colour wash from overlapping waves.',
      uses: ['opacity', 'size', 'rate', 'color', 'drift'],
      over: { size: { label: 'Scale', min: 30, max: 1500 }, rate: { label: 'Speed', max: 5 } },
      extra: [{ key: 'p1', label: 'Hue spread', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.6 }],
      def: { size: 400, rate: 0.15, opacity: 0.08 } },

    // ---- Floaters & shapes
    { id: 'floaters', name: 'Floaters', family: 'shapes', continuous: true, look: 'Soft blobs that wander slowly.',
      uses: ['opacity', 'size', 'density', 'softness', 'polarity', 'rate', 'color', 'drift'],
      over: { size: { label: 'Blob size', max: 60 }, rate: { label: 'Wander' } },
      def: { size: 6, rate: 0.4, density: 0.15, opacity: 0.3, softness: 0.9 } },
    { id: 'squiggles', name: 'Squiggles', family: 'shapes', continuous: true, look: 'Translucent worm-like strands that drift and bend, like vitreous floaters.',
      uses: ['opacity', 'size', 'density', 'softness', 'polarity', 'rate', 'color', 'drift'],
      over: { size: { label: 'Thickness', max: 20 }, rate: { label: 'Wander' } },
      extra: [
        { key: 'p1', label: 'Length', min: 20, max: 600, step: 1, unit: 'px', log: true, int: true, def: 120 },
        { key: 'p2', label: 'Bend', min: 0, max: 3, step: 0.01, unit: '×', def: 1.2 }
      ],
      def: { size: 3, rate: 0.2, density: 0.55, opacity: 0.28, softness: 0.6, polarity: 2 } },
    { id: 'phosphene', name: 'Phosphenes', family: 'shapes', continuous: true, look: 'Large soft coloured blobs that bloom, drift and fade.',
      uses: ['opacity', 'size', 'density', 'softness', 'rate', 'color'],
      over: { size: { label: 'Region', min: 80, max: 1500 }, rate: { label: 'Bloom rate', max: 2 } },
      extra: [{ key: 'p1', label: 'Hue drift', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.3 }],
      def: { size: 400, rate: 0.1, density: 0.5, opacity: 0.15, softness: 1 } },
    { id: 'flow', name: 'Flow particles', family: 'shapes', continuous: true, look: 'Tiny dots carried along a swirling flow.',
      uses: ['opacity', 'size', 'density', 'softness', 'polarity', 'color'],
      over: { size: { label: 'Particle', max: 8 } },
      extra: [
        { key: 'p1', label: 'Flow scale', min: 30, max: 1500, step: 1, unit: 'px', log: true, int: true, def: 300 },
        { key: 'p2', label: 'Flow speed', min: 2, max: 400, step: 1, unit: 'px/s', log: true, def: 40 },
        { key: 'p3', label: 'Life', min: 0.5, max: 10, step: 0.1, unit: 's', def: 3 }
      ],
      def: { size: 2, density: 0.6, opacity: 0.5, softness: 0.5, polarity: 1 } },
    { id: 'bokeh', name: 'Bokeh', family: 'shapes', continuous: true, look: 'Big soft discs with a bright rim, fading in and out.',
      uses: ['opacity', 'size', 'density', 'softness', 'rate', 'color', 'drift'],
      over: { size: { label: 'Disc size', min: 4, max: 200 }, rate: { label: 'Fade rate', max: 2 } },
      extra: [{ key: 'p1', label: 'Rim', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.4 }],
      def: { size: 40, rate: 0.1, density: 0.3, opacity: 0.15, softness: 0.6 } },

    // ---- Flicker
    { id: 'pulse', name: 'Pulse', family: 'flicker', flash: true, continuous: true, look: 'The whole screen brightens and dims in a slow rhythm.',
      uses: ['opacity', 'rate', 'color'], def: { rate: 0.8, opacity: 0.05 } },
    { id: 'flicker', name: 'Flicker', family: 'flicker', flash: true, look: 'Random brightness jitter, like a tired fluorescent tube.',
      uses: ['opacity', 'rate', 'color'],
      extra: [{ key: 'p1', label: 'Depth', min: 0, max: 0.5, step: 0.005, unit: '%', scale: 100, def: 0.05 }],
      def: { rate: 8, opacity: 1 } },
    { id: 'vignette', name: 'Breathing vignette', family: 'flicker', continuous: true, look: 'The edges darken and lighten slowly.',
      uses: ['opacity', 'rate', 'color'], over: { rate: { label: 'Breath rate', max: 2 } },
      extra: [{ key: 'p1', label: 'Edge width', min: 0.05, max: 1, step: 0.01, unit: '%', scale: 100, def: 0.5 }],
      def: { rate: 0.1, opacity: 0.35 } },
    { id: 'strobe', name: 'Strobe', family: 'flicker', flash: true, continuous: true, look: 'Hard flashes. For film and CRT looks only.',
      uses: ['opacity', 'rate', 'color'],
      extra: [{ key: 'p1', label: 'Duty', min: 0.02, max: 0.5, step: 0.01, unit: '%', scale: 100, def: 0.1 }],
      def: { rate: 1, opacity: 0.12 } },

    // ---- Lines
    { id: 'scanlines', name: 'Scanlines', family: 'lines', look: 'Horizontal lines that flicker and can roll.',
      uses: ['opacity', 'size', 'contrast', 'rate', 'color', 'drift'], over: { size: { label: 'Line pitch', max: 16 } },
      def: { size: 3, rate: 60, contrast: 0.8, opacity: 0.2 } },
    { id: 'grid', name: 'Grid', family: 'lines', look: 'A fine square or hex mesh that shimmers.',
      uses: ['opacity', 'size', 'contrast', 'polarity', 'rate', 'color', 'drift'],
      over: { size: { label: 'Pitch', min: 4, max: 200 }, rate: { label: 'Shimmer rate' } },
      extra: [
        { key: 'p1', label: 'Shape', options: ['Square', 'Hex'], def: 0 },
        { key: 'p2', label: 'Line width', min: 1, max: 6, step: 0.1, unit: 'px', def: 1 }
      ],
      def: { size: 24, rate: 6, contrast: 0.6, opacity: 0.1, polarity: 2 } },
    { id: 'rain', name: 'Rain streaks', family: 'lines', continuous: true, look: 'Thin streaks falling at speed.',
      uses: ['opacity', 'size', 'density', 'color'], over: { size: { label: 'Width', max: 6 } },
      extra: [
        { key: 'p1', label: 'Angle', min: -60, max: 60, step: 1, unit: '°', def: 15 },
        { key: 'p2', label: 'Speed', min: 50, max: 3000, step: 10, unit: 'px/s', log: true, def: 900 },
        { key: 'p3', label: 'Length', min: 5, max: 300, step: 1, unit: 'px', log: true, int: true, def: 60 }
      ],
      def: { size: 1, density: 0.1, opacity: 0.3, color: [0.62, 0.68, 0.8], colorMix: 1 } },
    { id: 'checker', name: 'Checker flicker', family: 'lines', look: 'A fine checkerboard whose two phases alternate.',
      uses: ['opacity', 'size', 'contrast', 'polarity', 'rate', 'color'], over: { size: { label: 'Pitch', max: 32 } },
      def: { size: 2, rate: 10, contrast: 0.5, opacity: 0.08 } }
  ];
  const TYPE_INDEX = {};
  const BY_ID = {};
  TYPES.forEach((t, i) => { TYPE_INDEX[t.id] = i; BY_ID[t.id] = t; t.extra = t.extra || []; t.over = t.over || {}; });

  // Resolved parameter spec for a type (generic + overrides).
  function spec(typeId, key) {
    const t = BY_ID[typeId];
    const ex = t.extra.find((e) => e.key === key);
    if (ex) return ex;
    return Object.assign({ key }, PARAMS[key] || {}, t.over[key] || {});
  }

  let counter = 1;
  function newId() { return 'L' + Date.now().toString(36) + (counter++).toString(36); }

  function base() {
    return {
      id: newId(), name: '', type: 'snow', enabled: true,
      opacity: 0.5, size: 1, rate: 18, density: 0.03, contrast: 0.5, polarity: 0, softness: 0.5,
      color: [1, 1, 1], colorMix: 0, drift: [0, 0], p1: 0, p2: 0, p3: 0,
      seed: Math.floor(Math.random() * 100000),
      blend: 0,
      mask: { shape: 0, size: 0.5, feather: 0.4 },
      mod: { target: 0, depth: 0.5, period: 60 },
      schedule: { on: false, from: '20:00', to: '07:00' },
      rateLock: false
    };
  }
  function typeDefaults(typeId) {
    const t = BY_ID[typeId] || BY_ID.snow;
    const d = {};
    t.extra.forEach((e) => (d[e.key] = e.def));
    return Object.assign(d, JSON.parse(JSON.stringify(t.def || {})));
  }
  function layer(typeId, overrides) {
    const t = BY_ID[typeId] || BY_ID.snow;
    const L = Object.assign(base(), typeDefaults(t.id), { type: t.id, name: t.name });
    const o = overrides ? JSON.parse(JSON.stringify(overrides)) : {};
    for (const k of ['mask', 'mod', 'schedule']) if (o[k]) { L[k] = Object.assign(L[k], o[k]); delete o[k]; }
    return Object.assign(L, o);
  }
  // Fill any missing fields (1.x layers, imports) without touching present ones.
  function migrateLayer(l) {
    const typeId = BY_ID[l && l.type] ? l.type : 'snow';
    const fresh = layer(typeId);
    const out = Object.assign(fresh, l || {}, { type: typeId });
    out.mask = Object.assign(layer(typeId).mask, (l && l.mask) || {});
    out.mod = Object.assign(layer(typeId).mod, (l && l.mod) || {});
    out.schedule = Object.assign(layer(typeId).schedule, (l && l.schedule) || {});
    if (!Array.isArray(out.color) || out.color.length !== 3) out.color = [1, 1, 1];
    if (!Array.isArray(out.drift) || out.drift.length !== 2) out.drift = [0, 0];
    if (!out.id) out.id = newId();
    if (!out.name) out.name = BY_ID[typeId].name;
    return out;
  }

  const PRESET_GROUPS = [
    { id: 'clinical', name: 'Clinical' },
    { id: 'variants', name: 'Reported variants' },
    { id: 'analog', name: 'Analog media' },
    { id: 'ambient', name: 'Ambient & calm' },
    { id: 'demo', name: 'Demo & extreme' }
  ];
  const P = (id, group, name, desc, layers) => ({ id, group, name, desc, make: () => layers().map((x) => layer(x[0], x[1])) });
  const BUILTIN = [
    P('clinical', 'clinical', 'Clinical match', 'Matching-study averages: under 2 arcmin, 18.2 Hz, 2.9 % density, low contrast.',
      () => [['snow', { name: 'Snow · 1 px · 18 Hz', seed: 11 }]]),
    P('clinical-even', 'clinical', 'Clinical, even texture', 'Same averages with evenly spread dots. Many describe snow as uniform.',
      () => [['even', { name: 'Even snow · 18 Hz', seed: 12 }]]),
    P('clinical-strong', 'clinical', 'Clinical, strong', 'Upper end of the reported range: denser, faster, two dot sizes.',
      () => [['snow', { rate: 22, density: 0.08, opacity: 0.6, seed: 13 }], ['snow', { name: 'Larger dots', size: 2, rate: 12, density: 0.01, opacity: 0.35, seed: 14 }]]),
    P('clinical-periphery', 'clinical', 'Worse at the edges', 'Clinical snow, heavier in peripheral vision.',
      () => [['snow', { name: 'Centre', opacity: 0.3, seed: 15 }], ['snow', { name: 'Periphery', density: 0.07, opacity: 0.55, seed: 16, mask: { shape: 2, size: 0.45, feather: 0.6 } }]]),

    P('bw', 'variants', 'Black and white', 'The most reported type, 58–65 % of patients.',
      () => [['static', { size: 1, rate: 24, contrast: 0.9, opacity: 0.16, seed: 21 }], ['snow', { density: 0.03, opacity: 0.35, seed: 22 }]]),
    P('transparent', 'variants', 'Transparent', 'Reported by 41–54 %. Faint mid-grey shimmer.',
      () => [['shimmer', { seed: 31 }]]),
    P('flashing', 'variants', 'Flashing', 'Reported by 44–50 %. Snow with bright pops.',
      () => [['snow', { density: 0.02, opacity: 0.35, seed: 41 }], ['sparkle', { seed: 42 }]]),
    P('coloured', 'variants', 'Coloured', 'Reported by 23–40 %. Mixed grey and colour dots.',
      () => [['snow', { opacity: 0.35, seed: 51 }], ['chroma', { seed: 52 }]]),
    P('screen-door', 'variants', 'Screen door', 'Dots that stay in place and twinkle.',
      () => [['fixed', { seed: 61 }]]),
    P('waves', 'variants', 'Waves of static', 'Snow that comes in waves and patches.',
      () => [['burst', { seed: 71 }], ['patchy', { opacity: 0.3, density: 0.02, seed: 72 }]]),
    P('bright-sky', 'variants', 'Bright sky', 'Snow with floaters and squiggles, as against a blue sky.',
      () => [['snow', { opacity: 0.35, seed: 81 }], ['squiggles', { seed: 82 }], ['floaters', { polarity: 2, seed: 83 }]]),
    P('eyes-closed', 'variants', 'Eyes closed', 'Marbled swirls and phosphene blobs, as with eyes shut.',
      () => [['warp', { seed: 91 }], ['phosphene', { seed: 92 }], ['snow', { rate: 12, density: 0.04, opacity: 0.35, seed: 93 }]]),
    P('dim-room', 'variants', 'Dim room', 'Snow is most visible in low light and on dark backgrounds.',
      () => [['snow', { rate: 16, density: 0.05, opacity: 0.6, polarity: 1, seed: 101 }], ['fog', { size: 400, rate: 0.1, contrast: 0.6, opacity: 0.1, color: [0.2, 0.3, 0.6], seed: 102 }]]),
    P('full', 'variants', 'Full syndrome', 'Snow, floaters, flashes and afterglow together.',
      () => [['snow', { seed: 111 }], ['floaters', { opacity: 0.25, polarity: 2, seed: 112 }], ['fog', { size: 320, opacity: 0.08, seed: 113 }], ['sparkle', { size: 2, rate: 1.5, density: 0.002, opacity: 0.7, seed: 114 }]]),

    P('film', 'analog', 'Cine film', 'Grain, dust and a breathing vignette.',
      () => [['grain', { seed: 121 }], ['dust', { opacity: 0.4, seed: 122 }], ['vignette', { opacity: 0.25, seed: 123 }]]),
    P('crt', 'analog', 'Old CRT', 'Static, rolling scanlines and a slow pulse.',
      () => [['static', { size: 2, rate: 25, contrast: 0.7, opacity: 0.15, seed: 131 }], ['scanlines', { drift: [0, 20], seed: 132 }], ['pulse', { opacity: 0.04, seed: 133 }]]),
    P('vhs', 'analog', 'VHS tape', 'Tracking bands, interlace and tape noise.',
      () => [['vhs', { seed: 141 }], ['interlace', { seed: 142 }], ['static', { rate: 30, contrast: 0.6, opacity: 0.08, seed: 143 }]]),
    P('print', 'analog', 'Newsprint', 'Halftone screen with fine grain.',
      () => [['halftone', { seed: 151 }], ['bluegrain', { opacity: 0.15, seed: 152 }]]),
    P('dither', 'analog', '1-bit dither', 'Ordered dither like an early handheld screen.',
      () => [['dither', { seed: 161 }]]),

    P('soft-grain', 'ambient', 'Soft grain', 'Fine, even grain that takes the edge off a bright screen.',
      () => [['bluegrain', { opacity: 0.18, contrast: 0.6, rate: 20, seed: 171 }]]),
    P('snowfall', 'ambient', 'Snowfall', 'Slow falling snow at several depths.',
      () => [['falling', { seed: 181 }]]),
    P('drift', 'ambient', 'Drift', 'Particles on a slow current over soft fog.',
      () => [['flow', { opacity: 0.35, seed: 191 }], ['fog', { opacity: 0.06, seed: 192 }]]),
    P('night-lights', 'ambient', 'Night lights', 'Soft bokeh discs fading in and out.',
      () => [['bokeh', { color: [1, 0.8, 0.5], colorMix: 0.8, seed: 201 }]]),

    P('tv', 'demo', 'Dead channel', 'Heavy full-screen TV static.',
      () => [['static', { size: 2, rate: 30, contrast: 1, opacity: 0.45, seed: 211 }]]),
    P('mosaic', 'demo', 'Big pixel mosaic', 'Large slow static blocks.',
      () => [['static', { size: 12, rate: 6, contrast: 0.6, opacity: 0.15, seed: 221 }]]),
    P('moire', 'demo', 'Moiré', 'Interference bands drifting across the screen.',
      () => [['interference', { opacity: 0.14, seed: 231 }]]),
    P('plasma', 'demo', 'Plasma', 'Colour waves with ripples.',
      () => [['plasma', { opacity: 0.12, seed: 241 }], ['ripples', { opacity: 0.08, seed: 242 }]]),
    P('storm', 'demo', 'Storm', 'Rain streaks, flicker and fog.',
      () => [['rain', { seed: 251 }], ['fog', { size: 500, opacity: 0.1, color: [0.5, 0.6, 0.7], seed: 252 }], ['flicker', { rate: 2, p1: 0.04, seed: 253 }]])
  ];

  function presetLayers(id) {
    const p = BUILTIN.find((b) => b.id === id);
    return (p || BUILTIN[0]).make();
  }

  function defaults() {
    return {
      version: SETTINGS_VERSION,
      enabled: true,
      maxFps: 60,
      globalOpacity: 1,
      displays: 'all',
      hotkeys: { toggle: 'CommandOrControl+Alt+V', panel: 'CommandOrControl+Alt+Shift+V' },
      launchAtLogin: false,
      keepOnTop: true,
      theme: 'system',
      flickerUnlocked: false,
      firstRunDone: false,
      calibration: { diagonalInches: 24, distanceCm: 60 },
      preset: 'clinical',
      layers: presetLayers('clinical'),
      userPresets: []
    };
  }
  function migrateSettings(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = Object.assign(d, raw);
    s.hotkeys = Object.assign(defaults().hotkeys, raw.hotkeys || {});
    s.calibration = Object.assign(defaults().calibration, raw.calibration || {});
    s.layers = Array.isArray(raw.layers) ? raw.layers.slice(0, MAX_LAYERS).map(migrateLayer) : d.layers;
    s.userPresets = Array.isArray(raw.userPresets) ? raw.userPresets.map((p) => Object.assign({}, p, { layers: (p.layers || []).map(migrateLayer) })) : [];
    s.version = SETTINGS_VERSION;
    return s;
  }

  // Pixels per arcminute for a display, from the calibration values.
  function pxPerArcmin(widthPx, heightPx, diagonalInches, distanceCm) {
    const diagPx = Math.hypot(widthPx, heightPx);
    const pxSizeCm = (diagonalInches * 2.54) / diagPx;
    const arcminPerPx = (Math.atan(pxSizeCm / distanceCm) * 180 / Math.PI) * 60;
    return 1 / arcminPerPx;
  }

  return {
    SETTINGS_VERSION, MAX_LAYERS, FLASH_CAP_HZ, FAMILIES, PARAMS, TYPES, TYPE_INDEX, BY_ID, PRESET_GROUPS, BUILTIN,
    spec, layer, typeDefaults, migrateLayer, migrateSettings, defaults, presetLayers, pxPerArcmin, newId
  };
});
