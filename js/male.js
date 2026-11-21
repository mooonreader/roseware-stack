/* Malé, as it is: the real island outlines, streets and buildings (OpenStreetMap), with empty land filled by grey blocks,
   the Sinamalé bridge, a lagoon with real reefs, clouds, and the chart of the Maldives seen from orbit-ish altitude. */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { ISL, REEF, AT, I_KV, I_KH } from './data.js';
import { SEC } from './hq.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
export const SEA_Y = -1.1;

/* svg (artistic chart) -> metres in the HQ frame. Least-squares fit of the chart's atoll centres to their real latitudes and longitudes
   gives ~1418 m per chart unit; Malé's chart point sits on the island centre, ~220 m north of the office. */
const MS = 1418, MALE_SVG = [204.1, 251.7], MALE_C = [-31, -220];
export const svgToW = (sx, sy) => V((sx - MALE_SVG[0]) * MS + MALE_C[0], 0, (sy - MALE_SVG[1]) * MS + MALE_C[1]);

/* ---------- land ---------- */
const groundCanvas = (D, bb, W, H, detail) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const sx = W / (bb[1] - bb[0]), sz = H / (bb[3] - bb[2]); const P = (px, pz) => [(px - bb[0]) * sx, (pz - bb[2]) * sz];
  const poly = (f, k = 0) => { x.beginPath(); for (let i = k; i < f.length - 1; i += 2) { const [a, b] = P(f[i], f[i + 1]); i === k ? x.moveTo(a, b) : x.lineTo(a, b); } x.closePath(); };
  x.fillStyle = '#2b5f7a'; x.fillRect(0, 0, W, H);
  D.isl.forEach(f => { poly(f); x.fillStyle = '#d8d2c6'; x.fill(); });
  /* subtle lot texture */
  if (detail) { x.globalAlpha = .07; for (let i = 0; i < 26000; i++) { x.fillStyle = rnd() < .5 ? '#9b9488' : '#ffffff'; x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 2 + rnd() * 6); } x.globalAlpha = 1; }
  D.green.forEach(f => { poly(f); x.fillStyle = '#7d9466'; x.fill(); });
  D.aero.forEach(a => { const w = a[1] || 45; x.lineCap = 'butt'; x.strokeStyle = a[0] === 'runway' ? '#4b4d50' : '#6a6c70'; x.lineWidth = w * sx; x.beginPath(); for (let i = 2; i < a.length - 1; i += 2) { const [p, q] = P(a[i], a[i + 1]); i === 2 ? x.moveTo(p, q) : x.lineTo(p, q); } x.stroke();
    if (a[0] === 'runway') { x.setLineDash([30 * sx, 30 * sx]); x.strokeStyle = '#eeeeee'; x.lineWidth = Math.max(1, .9 * sx); x.stroke(); x.setLineDash([]); } });
  const roadW = c => c === 0 ? 12 : c === 1 ? 7 : 3.6;
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const pass of [0, 1]) D.rd.forEach(r => { const w = roadW(r[0]); x.strokeStyle = pass ? (r[0] === 2 ? '#a8a49c' : '#5f6266') : '#c4bfb5'; x.lineWidth = (pass ? w : w + 3.2) * sx; x.beginPath();
    for (let i = 1; i < r.length - 1; i += 2) { const [p, q] = P(r[i], r[i + 1]); i === 1 ? x.moveTo(p, q) : x.lineTo(p, q); } x.stroke(); });
  if (detail) { /* lane lines on the bigger streets */ x.setLineDash([3 * sx, 4 * sx]); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = Math.max(1, .18 * sx);
    D.rd.forEach(r => { if (r[0] > 0) return; x.beginPath(); for (let i = 1; i < r.length - 1; i += 2) { const [p, q] = P(r[i], r[i + 1]); i === 1 ? x.moveTo(p, q) : x.lineTo(p, q); } x.stroke(); }); x.setLineDash([]);
    /* the RoseWare frontage: red kerb line and paving in front of the entrance */
    { const [a, b] = P(-14, 8.6), [c2, d2] = P(14, 11.2); x.fillStyle = '#e9e4da'; x.fillRect(a, b, c2 - a, d2 - b); x.fillStyle = '#e2231a'; const [e, f] = P(-14, 11.1); x.fillRect(e, f, 28 * sx, .25 * sz); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
};
const islandGeo = (D, f, top, base) => {
  const pts = []; for (let i = 0; i < f.length - 1; i += 2) pts.push(new THREE.Vector2(f[i], f[i + 1]));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const tri = THREE.ShapeUtils.triangulateShape(pts, []); const pos = [], nor = [], idx = [];
  pts.forEach(p => { pos.push(p.x, top, p.y); nor.push(0, 1, 0); }); tri.forEach(t => idx.push(t[0], t[2], t[1]));
  /* seawall sides */
  const n = pts.length; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], o = pos.length / 3; const dx = b.x - a.x, dz = b.y - a.y, L = Math.hypot(dx, dz) || 1, nx = dz / L, nz = -dx / L;
    pos.push(a.x, top, a.y, b.x, top, b.y, b.x, base, b.y, a.x, base, a.y); for (let k = 0; k < 4; k++) nor.push(nx, 0, nz); idx.push(o, o + 2, o + 1, o, o + 3, o + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
};
/* ground: planar uv from world xz in the zone's bbox */
const groundMat = (tex, bb, detailTex) => { const m = new THREE.MeshStandardMaterial({ map: tex, roughness: .92, metalness: 0 });
  m.onBeforeCompile = sh => { sh.uniforms.uBB = { value: new THREE.Vector4(bb[0], bb[2], bb[1] - bb[0], bb[3] - bb[2]) }; sh.uniforms.tDet = { value: detailTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uBB;uniform sampler2D tDet;varying vec3 vGW;')
      .replace('#include <map_fragment>', `vec2 guv=(vGW.xz-uBB.xy)/uBB.zw;vec4 gt=texture2D(map,vec2(guv.x,1.-guv.y));diffuseColor.rgb*=gt.rgb;
        float dd=length(vGW-cameraPosition);float det=dot(texture2D(tDet,vGW.xz*.25).rgb,vec3(.333));diffuseColor.rgb*=mix(1.,.72+det*.65,1.-smoothstep(30.,160.,dd));
        if(vGW.y<-.05)diffuseColor.rgb=vec3(.78,.76,.72)*mix(.55,1.,smoothstep(-3.,0.,vGW.y));`); };
  m.customProgramCacheKey = () => 'ground'; m.clippingPlanes = [SEC.fac]; return m; };

/* grey blocks with a fake ambient occlusion toward the ground and a slight per-building tone */
const blockMat = (U) => { const m = new THREE.MeshStandardMaterial({ color: 0xc3c4c4, roughness: .86, metalness: 0, envMapIntensity: .6 });
  m.onBeforeCompile = sh => { sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBW;varying float vTone;varying float vUp;').replace('#include <fog_vertex>', `#include <fog_vertex>
      vUp=abs(objectNormal.y);
      vec4 bw=modelMatrix*vec4(transformed,1.);
      #ifdef USE_INSTANCING
      bw=modelMatrix*instanceMatrix*vec4(transformed,1.);vTone=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9,78.2)))*437.5);
      #else
      vTone=fract(sin(dot(floor(bw.xz*.1),vec2(12.9,78.2)))*437.5);
      #endif
      vBW=bw.xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;varying vec3 vBW;varying float vTone;varying float vUp;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb*=.86+vTone*.2;diffuseColor.rgb*=mix(.42,1.,smoothstep(0.,7.,vBW.y));
        float fl=fract(vBW.y/3.1);diffuseColor.rgb*=1.-.06*smoothstep(.0,.06,fl)*(1.-smoothstep(.1,.16,fl))*step(vUp,.5);`); };
  m.customProgramCacheKey = () => 'blocks'; m.clippingPlanes = [SEC.fac]; return m; };

/* ---------- the lagoon ---------- */
const depthTex = (D, half, N, reefs) => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), S = N / (2 * half), P = (a, b) => [N / 2 + a * S, N / 2 + b * S];
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  /* reefs (chart), shallow */
  if (reefs) { x.filter = `blur(${Math.max(1, 220 * S)}px)`; REEF.forEach(r => { x.beginPath(); r.P.forEach((q, i) => { const w = svgToW(q[0], q[1]); const [a, b] = P(w.x, w.z); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.fillStyle = 'rgba(105,0,0,1)'; x.fill(); x.strokeStyle = 'rgb(165,60,0)'; x.lineWidth = Math.max(1, 260 * S); x.stroke(); }); x.filter = 'none'; }
  /* fringing reef around each island: blurred halo, then the land */
  const isl = (f, col, lw) => { x.beginPath(); for (let i = 0; i < f.length - 1; i += 2) { const [a, b] = P(f[i], f[i + 1]); i ? x.lineTo(a, b) : x.moveTo(a, b); } x.closePath(); x.fillStyle = col; x.fill(); if (lw) { x.strokeStyle = col; x.lineWidth = lw; x.lineJoin = 'round'; x.stroke(); } };
  x.filter = `blur(${Math.max(1.5, 90 * S)}px)`; D.isl.forEach(f => isl(f, 'rgb(170,30,0)', 260 * S)); x.filter = `blur(${Math.max(1, 25 * S)}px)`; D.isl.forEach(f => isl(f, 'rgb(235,120,0)', 70 * S)); x.filter = 'none';
  D.isl.forEach(f => isl(f, 'rgb(255,0,0)', 0));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
const SEA_SHADER = (refl) => ({ name: 'Sea',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tNear: { value: null }, tFar: { value: null } },
  vertexShader: `uniform mat4 textureMatrix;varying vec4 vR;varying vec3 vW;${refl ? '' : 'uniform mat4 _x;'}
    void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vR=${refl ? 'textureMatrix*vec4(position,1.)' : 'vec4(0.)'};gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: `uniform sampler2D tDiffuse,tNear,tFar;uniform float uT,uWater,uNight,uFogD,uRefl;uniform vec3 uSunDir,uSunC,uFog,uRip;varying vec4 vR;varying vec3 vW;
    float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+1.),f.x),f.y);}
    vec2 wv(vec2 p,vec2 d,float f,float s,float a){float ph=dot(p,d)*f+uT*s;return d*cos(ph)*a*f;}
    void main(){vec3 E=cameraPosition-vW;float dist=length(E);vec3 Vv=E/dist;vec2 p=vW.xz;
     float att=1./(1.+dist*.012);float alt=max(cameraPosition.y,1.);
     vec2 g=wv(p,normalize(vec2(1.,.35)),.21,1.15,.16)+wv(p,normalize(vec2(-.4,1.)),.33,1.6,.09)+wv(p,normalize(vec2(.8,-.6)),.57,2.2,.05)+wv(p,normalize(vec2(-.9,-.2)),1.13,3.1,.022);
     float n1=vn(p*.9+vec2(uT*.35,uT*.2)),n2=vn(p*2.3-vec2(uT*.5,-uT*.3));g+=vec2(n1-.5,n2-.5)*.10*att;g*=mix(.3,1.,att);
     g+=(vec2(vn(p*.012+uT*.01),vn(p*.012-uT*.013))-.5)*.08*(1.-att);
     float rd=length(p-uRip.xy),ra=uT-uRip.z;if(ra>0.&&ra<3.){float R0=ra*6.,x=(rd-R0);float env=exp(-x*x*.35)*exp(-ra*1.2);g+=normalize(p-uRip.xy+1e-4)*sin(x*2.2)*env*.35;}
     vec3 N=normalize(vec3(-g.x,1.,-g.y));
     vec2 un=p/9000.+.5;vec2 uf=p/64000.+.5;float inN=step(0.,un.x)*step(un.x,1.)*step(0.,un.y)*step(un.y,1.);
     vec4 dN=texture2D(tNear,un),dF=texture2D(tFar,clamp(uf,0.,1.));vec4 dm=mix(dF,dN,inN*(1.-smoothstep(.42,.5,max(abs(un.x-.5),abs(un.y-.5)))));
     float s=dm.r,surf=dm.g;
     vec3 deep=vec3(.006,.05,.12),lag=vec3(.01,.22,.34),shal=vec3(.28,.74,.70);
     vec3 body=mix(deep,lag,smoothstep(.1,.5,s));body=mix(body,shal,smoothstep(.55,.97,s));
     float cs=pow(abs(sin((vn(p*.45+uT*.08)+vn(p*.9-uT*.06))*3.1416)),6.);body+=vec3(.5,.9,.85)*cs*smoothstep(.45,.95,s)*.16*att;
     float lam=max(dot(N,uSunDir),0.)*.6+.55;body*=lam*uWater;
     float fr=.02+.98*pow(1.-max(dot(N,Vv),0.),5.);
     ${refl ? 'vec2 ru=vR.xy/vR.w+N.xz*.045*att;vec3 refl=texture2D(tDiffuse,ru).rgb;' : 'vec3 refl=mix(uFog,vec3(.55,.7,.85),.5)*mix(1.,.15,uNight);'}
     vec3 c=mix(body,refl,clamp(fr*uRefl*(1.-s*.45),0.,1.));
     vec3 H=normalize(uSunDir+Vv);float nh=max(dot(N,H),0.);c+=uSunC*(pow(nh,700.)*6.+pow(nh,80.)*.12)*step(0.,uSunDir.y)*att;
     float fn=vn(p*.7+vec2(uT*.6,uT*.25))*.6+vn(p*2.1-uT*.4)*.4;
     float foam=smoothstep(.5,.95,surf*(.55+fn))*smoothstep(1.,.98,s)*max(att,.25);
     c=mix(c,vec3(.95,.98,1.)*mix(1.,.18,uNight)*mix(.85,1.15,uWater),clamp(foam,0.,1.)*.8);
     float fg=1.-exp(-dist*uFogD*.55);c=mix(c,mix(uFog,deep*2.2+uFog*.25,.55),fg);
     gl_FragColor=vec4(c,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }` });

