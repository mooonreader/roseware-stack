import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { V, rnd, lerp, clamp, sstep, fbm, ISLAND_R, PT, boxM, place, archWall, terrainHeight, FAR } from './world1.js';
import { ISL, REEF, AT, I_MALE, I_KV, I_KH } from './data.js';
import { LAYERS } from './content.js';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const ctex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

/* ================= palms ================= */
const barkTex = () => { const [c, x] = canvas(64, 512); for (let y = 0; y < 512; y++) { const ring = Math.pow(Math.abs(Math.sin(y / 512 * Math.PI * 34)), 6); const n = fbm(1, y / 18, 3); const v = 120 + n * 50 - ring * 55; x.fillStyle = `rgb(${v * 1.02 | 0},${v * .94 | 0},${v * .82 | 0})`; x.fillRect(0, y, 64, 1); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(40,30,20,${rnd() * .15})`; x.fillRect(rnd() * 64, rnd() * 512, 1 + rnd() * 3, 1); } const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const leafTex = () => { const [c, x] = canvas(256, 1024); x.clearRect(0, 0, 256, 1024);
  for (let i = 0; i < 70; i++) { const v = i / 70, y = 20 + v * 980, len = 118 * Math.sin(Math.PI * Math.min(1, v * 1.08)) + 12; for (const sgn of [-1, 1]) { const g = 90 + rnd() * 50 | 0; x.strokeStyle = `rgb(${g * .45 | 0},${g},${g * .3 | 0})`; x.lineWidth = 5 + rnd() * 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(128, y); x.quadraticCurveTo(128 + sgn * len * .5, y + 18, 128 + sgn * len, y + 46 + rnd() * 10); x.stroke(); } }
  x.strokeStyle = '#6b7a3a'; x.lineWidth = 6; x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 1024); x.stroke(); return ctex(c); };
const buildPalmVariant = (h, lean, nFronds) => {
  /* trunk */
  const pts = [V(0, 0, 0), V(lean * .12, h * .3, 0), V(lean * .45, h * .65, 0), V(lean, h, 0)], cur = new THREE.CatmullRomCurve3(pts), SEG = 20, RS = 9, pos = [], uv = [], idx = [], sw = [];
  for (let i = 0; i <= SEG; i++) { const t = i / SEG, p = cur.getPoint(t), tg = cur.getTangent(t), n = new THREE.Vector3(0, 0, 1).cross(tg).normalize(), b = tg.clone().cross(n).normalize(), r = lerp(.27, .15, Math.pow(t, .7)) * (1 + .06 * Math.sin(t * 90));
    for (let j = 0; j <= RS; j++) { const a = j / RS * Math.PI * 2, d = n.clone().multiplyScalar(Math.cos(a) * r).add(b.clone().multiplyScalar(Math.sin(a) * r)); pos.push(p.x + d.x, p.y + d.y, p.z + d.z); uv.push(j / RS, t * h / 1.2); sw.push(t * t * .4); } }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RS; j++) { const a = i * (RS + 1) + j, b = a + RS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const trunk = new THREE.BufferGeometry(); trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); trunk.setAttribute('aSw', new THREE.Float32BufferAttribute(sw, 1)); trunk.setIndex(idx); trunk.computeVertexNormals();
  /* crown */
  const top = cur.getPoint(1), cp = [], cu = [], ci = [], cs = []; let base = 0;
  for (let f = 0; f < nFronds; f++) { const young = f >= nFronds - 3, phi = f / (nFronds - 3) * Math.PI * 2 + rnd() * .4, L = young ? 2.4 + rnd() * .6 : 3.8 + rnd() * 1.3, up = young ? 1.1 : .55 + rnd() * .35, droop = young ? .4 : 1.4 + rnd() * .9, W = young ? .45 : .95, dir = V(Math.cos(phi), 0, Math.sin(phi)), side = V(-Math.sin(phi), 0, Math.cos(phi)), S = 12;
    for (let i = 0; i <= S; i++) { const s = i / S, w = W * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05 + .02)), .7), cen = top.clone().add(dir.clone().multiplyScalar(s * L)).add(V(0, s * L * up - droop * s * s * L * .5, 0));
      for (const k of [-1, 0, 1]) { const q = cen.clone().add(side.clone().multiplyScalar(k * w * .5)).add(V(0, k === 0 ? .05 : -.08 * w, 0)); cp.push(q.x, q.y, q.z); cu.push(.5 + k * .5, s); cs.push(.4 + s); } }
    for (let i = 0; i < S; i++) for (let k = 0; k < 2; k++) { const a = base + i * 3 + k, b = a + 3; ci.push(a, b, a + 1, a + 1, b, b + 1); } base += (S + 1) * 3; }
  /* coconuts */
  const nut = new THREE.IcosahedronGeometry(.13, 1); for (let k = 0; k < 4 + (rnd() * 3 | 0); k++) { const g = nut.clone(), a = rnd() * 6.28; g.translate(top.x + Math.cos(a) * .22, top.y - .18 - rnd() * .15, top.z + Math.sin(a) * .22); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { cp.push(p.getX(i), p.getY(i), p.getZ(i)); cu.push(.5, .02); cs.push(.2); } const gi = g.index ? g.index.array : [...Array(p.count).keys()]; for (const v of gi) ci.push(base + v); base += p.count; }
  const crown = new THREE.BufferGeometry(); crown.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); crown.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2)); crown.setAttribute('aSw', new THREE.Float32BufferAttribute(cs, 1)); crown.setIndex(ci); crown.computeVertexNormals();
  return { trunk, crown };
};
const swayMat = (m, U) => { m.onBeforeCompile = s => { s.uniforms.uT = U.uT; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;attribute float aSw;')
  .replace('#include <begin_vertex>', `#include <begin_vertex>
   float ph=0.;
   #ifdef USE_INSTANCING
   ph=instanceMatrix[3].x*.37+instanceMatrix[3].z*.21;
   #endif
   float w=sin(uT*1.1+ph)*.6+sin(uT*2.3+ph*1.7)*.25+sin(uT*.37+ph)*.4;transformed.x+=w*aSw*.16;transformed.z+=cos(uT*.9+ph)*aSw*.1;transformed.y-=abs(w)*aSw*aSw*.05;`); }; return m; };
export const buildPalms = (scene, Q, U, spots) => {
  const bark = barkTex(), leaf = leafTex();
  const tm = swayMat(new THREE.MeshStandardMaterial({ map: bark, roughness: .95, color: 0xd8cfc0 }), U);
  const lm = swayMat(new THREE.MeshStandardMaterial({ map: leaf, alphaTest: .42, side: THREE.DoubleSide, roughness: .7, color: 0xd9ffd0, envMapIntensity: .8 }), U);
  const ld = new THREE.MeshDepthMaterial({ map: leaf, alphaTest: .42, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const vars = [buildPalmVariant(8.2, 1.9, 15), buildPalmVariant(9.6, 2.6, 16), buildPalmVariant(7, 1.2, 14)];
  const per = [[], [], []]; spots.forEach((s, i) => per[i % 3].push(s));
  const o = new THREE.Object3D(), out = [];
  vars.forEach((v, k) => { const n = per[k].length; if (!n) return; const T = new THREE.InstancedMesh(v.trunk, tm, n), C = new THREE.InstancedMesh(v.crown, lm, n); C.customDepthMaterial = ld;
    per[k].forEach((s, i) => { o.position.set(s[0], s[1], s[2]); o.rotation.set(0, s[3], 0); o.scale.setScalar(s[4]); o.updateMatrix(); T.setMatrixAt(i, o.matrix); C.setMatrixAt(i, o.matrix); });
    [T, C].forEach(m => { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); out.push(m); }); });
  return out;
};

/* ================= shrubs (beach scaevola) ================= */
export const buildShrubs = (scene, Q, spots) => {
  const [c, x] = canvas(512, 512); x.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 520; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 230, px = 256 + Math.cos(a) * r, py = 270 + Math.sin(a) * r * .8; if (py < 40) continue; const g = 70 + rnd() * 80 | 0, L = 16 + rnd() * 18, ang = rnd() * 6.283;
    x.save(); x.translate(px, py); x.rotate(ang); x.fillStyle = `rgb(${g * .5 | 0},${g},${g * .32 | 0})`; x.beginPath(); x.ellipse(0, 0, L, L * .42, 0, 0, 7); x.fill(); x.strokeStyle = `rgba(20,40,10,.35)`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-L, 0); x.lineTo(L, 0); x.stroke(); x.restore(); }
  const tex = ctex(c); const cards = []; for (let k = 0; k < 6; k++) { const g = new THREE.PlaneGeometry(2.2, 2.0); g.translate(0, .82, 0); g.rotateY(k / 6 * Math.PI); if (k > 2) g.rotateX((rnd() - .5) * .5); cards.push(g); } const top = new THREE.PlaneGeometry(2.0, 2.0); top.rotateX(-Math.PI / 2); top.translate(0, 1.45, 0); cards.push(top);
  const g = mergeGeometries(cards); const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: .45, side: THREE.DoubleSide, roughness: .8, color: 0xffffff, envMapIntensity: .6 });
  const im = new THREE.InstancedMesh(g, m, spots.length), o = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach((s2, i) => { o.position.set(s2[0], s2[1] - .15, s2[2]); o.rotation.set(0, rnd() * 6.28, 0); o.scale.set(s2[3], s2[3] * (.65 + rnd() * .3), s2[3]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); col.setHSL(.22 + rnd() * .06, .3 + rnd() * .2, .55 + rnd() * .2); im.setColorAt(i, col); });
  im.customDepthMaterial = new THREE.MeshDepthMaterial({ map: tex, alphaTest: .45, depthPacking: THREE.RGBADepthPacking });
  im.castShadow = im.receiveShadow = true; scene.add(im); return im;
};

/* ================= the pavilion, stack, hall, wings ================= */
export const buildArchitecture = (scene, lib, Q, U, renderer) => {
  const plaster = lib.mat('plaster', .42, { color: new THREE.Color(1.62, 1.56, 1.47), roughness: 1 }), plasterIn = lib.mat('plaster', .42, { color: 0x3a3d44, roughness: 1, envMapIntensity: .25 }),
    coral = lib.mat('coral', .45, { color: new THREE.Color(1.25, 1.2, 1.14) }), marble = lib.mat('marble', .26, { color: new THREE.Color(1.18, 1.14, 1.08), roughness: .8 }), wood = lib.mat('wood', [.6, .6], { color: 0xc8b49a }),
    concrete = lib.mat('concrete', .25, { roughness: .4, color: 0x9a9da3, envMapIntensity: .15 });
  const G = {}; const add = (key, g) => { (G[key] = G[key] || []).push(g.index ? g.toNonIndexed() : g); };
  const NIGHT = [];
  /* plinth with coral sides and marble top */
  const plinth = (cx, cz, w, d) => { const g = boxM(w, .55, d); place(g, cx, PT - .275, cz); const ge = g.toNonIndexed(); const groups = g.groups; groups.forEach(gr => { const part = new THREE.BufferGeometry(); ['position', 'normal', 'uv'].forEach(a => { const src = ge.attributes[a]; part.setAttribute(a, new THREE.BufferAttribute(src.array.slice(gr.start * src.itemSize, (gr.start + gr.count) * src.itemSize), src.itemSize)); }); add(gr.materialIndex === 2 ? 'marble' : 'coral', part); }); };
  plinth(0, 0, 34, 34); plinth(22.5, 0, 15, 16.5); plinth(-22.5, 0, 15, 16.5);
  for (let k = 0; k < 3; k++) { const g = boxM(7 - k * .0, .18, 1.1); place(g, 0, PT - .55 + .18 * (k + .5) - .02, 17.55 + (2 - k) * 1.1 - 1.1); add('marble', g); }
  /* arcade: inner and outer arched facades */
  const H = 5.4, T = .55;
  const fac = (L, n, span, x, z, ry, opt) => { const g = archWall(L, H, T, n, span, 3.1, opt); g.rotateY(ry); g.translate(x, PT, z); add('plaster', g); };
  fac(30, 7, 2.75, 0, 15 - T / 2, 0); fac(30, 7, 2.75, 0, -15 + T / 2, 0); fac(28.9, 7, 2.75, 15 - T / 2, 0, Math.PI / 2); fac(28.9, 7, 2.75, -15 + T / 2, 0, Math.PI / 2);
  fac(23.1, 5, 2.85, 0, 11 + T / 2, 0); fac(23.1, 5, 2.85, 0, -11 - T / 2, 0); fac(22, 5, 2.85, 11 + T / 2, 0, Math.PI / 2); fac(22, 5, 2.85, -11 - T / 2, 0, Math.PI / 2);
  /* roof ring, cornice and parapets */
  const RY = PT + H; [[0, 13, 30, 4], [0, -13, 30, 4], [13, 0, 4, 22], [-13, 0, 4, 22]].forEach(([x, z, w, d]) => { add('plaster', place(boxM(w, .55, d), x, RY + .275, z)); });
  [[0, 15.1, 30.6, .5], [0, -15.1, 30.6, .5], [15.1, 0, .5, 29.6], [-15.1, 0, .5, 29.6]].forEach(([x, z, w, d]) => add('plaster', place(boxM(w, .22, d), x, RY + .1, z)));
  [[0, 14.85, 30, .3], [0, -14.85, 30, .3], [14.85, 0, .3, 29.4], [-14.85, 0, .3, 29.4]].forEach(([x, z, w, d]) => add('plaster', place(boxM(w, .75, d), x, RY + .55 + .375, z)));
  [[0, 11.15, 22.6, .25], [0, -11.15, 22.6, .25], [11.15, 0, .25, 22.1], [-11.15, 0, .25, 22.1]].forEach(([x, z, w, d]) => add('plaster', place(boxM(w, .5, d), x, RY + .55 + .25, z)));
  /* raised pool */
  [[0, 6.75, 14, .5], [0, -6.75, 14, .5], [6.75, 0, .5, 13], [-6.75, 0, .5, 13]].forEach(([x, z, w, d]) => add('marble', place(boxM(w, .5, d), x, PT + .25, z)));
  /* server hall (north) */
  const HZ0 = -15, HZ1 = -30.5, HL = HZ0 - HZ1, HC = (HZ0 + HZ1) / 2;
  [[11 - .25, 'e'], [-11 + .25, 'w']].forEach(([x]) => { add('plaster', place(boxM(.5, H, HL), x, PT + H / 2, HC)); add('plasterIn', place(boxM(.12, H - .1, HL - .7), x - Math.sign(x) * .31, PT + H / 2, HC)); add('coral', place(boxM(.6, .9, HL + .1), x + Math.sign(x) * .05, PT + .45, HC)); });
  { const g = archWall(22, H, .5, 1, 3.2, 2.4); g.translate(0, PT, HZ1 + .25); add('plaster', g); const gi = archWall(21.3, H - .1, .12, 1, 3.2, 2.4); gi.translate(0, PT, HZ1 + .25 + .31); add('plasterIn', gi);
    const cb = archWall(22.1, .9, .6, 1, 3.2, 5); cb.translate(0, PT, HZ1 + .2); add('coral', cb); }
  add('plaster', place(boxM(22, .55, HL), 0, RY + .275, HC)); add('plasterIn', place(boxM(21.2, .06, HL - .7), 0, RY - .04, HC));
  [[0, HZ1 - .15, 22.6, .3], [11.15, HC, .3, HL], [-11.15, HC, .3, HL]].forEach(([x, z, w, d]) => add('plaster', place(boxM(w, .75, d), x, RY + .55 + .375, z)));
  add('concrete', place(boxM(21.3, .06, HL - .6), 0, PT + .03, HC - .1));
  /* east map pavilion: columns and timber pergola */
  const colG = new THREE.CylinderGeometry(.3, .34, 8.3, 20); [[16.3, 7.4], [16.3, -7.4], [22.6, 7.4], [22.6, -7.4], [29, 7.4], [29, -7.4], [29, 0]].forEach(([x, z]) => { add('plaster', colG.clone().translate(x, PT + 4.15, z)); add('coral', place(boxM(.95, .55, .95), x, PT + .275, z)); });
  [[16.3, 15.6], [22.6, 15.6], [29, 15.6]].forEach(([x, d]) => add('wood', place(boxM(.36, .55, d), x, PT + 8.5, 0)));
  for (let z = -7.2; z <= 7.21; z += .55) add('wood', place(boxM(13.4, .26, .13), 22.65, PT + 8.9, z));
  /* west solar terrace frame */
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: .7, roughness: .45 });
  const sG = []; [[-17, -6.6], [-17, 0], [-17, 6.6], [-28.2, -6.6], [-28.2, 0], [-28.2, 6.6]].forEach(([x, z]) => sG.push(place(boxM(.2, 4.4, .2), x, PT + 2.2, z)));
  [-6.6, 0, 6.6].forEach(z => sG.push(place(boxM(11.6, .22, .16), -22.6, PT + 4.35, z))); [-17, -28.2].forEach(x => sG.push(place(boxM(.16, .22, 13.4), x, PT + 4.45, 0)));
  /* south path */
  add('marble', place(boxM(4.2, .14, 27.5), 0, 1.4, 31.3));
  /* merge per material */
  const MATS = { plaster, plasterIn, coral, marble, wood, concrete };
  for (const k in G) { const g = mergeGeometries(G[k].map(x => { const y = x.index ? x.toNonIndexed() : x; ['uv1', 'uv2'].forEach(a => y.deleteAttribute(a)); return y; }), false); if (!g) continue; const m = new THREE.Mesh(g, MATS[k]); m.castShadow = m.receiveShadow = true; scene.add(m); }
  { const m = new THREE.Mesh(mergeGeometries(sG), steel); m.castShadow = m.receiveShadow = true; scene.add(m); }

  /* ---- solar panels ---- */
  { const [c, x] = canvas(256, 512); x.fillStyle = '#c9ced6'; x.fillRect(0, 0, 256, 512); x.fillStyle = '#0f1d33'; for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) x.fillRect(8 + i * 40.5, 8 + j * 49.6, 38, 47); x.strokeStyle = 'rgba(180,200,230,.25)'; x.lineWidth = 1; for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) { x.beginPath(); x.moveTo(8 + i * 40.5 + 19, 8 + j * 49.6); x.lineTo(8 + i * 40.5 + 19, 8 + j * 49.6 + 47); x.stroke(); }
    const pm = new THREE.MeshPhysicalMaterial({ map: ctex(c), metalness: .35, roughness: .22, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.2 });
    const pg = new THREE.BoxGeometry(1.02, .045, 1.72), pmats = [steel, steel, pm, steel, steel, steel]; const n = 10 * 7, im = new THREE.InstancedMesh(pg, pmats, n), o = new THREE.Object3D(); let i = 0;
    for (let r = 0; r < 7; r++) for (let k = 0; k < 10; k++) { o.position.set(-27.7 + k * 1.05, PT + 4.62, -5.8 + r * 1.69); o.rotation.set(-.21, 0, 0); o.updateMatrix(); im.setMatrixAt(i++, o.matrix); }
    im.castShadow = im.receiveShadow = true; scene.add(im); }
  /* ---- power room: UPS cabinets, batteries, condensers with spinning fans ---- */
  const fans = [];
  { const cab = new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: .45, metalness: .25 }), [c, x] = canvas(128, 256); x.fillStyle = '#e7e9ec'; x.fillRect(0, 0, 128, 256); x.fillStyle = '#1c2127'; x.fillRect(22, 30, 84, 46); x.fillStyle = '#39d98a'; x.fillRect(30, 40, 30, 6); x.fillStyle = '#7fc8ff'; x.fillRect(30, 52, 50, 4); x.fillRect(30, 62, 40, 4);
    for (let i = 0; i < 14; i++) { x.fillStyle = '#c9ccd1'; x.fillRect(16, 100 + i * 10, 96, 3); } x.fillStyle = '#e2231a'; x.fillRect(22, 236, 40, 6);
    const front = new THREE.MeshStandardMaterial({ map: ctex(c), roughness: .4, metalness: .2, emissiveMap: ctex(c), emissive: 0xffffff, emissiveIntensity: .12 }); NIGHT.push([front, .12, .8]);
    const g = new THREE.BoxGeometry(.8, 2, .62); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(g, [cab, cab, cab, cab, front, cab]); m.position.set(-20.8 + k * .86, PT + 1, -7.7); m.castShadow = m.receiveShadow = true; scene.add(m); }
    const [gc, gx] = canvas(256, 256); gx.fillStyle = '#d9dcdf'; gx.fillRect(0, 0, 256, 256); gx.fillStyle = '#1b1f24'; gx.beginPath(); gx.arc(128, 128, 104, 0, 7); gx.fill(); gx.strokeStyle = '#9aa1a8'; gx.lineWidth = 3; for (let r = 20; r < 104; r += 12) { gx.beginPath(); gx.arc(128, 128, r, 0, 7); gx.stroke(); } for (let a = 0; a < 8; a++) { gx.beginPath(); gx.moveTo(128, 128); gx.lineTo(128 + Math.cos(a * .785) * 104, 128 + Math.sin(a * .785) * 104); gx.stroke(); }
    const top = new THREE.MeshStandardMaterial({ map: ctex(gc), roughness: .5, metalness: .3, transparent: true, alphaTest: .1 }), blade = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: .5 });
    const ug = new THREE.BoxGeometry(1.25, 1.05, 1.25); for (let k = 0; k < 3; k++) { const x0 = -27.8 + k * 1.45, z0 = -7.5; const u = new THREE.Mesh(ug, [cab, cab, top, cab, cab, cab]); u.position.set(x0, PT + .53, z0); u.castShadow = u.receiveShadow = true; scene.add(u);
      const f = new THREE.Group(); for (let b = 0; b < 4; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(.48, .015, .14), blade); bl.position.x = .24; const h = new THREE.Group(); h.rotation.y = b * Math.PI / 2; bl.rotation.x = .35; h.add(bl); f.add(h); } f.position.set(x0, PT + 1.0, z0); scene.add(f); fans.push(f); } }

  /* ---- the stack: five slabs in the pool, wrapped in a glass security shell ---- */
  const stack = { slabs: [], seams: [], base: V(0, PT + .3, 0) };
  { const dark = new THREE.MeshStandardMaterial({ color: 0x1d2027, metalness: .75, roughness: .28 }), cap = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: .9, roughness: .15 });
    const base = new THREE.Mesh(boxM(4.4, .55, 4.4), coral); base.position.set(0, PT + .55, 0); base.castShadow = base.receiveShadow = true; scene.add(base);
    const label = (txt, n) => { const [c, x] = canvas(1024, 176); const g = x.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, '#1a1d23'); g.addColorStop(1, '#23272f'); x.fillStyle = g; x.fillRect(0, 0, 1024, 176);
      for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * .025})`; x.fillRect(rnd() * 1024, rnd() * 176, 40 + rnd() * 120, 1); }
      x.fillStyle = '#e2231a'; x.font = '600 34px -apple-system, Helvetica, Arial'; x.fillText('0' + n, 70, 104); x.fillStyle = 'rgba(235,228,220,.92)'; x.font = '500 40px -apple-system, Helvetica, Arial'; x.letterSpacing = '6px'; x.fillText(txt.toUpperCase(), 150, 104);
      const [e, ex] = canvas(1024, 176); ex.fillStyle = '#000'; ex.fillRect(0, 0, 1024, 176); ex.fillStyle = '#e2231a'; ex.font = '600 34px -apple-system, Helvetica, Arial'; ex.fillText('0' + n, 70, 104); ex.fillStyle = '#bbb'; ex.font = '500 40px -apple-system, Helvetica, Arial'; ex.letterSpacing = '6px'; ex.fillText(txt.toUpperCase(), 150, 104); return [ctex(c), ctex(e)]; };
    const names = ['Power & Cooling', 'Servers & Storage', 'Virtualization', 'Network', 'Unified Comms'];
    names.forEach((nm, i) => { const [t, e] = label(nm, i + 1), face = new THREE.MeshStandardMaterial({ map: t, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: .25, metalness: .6, roughness: .3 }); NIGHT.push([face, .25, .9]);
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.6, .62, 3.6), [dark, dark, cap, dark, face, face]); const y = PT + .82 + .07 + .31 + i * .76; m.position.set(0, y, 0); m.castShadow = m.receiveShadow = true; scene.add(m); stack.slabs.push({ m, y, face });
      const sm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a1c, emissiveIntensity: 1.2 }); const s = new THREE.Mesh(new THREE.BoxGeometry(3.42, .1, 3.42), sm); s.position.set(0, y + .31 + .07, 0); scene.add(s); stack.seams.push(sm); });
    const sm0 = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a1c, emissiveIntensity: 1.2 }); const s0 = new THREE.Mesh(new THREE.BoxGeometry(3.42, .1, 3.42), sm0); s0.position.set(0, PT + .86, 0); scene.add(s0); stack.seams.unshift(sm0);
    const topY = PT + .82 + 5 * .76 + .07; const capM = new THREE.Mesh(new THREE.BoxGeometry(3.7, .08, 3.7), cap); capM.position.set(0, topY + .04, 0); scene.add(capM);
    /* glass shell */
    const shell = new THREE.Mesh(new THREE.BoxGeometry(4.3, topY - PT - .7, 4.3), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: .05, transparent: true, opacity: .1, envMapIntensity: 1.6, clearcoat: 1, depthWrite: false })); shell.position.set(0, (topY + PT + .82) / 2 + .02, 0); shell.renderOrder = 4; scene.add(shell);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, .5, .4), transparent: true, opacity: .65 })); edge.position.copy(shell.position); scene.add(edge); stack.shell = shell; stack.edge = edge; stack.topY = topY; }

  /* ---- pool water ---- */
  let pool;
  { const geo = new THREE.PlaneGeometry(13, 13); geo.rotateX(-Math.PI / 2);
    if (Q.hi) { pool = new Reflector(geo, { textureWidth: 1024, textureHeight: 1024, clipBias: .003, multisample: 0, shader: { name: 'Pool', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
      vertexShader: 'uniform mat4 textureMatrix;varying vec4 vR;varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vR=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: `uniform sampler2D tDiffuse;uniform float uT,uNight;varying vec4 vR;varying vec3 vW;
        void main(){vec2 p=vW.xz;vec2 g=vec2(sin(p.x*2.1+uT*1.3)+sin(p.y*2.7-uT*1.1),cos(p.y*1.9+uT*1.5)+sin((p.x+p.y)*3.3+uT))*.012;
        vec3 V=normalize(cameraPosition-vW);float fr=.04+.96*pow(1.-max(V.y,0.),4.);vec3 refl=texture2D(tDiffuse,vR.xy/vR.w+g).rgb;
        vec3 body=mix(vec3(.04,.22,.25),vec3(.1,.55,.6),.4);body+=vec3(.15,.75,.85)*uNight*1.2*(.8+.2*sin(p.x*3.+uT));
        vec3 c=mix(body*(.55+.45*(1.-uNight)),refl,clamp(.45+fr*.5,0.,.92)*(1.-uNight*.35));gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }` } }); Object.assign(pool.material.uniforms, { uT: U.uT, uNight: U.uNight }); }
    else pool = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x0d4a52, metalness: .2, roughness: .05, envMapIntensity: 1.4, emissive: 0x1aa6b8, emissiveIntensity: 0 }));
    pool.position.set(0, PT + .42, 0); scene.add(pool); }

  /* ---- server hall interior: racks, trays, light ---- */
  const racks = {};
  { const [c, x] = canvas(256, 1024), [e, ex] = canvas(256, 1024); x.fillStyle = '#0f1115'; x.fillRect(0, 0, 256, 1024); ex.fillStyle = '#000'; ex.fillRect(0, 0, 256, 1024);
    for (let u = 0; u < 42; u++) { const y = 40 + u * 22.5; x.fillStyle = u % 7 === 0 ? '#1b1f26' : '#15181d'; x.fillRect(14, y, 228, 20); x.fillStyle = '#0a0b0d'; for (let i = 0; i < 26; i++) x.fillRect(60 + i * 6.8, y + 4, 3, 12);
      if (rnd() < .85) { const n = 2 + (rnd() * 4 | 0); for (let k = 0; k < n; k++) { const col = ['#3cff8f', '#5ac8ff', '#ffb648', '#ff3b30'][rnd() < .7 ? (rnd() < .5 ? 0 : 1) : (rnd() < .7 ? 2 : 3)]; ex.fillStyle = col; ex.fillRect(22 + k * 8, y + 8, 4, 4); x.fillStyle = col; x.fillRect(22 + k * 8, y + 8, 4, 4); } } }
    x.fillStyle = '#e2231a'; x.fillRect(14, 14, 50, 6); ex.fillStyle = '#e2231a'; ex.fillRect(14, 14, 50, 6); x.fillStyle = '#c8ccd2'; x.font = '600 15px -apple-system, Helvetica'; x.fillText('ROSEWARE', 150, 22); ex.fillStyle = '#888'; ex.font = '600 15px -apple-system, Helvetica'; ex.fillText('ROSEWARE', 150, 22);
    const front = new THREE.MeshStandardMaterial({ map: ctex(c), emissiveMap: ctex(e), emissive: 0xffffff, emissiveIntensity: 2.2, metalness: .5, roughness: .4 });
    front.onBeforeCompile = s => { s.uniforms.uT = U.uT; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {vec2 cell=floor(vEmissiveMapUv*vec2(32.,46.));float h=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);totalEmissiveRadiance*=.25+.75*step(.3,fract(h*7.+uT*(.6+h*3.)));}`); };
    const body = new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: .6, roughness: .4 });
    const g = new THREE.BoxGeometry(1.15, 2.25, .62), N = 7, im = new THREE.InstancedMesh(g, [front, body, body, body, body, body], N * 2), o = new THREE.Object3D(); let i = 0;
    for (const side of [-1, 1]) for (let k = 0; k < N; k++) { o.position.set(side * 1.58, PT + 1.15, -17.7 - k * .64); o.rotation.set(0, side < 0 ? 0 : Math.PI, 0); o.updateMatrix(); im.setMatrixAt(i++, o.matrix); }
    im.castShadow = true; im.receiveShadow = true; scene.add(im); racks.front = front;
    /* LED light spill on the polished floor */
    const spill = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uNight: U.uNight }, vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vU;void main(){float a=(1.-vU.x)*(1.-vU.x)*smoothstep(0.,.08,vU.y)*smoothstep(1.,.92,vU.y);gl_FragColor=vec4(vec3(.25,.55,1.)*a*.22,1.);}' });
    for (const side of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.6), spill); p.rotation.x = -Math.PI / 2; if (side > 0) p.rotation.z = Math.PI; p.position.set(side * .45, PT + .07, -21.55); scene.add(p); }
    /* overhead cable trays and light strips */
    const tray = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: .6, roughness: .5 }); for (const side of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(.5, .08, 11), tray); t.position.set(side * 1.58, PT + 2.85, -21.5); scene.add(t); }
    const strip = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xeaf2ff, emissiveIntensity: 3.2 }); for (const x of [-3.6, 0, 3.6]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.16, .05, 12), strip); s.position.set(x, RY - .1, -22.5); scene.add(s); }
    for (const z of [-19, -26]) { const l = new THREE.PointLight(0xdfe9ff, Q.hi ? 26 : 18, 16, 2); l.position.set(0, RY - .6, z); scene.add(l); }
    /* RoseWare wall sign above the far door, inside */
    racks.signZ = HZ1 + .5; }

  /* ---- map table (east pavilion) ---- */
  const map = { pins: [] };
  { const MX = 22.65, MZ = 0, top = PT + .87, S = .0108, cx = 180, cy = 333;
    map.toW = (sx, sy) => V(MX + (sx - cx) * S, top + .012, MZ + (sy - cy) * S); map.top = top; map.center = V(MX, top, MZ);
    const W = 1024, Hh = 2048, [c, x] = canvas(W, Hh), k = Hh / (6.9 / S), ox = W / 2 - cx * k, oy = Hh / 2 - cy * k, P = (sx, sy) => [ox + sx * k, oy + sy * k];
    const g = x.createRadialGradient(W / 2, Hh / 2, 100, W / 2, Hh / 2, Hh * .7); g.addColorStop(0, '#0f3a52'); g.addColorStop(1, '#06182a'); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(160,220,255,${rnd() * .035})`; x.fillRect(rnd() * W, rnd() * Hh, 2, 2); }
    x.strokeStyle = 'rgba(214,170,120,.14)'; x.lineWidth = 1; for (let i = 0; i < 26; i++) { x.beginPath(); x.moveTo(0, i * 80); x.lineTo(W, i * 80); x.stroke(); } for (let i = 0; i < 13; i++) { x.beginPath(); x.moveTo(i * 80, 0); x.lineTo(i * 80, Hh); x.stroke(); }
    REEF.forEach(r => { x.beginPath(); r.P.forEach((q, i) => { const [a, b] = P(q[0], q[1]); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.fillStyle = 'rgba(64,190,200,.26)'; x.fill(); x.strokeStyle = 'rgba(150,240,235,.75)'; x.lineWidth = 1.6; x.stroke(); });
    ISL.forEach(s => { const [a, b] = P(s.x, s.y); x.save(); x.translate(a, b); x.rotate(s.r); x.fillStyle = '#f1e6cf'; x.beginPath(); x.ellipse(0, 0, Math.max(1.4, s.a * k), Math.max(1.2, s.b * k), 0, 0, 7); x.fill(); x.restore(); });
    x.fillStyle = 'rgba(232,200,160,.85)'; x.font = '500 17px Georgia, serif'; x.letterSpacing = '3px'; AT.forEach(h => { if (h[0] === 'male') return; const [a, b] = P(h[2], h[3]); x.textAlign = h[2] > 185 ? 'left' : 'right'; x.fillText(h[1].toUpperCase(), a + (h[2] > 185 ? 1 : -1) * (h[4] * k + 14), b + 6); });
    x.textAlign = 'center'; x.fillStyle = 'rgba(232,200,160,.9)'; x.font = '400 46px Georgia, serif'; x.letterSpacing = '18px'; x.fillText('MALDIVES', W / 2 + 230, 140); x.font = '400 20px Georgia, serif'; x.letterSpacing = '6px'; x.fillText('ROSEWARE · PROJECTS ACROSS THE ATOLLS', W / 2 + 230, 180);
    x.save(); x.translate(150, 1820); x.strokeStyle = 'rgba(232,200,160,.8)'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 60, 0, 7); x.stroke(); x.beginPath(); x.moveTo(0, -78); x.lineTo(12, 0); x.lineTo(0, 78); x.lineTo(-12, 0); x.closePath(); x.stroke(); x.fillStyle = 'rgba(232,200,160,.9)'; x.font = '500 22px Georgia'; x.fillText('N', 0, -88); x.restore();
    const mt = ctex(c); mt.anisotropy = 16;
    const mm = new THREE.MeshPhysicalMaterial({ map: mt, roughness: .32, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, emissiveMap: mt, emissive: 0xffffff, emissiveIntensity: .05 }); NIGHT.push([mm, .05, .32]);
    const base = new THREE.Mesh(boxM(3.5, .86, 7.25), marble); base.position.set(MX, PT + .43, MZ); base.castShadow = base.receiveShadow = true; scene.add(base);
    const topm = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 6.95), mm); topm.rotation.x = -Math.PI / 2; topm.position.set(MX, top + .002, MZ); topm.receiveShadow = true; scene.add(topm); map.mesh = topm;
    const brass = new THREE.MeshStandardMaterial({ color: 0xd9a27a, metalness: 1, roughness: .25 }), glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3a2a, emissiveIntensity: 3 });
    const beamM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: U.uT, uA: { value: 1 } }, vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform float uT,uA;varying vec2 vU;void main(){float a=(1.-vU.y)*(.6+.4*sin(vU.y*20.-uT*3.));gl_FragColor=vec4(vec3(1.,.25,.18)*a*.55*uA,1.);}' });
    const sites = [['male', 204.1, 251.7], ['kv', ISL[I_KV].x, ISL[I_KV].y], ['kh', ISL[I_KH].x, ISL[I_KH].y]];
    sites.forEach(([id, sx, sy]) => { const p = map.toW(sx, sy), grp = new THREE.Group(); grp.position.copy(p);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .32, 10), brass); stem.position.y = .16; const head = new THREE.Mesh(new THREE.SphereGeometry(.045, 20, 12), glow); head.position.y = .34;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.02, .09, 1.4, 16, 1, true), beamM); beam.position.y = 1.05; const ring = new THREE.Mesh(new THREE.RingGeometry(.05, .07, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, .5, .4), transparent: true, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .004;
      grp.add(stem, head, beam, ring); stem.castShadow = true; scene.add(grp); map.pins.push({ id, grp, head, ring, beam, P: p.clone().add(V(0, .36, 0)) }); });
    map.beamM = beamM;
    /* atoll highlight ring (explore) */
    map.hl = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.2, .8), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); map.hl.rotation.x = -Math.PI / 2; map.hl.position.set(MX, top + .01, MZ); scene.add(map.hl); }

  /* ---- lanterns along the path ---- */
  { const bulbM = new THREE.MeshStandardMaterial({ color: 0xfff2dd, emissive: 0xffb45e, emissiveIntensity: .1, roughness: .3 }); NIGHT.push([bulbM, .05, 6]);
    const gs = [], bs = []; for (let z = 20; z <= 44; z += 4) for (const x of [-2.7, 2.7]) { gs.push(place(boxM(.32, .62, .32), x, 1.62, z)); bs.push(place(new THREE.BoxGeometry(.24, .2, .24), x, 2.03, z)); }
    const m = new THREE.Mesh(mergeGeometries(gs), coral); m.castShadow = true; scene.add(m); scene.add(new THREE.Mesh(mergeGeometries(bs), bulbM)); }
  /* ---- courtyard night lights ---- */
  const nightLights = [];
  for (const [x, z] of [[-8.5, 8.5], [8.5, -8.5]]) { const l = new THREE.PointLight(0xffc68a, 0, 22, 2); l.position.set(x, PT + 3.2, z); scene.add(l); nightLights.push([l, Q.hi ? 30 : 20]); }
  { const l = new THREE.PointLight(0x8fe8ff, 0, 14, 2); l.position.set(0, PT + .9, 0); scene.add(l); nightLights.push([l, 14]); }
  /* arcade uplights: small glowing discs at the pier bases on the inner facades */
  { const um = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc27a, emissiveIntensity: 0 }); NIGHT.push([um, 0, 5]); const gs = [];
    const piers = (L, n, f) => { const pitch = L / n; for (let i = 0; i <= n; i++) { const t = -L / 2 + pitch * i; f(t); } };
    piers(23.1, 5, t => { gs.push(place(new THREE.CylinderGeometry(.1, .1, .03, 12), t, PT + .02, 10.85)); gs.push(place(new THREE.CylinderGeometry(.1, .1, .03, 12), t, PT + .02, -10.85)); });
    piers(22, 5, t => { gs.push(place(new THREE.CylinderGeometry(.1, .1, .03, 12), 10.85, PT + .02, t)); gs.push(place(new THREE.CylinderGeometry(.1, .1, .03, 12), -10.85, PT + .02, t)); });
    scene.add(new THREE.Mesh(mergeGeometries(gs), um)); }
  return { stack, pool, racks, map, fans, NIGHT, nightLights, mats: { plaster, coral, marble, wood, steel } };
};

/* ================= jetty, dhoni, water villas ================= */
export const buildCoast = (scene, lib, Q, U, mats) => {
  const NIGHT = [], wood = lib.mat('wood', [1 / 3.2, 1 / 3.2], { color: 0xc9b59c }), post = new THREE.MeshStandardMaterial({ color: 0x6d5a48, roughness: .9 });
  const deckG = []; const z0 = 41, z1 = 168, L = z1 - z0;
  { const g = new THREE.BoxGeometry(3.2, .16, L); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3.2, uv.getY(i) * L); place(g, 0, 1.35, (z0 + z1) / 2); deckG.push(g); }
  { const g = boxM(11, .16, 9); place(g, 0, 1.35, z1 + 4.5); deckG.push(g); }
  const deck = new THREE.Mesh(mergeGeometries(deckG), wood); deck.castShadow = deck.receiveShadow = true; scene.add(deck);
  const pg = new THREE.CylinderGeometry(.11, .13, 4.2, 8), ps = []; for (let z = z0 + 2; z <= z1 + 9; z += 3) for (const x of [-1.5, 1.5]) ps.push([x, z]); [[-5.3, z1 + 1], [5.3, z1 + 1], [-5.3, z1 + 8.6], [5.3, z1 + 8.6]].forEach(q => ps.push(q));
  const pm = new THREE.InstancedMesh(pg, post, ps.length), o = new THREE.Object3D(); ps.forEach((q, i) => { o.position.set(q[0], -.75, q[1]); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); }); pm.castShadow = true; scene.add(pm);
  /* lamp posts along the jetty */
  const bulb = new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffb562, emissiveIntensity: .1 }); NIGHT.push([bulb, .05, 7]); const lp = [], lb = [];
  for (let z = z0 + 6; z <= z1; z += 9) for (const x of [-1.52, 1.52]) { lp.push(place(new THREE.CylinderGeometry(.045, .055, 1.1, 8), x, 1.98, z)); lb.push(place(new THREE.SphereGeometry(.11, 12, 8), x, 2.6, z)); }
  { const m = new THREE.Mesh(mergeGeometries(lp), mats.steel); m.castShadow = true; scene.add(m); scene.add(new THREE.Mesh(mergeGeometries(lb), bulb)); }
  /* thatched gazebo at the end */
  const thatch = (() => { const [c, x] = canvas(256, 256); x.fillStyle = '#9c7a4a'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { const v = 120 + rnd() * 90 | 0; x.strokeStyle = `rgba(${v},${v * .78 | 0},${v * .48 | 0},.55)`; x.lineWidth = 1 + rnd() * 1.5; const px = rnd() * 256, py = rnd() * 256; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - .5) * 6, py + 16 + rnd() * 20); x.stroke(); } const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); return new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: 0xe8d7b8 }); })();
  const hip = (w, h) => { const g = new THREE.ConeGeometry(w * .72, h, 4, 1, true); g.rotateY(Math.PI / 4); return g; };
  { const gz = new THREE.Group(); [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, 3, 8), post); p.position.set(x, 1.5, z); p.castShadow = true; gz.add(p); });
    const r = new THREE.Mesh(hip(7.6, 2.4), thatch); r.position.y = 4.1; r.castShadow = true; gz.add(r); gz.position.set(0, 1.43, z1 + 4.5); scene.add(gz); }
  /* dhoni moored alongside */
  { const g = new THREE.BoxGeometry(2.6, 1.1, 10, 4, 4, 30), p = g.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = Math.abs(z) / 5, s = 1 - Math.pow(t, 2.4) * .92; x *= s * (y < 0 ? .7 + (y + .55) * .55 : 1); y += Math.pow(t, 2) * .45 + (z > 0 ? Math.pow(t, 4) * 1.1 : Math.pow(t, 4) * .5) * (y > 0 ? 1 : .3); p.setXYZ(i, x, y, z); } g.computeVertexNormals();
    const hull = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .55 })); const boat = new THREE.Group(); boat.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.66, .12, 7.5), new THREE.MeshStandardMaterial({ color: 0x1f5c8a, roughness: .5 })); stripe.position.y = .18; boat.add(stripe);
    const can = new THREE.Mesh(new THREE.BoxGeometry(2.3, .08, 4.2), new THREE.MeshStandardMaterial({ color: 0x2b6aa0, roughness: .8 })); can.position.set(0, 2.2, -1); boat.add(can); [[-1.05, -2.9], [1.05, -2.9], [-1.05, .9], [1.05, .9]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.6, 6), post); p.position.set(x, 1.4, z); boat.add(p); });
    boat.position.set(3.7, .35, 146); boat.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(boat); }
  /* water villas on stilts, east lagoon */
  const glassWarm = new THREE.MeshStandardMaterial({ color: 0x1d2b33, roughness: .08, metalness: .6, emissive: 0xffb36b, emissiveIntensity: 0 }); NIGHT.push([glassWarm, 0, 1.7]);
  const villaG = { plaster: [], wood: [], glass: [], thatch: [], post: [] };
  const walk = []; let prev = V(47.5, 0, -6);
  for (let k = 0; k < 6; k++) { const t = -0.45 + k * .3, cx = 48 + 52 * Math.cos(t), cz = 52 * Math.sin(t) - 6, ry = -t + Math.PI / 2;
    const dg = boxM(9, .3, 7.5); dg.rotateY(ry); dg.translate(cx, 1.25, cz); villaG.wood.push(dg);
    const wg = boxM(6, 2.9, 4.6); wg.translate(0, 0, -.6); wg.rotateY(ry); wg.translate(cx, 2.85, cz); villaG.plaster.push(wg);
    const gl = new THREE.BoxGeometry(5.2, 2.2, .06); gl.translate(0, 0, 1.68); gl.rotateY(ry); gl.translate(cx, 2.6, cz); villaG.glass.push(gl);
    const rf = hip(9.8, 2.8); rf.scale(1.25, 1, 1); rf.rotateY(ry); rf.translate(cx, 5.65, cz); villaG.thatch.push(rf);
    for (const [px, pz] of [[-4, -3.4], [4, -3.4], [-4, 3.4], [4, 3.4], [0, -3.4], [0, 3.4]]) { const pg2 = new THREE.CylinderGeometry(.12, .14, 4, 6); pg2.translate(px, -.8, pz); pg2.rotateY(ry); pg2.translate(cx, 0, cz); villaG.post.push(pg2); }
    const here = V(cx, 0, cz).add(V(Math.cos(t), 0, Math.sin(t)).multiplyScalar(-4.6)); walk.push([prev.clone(), here.clone()]); prev = here; }
  walk.forEach(([a, b]) => { const d = b.clone().sub(a), L2 = d.length(), g = new THREE.BoxGeometry(1.8, .14, L2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.8, uv.getY(i) * L2); g.rotateY(Math.atan2(d.x, d.z)); g.translate((a.x + b.x) / 2, 1.2, (a.z + b.z) / 2); villaG.wood.push(g);
    for (let s = 0; s < L2; s += 3.2) { const q = a.clone().lerp(b, s / L2); const pg2 = new THREE.CylinderGeometry(.09, .1, 3.6, 6); pg2.translate(q.x, -.6, q.z); villaG.post.push(pg2); } });
  const VM = { plaster: mats.plaster, wood, glass: glassWarm, thatch, post };
  for (const k in villaG) { const g = mergeGeometries(villaG[k].map(x => { const y = x.index ? x.toNonIndexed() : x; ['uv1'].forEach(a => y.deleteAttribute(a)); return y; })); const m = new THREE.Mesh(g, VM[k]); m.castShadow = k !== 'glass'; m.receiveShadow = true; scene.add(m); }
  return { NIGHT };
};

/* ================= neighbouring islands ================= */
export const buildFarIslands = (scene, Q, U) => {
  const sand = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: .95 }), green = new THREE.MeshStandardMaterial({ color: 0x3f6a33, roughness: .9 });
  const dome = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const n = FAR.length, a = new THREE.InstancedMesh(dome, sand, n), b = new THREE.InstancedMesh(dome, green, n), o = new THREE.Object3D();
  FAR.forEach((f, i) => { o.position.set(f[0], -.4, f[1]); o.rotation.set(0, i, 0); o.scale.set(f[2], 1.7, f[2] * (.7 + (i % 5) * .08)); o.updateMatrix(); a.setMatrixAt(i, o.matrix); o.position.y = .2; o.scale.set(f[2] * .78, f[2] * .13 + 3, f[2] * .78 * (.7 + (i % 5) * .08)); o.updateMatrix(); b.setMatrixAt(i, o.matrix); });
  a.receiveShadow = b.receiveShadow = true; scene.add(a, b);
  const spots = []; FAR.slice(0, 4).forEach(f => { for (let k = 0; k < 28; k++) { const t = rnd() * 6.28, r = Math.sqrt(rnd()) * f[2] * .8; spots.push([f[0] + Math.cos(t) * r, 1.2, f[1] + Math.sin(t) * r, rnd() * 6.28, .9 + rnd() * .5]); } });
  return spots;
};

/* ================= fibre links and the security dome ================= */
export const buildNetwork = (scene, U) => {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: U.uT, uA: U.uNet },
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float uT,uA;varying vec2 vU;void main(){float p=fract(vU.x*6.-uT*.45);float pulse=smoothstep(.0,.04,p)*smoothstep(.12,.04,p);float base=.12;gl_FragColor=vec4(vec3(1.,.22,.14)*(base+pulse*1.6)*uA,1.);}' });
  const from = V(46, .4, -12), lines = [];
  FAR.slice(0, 4).concat(FAR.slice(4).filter((_, i) => i % 3 === 0)).forEach((f, fi) => { const to = V(f[0], .4, f[1]), mid = from.clone().lerp(to, .5); mid.y = 2.5; const c = new THREE.QuadraticBezierCurve3(from, mid, to); const g = new THREE.TubeGeometry(c, 120, 1.1, 6, false); const t = new THREE.Mesh(g, m); t.renderOrder = 6; t.frustumCulled = false; scene.add(t); lines.push(t);
    if (fi >= 4) return; const pil = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, 60, 24, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: U.uT, uA: U.uNet }, vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform float uT,uA;varying vec2 vU;void main(){float a=pow(1.-vU.y,2.)*(.6+.4*sin(vU.y*14.-uT*4.));gl_FragColor=vec4(vec3(1.,.3,.2)*a*.5*uA,1.);}' })); pil.position.set(f[0], 30, f[1]); scene.add(pil); lines.push(pil); });
  return lines;
};
export const buildShield = (scene, U) => {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: U.uT, uA: U.uSec, uHit: U.uHit },
    vertexShader: 'varying vec3 vW,vN;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `uniform float uT,uA;uniform vec4 uHit;varying vec3 vW,vN;
      vec2 hx(vec2 p){vec2 r=vec2(1.,1.732),h=r*.5;vec2 a=mod(p,r)-h,b=mod(p-h,r)-h;return dot(a,a)<dot(b,b)?a:b;}
      void main(){vec3 V=normalize(cameraPosition-vW);float fr=pow(1.-abs(dot(V,vN)),2.2);vec3 d=normalize(vW-vec3(0.,0.,10.));vec2 sp=vec2(atan(d.z,d.x)*44.,asin(d.y)*44.);
      vec2 h=hx(sp);vec2 ah=abs(h);float hxd=max(dot(ah,vec2(.5,.8660254)),ah.x);float e=smoothstep(.43,.495,hxd);
      float scan=exp(-pow(fract(d.y*2.-uT*.15)-.5,2.)*60.);float hd=length(vW-uHit.xyz);float hit=exp(-hd*hd*.0012)*uHit.w;float ring=exp(-pow(hd-fract(uT*.6)*60.,2.)*.01)*uHit.w;
      float a=(fr*.3+e*(.09+fr*.55)+scan*e*.55+hit*(e*1.6+.15)+ring*e*.8)*uA*(1.-smoothstep(.0,.06,-d.y));
      gl_FragColor=vec4(vec3(1.,.28,.2)*a,1.);}` });
  const g = new THREE.SphereGeometry(110, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), s = new THREE.Mesh(g, m); s.position.set(0, 0, 10); s.renderOrder = 7; scene.add(s); return s;
};

/* ================= placement helpers ================= */
export const vegetationSpots = () => {
  const palms = [], shrubs = []; const blocked = (x, z) => (Math.abs(x) < 31 && z > -32 && z < 18) || (Math.abs(x) < 3.6 && z > 15 && z < 48) || (x > 40 && Math.abs(z + 6) < 4);
  for (let i = 0; i < 64; i++) { const th = rnd() * 6.283, e = ISLAND_R(th), r = e - 4.5 - rnd() * 9; const x = Math.cos(th) * r, z = Math.sin(th) * r; if (blocked(x, z)) continue; palms.push([x, terrainHeight(r, th) - .1, z, -th, .85 + rnd() * .35]); }
  for (let i = 0; i < 26; i++) { const x = (rnd() - .5) * 80, z = (rnd() - .5) * 80; const th = Math.atan2(z, x), r = Math.hypot(x, z); if (r > ISLAND_R(th) - 14 || blocked(x, z)) continue; palms.push([x, terrainHeight(r, th) - .1, z, rnd() * 6.28, .8 + rnd() * .4]); }
  for (let z = 22; z <= 44; z += 7) for (const x of [-5.2, 5.2]) palms.push([x, 1.25, z, x < 0 ? Math.PI : 0, .9]);
  for (let i = 0; i < 190; i++) { const th = rnd() * 6.283, e = ISLAND_R(th), r = e - 9 - rnd() * 8; const x = Math.cos(th) * r, z = Math.sin(th) * r; if (blocked(x, z)) continue; shrubs.push([x, terrainHeight(r, th), z, 1.1 + rnd() * 1.5]); }
  return { palms, shrubs };
};
