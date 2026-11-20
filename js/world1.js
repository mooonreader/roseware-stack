import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
/* deterministic random */
let seed = 7; export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/* value noise */
const hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hsh(xi, yi), hsh(xi + 1, yi), u), lerp(hsh(xi, yi + 1), hsh(xi + 1, yi + 1), u), v); };
export const fbm = (x, y, o = 5) => { let a = 0, f = 1, w = .5, t = 0; for (let i = 0; i < o; i++) { a += vnoise(x * f, y * f) * w; t += w; f *= 2.03; w *= .5; } return a / t; };

/* ---------- island outline (metres; +x east, -z north) ---------- */
export const ISLAND_R = th => 47 + 6 * Math.sin(2 * th + .6) + 4 * Math.cos(3 * th - 1) + 2.2 * Math.sin(5 * th + 2) + 1.2 * Math.cos(7 * th);
export const PT = 1.6; /* plinth top */

/* ---------- PBR material library (Poly Haven CC0 textures) ---------- */
export const makeLib = (TL, Q) => {
  const cache = {};
  const load = (slot, kind, rep, srgb) => { const k = slot + kind; let base = cache[k]; if (!base) { base = cache[k] = TL.load(`assets/tex/${slot}_${kind}.jpg`); base.wrapS = base.wrapT = THREE.RepeatWrapping; base.anisotropy = Q.aniso; if (srgb) base.colorSpace = THREE.SRGBColorSpace; }
    const t = base.clone(); t.repeat.set(rep[0], rep[1]); t.needsUpdate = true; return t; };
  const mat = (slot, rep, opt = {}) => { rep = Array.isArray(rep) ? rep : [rep, rep]; const arm = load(slot, 'arm', rep);
    return new THREE.MeshStandardMaterial({ map: load(slot, 'diff', rep, true), normalMap: load(slot, 'nor', rep), roughnessMap: arm, aoMap: arm, aoMapIntensity: .8, metalness: 0, ...opt }); };
  return { mat, load };
};
/* box with UVs in metres on every face */
export const boxM = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, s = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * s[f][0], uv.getY(i) * s[f][1]); } return g; };
export const place = (g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

/* wall with round arches, extruded; length along x, centred; returns geometry in local space (front face at z=+t/2) */
export const archWall = (L, H, t, n, span, spring, opts = {}) => {
  const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.lineTo(L / 2, 0); s.lineTo(L / 2, H); s.lineTo(-L / 2, H); s.lineTo(-L / 2, 0);
  const pitch = L / n; const skip = opts.skip || [];
  for (let i = 0; i < n; i++) { if (skip.includes(i)) continue; const cx = -L / 2 + pitch * (i + .5), r = span / 2, h = new THREE.Path(), sp = opts.springs?.[i] ?? spring;
    h.moveTo(cx - r, opts.sill ?? 0); h.lineTo(cx - r, sp); h.absarc(cx, sp, r, Math.PI, 0, true); h.lineTo(cx + r, opts.sill ?? 0); h.lineTo(cx - r, opts.sill ?? 0); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 18 }); g.translate(0, 0, -t / 2); return g;
};

/* ---------- terrain: coral sand beach rising to a grassy plateau ---------- */
export const terrainHeight = (r, th) => { const e = ISLAND_R(th), d = r - e; const n = (fbm(r * Math.cos(th) * .05 + 9, r * Math.sin(th) * .05) - .5) * .5;
  if (d < -11) return 1.32 + n * .25; if (d < 0) return lerp(1.32 + n * .25, .12, sstep(-11, 0, d)); return lerp(.12, -1.8, sstep(0, 9, d)); };