/* ---------- build it ---------- */
export const loadMale = async ({ scene, U, Q, TL }) => {
  const D = await fetch('assets/male/male.json').then(r => r.json());
  const G = new THREE.Group(); G.name = 'male'; scene.add(G);
  const det = TL.load('assets/tex/concrete_diff.jpg'); det.wrapS = det.wrapT = THREE.RepeatWrapping; det.colorSpace = THREE.SRGBColorSpace; det.anisotropy = Q.aniso;
  /* zones: Malé gets a 0.5 m/px ground texture, everything else 4 m/px */
  const bbOf = f => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let i = 0; i < f.length - 1; i += 2) { a = Math.min(a, f[i]); b = Math.max(b, f[i]); c = Math.min(c, f[i + 1]); d = Math.max(d, f[i + 1]); } return [a, b, c, d]; };
  const mb = bbOf(D.isl[D.male]); const pad = 30; const bbM = [mb[0] - pad, mb[1] + pad, mb[2] - pad, mb[3] + pad];
  const W = Q.hi ? 4096 : 2048, H = Math.round(W * (bbM[3] - bbM[2]) / (bbM[1] - bbM[0]));
  const texM = groundCanvas(D, bbM, W, H, true);
  let all = [1e9, -1e9, 1e9, -1e9]; D.isl.forEach(f => { const b = bbOf(f); all = [Math.min(all[0], b[0]), Math.max(all[1], b[1]), Math.min(all[2], b[2]), Math.max(all[3], b[3])]; });
  const texO = groundCanvas(D, all, 2048, Math.round(2048 * (all[3] - all[2]) / (all[1] - all[0])), false);
  const gM = groundMat(texM, bbM, det), gO = groundMat(texO, all, det);
  D.isl.forEach((f, k) => { const m = new THREE.Mesh(islandGeo(D, f, 0, -3.2), k === D.male ? gM : gO); m.receiveShadow = true; m.name = 'island'; G.add(m); });
  /* OSM buildings: extruded footprints, merged */
  const bm = blockMat(U); { const pos = [], nor = [], idx = []; let o = 0;
    for (const b of D.bd) { const h = b[0], mh = b[1] || 0, pts = []; for (let i = 2; i < b.length - 1; i += 2) pts.push(new THREE.Vector2(b[i], b[i + 1])); if (pts.length < 3) continue; if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      let tri; try { tri = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { continue; }
      const base = o; pts.forEach(p => { pos.push(p.x, h, p.y); nor.push(0, 1, 0); }); tri.forEach(t => idx.push(base + t[0], base + t[2], base + t[1])); o += pts.length;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; const dx = c.x - a.x, dz = c.y - a.y, L = Math.hypot(dx, dz) || 1, nx = dz / L, nz = -dx / L;
        pos.push(a.x, h, a.y, c.x, h, c.y, c.x, mh, c.y, a.x, mh, a.y); for (let k = 0; k < 4; k++) nor.push(nx, 0, nz); idx.push(o, o + 2, o + 1, o, o + 3, o + 2); o += 4; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, bm); m.castShadow = m.receiveShadow = true; m.name = 'osm'; G.add(m); }
  /* filled blocks: one instanced box, with roof parapets and water tanks on some */
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0); const inst = new THREE.InstancedMesh(box, bm, D.fill.length); const M4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = V(1, 1, 1), p3 = V(0, 0, 0), Y = V(0, 1, 0);
  D.fill.forEach((f, i) => { p3.set(f[0], 0, f[1]); q4.setFromAxisAngle(Y, -f[5] * Math.PI / 180); s3.set(f[2], f[4], f[3]); M4.compose(p3, q4, s3); inst.setMatrixAt(i, M4); });
  inst.castShadow = inst.receiveShadow = true; inst.name = 'fill'; inst.computeBoundingSphere(); G.add(inst);
  /* rooftop tanks near the HQ (seen from the reveal) */
  { const tg = new THREE.CylinderGeometry(.9, .9, 1.6, 12).translate(0, .8, 0); const near = D.fill.filter(f => Math.hypot(f[0], f[1]) < 260 && rnd() < .55); const ti = new THREE.InstancedMesh(tg, bm, near.length);
    near.forEach((f, i) => { M4.makeTranslation(f[0] + (rnd() - .5) * f[2] * .5, f[4], f[1] + (rnd() - .5) * f[3] * .5); ti.setMatrixAt(i, M4); }); ti.castShadow = true; G.add(ti); }
  /* Sinamalé bridge */
  D.bridge.forEach(b => { const A = V(b.a[0], 0, b.a[1]), Bp = V(b.b[0], 0, b.b[1]), L = A.distanceTo(Bp), dir = Bp.clone().sub(A).normalize(), side = V(-dir.z, 0, dir.x), w = b.w;
    const N = 80, pos = [], idx = []; const hAt = t => 4 + 16 * Math.pow(Math.sin(Math.PI * t), .6);
    for (let i = 0; i <= N; i++) { const t = i / N, c = A.clone().lerp(Bp, t), h = hAt(t); for (const s of [-1, 1]) { const e = c.clone().addScaledVector(side, s * w / 2); pos.push(e.x, h, e.z, e.x, h - 1.4, e.z); } }
    for (let i = 0; i < N; i++) { const a = i * 4, c = a + 4; idx.push(a, c, a + 2, a + 2, c, c + 2, a + 1, a + 3, c + 1, a + 3, c + 3, c + 1, a, a + 1, c, a + 1, c + 1, c, a + 2, c + 2, a + 3, a + 3, c + 2, c + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const deck = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd9d7d2, roughness: .7, side: THREE.DoubleSide })); deck.castShadow = true; G.add(deck);
    const piers = []; for (let i = 1; i < 14; i++) { const t = i / 14, c = A.clone().lerp(Bp, t); piers.push(new THREE.CylinderGeometry(1.1, 1.3, hAt(t) + 6, 10).translate(c.x, (hAt(t) - 6) / 2 - 1, c.z)); }
    const pm = new THREE.Mesh(piers.reduce((a, g2) => { a.push(g2); return a; }, []).length ? mergeGeo(piers) : box, deck.material); pm.castShadow = true; G.add(pm);
    /* two red arches at the main span: RoseWare red on the city's skyline */
    const arch = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([0, .25, .5, .75, 1].map(t => A.clone().lerp(Bp, .38 + t * .24).setY(hAt(.38 + t * .24) + Math.sin(Math.PI * t) * 26))), 40, .7, 8);
    for (const s of [-1, 1]) { const a = new THREE.Mesh(arch, new THREE.MeshStandardMaterial({ color: 0xe2231a, roughness: .4, metalness: .2 })); a.position.addScaledVector(side, s * w / 2); G.add(a); } });
  /* the lagoon: reflective near the surface, flat shading from higher up */
  const tNear = depthTex(D, 4500, 2048, false), tFar = depthTex(D, 32000, 2048, true);
  const geo = new THREE.PlaneGeometry(64000, 64000, 1, 1).rotateX(-Math.PI / 2);
  const common = { uT: U.uT, uWater: U.uWater, uNight: U.uNight, uFogD: U.uFogD, uRefl: { value: 1 }, uSunDir: U.uSunDir, uSunC: U.uSunC, uFog: U.uFog, uRip: U.uRip };
  const sea = new Reflector(geo, { textureWidth: Math.round(innerWidth * Q.refl), textureHeight: Math.round(innerHeight * Q.refl), clipBias: .002, shader: SEA_SHADER(true), multisample: 0 });
  Object.assign(sea.material.uniforms, common, { tNear: { value: tNear }, tFar: { value: tFar } }); sea.position.y = SEA_Y; sea.name = 'sea';
  const sh2 = SEA_SHADER(false); const flat = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...common, tNear: { value: tNear }, tFar: { value: tFar }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() } }, vertexShader: sh2.vertexShader, fragmentShader: sh2.fragmentShader }));
  flat.position.y = SEA_Y; flat.visible = false; scene.add(sea, flat);
  return { G, sea, flat, D, osm: G.getObjectByName('osm'), fill: inst };
};
const mergeGeo = (list) => { const pos = [], nor = [], idx = []; let o = 0; for (const g of list) { const gi = g.index ? g : g; const p = gi.attributes.position, n = gi.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } const I = gi.index.array; for (let i = 0; i < I.length; i++) idx.push(I[i] + o); o += p.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g; };

