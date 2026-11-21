/* RoseWare HQ: loads the baked floors, swaps in web materials, section cut with poché caps, animated screens. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const LEVELS = ['B3', 'B2', 'B1', 'G', 'L1', 'L2', 'L3', 'L4', 'L5', 'ROOF', 'FACADE'];
export const FLOOR_Y = { B3: -12.6, B2: -8.1, B1: -3.9, G: 0, L1: 5.4, L2: 9.6, L3: 13.8, L4: 18, L5: 22.2, ROOF: 26.4 };
/* how dark each floor is, used for things that are not lightmapped (people, props) */
export const AMB = { B3: .55, B2: .3, B1: .32, G: 1, L1: 1, L2: 1, L3: 1, L4: 1, L5: 1, ROOF: 1.2, FACADE: 1.2 };

/* shared section state: z of the cut (three.js z = -Blender y) */
export const SEC = { lv: new THREE.Plane(new THREE.Vector3(0, 0, -1), 60), fac: new THREE.Plane(new THREE.Vector3(0, 0, -1), 60), uLv: { value: 60 }, uFac: { value: 60 }, uLine: { value: 1 } };

const DIRECT_OFF = s => s.replace('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0').replace('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0')
  .replace('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0').replace('#if ( NUM_HEMI_LIGHTS > 0 )', '#if 0');

/* triplanar detail slots per material name */
const TRI = { M_concrete: ['concrete', .5, .55], M_concrete_dark: ['concrete', .5, .5], M_white: ['plaster', .45, .35], M_panel: ['plaster', .4, .3], M_stone: ['marble', .35, .45],
  M_timber: ['wood', .7, .75], M_carpet: ['stone', 1.6, .45], M_floor_dark: ['stone', .8, .35], M_soil: ['sand', .25, .6], M_floor_perf: ['metal', 1.2, .4] };
export const patchMat = (m, o) => {
  const cap = o.cap !== false, uSec = o.facade ? SEC.uFac : SEC.uLv;
  m.clippingPlanes = [o.facade ? SEC.fac : SEC.lv]; m.clipShadows = true;
  if (cap) m.side = THREE.DoubleSide;
  const U = { uSecZ: uSec, uLine: SEC.uLine, uCapA: { value: new THREE.Color(o.capA || 0xd9d3c8) }, uCapB: { value: new THREE.Color(o.capB || 0x8f877c) }, uCapF: { value: o.capF || 9 },
    tTri: { value: o.tri ? o.tri.tex : null }, uTriS: { value: o.tri ? o.tri.s : 1 }, uTriK: { value: o.tri ? o.tri.k : 0 }, uTriAvg: { value: o.tri ? o.tri.avg : .5 } };
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;varying vec3 vWN;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
    let f = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP;varying vec3 vWN;uniform float uSecZ,uLine,uCapF,uTriS,uTriK,uTriAvg;uniform vec3 uCapA,uCapB;uniform sampler2D tTri;`);
    if (o.tri) f = f.replace('#include <map_fragment>', `#include <map_fragment>
      {vec3 bw=pow(abs(vWN),vec3(4.));bw/=bw.x+bw.y+bw.z+1e-4;vec3 q=vWP*uTriS;
       vec3 tx=texture2D(tTri,q.zy).rgb*bw.x+texture2D(tTri,q.xz).rgb*bw.y+texture2D(tTri,q.xy).rgb*bw.z;
       diffuseColor.rgb*=mix(1.,dot(tx,vec3(.333))/uTriAvg,uTriK);}`);
    if (o.noDirect) f = f.replace('#include <lights_fragment_begin>', DIRECT_OFF(THREE.ShaderChunk.lights_fragment_begin));
    f = f.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      ${cap ? `if(!gl_FrontFacing){vec3 rd=normalize(vWP-cameraPosition);float tt=(uSecZ-cameraPosition.z)/(abs(rd.z)>1e-4?rd.z:1e-4);vec3 sp=cameraPosition+rd*max(tt,0.);
        float hs=fract((sp.x+sp.y)*uCapF);float h=smoothstep(.0,.06,hs)*(1.-smoothstep(.12,.18,hs));
        gl_FragColor=vec4(mix(uCapA,uCapB,h),1.);}else` : ''}{float d=uSecZ-vWP.z;gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(2.4,.16,.1),(1.-smoothstep(0.,.03,d))*step(-.001,d)*uLine);}`);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => `rw${cap ? 1 : 0}${o.tri ? 1 : 0}${o.noDirect ? 1 : 0}${o.facade ? 1 : 0}`;
  return m;
};

