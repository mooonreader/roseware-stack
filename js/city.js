/* Malé around the building: plaza, street, seawall, neighbouring blocks, the harbour water, and the atoll map seen from high above. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISL, REEF, AT, I_KV, I_KH } from './data.js';
import { SEC } from './hq.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 21; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
export const SHORE = 30;   /* seawall line (three z) */

/* windows drawn procedurally on the blocks; lit windows at night */
const cityMat = (U) => { const m = new THREE.MeshStandardMaterial({ color: 0xf1ece4, roughness: .78, metalness: 0 });
  m.onBeforeCompile = sh => { sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aTint;varying vec3 vWP2;varying vec3 vN2;varying vec3 vTint;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP2=(modelMatrix*vec4(transformed,1.)).xyz;vN2=normalize(mat3(modelMatrix)*objectNormal);vTint=aTint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;varying vec3 vWP2;varying vec3 vN2;varying vec3 vTint;float hc(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*45758.5);}')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb*=vTint;
        float side=1.-step(.7,abs(vN2.y));float u=abs(vN2.x)>.5?vWP2.z:vWP2.x;vec2 c=vec2(u/1.6,vWP2.y/3.2);vec2 f=fract(c);
        float win=side*step(.18,f.x)*step(f.x,.82)*step(.3,f.y)*step(f.y,.82)*step(1.,vWP2.y);
        float lit=step(.58,hc(floor(c)+floor(vWP2.xz*.03)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.22,.27,.31),win*.7);
        vec3 winGlow=win*lit*vec3(1.,.72,.42)*uNight*1.6;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=winGlow;'); };
  return m; };

