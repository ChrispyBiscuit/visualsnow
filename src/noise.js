// Shared WebGL2 noise renderer. Used by the overlay windows and the panel preview.
// Usage: const r = new NoiseRenderer(canvas); r.setLayers(layers, globalOpacity); r.start(maxFps);
(function (root) {
  const MAXL = 8;

  const VERT = `#version 300 es
  in vec2 a;
  void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
  precision highp float;
  precision highp int;
  out vec4 o;
  uniform vec2 u_res;
  uniform float u_time;
  uniform int u_count;
  uniform float u_global;
  uniform int u_type[${MAXL}];
  uniform vec4 u_a[${MAXL}]; // opacity, size, rate, density
  uniform vec4 u_b[${MAXL}]; // contrast, softness, seed, polarity
  uniform vec4 u_c[${MAXL}]; // color rgb, colorMix
  uniform vec4 u_d[${MAXL}]; // drift x, drift y, -, -

  uint pcg(uint v){ uint s = v*747796405u + 2891336453u; uint w = ((s >> ((s>>28u)+4u)) ^ s) * 277803737u; return (w>>22u)^w; }
  float h1(ivec2 c, int f, int k){
    uint h = pcg(uint(c.x) ^ pcg(uint(c.y) ^ pcg(uint(f) ^ pcg(uint(k)))));
    return float(h) * (1.0/4294967295.0);
  }
  // Smooth value noise in 3D (xy cells, z time), hash based.
  float vnoise(vec2 p, float z, int k){
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    float zi = floor(z); float zf = z - zi; zf = zf*zf*(3.0-2.0*zf);
    int z0 = int(zi), z1 = z0+1;
    ivec2 c = ivec2(i);
    float a = mix(h1(c, z0, k), h1(c, z1, k), zf);
    float b = mix(h1(c+ivec2(1,0), z0, k), h1(c+ivec2(1,0), z1, k), zf);
    float cc = mix(h1(c+ivec2(0,1), z0, k), h1(c+ivec2(0,1), z1, k), zf);
    float d = mix(h1(c+ivec2(1,1), z0, k), h1(c+ivec2(1,1), z1, k), zf);
    return mix(mix(a,b,f.x), mix(cc,d,f.x), f.y);
  }
  float fbm(vec2 p, float z, int k){
    float v = 0.0, amp = 0.5;
    for (int i=0;i<5;i++){ v += amp*vnoise(p, z, k+i*7); p = p*2.03 + 17.0; z *= 1.3; amp *= 0.5; }
    return v;
  }
  // Soft disc inside a cell. d in cell units from centre (0..~0.7).
  float disc(vec2 fr, float size, float soft){
    if (size < 2.5) return 1.0;
    float d = length(fr - 0.5);
    float edge = 0.5 * soft;
    return 1.0 - smoothstep(0.5 - edge, 0.5, d);
  }

  void main(){
    vec2 px = gl_FragCoord.xy;
    vec3 P = vec3(0.0); float A = 0.0; // premultiplied accumulator
    for (int L = 0; L < ${MAXL}; L++) {
      if (L >= u_count) break;
      int type = u_type[L];
      float op = u_a[L].x, size = max(u_a[L].y, 1.0), rate = max(u_a[L].z, 0.0001), dens = u_a[L].w;
      float con = u_b[L].x, soft = u_b[L].y; int seed = int(u_b[L].z); float pol = u_b[L].w;
      vec3 tint = u_c[L].rgb; float tmix = u_c[L].w;
      vec2 p = px - u_d[L].xy * u_time;
      vec3 col = vec3(0.0); float a = 0.0;

      if (type == 0) { // snow: sparse dots, async refresh
        vec2 cellf = floor(p / size); ivec2 cell = ivec2(cellf);
        float phase = h1(cell, 0, seed + 1);
        int f = int(floor(u_time * rate + phase));
        float on = h1(cell, f, seed) < dens ? 1.0 : 0.0;
        float light = h1(cell, f, seed + 2);
        float isLight = pol == 1.0 ? 1.0 : (pol == 2.0 ? 0.0 : step(0.5, light));
        col = vec3(isLight);
        a = on * op * disc(fract(p / size), size, soft);
      } else if (type == 1) { // TV static: dense, synchronous
        ivec2 cell = ivec2(floor(p / size));
        int f = int(floor(u_time * rate));
        float v = h1(cell, f, seed);
        v = 0.5 + (v - 0.5) * con;
        col = vec3(v); a = op;
      } else if (type == 2) { // film grain: bell-shaped
        ivec2 cell = ivec2(floor(p / size));
        int f = int(floor(u_time * rate));
        float v = (h1(cell,f,seed) + h1(cell,f,seed+1) + h1(cell,f,seed+2)) / 3.0;
        float d = (v - 0.5) * 2.0 * con; // -con..con
        col = vec3(d > 0.0 ? 1.0 : 0.0);
        a = abs(d) * op;
      } else if (type == 3) { // chroma
        ivec2 cell = ivec2(floor(p / size));
        float phase = h1(cell, 0, seed + 1);
        int f = int(floor(u_time * rate + phase));
        float on = h1(cell, f, seed) < dens ? 1.0 : 0.0;
        vec3 c = vec3(h1(cell,f,seed+3), h1(cell,f,seed+4), h1(cell,f,seed+5));
        // push toward saturated
        float mx = max(c.r, max(c.g, c.b)); c = mix(c, c / max(mx, 0.001), con);
        col = c; a = on * op * disc(fract(p / size), size, soft);
      } else if (type == 4) { // transparent shimmer
        ivec2 cell = ivec2(floor(p / size));
        float phase = h1(cell, 0, seed + 1);
        int f = int(floor(u_time * rate + phase));
        float on = h1(cell, f, seed) < dens ? 1.0 : 0.0;
        float v = 0.42 + 0.16 * h1(cell, f, seed + 2);
        col = vec3(v); a = on * op * disc(fract(p / size), size, soft);
      } else if (type == 5) { // sparkles: pop then fade over one period
        ivec2 cell = ivec2(floor(p / size));
        float phase = h1(cell, 0, seed + 1);
        float tt = u_time * rate + phase;
        int f = int(floor(tt));
        float on = h1(cell, f, seed) < dens ? 1.0 : 0.0;
        float age = fract(tt);
        float env = pow(1.0 - age, 2.5) * smoothstep(0.0, 0.08, age);
        col = vec3(1.0);
        a = on * op * env * disc(fract(p / size), size, soft);
      } else if (type == 6) { // floaters: one blob per region, wandering
        float region = size * 6.0;
        vec2 cellf = floor(p / region); ivec2 cell = ivec2(cellf);
        float on = h1(cell, 0, seed) < dens ? 1.0 : 0.0;
        float z = u_time * rate + h1(cell, 0, seed + 9) * 10.0;
        vec2 off = vec2(vnoise(vec2(cellf) * 0.37, z, seed + 1), vnoise(vec2(cellf) * 0.37 + 50.0, z, seed + 2));
        vec2 centre = (cellf + 0.5) * region + (off - 0.5) * (region - size);
        float d = length(p - centre) / (size * 0.5);
        float shape = 1.0 - smoothstep(1.0 - soft, 1.0, d);
        float light = h1(cell, 0, seed + 3);
        float isLight = pol == 1.0 ? 1.0 : (pol == 2.0 ? 0.0 : step(0.5, light));
        col = vec3(isLight);
        a = on * op * shape;
      } else if (type == 7) { // fog
        float v = fbm(p / size, u_time * rate, seed);
        v = 0.5 + (v - 0.5) * 2.0 * con;
        col = vec3(1.0);
        a = op * smoothstep(0.35, 0.75, v);
      } else if (type == 8) { // scanlines
        int f = int(floor(u_time * rate));
        float row = floor(p.y / size) + float(f & 1);
        float on = mod(row, 2.0);
        col = vec3(0.0);
        a = on * op * con;
      } else if (type == 9) { // pulse
        float s = 0.5 + 0.5 * sin(6.28318 * u_time * rate + float(seed));
        col = vec3(1.0); a = op * s;
      }

      col = mix(col, col * tint, tmix);
      // allow tint on black dots too: if the dot is dark and tint is on, lift toward tint*0.5
      if (tmix > 0.0 && col == vec3(0.0)) col = tint * 0.35 * tmix;
      a = clamp(a * u_global, 0.0, 1.0);
      P = P * (1.0 - a) + col * a;
      A = A * (1.0 - a) + a;
    }
    o = vec4(P, A);
  }`;

  class NoiseRenderer {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.opts = opts || {};
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!gl) throw new Error('WebGL2 is not available');
      this.gl = gl;
      this.layers = [];
      this.globalOpacity = 1;
      this.maxFps = 60;
      this.running = false;
      this.t0 = performance.now();
      this.lastDraw = -1;
      this.lastKeys = null;
      this.dpr = window.devicePixelRatio || 1;
      this._build();
      this.onFrame = null;
    }
    _compile(type, src) {
      const gl = this.gl; const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    _build() {
      const gl = this.gl;
      const prog = gl.createProgram();
      gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      this.prog = prog;
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      ['u_res', 'u_time', 'u_count', 'u_global', 'u_type', 'u_a', 'u_b', 'u_c', 'u_d'].forEach((n) => (this.u[n] = gl.getUniformLocation(prog, n)));
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
    }
    setLayers(layers, globalOpacity) {
      this.layers = (layers || []).filter((l) => l.enabled !== false).slice(0, MAXL);
      this.globalOpacity = globalOpacity == null ? 1 : globalOpacity;
      this._upload();
      this.lastKeys = null; // force redraw
    }
    _upload() {
      const gl = this.gl, n = this.layers.length;
      const type = new Int32Array(MAXL), a = new Float32Array(MAXL * 4), b = new Float32Array(MAXL * 4), c = new Float32Array(MAXL * 4), d = new Float32Array(MAXL * 4);
      const TI = root.VSPresets.TYPE_INDEX;
      this.layers.forEach((L, i) => {
        type[i] = TI[L.type] || 0;
        a.set([L.opacity, L.size * this.dpr, L.rate, L.density], i * 4);
        b.set([L.contrast, L.softness, L.seed || 0, L.polarity || 0], i * 4);
        c.set([L.color[0], L.color[1], L.color[2], L.colorMix || 0], i * 4);
        d.set([(L.drift ? L.drift[0] : 0) * this.dpr, (L.drift ? -L.drift[1] : 0) * this.dpr, 0, 0], i * 4);
      });
      gl.useProgram(this.prog);
      gl.uniform1i(this.u.u_count, n);
      gl.uniform1f(this.u.u_global, this.globalOpacity);
      gl.uniform1iv(this.u.u_type, type);
      gl.uniform4fv(this.u.u_a, a); gl.uniform4fv(this.u.u_b, b); gl.uniform4fv(this.u.u_c, c); gl.uniform4fv(this.u.u_d, d);
    }
    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h || this.dpr !== dpr) {
        this.canvas.width = w; this.canvas.height = h; this.dpr = dpr;
        this.gl.viewport(0, 0, w, h);
        this._upload();
        this.lastKeys = null;
      }
    }
    // A "change key" for the current time: if no layer would look different, skip the draw.
    _changeKey(t) {
      let continuous = false; const parts = [];
      for (const L of this.layers) {
        if ((L.drift && (L.drift[0] || L.drift[1])) || L.type === 'fog' || L.type === 'floaters' || L.type === 'pulse' || L.type === 'sparkle') continuous = true;
        parts.push(Math.floor(t * L.rate));
      }
      return continuous ? null : parts.join(',');
    }
    draw(t) {
      const gl = this.gl;
      gl.useProgram(this.prog);
      gl.uniform2f(this.u.u_res, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.u.u_time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (this.onFrame) this.onFrame();
    }
    start(maxFps) {
      this.maxFps = maxFps || 60;
      if (this.running) return; this.running = true;
      const loop = (now) => {
        if (!this.running) return;
        this.resize();
        const minDt = 1000 / this.maxFps - 1;
        if (now - this.lastDraw >= minDt) {
          const t = (now - this.t0) / 1000;
          const key = this._changeKey(t);
          if (this.layers.length === 0) {
            if (this.lastKeys !== 'empty') { gl_clear(this.gl); this.lastKeys = 'empty'; }
          } else if (key === null || key !== this.lastKeys) {
            this.draw(t); this.lastKeys = key; this.lastDraw = now;
          }
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); gl_clear(this.gl); this.lastKeys = 'empty'; }
  }
  function gl_clear(gl) { gl.clear(gl.COLOR_BUFFER_BIT); }
  root.NoiseRenderer = NoiseRenderer;
})(typeof self !== 'undefined' ? self : this);