/* ---------- canvases for screens, signage and logos ---------- */
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const RED = '#e2231a';
export const logoCanvas = (col = '#ffffff', pad = 0) => { const mk = window.__logoMk; if (!mk) { const [c, x] = cnv(605, 122); x.fillStyle = col; x.font = '700 90px Inter,sans-serif'; x.fillText('RoseWare', 10, 96); return c; }
  const s = mk(col); if (!pad) return s; const [c, x] = cnv(s.width + pad * 2, s.height + pad * 2); x.drawImage(s, pad, pad); return c; };
const texOf = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };

/* animated screen contents. Each returns {tex, draw(t)} */
const SCREENS = {}; let LOGOC = null;
const screen = (key, w, h, paint) => { const [c, x] = cnv(w, h); const tex = texOf(c); const s = { tex, draw: t => { paint(x, w, h, t); tex.needsUpdate = true; } }; s.draw(0); SCREENS[key] = s; return s; };
let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const codeLines = Array.from({ length: 60 }, () => [rnd() * 40 | 0, 30 + rnd() * 230, rnd() < .25 ? RED : rnd() < .5 ? '#7fb0ff' : '#c9d1d9']);
const mkScreens = () => {
  screen('office', 256, 150, (x, w, h, t) => { x.fillStyle = '#0d1117'; x.fillRect(0, 0, w, h); x.fillStyle = '#161b22'; x.fillRect(0, 0, w, 14); x.fillStyle = RED; x.fillRect(6, 4, 6, 6);
    const o = (t * 4 | 0) % 60; for (let i = 0; i < 13; i++) { const L = codeLines[(i + o) % 60]; x.fillStyle = L[2]; x.globalAlpha = .9; x.fillRect(8 + L[0], 20 + i * 9.5, L[1] * .8, 4); } x.globalAlpha = 1;
    x.fillStyle = '#c9d1d9'; if ((t * 2 | 0) % 2) x.fillRect(8 + codeLines[(12 + o) % 60][0] + codeLines[(12 + o) % 60][1] * .8 + 3, 20 + 12 * 9.5 - 2, 3, 8); });
  screen('soc', 256, 150, (x, w, h, t) => { x.fillStyle = '#06101f'; x.fillRect(0, 0, w, h); x.strokeStyle = '#1d3b66'; x.lineWidth = 1; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(0, 20 + i * 16); x.lineTo(w, 20 + i * 16); x.stroke(); }
    x.strokeStyle = '#4da3ff'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= 64; i++) { const v = Math.sin(i * .4 + t * 2) * 14 + Math.sin(i * 1.3 - t * 3) * 8; i ? x.lineTo(i * 4, 85 + v) : x.moveTo(0, 85 + v); } x.stroke();
    x.fillStyle = (t * 1.5 | 0) % 2 ? RED : '#7a1410'; x.fillRect(w - 64, 8, 56, 16); x.fillStyle = '#fff'; x.font = '700 11px Inter,sans-serif'; x.fillText('ALERT', w - 54, 20);
    for (let i = 0; i < 4; i++) { x.fillStyle = ['#2ecc71', '#4da3ff', '#f1c40f', '#2ecc71'][i]; x.fillRect(10 + i * 60, 120, 48 * (.4 + .6 * Math.abs(Math.sin(t * .7 + i))), 8); } });
  screen('ups', 128, 80, (x, w, h, t) => { x.fillStyle = '#0a1a0f'; x.fillRect(0, 0, w, h); x.fillStyle = '#39d353'; x.font = '700 20px Inter,sans-serif'; x.fillText((99 + Math.sin(t) * .4).toFixed(1) + '%', 8, 30); x.font = '600 11px Inter,sans-serif'; x.fillText('ONLINE · LOAD 42%', 8, 52); x.fillRect(8, 62, 112 * (.4 + .02 * Math.sin(t * 3)), 8); });
  screen('lobby', 512, 288, (x, w, h, t) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1a0f0e'); g.addColorStop(1, '#3a0d0a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const k = (t * .12) % 1; x.strokeStyle = 'rgba(226,35,26,.6)'; x.lineWidth = 2; for (let i = 0; i < 9; i++) { const r = ((i / 9 + k) % 1) * 380; x.beginPath(); x.arc(w * .5, h * .55, r, 0, 7); x.globalAlpha = 1 - r / 380; x.stroke(); } x.globalAlpha = 1;
    const L = LOGOC || (LOGOC = logoCanvas('#ffffff')); x.drawImage(L, w * .5 - 150, h * .42 - 30, 300, 60); x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '500 18px Inter,sans-serif'; x.textAlign = 'center'; x.fillText(['Design · Build · Support', 'Since 2007, from Malé to every atoll', 'Networks · Data centres · Security'][(t / 4 | 0) % 3], w / 2, h * .72); x.textAlign = 'left'; });
  screen('vc', 256, 150, (x, w, h, t) => { x.fillStyle = '#101418'; x.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { const cx = (i % 2) * 128, cy = (i / 2 | 0) * 75; x.fillStyle = ['#2b3440', '#33302b', '#2b3330', '#352b2e'][i]; x.fillRect(cx + 3, cy + 3, 122, 69);
      x.fillStyle = '#d8d2c8'; x.beginPath(); x.arc(cx + 64, cy + 34, 13, 0, 7); x.fill(); x.fillRect(cx + 44, cy + 50, 40, 22); if (((t * 1.3 | 0) % 4) === i) { x.strokeStyle = RED; x.lineWidth = 3; x.strokeRect(cx + 4, cy + 4, 120, 67); } } });
  /* the SOC video wall: one wide canvas split over 8 panels */
  screen('socwall', 1024, 330, (x, w, h, t) => { x.fillStyle = '#040b16'; x.fillRect(0, 0, w, h);
    /* left half: Maldives map with pings */
    x.fillStyle = '#0c2340'; x.fillRect(8, 8, 500, h - 16); x.fillStyle = '#5fd0d8'; for (let i = 0; i < 70; i++) { const a = (i * 37 % 100) / 100, b = (i * 61 % 100) / 100; x.globalAlpha = .55; x.fillRect(150 + a * 200 + Math.sin(i) * 20, 20 + b * 290, 3, 3); } x.globalAlpha = 1;
    for (let i = 0; i < 6; i++) { const ph = (t * .6 + i * .37) % 1, px = 170 + (i * 53 % 160), py = 40 + (i * 97 % 250); x.strokeStyle = i === 2 ? RED : '#4da3ff'; x.globalAlpha = 1 - ph; x.lineWidth = 2; x.beginPath(); x.arc(px, py, 4 + ph * 26, 0, 7); x.stroke(); } x.globalAlpha = 1;
    /* right half: graphs, a camera grid */
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) { const cx = 520 + i * 166, cy = 8 + j * 160; x.fillStyle = '#0d1a2b'; x.fillRect(cx, cy, 160, 152);
      if (j === 0) { x.strokeStyle = ['#4da3ff', '#2ecc71', RED][i]; x.lineWidth = 2; x.beginPath(); for (let k = 0; k <= 40; k++) { const v = Math.sin(k * .5 + t * (1 + i * .4)) * 22 + Math.sin(k * 1.7 - t * 2) * 9; k ? x.lineTo(cx + k * 4, cy + 90 + v) : x.moveTo(cx, cy + 90 + v); } x.stroke(); }
      else { x.fillStyle = '#1b2633'; x.fillRect(cx + 6, cy + 6, 148, 140); x.fillStyle = '#2c3a4a'; x.fillRect(cx + 20 + Math.sin(t * .3 + i) * 10, cy + 60, 50, 70); x.fillStyle = '#9aa7b5'; x.font = '600 10px Inter,sans-serif'; x.fillText('CAM 0' + (i + 1) + '  ' + new Date().toISOString().slice(11, 19), cx + 10, cy + 18); } }
    x.fillStyle = RED; x.font = '700 14px Inter,sans-serif'; x.fillText('ROSEWARE SOC · ALL SITES NOMINAL', 18, h - 18); });
};