export const buildCity = (scene, U, Q, TL) => {
  const G = new THREE.Group(); G.name = 'city'; scene.add(G);
  /* paving, street, seawall: one ground slab with the building plot cut out (the soil block shows through it in section) */
  const tex = (slot, rep) => { const t = TL.load(`assets/tex/${slot}_diff.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; return t; };
  const pave = new THREE.MeshStandardMaterial({ color: 0xf3eee6, roughness: .85, map: tex('concrete', 90) });
  const road = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: .9, map: tex('concrete', 40) });
  const sh = new THREE.Shape(); sh.moveTo(-260, -260); sh.lineTo(260, -260); sh.lineTo(260, SHORE); sh.lineTo(-260, SHORE); sh.closePath();
  const hole = new THREE.Path(); hole.moveTo(-12.4, -8.4); hole.lineTo(-12.4, 8.4); hole.lineTo(12.4, 8.4); hole.lineTo(12.4, -8.4); hole.closePath(); sh.holes.push(hole);
  const gGeo = new THREE.ShapeGeometry(sh); gGeo.rotateX(Math.PI / 2); /* shape y -> -z after rotation; flip to keep north = -z */
  { const p = gGeo.attributes.position, uv = gGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 520, p.getZ(i) / 520); }
  const ground = new THREE.Mesh(gGeo, pave); ground.receiveShadow = true; ground.material.side = THREE.DoubleSide; G.add(ground);
  ground.material.clippingPlanes = [SEC.fac];
  /* fix normals to +y */
  { const n = gGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  const st = new THREE.Mesh(new THREE.PlaneGeometry(520, 9).rotateX(-Math.PI / 2), road); st.position.set(0, .01, 21.5); st.receiveShadow = true; G.add(st);
  /* kerb + red cycle line, seawall, bollards */
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: .6 }), red = new THREE.MeshStandardMaterial({ color: 0xe2231a, roughness: .5 });
  const boxes = (m, list) => { const geos = list.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)); const mesh = new THREE.Mesh(mergeGeometries(geos), m); mesh.castShadow = mesh.receiveShadow = true; G.add(mesh); return mesh; };
  boxes(white, [[520, .18, .3, 0, .09, 17], [520, .18, .3, 0, .09, 26], [520, .9, 1.2, 0, .45, SHORE + .1], [520, 2.2, 1.2, 0, -1.1, SHORE + .1]]);
  boxes(red, [[520, .02, .25, 0, .02, 16.4]]);
  const bl = []; for (let x = -60; x <= 60; x += 3.2) bl.push([.18, .8, .18, x, .4, 27.2]); boxes(white, bl);
  /* plaza in front of the building: planters, benches */
  const pl = []; for (const x of [-16, -9, 9, 16]) pl.push([3.2, .6, 3.2, x, .3, 12]); boxes(white, pl);
  /* city blocks: dense Malé, 4-12 storeys, with gaps for streets */
  const geos = [], tints = [];
  const add = (w, h, d, x, z) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z); const pal = [[.08, .2, .86], [.1, .3, .8], [.55, .18, .78], [.02, .35, .78], [.13, .45, .76], [.0, 0, .9], [.33, .15, .78]]; const q = pal[rnd() * pal.length | 0]; const c = new THREE.Color().setHSL(q[0] + rnd() * .02, q[1] * (.7 + rnd() * .5), q[2] + rnd() * .06); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('aTint', new THREE.BufferAttribute(a, 3)); geos.push(g);
    if (rnd() < .5) { const t = new THREE.CylinderGeometry(.8, .8, 1.4, 10).translate(x + (rnd() - .5) * w * .5, h + .7, z + (rnd() - .5) * d * .5); const a2 = new Float32Array(t.attributes.position.count * 3).fill(.95); t.setAttribute('aTint', new THREE.BufferAttribute(a2, 3)); geos.push(t); } };
  for (let bx = -7; bx <= 7; bx++) for (let bz = -8; bz <= 0; bz++) {
    const cx = bx * 26, cz = bz * 26 + 2; if (Math.abs(bx) <= 1 && bz >= -1) continue; if (cz > 8) continue; if (Math.abs(bx) <= 2 && bz === 0) continue;
    for (let i = 0; i < 4; i++) { const w = 7 + rnd() * 5, d = 7 + rnd() * 5, x = cx + (i % 2 ? 5.5 : -5.5), z = cz + (i < 2 ? 5.5 : -5.5); const far = Math.hypot(x, z) / 120; add(w, 9 + rnd() * 18 + Math.min(1.5, far) * rnd() * 16, d, x, z); }
  }
  /* waterfront row to the east and west of the plaza */
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) add(10 + rnd() * 4, 10 + rnd() * 16 + k * 1.5, 12, s * (40 + k * 15), 3 + rnd() * 3);
  const city = new THREE.Mesh(mergeGeometries(geos), cityMat(U)); city.castShadow = city.receiveShadow = true; G.add(city);
  /* palm spots along the waterfront */
  const palms = []; for (let x = -70; x <= 70; x += 7) if (Math.abs(x) > 3) palms.push([x + (rnd() - .5) * 1.5, 0, 24.6 + rnd() * .6, rnd() * 6.28, .55 + rnd() * .2]);
  for (const x of [-16, -9, 9, 16]) palms.push([x, .6, 12, rnd() * 6.28, .6]);
  return { G, palms, city };
};

/* harbour water: deep blue with a shallow band along the seawall */
export const harbourDepth = (DEPTH_HALF) => { const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), S = N / (2 * DEPTH_HALF);
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N); const z0 = N / 2 + SHORE * S; const g = x.createLinearGradient(0, z0, 0, z0 + 90 * S); g.addColorStop(0, 'rgb(120,40,0)'); g.addColorStop(1, 'rgb(0,0,0)'); x.fillStyle = g; x.fillRect(0, z0, N, 90 * S);
  x.fillStyle = 'rgb(255,0,0)'; x.fillRect(0, 0, N, z0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; };

/* ---------- the atoll map, laid on the sea far below when we rise ---------- */
export const MAP_S = 10;   /* metres per map unit */
export const buildMap = (scene, U) => {
  const male = [204.1, 251.7], toW = (sx, sy) => V((sx - male[0]) * MAP_S, 0, (sy - male[1]) * MAP_S);
  const W = 1600, H = 3900, x0 = 120, y0 = 20, sx = 260 / W, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const P = (a, b) => [(a - x0) / sx, (b - y0) / sx];
  x.clearRect(0, 0, W, H);
  { const g = x.createRadialGradient(W * .5, H * .45, 50, W * .5, H * .45, H * .7); g.addColorStop(0, 'rgba(20,70,120,.0)'); g.addColorStop(1, 'rgba(6,24,48,.0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  REEF.forEach(r => { x.beginPath(); r.P.forEach((q, i) => { const [a, b] = P(q[0], q[1]); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.fillStyle = 'rgba(80,215,215,.30)'; x.fill(); x.strokeStyle = 'rgba(190,250,245,.9)'; x.lineWidth = 2.4; x.stroke(); });
  ISL.forEach(s => { const [a, b] = P(s.x, s.y); x.save(); x.translate(a, b); x.rotate(s.r); x.fillStyle = '#fbf3e2'; x.beginPath(); x.ellipse(0, 0, Math.max(3, s.a / sx), Math.max(2.5, s.b / sx), 0, 0, 7); x.fill(); x.restore(); });
  x.font = '500 24px Inter,sans-serif'; x.fillStyle = 'rgba(255,255,255,.75)'; x.textAlign = 'center'; AT.forEach(a => { if (a[0] === 'male') return; const [px, py] = P(a[2] + a[4] + 8, a[3]); x.fillText(a[1].toUpperCase(), px + 40, py); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const wM = W * sx * MAP_S, hM = H * sx * MAP_S; const geo = new THREE.PlaneGeometry(wM, hM).rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  const mesh = new THREE.Mesh(geo, m); const cW = toW(x0 + W * sx / 2, y0 + H * sx / 2); mesh.position.set(cW.x, 1.5, cW.z); mesh.renderOrder = 3; scene.add(mesh);
  /* a deep-ocean backdrop under the map, so the view from altitude reads as a chart */
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x0a2a4a), transparent: true, opacity: 0, depthWrite: false, toneMapped: true }));
  sea.position.set(cW.x, 1.2, cW.z); sea.renderOrder = 2; scene.add(sea);
  /* pins: Malé (here), Kuda Villingili, Kulhudhuffushi */
  const sites = [['male', ...male], ['kv', ISL[I_KV].x, ISL[I_KV].y], ['kh', ISL[I_KH].x, ISL[I_KH].y]];
  const beamM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uT: U.uT },
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float uA,uT;varying vec2 vU;void main(){float a=pow(1.-vU.y,1.6)*(.6+.4*sin(vU.y*30.-uT*4.));gl_FragColor=vec4(vec3(1.,.16,.1)*2.,a*uA);}' });
  const pins = sites.map(([id, a, b]) => { const p = toW(a, b), grp = new THREE.Group(); grp.position.copy(p);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 1600, 16, 1, true).translate(0, 800, 0), beamM); grp.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(90, 130, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .3, .2), transparent: true, depthWrite: false, opacity: 0 })); ring.position.y = 3; grp.add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .3, .2), transparent: true, opacity: 0 })); dot.position.y = 45; grp.add(dot);
    grp.visible = false; scene.add(grp); return { id, grp, ring, dot, P: p.clone().setY(60) }; });
  return { mesh, sea, pins, beamM, toW };
};