/* ---------- clouds over the atoll ---------- */
export const buildSky = (Q, U) => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256);
  const hh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (px, py) => { const i = Math.floor(px), j = Math.floor(py), f = px - i, g = py - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); return (hh(i, j) * (1 - u) + hh(i + 1, j) * u) * (1 - v) + (hh(i, j + 1) * (1 - u) + hh(i + 1, j + 1) * u) * v; };
  const fbm = (px, py) => { let s = 0, a = .5; for (let k = 0; k < 6; k++) { s += vn(px, py) * a; px *= 2.03; py *= 2.03; a *= .5; } return s; };
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const u = i / 256 - .5, v = j / 256 - .5, r = Math.sqrt(u * u + v * v) * 2, n = fbm(i / 40, j / 40); const a = clamp((n * 1.3 - .36) * (1 - Math.min(1, Math.max(0, (r - .42) / .58))) * 1.7);
    const k = (j * 256 + i) * 4; im.data[k] = 255; im.data[k + 1] = clamp(.5 + n * .65 - v * .7) * 255; im.data[k + 2] = 255; im.data[k + 3] = a * 255; }
  x.putImageData(im, 0, 0); const tex = new THREE.CanvasTexture(c);
  const n = Q.hi ? 260 : 140, geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(n * 4), b = new Float32Array(n * 2); seed = 17;
  for (let i = 0; i < n; i++) { const t = rnd() * 6.283, r = 300 + Math.pow(rnd(), .8) * 9000; a.set([Math.cos(t) * r, 900 + rnd() * 500, Math.sin(t) * r, 260 + rnd() * 520], i * 4); b.set([rnd(), rnd() * 6.28], i * 2); }
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 4)); geo.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 2)); geo.instanceCount = n;
  const m = new THREE.ShaderMaterial({ uniforms: { tC: { value: tex }, uT: U.uT, uSunC: U.uSunC, uFog: U.uFog, uCloudA: U.uCloudA, uNight: U.uNight }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aP;attribute vec2 aB;uniform float uT;varying vec2 vU;varying float vA;varying float vK;
      void main(){vec3 c=aP.xyz+vec3(sin(uT*.02+aB.y)*30.,0.,uT*2.);vec4 mv=viewMatrix*vec4(c,1.);float ang=aB.y+uT*.003;vec2 q=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*position.xy;mv.xy+=q*aP.w*vec2(1.,.6);
      vU=position.xy*.5+.5;float d=-mv.z;vA=smoothstep(60.,420.,d)*(1.-smoothstep(9000.,26000.,d));vK=aB.x;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform sampler2D tC;uniform vec3 uSunC,uFog;uniform float uCloudA,uNight;varying vec2 vU;varying float vA;varying float vK;
      void main(){vec4 t=texture2D(tC,vU);vec3 lit=mix(vec3(1.),uSunC,.35)*mix(1.08,.22,uNight),sh=mix(uFog,vec3(.55,.6,.72),.4)*mix(.85,.28,uNight);
      gl_FragColor=vec4(mix(sh,lit,t.g),t.a*vA*uCloudA*(.75+.25*vK));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 5; return mesh;
};

/* ---------- the chart of the Maldives, at true scale ---------- */
export const buildChart = (scene, U) => {
  const x0 = 110, y0 = 15, sxu = 290, syu = 650, W = 2048, H = Math.round(W * syu / sxu), k = W / sxu;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const P = (a, b) => [(a - x0) * k, (b - y0) * k];
  x.clearRect(0, 0, W, H);
  REEF.forEach(r => { x.beginPath(); r.P.forEach((q, i) => { const [a, b] = P(q[0], q[1]); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.fillStyle = 'rgba(70,205,210,.22)'; x.fill(); x.strokeStyle = 'rgba(180,250,245,.85)'; x.lineWidth = 2.2; x.stroke(); });
  ISL.forEach(s => { const [a, b] = P(s.x, s.y); x.save(); x.translate(a, b); x.rotate(s.r); x.fillStyle = '#fbf3e2'; x.beginPath(); x.ellipse(0, 0, Math.max(1.8, s.a * k), Math.max(1.4, s.b * k), 0, 0, 7); x.fill(); x.restore(); });
  x.font = '500 19px Inter,sans-serif'; x.fillStyle = 'rgba(255,255,255,.62)'; x.textAlign = 'left'; AT.forEach(a => { if (a[0] === 'male') return; const [px, py] = P(a[2] + a[4] + 6, a[3]); x.fillText(a[1].toUpperCase(), px, py + 6); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const wM = sxu * MS, hM = syu * MS; const ctr = svgToW(x0 + sxu / 2, y0 + syu / 2);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, toneMapped: false }));
  mesh.position.set(ctr.x, 30, ctr.z); mesh.renderOrder = 4; mesh.frustumCulled = false; scene.add(mesh);
  /* ocean under the chart, to the horizon */
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(6e6, 6e6).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, uniforms: { uA: { value: 0 }, uC: { value: new THREE.Vector3(ctr.x, 0, ctr.z) } },
    vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'uniform float uA;uniform vec3 uC;varying vec3 vW;void main(){float r=length(vW.xz-uC.xz)/9e5;vec3 c=mix(vec3(.035,.15,.27),vec3(.012,.05,.1),smoothstep(.1,1.4,r));gl_FragColor=vec4(c,uA);}' }));
  ocean.position.set(ctr.x, 20, ctr.z); ocean.renderOrder = 3; ocean.frustumCulled = false; scene.add(ocean);
  const sites = [['male', 0, 0], ['kv', ...['x', 'y'].map(k2 => ISL[I_KV][k2])], ['kh', ...['x', 'y'].map(k2 => ISL[I_KH][k2])]];
  const beamM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uT: U.uT },
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float uA,uT;varying vec2 vU;void main(){float a=pow(1.-vU.y,1.6)*(.6+.4*sin(vU.y*30.-uT*4.));gl_FragColor=vec4(vec3(1.,.16,.1)*2.,a*uA);}' });
  const pins = sites.map(([id, a, b], i) => { const p = id === 'male' ? V(0, 0, 0) : svgToW(a, b); const grp = new THREE.Group(); grp.position.copy(p);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, .5, 0), beamM); beam.renderOrder = 6; grp.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .3, .2), transparent: true, depthWrite: false, depthTest: false, opacity: 0 })); ring.renderOrder = 6; grp.add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.32, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .3, .2), transparent: true, opacity: 0, depthTest: false })); dot.renderOrder = 7; grp.add(dot);
    grp.visible = false; scene.add(grp); return { id, grp, beam, ring, dot, P: p.clone() }; });
  return { mesh, ocean, pins, beamM };
};