/* rack fronts: dark bezel with blinking LEDs (procedural) */
const rackMat = (U) => { const [c, x] = cnv(64, 256); x.fillStyle = '#0b0d10'; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 42; i++) { const y = 4 + i * 6; x.fillStyle = i % 7 === 0 ? '#1a1e24' : '#13161b'; x.fillRect(4, y, 56, 5); x.fillStyle = '#222'; x.fillRect(48, y + 1, 8, 3); }
  x.fillStyle = RED; x.fillRect(2, 0, 60, 2); const tex = texOf(c);
  const m = new THREE.MeshBasicMaterial({ map: tex }); m.userData.isRack = true;
  m.onBeforeCompile = sh => { sh.uniforms.uT = U.uT; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT;float hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}')
    .replace('#include <map_fragment>', `#include <map_fragment>
      {vec2 g=vec2(floor(vMapUv.x*10.),floor(vMapUv.y*42.));vec2 f=fract(vec2(vMapUv.x*10.,vMapUv.y*42.));float on=step(.55,hh(g+floor(uT*(2.+hh(g)*5.))));
       float dot1=step(length(f-vec2(.5,.5)),.22)*step(6.5,g.x)*step(g.x,8.5);vec3 lc=hh(g+3.)<.15?vec3(3.,.2,.1):hh(g+5.)<.5?vec3(.3,2.2,.5):vec3(.4,.9,3.);
       diffuseColor.rgb+=lc*dot1*on;}`); };
  m.clippingPlanes = [SEC.lv]; return m; };