export const buildTerrain = (lib, Q) => {
  const ks = [0, .12, .24, .36, .48, .58, .66, .72, .77, .81, .845, .87, .89, .91, .93, .95, .965, .98, .99, 1, 1.012, 1.03, 1.06, 1.1, 1.16], NA = Q.hi ? 320 : 200;
  const pos = [], uv = [], gr = [], idx = [];
  for (let i = 0; i < ks.length; i++) for (let j = 0; j <= NA; j++) { const th = j / NA * Math.PI * 2, e = ISLAND_R(th), r = ks[i] * (i === ks.length - 1 ? e + 9 : e) + (ks[i] > 1 ? (ks[i] - 1) * 60 : 0);
    const x = Math.cos(th) * r, z = Math.sin(th) * r, y = terrainHeight(r, th); pos.push(x, y, z); uv.push(x / 4, z / 4);
    const d = r - e, n = fbm(x * .06 + 3, z * .06 - 2); gr.push(clamp(sstep(-12, -19, d) * (n * 1.6 - .35) + sstep(-22, -30, d) * .5)); }
  for (let i = 0; i < ks.length - 1; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aG', new THREE.Float32BufferAttribute(gr, 1)); g.setIndex(idx); g.computeVertexNormals();
  const m = lib.mat('sand', 1, { roughness: 1 }); const gm = lib.load('grass', 'diff', [1.6, 1.6], true);
  m.onBeforeCompile = s => { s.uniforms.tGrass = { value: gm };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aG;varying float vG;varying float vY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvG=aG;vY=position.y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGrass;varying float vG;varying float vY;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {vec3 c=diffuseColor.rgb;float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,.35)*vec3(1.95,1.9,1.78);
         vec3 g=texture2D(tGrass,vMapUv*1.6).rgb*vec3(.85,1.,.7);c=mix(c,g,clamp(vG,0.,1.));
         float wet=1.-smoothstep(.12,.42,vY);c*=mix(1.,.62,wet);diffuseColor.rgb=c;}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor*=mix(1.,.35,1.-smoothstep(.1,.4,vY));'); };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; return mesh;
};

/* ---------- lagoon depth map: R = shallowness, G = surf ---------- */
export const DEPTH_HALF = 640;
export const buildDepthMap = () => {
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), S = N / (2 * DEPTH_HALF), P = (wx, wz) => [N / 2 + wx * S, N / 2 + wz * S];
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  const blob = (cx, cz, r, wob, seedK) => { x.beginPath(); for (let i = 0; i <= 128; i++) { const t = i / 128 * Math.PI * 2, rr = r * (1 + wob * (fbm(Math.cos(t) * 1.3 + seedK, Math.sin(t) * 1.3 - seedK, 4) - .5) * 2); const [px, py] = P(cx + Math.cos(t) * rr, cz + Math.sin(t) * rr); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); };
  const soft = (fill, blur, draw) => { x.save(); x.shadowColor = fill; x.shadowBlur = blur; x.shadowOffsetX = 4000; x.translate(-4000, 0); x.fillStyle = fill; draw(); x.fill(); x.restore(); };
  /* lagoon basin and reef rim (surf in G) */
  soft('rgb(105,0,0)', 26, () => blob(20, -10, 300, .22, 3));
  x.save(); blob(20, -10, 300, .22, 3); x.lineWidth = 9; x.strokeStyle = 'rgb(170,255,0)'; x.shadowColor = 'rgb(140,190,0)'; x.shadowBlur = 10; x.stroke(); x.restore();
  for (let k = 0; k < 14; k++) { const a = rnd() * 6.283, r = 70 + rnd() * 200; soft(`rgb(${150 + rnd() * 40 | 0},0,0)`, 18, () => blob(20 + Math.cos(a) * r, -10 + Math.sin(a) * r, 10 + rnd() * 26, .4, k)); }
  /* the island and its sandy apron */
  const isl = (grow) => { x.beginPath(); for (let i = 0; i <= 200; i++) { const t = i / 200 * Math.PI * 2, r = ISLAND_R(t) + grow, [px, py] = P(Math.cos(t) * r, Math.sin(t) * r); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); };
  soft('rgb(205,0,0)', 36, () => isl(30)); soft('rgb(240,0,0)', 14, () => isl(8)); x.fillStyle = 'rgb(255,0,0)'; isl(1); x.fill();
  /* water villas: shallow sand under them */
  for (let k = 0; k < 6; k++) { const t = -0.45 + k * .3; soft('rgb(190,0,0)', 20, () => blob(48 + 52 * Math.cos(t), 52 * Math.sin(t) - 6, 16, .3, k + 20)); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4; return tex;
};

/* far islands of the surrounding atoll: x, z, radius, lagoon radius */
export const FAR = (() => { const a = []; seed = 11; const ring = (n, r0, r1) => { for (let i = 0; i < n; i++) { const t = rnd() * 6.283, r = r0 + rnd() * (r1 - r0); a.push([Math.cos(t) * r, Math.sin(t) * r - 200, 14 + rnd() * 34, 70 + rnd() * 120]); } };
  a.push([420, -380, 34, 160], [-520, -260, 40, 170], [660, 160, 28, 140], [-300, -720, 46, 190]); ring(28, 1300, 3600); return a; })();

/* ---------- the lagoon: planar reflections, depth colour, surf, sun glitter, hover ripples ---------- */
export const buildWater = (Q, U, depthTex) => {
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1); geo.rotateX(-Math.PI / 2);
  const isl = FAR.slice(0, 32).map(f => new THREE.Vector4(f[0], f[1], f[2], f[3])); while (isl.length < 32) isl.push(new THREE.Vector4(1e5, 1e5, 0, 1));
  const shader = { name: 'Lagoon', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tDepth: { value: depthTex }, uIsl: { value: isl } },
    vertexShader: `uniform mat4 textureMatrix;varying vec4 vR;varying vec3 vW;
      void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vR=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform sampler2D tDiffuse,tDepth;uniform float uT,uWater,uNight,uFogD,uRefl;uniform vec3 uSunDir,uSunC,uFog,uRip;uniform vec4 uIsl[32];varying vec4 vR;varying vec3 vW;
      float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+1.),f.x),f.y);}
      vec2 wv(vec2 p,vec2 d,float f,float s,float a){float ph=dot(p,d)*f+uT*s;return d*cos(ph)*a*f;}
      void main(){vec3 E=cameraPosition-vW;float dist=length(E);vec3 V=E/dist;vec2 p=vW.xz;
       float att=1./(1.+dist*.012);
       vec2 g=wv(p,normalize(vec2(1.,.35)),.21,1.15,.16)+wv(p,normalize(vec2(-.4,1.)),.33,1.6,.09)+wv(p,normalize(vec2(.8,-.6)),.57,2.2,.05)+wv(p,normalize(vec2(-.9,-.2)),1.13,3.1,.022);
       float n1=vn(p*.9+vec2(uT*.35,uT*.2)),n2=vn(p*2.3-vec2(uT*.5,-uT*.3));g+=vec2(n1-.5,n2-.5)*.10*att;g*=mix(.35,1.,att);
       /* hover ripple */
       float rd=length(p-uRip.xy),ra=uT-uRip.z;if(ra>0.&&ra<3.){float R0=ra*6.,x=(rd-R0);float env=exp(-x*x*.35)*exp(-ra*1.2);g+=normalize(p-uRip.xy+1e-4)*sin(x*2.2)*env*.35;}
       vec3 N=normalize(vec3(-g.x,1.,-g.y));
       vec2 du=p/(2.*${DEPTH_HALF.toFixed(1)})+.5;vec4 dm=texture2D(tDepth,du);float inb=step(0.,du.x)*step(du.x,1.)*step(0.,du.y)*step(du.y,1.);
       float s=dm.r*inb,surf=dm.g*inb;
       for(int i=0;i<32;i++){vec4 q=uIsl[i];float d=length(p-q.xy)-q.z;s=max(s,(1.-smoothstep(0.,q.w,d))*.62);s=max(s,(1.-smoothstep(0.,q.w*.22,d))*.92);surf=max(surf,exp(-pow((d-q.w*.82)/(q.w*.05),2.))*.55);}
       vec3 deep=vec3(.004,.032,.085),lag=vec3(.012,.25,.36),shal=vec3(.3,.72,.68);
       vec3 body=mix(deep,lag,smoothstep(.12,.55,s));body=mix(body,shal,smoothstep(.62,.97,s));
       float cs=pow(abs(sin((vn(p*.45+uT*.08)+vn(p*.9-uT*.06))*3.1416)),6.);body+=vec3(.5,.9,.85)*cs*smoothstep(.45,.95,s)*.18*att;
       float lam=max(dot(N,uSunDir),0.)*.6+.55;body*=lam*uWater;
       float fr=.02+.98*pow(1.-max(dot(N,V),0.),5.);
       vec2 ru=vR.xy/vR.w+N.xz*.045*att;vec3 refl=texture2D(tDiffuse,ru).rgb;
       vec3 c=mix(body,refl,clamp(fr*uRefl*(1.-s*.45),0.,1.));
       vec3 H=normalize(uSunDir+V);float nh=max(dot(N,H),0.);c+=uSunC*(pow(nh,700.)*6.+pow(nh,80.)*.12)*step(0.,uSunDir.y);
       float fn=vn(p*.7+vec2(uT*.6,uT*.25))*.6+vn(p*2.1-uT*.4)*.4;
       float shore=smoothstep(.9,.985,s)*(1.-smoothstep(.995,1.,s));float foam=smoothstep(.45,.9,(shore+surf*.9)*(.55+fn))*att;
       c=mix(c,vec3(.95,.98,1.)*mix(1.,.18,uNight)*mix(.85,1.15,uWater),clamp(foam,0.,1.)*.85);
       float fg=1.-exp(-dist*uFogD*.55);c=mix(c,mix(uFog,deep*2.2+uFog*.25,.55),fg);
       gl_FragColor=vec4(c,1.);
       #include <tonemapping_fragment>
       #include <colorspace_fragment>
      }` };
  const w = new Reflector(geo, { textureWidth: Math.round(innerWidth * Q.refl * Math.min(devicePixelRatio, 1.5)), textureHeight: Math.round(innerHeight * Q.refl * Math.min(devicePixelRatio, 1.5)), clipBias: .002, shader, multisample: Q.hi ? 4 : 0 });
  Object.assign(w.material.uniforms, { uT: U.uT, uWater: U.uWater, uNight: U.uNight, uFogD: U.uFogD, uRefl: { value: 1 }, uSunDir: U.uSunDir, uSunC: U.uSunC, uFog: U.uFog, uRip: U.uRip });
  w.renderOrder = 0; w.name = 'water'; return w;
};

