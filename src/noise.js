// WebGL2 noise renderer shared by the overlay windows, the panel preview and thumbnails.
// All sizes are device pixels. Every type is a pure function of pixel, time and seed.
(function (root) {
  const MAXL = 8;
  const TIME_WRAP = 65536; // seconds; keeps float precision over long sessions

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
  uniform vec4 u_c[${MAXL}]; // tint rgb, tint amount
  uniform vec4 u_d[${MAXL}]; // drift x, drift y, mod depth, mod period
  uniform vec4 u_e[${MAXL}]; // p1, p2, p3, mod target
  uniform vec4 u_f[${MAXL}]; // mask shape, mask size, mask feather, blend

  const float TAU = 6.2831853;
  const float PI = 3.1415927;

  uint pcg(uint v){ uint s = v*747796405u + 2891336453u; uint w = ((s >> ((s>>28u)+4u)) ^ s) * 277803737u; return (w>>22u)^w; }
  float hash(ivec2 c, int f, int k){
    uint h = pcg(uint(c.x) ^ pcg(uint(c.y) ^ pcg(uint(f) ^ pcg(uint(k)))));
    return float(h) * (1.0/4294967295.0);
  }
  float vnoise(vec2 p, float z, int k){
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    float zi = floor(z); float zf = z - zi; zf = zf*zf*(3.0-2.0*zf);
    int z0 = int(zi), z1 = z0+1; ivec2 c = ivec2(i);
    float a = mix(hash(c, z0, k), hash(c, z1, k), zf);
    float b = mix(hash(c+ivec2(1,0), z0, k), hash(c+ivec2(1,0), z1, k), zf);
    float d = mix(hash(c+ivec2(0,1), z0, k), hash(c+ivec2(0,1), z1, k), zf);
    float e = mix(hash(c+ivec2(1,1), z0, k), hash(c+ivec2(1,1), z1, k), zf);
    return mix(mix(a,b,f.x), mix(d,e,f.x), f.y);
  }
  float fbm(vec2 p, float z, int k, int oct){
    float v = 0.0, amp = 0.5, norm = 0.0;
    for (int i=0;i<5;i++){ if (i>=oct) break; v += amp*vnoise(p, z, k+i*7); norm += amp; p = p*2.03 + 17.0; z *= 1.3; amp *= 0.5; }
    return v / norm;
  }
  vec3 hue(float h){ return clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  float polSel(float pol, float r){ return pol > 1.5 ? 0.0 : (pol > 0.5 ? 1.0 : step(0.5, r)); }
  // Dot footprint inside a cell. Small dots fill the cell; bigger ones are discs.
  float dotShape(vec2 fr, float size, float soft){
    if (size < 2.5) return 1.0;
    float d = length(fr - 0.5);
    return 1.0 - smoothstep(0.5 - 0.5*soft - 0.5/size, 0.5, d);
  }
  float discAt(vec2 p, vec2 ctr, float r, float soft){
    float d = length(p - ctr);
    return 1.0 - smoothstep(max(r - 0.5 - soft*r, 0.0), r + 0.5, d);
  }
  float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-5), 0.0, 1.0); return length(pa - ba*h); }
  float bayer(ivec2 p, bool big){
    const int M[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
    int v = M[(p.y&3)*4 + (p.x&3)];
    if (!big) return (float(v)+0.5)/16.0;
    const int M2[4] = int[4](0,2,3,1);
    return (float(v*4 + M2[((p.y>>2)&1)*2 + ((p.x>>2)&1)]) + 0.5)/64.0;
  }
  vec2 flowVel(vec2 q, float t, float k){
    float a = t*0.11, b = -t*0.07, c = t*0.05;
    float dx = k*cos(k*q.x + a)*cos(1.3*k*q.y + b) + 0.85*k*cos(1.7*k*(q.x+q.y) + c);
    float dy = -1.3*k*sin(k*q.x + a)*sin(1.3*k*q.y + b) + 0.85*k*cos(1.7*k*(q.x+q.y) + c);
    return vec2(dy, -dx);
  }
  float maskF(float shape, float sz, float fe){
    if (shape < 0.5) return 1.0;
    vec2 uv = gl_FragCoord.xy / u_res;
    float fw = max(fe, 0.002) * 0.5;
    if (shape < 2.5) {
      float asp = u_res.x / u_res.y;
      float r = length((uv - 0.5) * vec2(asp, 1.0)) / length(vec2(0.5*asp, 0.5));
      float m = 1.0 - smoothstep(sz - fw, sz + fw, r);
      return shape < 1.5 ? m : 1.0 - m;
    }
    float x = shape < 3.5 ? uv.x : (shape < 4.5 ? 1.0 - uv.x : (shape < 5.5 ? 1.0 - uv.y : uv.y));
    return 1.0 - smoothstep(sz - fw, sz + fw, x);
  }
  // Snow-family dot at p with density d.
  void snowDot(vec2 p, float size, float rate, float d, float soft, float pol, int seed, float T, out vec3 col, out float a){
    ivec2 c = ivec2(floor(p / size));
    float ph = hash(c, 0, seed + 1);
    int f = int(floor(T * rate + ph));
    float on = step(hash(c, f, seed), d);
    col = vec3(polSel(pol, hash(c, f, seed + 2)));
    a = on * dotShape(fract(p / size), size, soft);
  }

  void main(){
    vec2 px = gl_FragCoord.xy;
    float t = u_time;
    vec3 P = vec3(0.0); float A = 0.0;
    for (int L = 0; L < ${MAXL}; L++) {
      if (L >= u_count) break;
      int type = u_type[L];
      float op = u_a[L].x, size = max(u_a[L].y, 1.0), rate = max(u_a[L].z, 0.0001), dens = u_a[L].w;
      float con = u_b[L].x, soft = u_b[L].y; int seed = int(u_b[L].z); float seedf = u_b[L].z; float pol = u_b[L].w;
      vec3 tint = u_c[L].rgb; float tmix = u_c[L].w;
      float p1 = u_e[L].x, p2 = u_e[L].y, p3 = u_e[L].z;

      // Slow modulation: opacity, density, or rate (as a smooth time warp).
      float mt = u_e[L].w, mdepth = u_d[L].z, w = TAU / max(u_d[L].w, 1.0);
      float lfo = 0.5 + 0.5*sin(w*t + seedf*0.37);
      float T = t;
      if (mt > 0.5 && mt < 1.5) op *= 1.0 - mdepth*lfo;
      else if (mt > 1.5 && mt < 2.5) dens *= 1.0 - mdepth*lfo;
      else if (mt > 2.5) T = t + mdepth*0.9/w*sin(w*t + seedf*0.37);

      vec2 p = px - u_d[L].xy * t;
      vec3 col = vec3(1.0); float a = 0.0;

      switch (type) {
      case 0: { // snow
        snowDot(p, size, rate, dens, soft, pol, seed, T, col, a);
      } break;
      case 1: { // even snow: one dot per jittered cell
        float S = size * max(1.0, inversesqrt(max(dens, 1e-4)));
        ivec2 c = ivec2(floor(p / S));
        int f = int(floor(T*rate + hash(c, 0, seed+1)));
        vec2 off = 0.5*(S - size) + (vec2(hash(c,f,seed+3), hash(c,f,seed+4)) - 0.5) * p1 * (S - size);
        vec2 lc = p - vec2(c)*S - off;
        float inside = step(0.0, lc.x)*step(0.0, lc.y)*step(lc.x, size)*step(lc.y, size);
        col = vec3(polSel(pol, hash(c, f, seed+2)));
        a = inside * dotShape(lc / size, size, soft);
      } break;
      case 2: { // fixed shimmer
        ivec2 c = ivec2(floor(p / size));
        int f = int(floor(T*rate + hash(c, 0, seed+1)));
        float on = step(hash(c, 0, seed), dens);
        col = vec3(polSel(pol, hash(c, 0, seed+3)));
        a = on * (1.0 - p1*hash(c, f, seed+2)) * dotShape(fract(p/size), size, soft);
      } break;
      case 3: { // pulsing dots
        ivec2 c = ivec2(floor(p / size));
        float tt = T*rate + hash(c, 0, seed+1);
        int f = int(floor(tt));
        float env = pow(sin(PI*fract(tt)), p1);
        col = vec3(polSel(pol, hash(c, f, seed+2)));
        a = step(hash(c, f, seed), dens) * env * dotShape(fract(p/size), size, soft);
      } break;
      case 4: { // patchy snow
        float pf = fbm(p / max(p1, 1.0), t*p3, seed+50, 4);
        float m = mix(1.0, 2.4*smoothstep(0.38, 0.68, pf), p2);
        snowDot(p, size, rate, dens*m, soft, pol, seed, T, col, a);
      } break;
      case 5: { // falling snow, three depths
        float ang = radians(p1); vec2 dir = vec2(sin(ang), -cos(ang)); vec2 nrm = vec2(-dir.y, dir.x);
        float pr = clamp(dens*25.0/3.0, 0.0, 1.0);
        for (int k = 0; k < 3; k++) {
          float sc = 0.55 + 0.45*float(k);
          float sz = max(1.0, floor(size*sc + 0.5));
          float G = sz * 5.0;
          vec2 q = px - dir*p2*sc*t;
          q += nrm * sin(dot(q, dir)/(40.0*sc) + float(k)*1.7 + t*0.5) * p3 * 8.0 * sc;
          vec2 cf = floor(q / G); ivec2 c = ivec2(cf);
          if (hash(c, k, seed) > pr) continue;
          vec2 lc = q - cf*G - vec2(hash(c,k,seed+1), hash(c,k,seed+2))*(G - sz);
          float inside = sz < 2.5 ? step(0.0,lc.x)*step(0.0,lc.y)*step(lc.x,sz)*step(lc.y,sz) : discAt(lc, vec2(sz*0.5), sz*0.5, soft);
          float v = inside * (0.45 + 0.55*sc/1.45);
          if (v > a) { a = v; col = vec3(polSel(pol, hash(c, k, seed+3))); }
        }
      } break;
      case 6: { // bursts
        float bt = t*p1 + hash(ivec2(seed, 7), 0, seed);
        float bf = fract(bt);
        float gate = smoothstep(0.0, 0.04, bf) * (1.0 - smoothstep(p2 - 0.04, p2, bf));
        float amp = 0.6 + 0.8*hash(ivec2(int(floor(bt)), 3), 0, seed+9);
        snowDot(p, size, rate, dens*mix(0.12, 2.0*amp, gate), soft, pol, seed, T, col, a);
      } break;
      case 7: { // colour dots
        ivec2 c = ivec2(floor(p / size));
        int f = int(floor(T*rate + hash(c, 0, seed+1)));
        vec3 cc = vec3(hash(c,f,seed+3), hash(c,f,seed+4), hash(c,f,seed+5));
        float mx = max(cc.r, max(cc.g, cc.b)); cc = mix(cc, cc/max(mx, 0.001), con);
        col = cc; a = step(hash(c, f, seed), dens) * dotShape(fract(p/size), size, soft);
      } break;
      case 8: { // transparent
        ivec2 c = ivec2(floor(p / size));
        int f = int(floor(T*rate + hash(c, 0, seed+1)));
        col = vec3(0.42 + 0.16*hash(c, f, seed+2));
        a = step(hash(c, f, seed), dens) * dotShape(fract(p/size), size, soft);
      } break;
      case 9: { // sparkles
        ivec2 c = ivec2(floor(p / size));
        float tt = T*rate + hash(c, 0, seed+1);
        int f = int(floor(tt)); float age = fract(tt);
        float env = pow(1.0 - age, 2.5) * smoothstep(0.0, 0.08, age);
        col = vec3(1.0);
        a = step(hash(c, f, seed), dens) * env * dotShape(fract(p/size), size, soft);
      } break;
      case 10: { // TV static
        ivec2 c = ivec2(floor(p / size));
        col = vec3(0.5 + (hash(c, int(floor(T*rate)), seed) - 0.5)*con); a = 1.0;
      } break;
      case 11: { // film grain
        ivec2 c = ivec2(floor(p / size)); int f = int(floor(T*rate));
        if (p1 < 0.5) {
          float d = ((hash(c,f,seed)+hash(c,f,seed+1)+hash(c,f,seed+2))/3.0 - 0.5)*2.0*con;
          col = vec3(step(0.0, d)); a = abs(d);
        } else {
          vec3 d3 = (vec3(hash(c,f,seed)+hash(c,f,seed+1), hash(c,f,seed+2)+hash(c,f,seed+3), hash(c,f,seed+4)+hash(c,f,seed+5))*0.5 - 0.5)*2.0*con;
          col = clamp(vec3(0.5) + d3*1.5, 0.0, 1.0); a = min(1.0, length(d3)*1.1);
        }
      } break;
      case 12: { // fine (blue-noise) grain
        ivec2 c = ivec2(floor(p / size)); int f = int(floor(T*rate));
        float v = hash(c,f,seed) - 0.25*(hash(c+ivec2(1,0),f,seed)+hash(c-ivec2(1,0),f,seed)+hash(c+ivec2(0,1),f,seed)+hash(c-ivec2(0,1),f,seed));
        float d = clamp(v*1.6*con, -1.0, 1.0);
        col = vec3(step(0.0, d)); a = abs(d);
      } break;
      case 13: { // halftone
        float ang = radians(p1); mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        vec2 q = R*p; vec2 cell = floor(q/size); vec2 lc = fract(q/size) - 0.5;
        vec2 cc = transpose(R) * ((cell + 0.5)*size);
        float fv = fbm(cc / max(p2, 1.0), T*rate, seed, 4);
        float field = clamp(0.5 + (fv - 0.5)*3.0*con, 0.0, 1.0);
        float r = sqrt(field)*0.62*size;
        a = 1.0 - smoothstep(r - 0.7, r + 0.7, length(lc)*size);
        col = vec3(polSel(pol, 0.0));
      } break;
      case 14: { // ordered dither
        ivec2 c = ivec2(floor(p / size)); int f = int(floor(T*rate));
        ivec2 cc = c + (f & 1)*ivec2(1, 1);
        a = step(bayer(cc, p1 > 0.5), dens);
        col = vec3(pol > 0.5 && pol < 1.5 ? 1.0 : 0.0);
      } break;
      case 15: { // dust and scratches
        int f = int(floor(T*rate));
        float G = max(48.0, size*20.0);
        ivec2 c = ivec2(floor(px / G));
        vec2 ctr = (vec2(c) + 0.2 + 0.6*vec2(hash(c,f,seed+1), hash(c,f,seed+2)))*G;
        float rad = size*(0.6 + 2.0*hash(c,f,seed+3));
        float irr = vnoise((px - ctr)/max(rad,1.0)*1.5, float(f), seed+4);
        float dd = length(px - ctr)/rad + (irr - 0.5)*0.8;
        float speck = step(hash(c,f,seed), p1*0.2) * (1.0 - smoothstep(1.0 - soft*0.8, 1.0, dd));
        float W = 160.0; int ci = int(floor(px.x / W)); int fg = int(floor(T*rate/4.0));
        float x0 = (float(ci) + 0.1 + 0.8*hash(ivec2(ci,2), fg, seed+6))*W + (hash(ivec2(ci,3), f, seed+7) - 0.5)*3.0;
        float y0 = hash(ivec2(ci,4), fg, seed+8)*u_res.y; float len = p3*u_res.y;
        float lw = max(1.0, size*0.5);
        float scr = step(hash(ivec2(ci,1), fg, seed+5), p2*0.4) * step(abs(px.y - y0), len*0.5) * (1.0 - smoothstep(lw*0.5, lw*0.5 + 1.0, abs(px.x - x0)));
        a = max(speck, scr*0.8);
        col = vec3(polSel(pol, hash(c, f, seed+9)));
      } break;
      case 16: { // VHS tracking
        float bi = floor((px.y + t*p2)/p1);
        float act = step(hash(ivec2(int(bi), 0), int(floor(t*2.0)), seed), p3);
        int f = int(floor(T*rate));
        ivec2 c = ivec2(floor(vec2(px.x/(size*6.0), px.y/size)));
        float v = hash(c, f, seed+1);
        float noiseA = act * step(0.45, v) * con;
        float ty = mod(t*p2*1.7, u_res.y + 80.0) - 40.0;
        float line = (1.0 - smoothstep(2.0, 6.0, abs(px.y - ty))) * hash(ivec2(int(px.x/3.0), int(px.y)), f, seed+2) * con;
        a = max(noiseA, line);
        col = mix(vec3(step(0.72, v)), vec3(1.0), step(noiseA, line));
      } break;
      case 17: { // interlace
        int row = int(floor(px.y / size));
        a = float((row + int(floor(T*rate))) & 1) * con; col = vec3(0.0);
      } break;
      case 18: { // fog
        float v = 0.5 + (fbm(p/size, T*rate, seed, 5) - 0.5)*2.0*con;
        a = smoothstep(0.35, 0.75, v);
      } break;
      case 19: { // marbled swirl (domain warp)
        vec2 q = p/size; float z = T*rate;
        vec2 o2 = vec2(fbm(q, z, seed, 4), fbm(q + vec2(5.2, 1.3), z, seed+11, 4));
        float v = fbm(q + p1*2.0*o2, z, seed+23, 4);
        col = mix(vec3(1.0), hue(v*1.5 + o2.x*0.8 + seedf*0.013), p2);
        a = smoothstep(0.3, 0.8, 0.5 + (v - 0.5)*2.0*con);
      } break;
      case 20: { // cells (Worley)
        vec2 q = p/size; vec2 i0 = floor(q); vec2 fr = fract(q);
        float d1 = 8.0, d2 = 8.0;
        for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
          ivec2 n = ivec2(i0) + ivec2(x, y);
          vec2 r = vec2(hash(n,0,seed), hash(n,0,seed+1));
          vec2 pt = vec2(float(x), float(y)) + 0.5 + 0.42*sin(T*rate*TAU*0.5 + TAU*r);
          float d = length(pt - fr);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        float v = p1 < 0.5 ? pow(1.0 - smoothstep(0.0, 0.9, d1), 2.0) : 1.0 - smoothstep(0.0, max(p2, 0.005), d2 - d1);
        a = v*con;
      } break;
      case 21: { // ripples
        float R = size; ivec2 ci = ivec2(floor(p / R));
        for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
          ivec2 n = ci + ivec2(x, y);
          float tt = t*p2 + hash(n, 0, seed);
          int e = int(floor(tt));
          if (hash(n, e, seed+1) > dens) continue;
          vec2 ctr = (vec2(n) + vec2(hash(n,e,seed+2), hash(n,e,seed+3)))*R;
          float rad = fract(tt)/max(p2, 1e-3)*p3;
          float behind = rad - length(p - ctr);
          if (behind < 0.0) continue;
          float wave = 0.5 + 0.5*cos(behind/p1*TAU);
          float env = exp(-behind/(p1*3.0)) * (1.0 - fract(tt)) * (1.0 - smoothstep(R*0.7, R, rad));
          a = max(a, wave*env);
        }
        a *= con;
      } break;
      case 22: { // interference
        float a1 = radians(p1), a2 = radians(p1 + p2);
        float g1 = sin(TAU*(dot(p, vec2(cos(a1), sin(a1)))/size + T*rate));
        float g2 = sin(TAU*(dot(p, vec2(cos(a2), sin(a2)))/(size*1.02) - T*rate*0.7));
        float v = g1*g2;
        col = vec3(step(0.0, v)); a = abs(v)*con;
      } break;
      case 23: { // plasma
        vec2 q = p/size; float z = T*rate*TAU;
        float v = sin(q.x*3.0 + z) + sin(q.y*3.7 - z*1.1) + sin((q.x + q.y)*2.3 + z*0.7) + sin(length(q - 2.0*vec2(sin(z*0.3), cos(z*0.27)))*4.0 - z);
        col = hue(0.5 + v*0.25*p1 + z*0.01 + seedf*0.01); a = 1.0;
      } break;
      case 24: { // floaters
        float region = size * 6.0;
        vec2 cf = floor(p / region); ivec2 c = ivec2(cf);
        float z = T*rate + hash(c, 0, seed+9)*10.0;
        vec2 off = vec2(vnoise(cf*0.37, z, seed+1), vnoise(cf*0.37 + 50.0, z, seed+2));
        vec2 ctr = (cf + 0.5)*region + (off - 0.5)*(region - size);
        float d = length(p - ctr)/(size*0.5);
        col = vec3(polSel(pol, hash(c, 0, seed+3)));
        a = step(hash(c, 0, seed), dens) * (1.0 - smoothstep(1.0 - soft, 1.0, d));
      } break;
      case 25: { // squiggles
        float Lg = p1; float R = Lg*1.6 + size*4.0;
        vec2 cf = floor(p / R); ivec2 c = ivec2(cf);
        if (hash(c, 0, seed) < dens) {
          float z = T*rate + hash(c, 0, seed+9)*10.0;
          vec2 wob = vec2(vnoise(cf*0.37, z, seed+1), vnoise(cf*0.37 + 50.0, z, seed+2)) - 0.5;
          vec2 ctr = (cf + 0.5)*R + wob*0.3*Lg;
          float ang = TAU*hash(c, 0, seed+3) + (vnoise(cf, z*0.5, seed+4) - 0.5)*1.5;
          vec2 dir = vec2(cos(ang), sin(ang)); vec2 nrm = vec2(-dir.y, dir.x);
          float dmin = 1e9; vec2 prev = ctr - dir*Lg*0.5;
          for (int i = 1; i <= 12; i++) {
            float s = -1.0 + 2.0*float(i)/12.0;
            vec2 pt = ctr + dir*s*Lg*0.5 + nrm*sin(s*p2*3.0 + z*0.7)*Lg*0.12;
            dmin = min(dmin, sdSeg(p, prev, pt)); prev = pt;
          }
          float r = dmin/(size*0.5);
          float body = 1.0 - smoothstep(1.0 - soft*0.5, 1.0, r);
          a = body*0.45 + body*smoothstep(0.2, 0.9, r)*0.55;
          col = vec3(polSel(pol, hash(c, 0, seed+5)));
        }
      } break;
      case 26: { // phosphenes
        float R = size; ivec2 ci = ivec2(floor(p / R));
        vec3 pc = vec3(0.0); float pa = 0.0;
        for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
          ivec2 n = ci + ivec2(x, y);
          float ph = hash(n, 0, seed);
          float tt = T*rate + ph; int e = int(floor(tt)); float age = fract(tt);
          if (hash(n, e, seed+1) > dens) continue;
          vec2 ctr = (vec2(n) + 0.2 + 0.6*vec2(hash(n,e,seed+2), hash(n,e,seed+3)))*R + vec2(sin(t*0.1 + ph*6.0), cos(t*0.13 + ph*5.0))*R*0.1;
          float rad = R*0.45*(0.6 + 0.4*age);
          float shape = 1.0 - smoothstep((1.0 - soft)*0.7, 1.0, length(p - ctr)/rad);
          float wgt = shape*sin(PI*age);
          vec3 hc = hue(hash(n, e, seed+4) + age*p1);
          pc = pc*(1.0 - wgt) + hc*wgt; pa = pa*(1.0 - wgt) + wgt;
        }
        col = pa > 0.0 ? pc/pa : vec3(1.0); a = pa;
      } break;
      case 27: { // flow particles
        float k = TAU / max(p1, 1.0);
        float travel = p2*p3;
        float G = max(size*10.0, travel*1.05);
        ivec2 ci = ivec2(floor(px / G));
        float vs = p2/(k*1.6);
        for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
          ivec2 n = ci + ivec2(x, y);
          for (int j = 0; j < 3; j++) {
            float tt = t/p3 + hash(n, j, seed);
            int e = int(floor(tt)); float age = fract(tt);
            int id = e*4 + j;
            if (hash(n, id, seed+1) > dens) continue;
            vec2 pos = (vec2(n) + vec2(hash(n,id,seed+2), hash(n,id,seed+3)))*G;
            float dt = age*p3/4.0;
            for (int s = 0; s < 4; s++) pos += flowVel(pos, t, k)*vs*dt;
            float v = discAt(px, pos, size*0.5, soft) * sin(PI*age);
            if (v > a) { a = v; col = vec3(polSel(pol, hash(n, id, seed+4))); }
          }
        }
      } break;
      case 28: { // bokeh
        float R = size*3.0; ivec2 ci = ivec2(floor(p / R));
        vec3 pc = vec3(0.0); float pa = 0.0;
        for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
          ivec2 n = ci + ivec2(x, y);
          float tt = T*rate + hash(n, 0, seed); int e = int(floor(tt)); float age = fract(tt);
          if (hash(n, e, seed+1) > dens) continue;
          vec2 ctr = (vec2(n) + 0.2 + 0.6*vec2(hash(n,e,seed+2), hash(n,e,seed+3)))*R;
          float rad = size*(0.6 + 0.6*hash(n, e, seed+5));
          float d = length(p - ctr)/rad;
          float body = 1.0 - smoothstep(1.0 - 0.05 - soft*0.3, 1.0, d);
          float wgt = body*mix(0.5, 0.25 + 0.75*smoothstep(0.55, 1.0, d), p1)*sin(PI*age);
          vec3 hc = mix(vec3(1.0), hue(hash(n, e, seed+4)), 0.35);
          pc = pc*(1.0 - wgt) + hc*wgt; pa = pa*(1.0 - wgt) + wgt;
        }
        col = pa > 0.0 ? pc/pa : vec3(1.0); a = pa;
      } break;
      case 29: { // pulse
        a = 0.5 + 0.5*sin(TAU*T*rate + seedf);
      } break;
      case 30: { // flicker
        float d = (hash(ivec2(0, 0), int(floor(T*rate)), seed) - 0.5)*2.0*p1;
        col = vec3(step(0.0, d)); a = abs(d);
      } break;
      case 31: { // breathing vignette
        vec2 uv = (px - 0.5*u_res)/(0.5*u_res);
        float e = smoothstep(1.0 - p1, 1.0, length(uv)/1.41421);
        a = e*mix(0.35, 1.0, 0.5 + 0.5*sin(TAU*T*rate + seedf));
        col = vec3(0.0);
      } break;
      case 32: { // strobe
        a = step(fract(T*rate + seedf*0.001), p1);
      } break;
      case 33: { // scanlines
        int f = int(floor(T*rate));
        a = mod(floor(p.y/size) + float(f & 1), 2.0)*con; col = vec3(0.0);
      } break;
      case 34: { // grid
        vec2 q = p/size; float dl;
        if (p1 < 0.5) { vec2 g = abs(fract(q) - 0.5); dl = (0.5 - max(g.x, g.y))*size; }
        else {
          vec2 r = vec2(1.0, 1.7320508); vec2 h = r*0.5;
          vec2 aa = mod(q, r) - h; vec2 bb = mod(q - h, r) - h;
          vec2 gv = dot(aa,aa) < dot(bb,bb) ? aa : bb; vec2 ap = abs(gv);
          dl = (0.5 - max(dot(ap, vec2(0.5, 0.8660254)), ap.x))*size;
        }
        float flick = hash(ivec2(floor(q)), int(floor(T*rate)), seed);
        a = (1.0 - smoothstep(p2*0.5 - 0.5, p2*0.5 + 0.5, dl))*con*(0.55 + 0.45*flick);
        col = vec3(polSel(pol, 0.0));
      } break;
      case 35: { // rain
        float ang = radians(p1); vec2 dir = vec2(sin(ang), -cos(ang)); vec2 nrm = vec2(-dir.y, dir.x);
        float u = dot(px, nrm), v = dot(px, dir);
        float colW = max(size*4.0, 6.0); int ci = int(floor(u/colW));
        float spd = p2*(0.7 + 0.6*hash(ivec2(ci, 0), 0, seed));
        float vv = v - t*spd + hash(ivec2(ci, 1), 0, seed)*1000.0;
        float seg = p3*4.0; int si = int(floor(vv/seg)); float sf = vv - float(si)*seg;
        float on = step(hash(ivec2(ci, si), 0, seed+2), clamp(dens*3.0, 0.0, 1.0));
        float x0 = (float(ci) + 0.2 + 0.6*hash(ivec2(ci, si), 0, seed+3))*colW;
        float wd = 1.0 - smoothstep(size*0.5 - 0.5, size*0.5 + 0.5, abs(u - x0));
        a = on*wd*(sf < p3 ? sf/p3 : 0.0);
        col = vec3(0.85);
      } break;
      case 36: { // checker flicker
        ivec2 c = ivec2(floor(p/size));
        a = float((c.x + c.y + int(floor(T*rate))) & 1)*con;
        col = vec3(polSel(pol, 0.0));
      } break;
      }

      bool dark = col == vec3(0.0);
      col = mix(col, col*tint, tmix);
      if (tmix > 0.0 && dark) col = tint*0.35*tmix;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float blend = u_f[L].w;
      if (blend > 0.5 && blend < 1.5) a *= smoothstep(0.35, 0.65, lum);
      else if (blend > 1.5) a *= 1.0 - smoothstep(0.35, 0.65, lum);
      a *= maskF(u_f[L].x, u_f[L].y, u_f[L].z);
      a = clamp(a*op*u_global, 0.0, 1.0);
      P = P*(1.0 - a) + col*a;
      A = A*(1.0 - a) + a;
    }
    o = vec4(P, A);
  }`;

  // Split the switch into per-type case bodies. Each program is compiled with only the
  // types it draws, so cost per pixel does not grow with the size of the catalog. This
  // matters most on software rendering (VMs, remote desktops) where every branch runs.
  const SW_START = FRAG.indexOf('      switch (type) {');
  const SW_END = FRAG.indexOf('\n      bool dark');
  const CASES = {};
  FRAG.slice(SW_START, SW_END).split(/\n(?=      case \d+: )/).slice(1).forEach((chunk) => {
    const m = /^      case (\d+): /.exec(chunk);
    CASES[m[1]] = chunk.replace(/\n      }\s*$/, '');
  });
  function fragFor(indices) {
    const body = indices.map((i) => CASES[i]).filter(Boolean).join('\n');
    return FRAG.slice(0, SW_START) + '      switch (type) {\n' + body + '\n      }' + FRAG.slice(SW_END);
  }

  function hhmm(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; }
  function scheduleActive(L, now) {
    if (!L.schedule || !L.schedule.on) return true;
    const d = now || new Date();
    const m = d.getHours() * 60 + d.getMinutes();
    const a = hhmm(L.schedule.from), b = hhmm(L.schedule.to);
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }

  class NoiseRenderer {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.opts = Object.assign({ zoom: 1, pxScale: 1, auto: true }, opts || {});
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: !!this.opts.preserve, powerPreference: 'low-power' });
      if (!gl) throw new Error('WebGL2 is not available');
      this.gl = gl;
      this.all = []; this.layers = [];
      this.globalOpacity = 1; this.maxFps = 60; this.flickerUnlocked = false;
      this.running = false; this.t0 = performance.now(); this.lastDraw = -1; this.lastKey = null;
      this.refreshHz = 60; this._deltas = []; this._prevRaf = 0;
      this.fps = 0; this._fpsCount = 0; this._fpsT = performance.now();
      this._schedKey = ''; this._schedCheck = 0;
      this._build();
    }
    _compile(type, src) {
      const gl = this.gl; const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    _build() {
      const gl = this.gl;
      this.vs = this._compile(gl.VERTEX_SHADER, VERT);
      this.programs = new Map();
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      this._use([0]);
    }
    // Get (compiling on first use) the program for a set of type indices.
    _use(indices) {
      const key = indices.join(',');
      let p = this.programs.get(key);
      if (!p) {
        const gl = this.gl, t0 = performance.now();
        const prog = gl.createProgram();
        gl.attachShader(prog, this.vs);
        gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fragFor(indices)));
        gl.bindAttribLocation(prog, 0, 'a');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        const u = {};
        ['u_res', 'u_time', 'u_count', 'u_global', 'u_type', 'u_a', 'u_b', 'u_c', 'u_d', 'u_e', 'u_f'].forEach((n) => (u[n] = gl.getUniformLocation(prog, n)));
        p = { prog, u };
        this.programs.set(key, p);
        this.compileMs = performance.now() - t0;
      }
      this.prog = p.prog; this.u = p.u;
      this.gl.useProgram(p.prog);
    }
    // state: { layers, globalOpacity, maxFps, flickerUnlocked }
    setState(s) {
      this.all = (s.layers || []).filter((l) => l && l.enabled !== false);
      if (s.globalOpacity != null) this.globalOpacity = s.globalOpacity;
      if (s.maxFps) this.maxFps = s.maxFps;
      this.flickerUnlocked = !!s.flickerUnlocked;
      this._applySchedule(true);
    }
    _applySchedule(force) {
      const now = new Date();
      const active = this.all.filter((l) => scheduleActive(l, now)).slice(0, MAXL);
      const key = active.map((l) => l.id).join(',');
      if (!force && key === this._schedKey) return;
      this._schedKey = key; this.layers = active; this._upload(); this.lastKey = null;
    }
    _effectiveRate(L, T) {
      let rate = L.rate;
      if (L.rateLock && rate >= 1 && this.refreshHz > 0) rate = this.refreshHz / Math.max(1, Math.round(this.refreshHz / rate));
      if (T.flash && !this.flickerUnlocked) {
        const peak = rate * (L.mod && L.mod.target === 3 ? 1 + 0.9 * L.mod.depth : 1);
        if (T.id === 'flicker') { /* depth capped instead, below */ }
        else if (peak > root.VSPresets.FLASH_CAP_HZ) rate *= root.VSPresets.FLASH_CAP_HZ / peak;
      }
      return rate;
    }
    _upload() {
      const gl = this.gl, n = this.layers.length, VP = root.VSPresets;
      const type = new Int32Array(MAXL);
      const A = [new Float32Array(MAXL * 4), new Float32Array(MAXL * 4), new Float32Array(MAXL * 4), new Float32Array(MAXL * 4), new Float32Array(MAXL * 4), new Float32Array(MAXL * 4)];
      const ps = this.opts.pxScale;
      this.layers.forEach((L, i) => {
        const T = VP.BY_ID[L.type] || VP.BY_ID.snow;
        type[i] = VP.TYPE_INDEX[T.id];
        const rate = this._effectiveRate(L, T);
        const sz = L.size > 4 ? Math.max(1, L.size * ps) : L.size;
        const ex = [L.p1, L.p2, L.p3].map((v, k) => {
          const sp = T.extra.find((e) => e.key === 'p' + (k + 1));
          return sp && /px/.test(sp.unit || '') ? v * ps : v;
        });
        if (T.id === 'flicker' && !this.flickerUnlocked && rate > VP.FLASH_CAP_HZ) ex[0] = Math.min(ex[0], 0.1);
        const m = L.mod || {}, mk = L.mask || {};
        A[0].set([L.opacity, sz, rate, L.density], i * 4);
        A[1].set([L.contrast, L.softness, L.seed || 0, L.polarity || 0], i * 4);
        A[2].set([L.color[0], L.color[1], L.color[2], L.colorMix || 0], i * 4);
        A[3].set([(L.drift ? L.drift[0] : 0) * ps, (L.drift ? -L.drift[1] : 0) * ps, m.depth || 0, m.period || 60], i * 4);
        A[4].set([ex[0] || 0, ex[1] || 0, ex[2] || 0, m.target || 0], i * 4);
        A[5].set([mk.shape || 0, mk.size == null ? 0.5 : mk.size, mk.feather == null ? 0.4 : mk.feather, L.blend || 0], i * 4);
      });
      const idx = [...new Set(Array.from(type.slice(0, n)))].sort((a, b) => a - b);
      this._use(idx.length ? idx : [0]);
      gl.uniform1i(this.u.u_count, n);
      gl.uniform1f(this.u.u_global, this.globalOpacity);
      gl.uniform1iv(this.u.u_type, type);
      ['u_a', 'u_b', 'u_c', 'u_d', 'u_e', 'u_f'].forEach((k, j) => gl.uniform4fv(this.u[k], A[j]));
    }
    resize() {
      const dpr = window.devicePixelRatio || 1;
      const z = this.opts.zoom || 1;
      const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr / z));
      const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr / z));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w; this.canvas.height = h;
        this.gl.viewport(0, 0, w, h); this.lastKey = null;
      }
    }
    setZoom(z) { this.opts.zoom = z; this.lastKey = null; }
    // Returns null when the picture changes continuously, else a key that changes only when a frame would differ.
    _changeKey(t) {
      const VP = root.VSPresets; const parts = [];
      for (const L of this.layers) {
        const T = VP.BY_ID[L.type];
        if (!T || T.continuous || (L.drift && (L.drift[0] || L.drift[1])) || (L.mod && L.mod.target)) return null;
        const r = this._effectiveRate(L, T);
        parts.push(Math.floor(t * r * (T.async ? 3 : 1)));
      }
      return parts.join(',');
    }
    time() { return ((performance.now() - this.t0) / 1000) % TIME_WRAP; }
    draw(t) {
      const gl = this.gl;
      gl.useProgram(this.prog);
      gl.uniform2f(this.u.u_res, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.u.u_time, t);
      if (this.layers.length === 0) gl.clear(gl.COLOR_BUFFER_BIT);
      else gl.drawArrays(gl.TRIANGLES, 0, 3);
      this._fpsCount++; this.frames = (this.frames || 0) + 1;
    }
    start() {
      if (this.running) return; this.running = true;
      const loop = (now) => {
        if (!this.running) return;
        if (this._prevRaf) { this._deltas.push(now - this._prevRaf); if (this._deltas.length > 90) this._deltas.shift(); }
        this._prevRaf = now;
        if (this._deltas.length === 90 && !this._hzSet) {
          const s = this._deltas.slice().sort((a, b) => a - b); const med = s[45];
          if (med > 2) { this.refreshHz = Math.round(1000 / med); this._hzSet = true; this._upload(); }
        }
        if (now - this._schedCheck > 15000) { this._schedCheck = now; this._applySchedule(false); }
        if (now - this._fpsT >= 1000) { this.fps = this._fpsCount; this._fpsCount = 0; this._fpsT = now; }
        this.resize();
        if (now - this.lastDraw >= 1000 / this.maxFps - 1) {
          const t = this.time();
          const key = this.layers.length ? this._changeKey(t) : 'empty';
          if (key === null || key !== this.lastKey) { this.draw(t); this.lastKey = key; this.lastDraw = now; }
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() {
      this.running = false; if (this.raf) cancelAnimationFrame(this.raf);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT); this.lastKey = 'empty';
    }
    // Draw one frame of the given layers into this (small) canvas at time t. For thumbnails.
    snapshot(layers, t, w, h) {
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.gl.viewport(0, 0, w, h); }
      this.all = layers; this.layers = layers.slice(0, MAXL); this._upload();
      this.draw(t);
    }
  }
  NoiseRenderer.scheduleActive = scheduleActive;
  NoiseRenderer.fragFor = fragFor;
  NoiseRenderer.caseCount = () => Object.keys(CASES).length;
  root.NoiseRenderer = NoiseRenderer;
})(typeof self !== 'undefined' ? self : this);