/* ---------- the loader ---------- */
export const loadHQ = async ({ manager, TL, U, Q, onLevel }) => {
  mkScreens();
  const loader = new GLTFLoader(manager); loader.setMeshoptDecoder(MeshoptDecoder);
  const triTex = {}; const tri = (slot) => { if (triTex[slot]) return triTex[slot]; const t = TL.load(`assets/tex/${slot}_diff.jpg`, tx => { try { const [c, x] = cnv(8, 8); x.drawImage(tx.image, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3; const avg = Math.pow(s / 64 / 255, 2.2); triTex[slot].avg = avg; mats.forEach(m => { if (m.userData.U && m.userData.slot === slot) m.userData.U.uTriAvg.value = avg; }); } catch (e) { } });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; triTex[slot] = { tex: t, avg: .35 }; return triTex[slot]; };
  const mats = [];
  const root = new THREE.Group(); root.name = 'HQ';
  const LV = {}, NIGHTGLOW = [], GLASS = [];
  const logoW = texOf(logoCanvas('#ffffff', 6)), logoR = texOf(logoCanvas(RED, 6));
  const signTex = (txt, bg, fg, w = 512, h = 104) => { const [c, x] = cnv(w, h); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); } x.fillStyle = fg; x.font = `700 ${h * .42 | 0}px Inter,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w / 2, h / 2 + 2); return texOf(c); };
  const graphic = (() => { const [c, x] = cnv(1024, 244); x.fillStyle = '#ffffff'; x.font = '300 74px Marcellus,serif'; x.fillText('Design · Build · Support', 20, 110); x.font = '600 26px Inter,sans-serif'; x.globalAlpha = .8; x.fillText('ENGINEERING · LEVEL 1', 24, 190); return texOf(c); })();
  const rackM = rackMat(U);
  const lmI = Math.PI * 4;   /* jpeg stores srgb(L/4); three's irradiance needs pi*L */
  const loadLevel = name => new Promise(res => {
    const lmTex = new Promise(r2 => { TL.load(`assets/building/lm_${name}.jpg`, t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; r2(t); }, undefined, () => r2(null)); });
    loader.load(`assets/building/${name}.glb`, async g => {
      const lm0 = await lmTex; const lm = name === 'FACADE' || name === 'ROOF' ? null : lm0; const grp = g.scene; grp.name = 'LV_' + name; const amb = AMB[name], facade = name === 'FACADE';
      const cache = {};
      grp.traverse(o => {
        if (!o.isMesh) return; const src = o.material, mn = src.name || '', on = (o.name || '').replace(/([a-z])\.?\d{3}$/i, '$1'), pn = (o.parent && o.parent.name || '').replace(/([a-z])\.?\d{3}$/i, '$1');
        const nm = /^lv_/i.test(on) ? '' : on;
        let m;
        const key = mn + '|' + nm;
        if (cache[key] && !nm.startsWith('soc_wall')) { o.material = cache[key]; return; }
        const em = src.emissive && (src.emissive.r + src.emissive.g + src.emissive.b) > 0 ? src.emissive.clone().multiplyScalar(src.emissiveIntensity || 1) : null;
        if (nm.startsWith('screen_') || nm.startsWith('vc_') || nm.startsWith('soc_wall')) {
          let s = nm.startsWith('vc_') ? SCREENS.vc : nm.startsWith('soc_wall') ? SCREENS.socwall : SCREENS[nm.replace('screen_', '')] || SCREENS.office; let map = s.tex;
          if (nm.startsWith('soc_wall')) { const [, i, j] = nm.match(/soc_wall_(\d)_(\d)/) || [0, 0, 0]; map = s.tex.clone(); map.repeat.set(.25, .5); map.offset.set(i * .25, (1 - j) * .5); map.needsUpdate = true; s.clones = (s.clones || []).concat(map); }
          m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: true }); m.clippingPlanes = [SEC.lv];
        } else if (nm === 'rack_front') m = rackM;
        else if (nm.startsWith('logo') || nm === 'aisle_sign' || nm === 'graphic_l1') {
          const map = nm === 'graphic_l1' ? graphic : nm === 'aisle_sign' ? signTex('COLD AISLE', '#16181c', '#ff3b2f') : nm === 'logo_etch' ? logoW : logoR;
          const k = nm === 'logo_lobby' ? .92 : nm === 'logo_roof' ? 2.2 : nm === 'logo_etch' ? .7 : nm === 'graphic_l1' ? .95 : 1.6;
          m = new THREE.MeshBasicMaterial({ map, transparent: true, color: new THREE.Color(k, k, k), depthWrite: false }); m.clippingPlanes = [facade ? SEC.fac : SEC.lv];
          if (nm === 'logo_roof') NIGHTGLOW.push([m, 1.2, 3.6]);
        } else if (mn.startsWith('M_glass')) {
          m = new THREE.MeshStandardMaterial({ color: mn === 'M_glass_frost' ? 0xe8f0f4 : 0xbcd6de, roughness: mn === 'M_glass_frost' ? .35 : .04, metalness: .1, transparent: true, opacity: mn === 'M_glass_frost' ? .4 : (facade ? .32 : .16), depthWrite: false, envMapIntensity: facade ? 1.6 : 1 });
          m.clippingPlanes = [facade ? SEC.fac : SEC.lv]; GLASS.push(m); o.renderOrder = 2;
        } else if (em) {
          const c = em.clone(); const base = mn === 'M_light' || mn === 'M_light_cool' ? .26 : .5; c.multiplyScalar(base);
          m = new THREE.MeshBasicMaterial({ color: c, toneMapped: true }); m.clippingPlanes = [facade ? SEC.fac : SEC.lv];
          if (facade) NIGHTGLOW.push([m, .35, 1]);
        } else {
          const t = TRI[mn]; const triO = t ? { ...tri(t[0]), s: t[1], k: t[2] } : null;
          m = new THREE.MeshStandardMaterial({ color: src.color, roughness: src.roughness, metalness: src.metalness, envMapIntensity: facade || name === 'ROOF' ? 1 : .22 });
          if (lm && o.geometry.attributes.uv1) { m.lightMap = lm; m.lightMapIntensity = lmI; }
          const soil = mn === 'M_soil';
          patchMat(m, { cap: true, tri: triO, noDirect: !!(lm && o.geometry.attributes.uv1) && !facade && name !== 'ROOF', facade, capA: soil ? 0x8a6a4a : mn === 'M_concrete' ? 0xe1dbd0 : 0x2f3136, capB: soil ? 0x5d4630 : mn === 'M_concrete' ? 0x9d958a : 0x24262a, capF: soil ? 3 : 9 });
          if (t) m.userData.slot = t[0];
          if (!lm) m.envMapIntensity = facade || name === 'ROOF' ? 1 : .55;
          mats.push(m);
        }
        cache[key] = m; o.material = m; o.castShadow = facade || name === 'ROOF' || o.material === m && (mn === 'M_concrete' && !lm); o.receiveShadow = facade || name === 'ROOF' || !lm;
      });
      LV[name] = { grp, y: FLOOR_Y[name], amb }; root.add(grp); onLevel && onLevel(name); res();
    }, undefined, e => { console.warn('level', name, e); res(); });
  });
  await Promise.all(LEVELS.map(loadLevel));
  let ft = 0;
  const update = (t, camY, inside) => {
    /* screens update at ~8 fps */
    if (t - ft > .12) { ft = t; for (const k in SCREENS) { const s = SCREENS[k]; s.draw(t); if (s.clones) s.clones.forEach(c => c.needsUpdate = true); } }
  };
  return { root, LV, update, NIGHTGLOW, GLASS };
};