/* ---------- clouds: a soft sea of cloud below the opening view ---------- */
export const buildClouds = (Q, U) => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const u = i / 256 - .5, v = j / 256 - .5, r = Math.sqrt(u * u + v * v) * 2; const n = fbm(i / 40, j / 40, 6); const a = clamp((n * 1.25 - .35) * (1 - sstep(.45, 1, r)) * 1.6);
    const k = (j * 256 + i) * 4; im.data[k] = 255; im.data[k + 1] = clamp(.55 + n * .6 - v * .6) * 255; im.data[k + 2] = 255; im.data[k + 3] = a * 255; }
  x.putImageData(im, 0, 0); const tex = new THREE.CanvasTexture(c);
  const n = Q.hi ? 170 : 90, geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(n * 4), b = new Float32Array(n * 2); seed = 5;
  for (let i = 0; i < n; i++) { const t = rnd() * 6.283, r = 60 + Math.pow(rnd(), .7) * 900; a.set([Math.cos(t) * r + 30, 120 + rnd() * 55, Math.sin(t) * r + 120, 60 + rnd() * 120], i * 4); b.set([rnd(), rnd() * 6.28], i * 2); }
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 4)); geo.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 2)); geo.instanceCount = n;
  const m = new THREE.ShaderMaterial({ uniforms: { tC: { value: tex }, uT: U.uT, uSunDir: U.uSunDir, uSunC: U.uSunC, uFog: U.uFog, uCloudA: U.uCloudA, uNight: U.uNight }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aP;attribute vec2 aB;uniform float uT;varying vec2 vU;varying float vA;varying float vK;
      void main(){vec3 c=aP.xyz+vec3(sin(uT*.02+aB.y)*8.,0.,uT*.6);vec4 mv=viewMatrix*vec4(c,1.);float ang=aB.y+uT*.004;vec2 q=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*position.xy;mv.xy+=q*aP.w*vec2(1.,.55);
      vU=position.xy*.5+.5;float d=-mv.z;vA=smoothstep(25.,110.,d)*(1.-smoothstep(1800.,3200.,d));vK=aB.x;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform sampler2D tC;uniform vec3 uSunC,uFog;uniform float uCloudA,uNight;varying vec2 vU;varying float vA;varying float vK;
      void main(){vec4 t=texture2D(tC,vU);vec3 lit=mix(vec3(1.),uSunC,.35)*mix(1.05,.25,uNight),sh=mix(uFog,vec3(.55,.6,.72),.4)*mix(.9,.3,uNight);
      vec3 col=mix(sh,lit,t.g);gl_FragColor=vec4(col,t.a*vA*uCloudA*(.75+.25*vK));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 5; return mesh;
};
