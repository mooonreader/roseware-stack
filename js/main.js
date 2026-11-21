import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { V, lerp, clamp, sstep } from './world1.js';
import { makeSkyDome, sunDirFromPx, rotForAzimuth, astro, nowMs, pickSky, LOOK, mvClock, phaseName } from './sky.js';
import { CHAPTERS, PROJECTS, ICONS } from './content.js';
import { AT } from './data.js';
import { makeAudio } from './audio.js';
import { loadHQ, SEC, FLOOR_Y, captureEnv } from './hq.js';
import { loadPeople } from './people.js';
import { loadMale, buildSky, buildChart, SEA_Y } from './male.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const N = CHAPTERS.length, RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
const FINE = matchMedia('(pointer: fine)').matches;
const Q = MOBILE ? { hi: false, dpr: Math.min(devicePixelRatio, 1.5), shadow: 1024, refl: .3, aniso: 4, msaa: 0 } : { hi: true, dpr: Math.min(devicePixelRatio, 2), shadow: 2048, refl: .45, aniso: 8, msaa: 4 };
const fail = msg => { document.body.classList.add('nogl'); const e = $('#loadMsg'); if (e) e.textContent = msg; window.__fail = msg; };
const CH = id => CHAPTERS.findIndex(c => c.id === id);

/* ---------- renderer ---------- */
const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }); } catch (e) { fail('3D is not available on this device.'); throw e; }
if (!renderer.capabilities.isWebGL2) { fail('3D needs a newer browser.'); throw new Error('webgl2'); }
renderer.setPixelRatio(Q.dpr); renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.localClippingEnabled = true;
THREE.Cache.enabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .05, 30000);

const U = { uT: { value: 0 }, uWater: { value: 1 }, uNight: { value: 0 }, uFogD: { value: .0003 }, uSunDir: { value: V(.4, .7, .3).normalize() }, uSunC: { value: new THREE.Color(1, .95, .85) }, uFog: { value: new THREE.Color(0x9fc3df) },
  uRip: { value: V(0, 0, -99) }, uCloudA: { value: 0 } };

/* ---------- loading ---------- */
const manager = new THREE.LoadingManager(); let loadP = 0;
manager.onProgress = (u, a, b) => { loadP = Math.max(loadP, a / b); };
const TL = new THREE.TextureLoader(manager);
let SKYMETA = null; const skyKey = pickSky(nowMs());
const skyDome = makeSkyDome(); scene.add(skyDome.mesh);
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.bias = -.0004; sun.shadow.normalBias = .05; scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.near = 1; c.far = 800; c.left = c.bottom = -45; c.right = c.top = 45; c.updateProjectionMatrix(); }
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xe8dcc4, .35); scene.add(hemi);
scene.fog = new THREE.FogExp2(0x9fc3df, .0003);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, LOOKNOW = LOOK.day, SKYKEY = 'day';
const applySky = (key, meta, hdr, jpg) => {
  const L = LOOK[key], A = astro(nowMs()); const skyRot = rotForAzimuth(meta.sun_px, meta.size, A.sunAz);
  skyDome.u.tSky.value = jpg; skyDome.u.uRot.value = skyRot; skyDome.u.uExp.value = L.bg * (key === 'night' ? .55 : 1.55); skyDome.u.uGrade.value.set(...L.grade); skyDome.u.uHaze.value.set(L.fog); skyDome.u.uHazeK.value = key === 'night' ? .25 : .5;
  const es = new THREE.Scene(), em = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { t: { value: hdr }, uRot: { value: skyRot }, uK: { value: key === 'night' ? .35 : 1 } },
    vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform sampler2D t;uniform float uRot,uK;varying vec3 vD;void main(){vec3 d=normalize(vD);float c=cos(uRot),s=sin(uRot);vec3 r=vec3(d.x*c-d.z*s,d.y,d.x*s+d.z*c);vec2 uv=vec2(atan(r.z,r.x)/6.2831853+.5,asin(clamp(r.y,-1.,1.))/3.1415927+.5);vec3 col=min(texture2D(t,uv).rgb,vec3(24.))*uK;if(d.y<0.)col=mix(col,vec3(.28,.32,.34)*uK,smoothstep(0.,-.2,d.y));gl_FragColor=vec4(col,1.);}' });
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), em)); const rt = pmrem.fromScene(es, .02); scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt; em.dispose();
  const sd = sunDirFromPx(meta.sun_px, meta.size, skyRot); if (key === 'golden' && sd.y < .12) { sd.y = .12; sd.normalize(); } if (key === 'night') sd.set(-.35, .82, .45).normalize();
  U.uSunDir.value.copy(sd); sun.color.set(L.sunC); sun.intensity = L.sunI; U.uSunC.value.set(L.sunC).multiplyScalar(key === 'night' ? .35 : 1);
  hemi.intensity = L.hemi; scene.fog.color.set(L.fog); U.uFog.value.set(L.fog); U.uWater.value = L.water; U.uNight.value = L.night;
  bloom.strength = L.bloom; LOOKNOW = L; SKYKEY = key; };
const loadSky = key => new Promise((res, rej) => {
  const meta = SKYMETA.sky[key]; let hdr = null, jpg = null; const done = () => { if (hdr && jpg) res([key, meta, hdr, jpg]); };
  new RGBELoader(manager).setDataType(THREE.HalfFloatType).load(`assets/sky/${key}_env.hdr`, t => { hdr = t; done(); }, undefined, rej);
  TL.load(`assets/sky/${key}${Q.hi ? '' : '_lo'}.jpg`, t => { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; jpg = t; done(); }, undefined, rej);
});

/* ---------- post ---------- */
const rtc = new THREE.WebGLRenderTarget(innerWidth * Q.dpr, innerHeight * Q.dpr, { type: THREE.HalfFloatType, samples: Q.msaa });
const composer = new EffectComposer(renderer, rtc); composer.setPixelRatio(Q.dpr); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .5, .95); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uReveal: { value: 0 }, uAsp: { value: innerWidth / innerHeight }, uFade: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uT,uReveal,uAsp,uFade;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 c=vUv-.5;float r=length(c*vec2(uAsp,1.));vec2 off=c*.0022*r;
      vec3 col=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
      col*=1.-smoothstep(.55,1.35,r)*.42;col+=(h(vUv*vec2(1713.,977.)+fract(uT))-.5)*.026;
      vec2 cell=floor(vec2(vUv.x*uAsp,vUv.y)*26.);float n=h(cell);float d=length((cell/26.-vec2(uAsp*.5,.5))*vec2(1.,1.15));
      float th=uReveal*1.6-.3;float m=step(d*.85+n*.42,th+.05);float edge=step(d*.85+n*.42,th+.13)-m;
      vec3 paper=vec3(.937,.906,.855)+(h(vUv*800.)-.5)*.03;col=mix(paper,col,m);col=mix(col,mix(col,vec3(.93,.6,.48),.35),edge);
      col=mix(col,vec3(.03,.04,.05),uFade);gl_FragColor=vec4(col,1.);}` });
composer.addPass(grade);

/* ---------- the world: Malé, the lagoon, clouds, the chart ---------- */
const clouds = buildSky(Q, U); scene.add(clouds);
const map = buildChart(scene, U);
let HQ = null, PEOPLE = null, MALE = null;

/* ---------- camera journey: [pos, target, stop, fov, roll] ---------- */
const W = [
  [[0, 1.62, 6.3], [0, 2.15, -5], 0, 52],
  /* swing left past the lounge, then across the lobby */
  [[-3.6, 2.35, 4.6], [.6, 1.9, -5], null, null, -.05], [[1.6, 1.8, 3.1], [-2.5, 2.0, -5]],
  [[4.6, 1.75, 2.5], [-1.4, 2.25, -4.9], 1, 50],
  /* to the cut, then down the face of the section, through the slab, into the security centre */
  [[5.8, 2.5, 5.6], [2, .4, -3], null, null, .1], [[4.2, .7, 8.3], [1, -1.1, -2], null, null, .22], [[2.2, -1.25, 8.5], [4, -2.6, -2], null, null, -.12], [[7.6, -1.6, 6.9], [1, -2.4, -2.8], null, null, .05],
  [[11.2, -1.7, 3.6], [.5, -2.5, -2.8], 2, 52],
  /* down again into the data hall, landing in a cold aisle */
  [[9.8, -2.2, 7.5], [4, -6.6, 0], null, null, .2], [[5.4, -4.5, 8.5], [3, -6.8, -3], null, null, .08], [[3.4, -6.05, 7.4], [3.0, -6.8, -3], null, null, -.05],
  [[3.0, -6.5, 6.0], [3.0, -6.85, -4.5], 3, 56],
  /* and down to the power plant */
  [[2.6, -7.2, 8.1], [1.5, -10.6, -2], null, null, -.16], [[.2, -9.4, 8.5], [-1, -11.6, -1], null, null, .24], [[-3.5, -10.5, 7.0], [5, -11.6, 1], null, null, .04],
  [[-5.2, -10.7, 1.0], [9, -11.6, .8], 4, 56],
  /* back out through the cut, swinging round: the whole section */
  [[-4.2, -10.6, 9.5], [2, -10, -2], null, null, -.04], [[-6, -8.5, 24], [0, -5, 0], null, null, -.1], [[4, -1, 50], [-5, 3, 0], null, null, -.05],
  [[27, 3.5, 76], [-9.5, 5.2, 0], 5, 43],
  /* the section heals, and we fly in through the glass to the engineers */
  [[15, 7.6, 36], [0, 6.6, -2], null, null, .06], [[4.5, 7.2, 12.5], [1, 6.8, -4], null, null, .08],
  [[-1.0, 7.1, 6.0], [6, 6.5, -3.6], 6, 52],
  /* up through the ceiling to the boardroom, turn, out of the balcony door, and out over Malé */
  [[1.0, 7.9, .6], [1.5, 11, -6], null, null, .12], [[1.5, 10.2, -1.6], [1.5, 11.2, 6], null, null, -.18], [[.75, 11.15, 6.4], [.75, 10.9, 14]], [[.75, 11.1, 9.8], [.75, 10.6, 20]],
  [[4.5, 17, 19], [0, 12, 0], null, null, -.14], [[16, 30, 36], [0, 12, 0], null, null, -.06],
  [[36, 40, 62], [9, 12, 0], 7, 42],
  /* rise through the cloud to the atolls */
  [[110, 230, 300], [0, 0, 0], null, null, .04], [[480, 2100, 2000], [0, 0, -300]], [[5200, 21000, 15000], [-1500, 0, 4000], null, null, -.05], [[20000, 230000, 160000], [30000, 0, 90000]],
  [[-110000, 1150000, 430000], [-125000, 0, 115000], 8, 45],
  /* and back down to the street corner outside the office */
  [[6000, 40000, 30000], [0, 0, 0]], [[500, 1600, 1500], [0, 0, 0], null, null, .05], [[60, 90, 120], [0, 10, 0]], [[30, 12, 42], [0, 12, 0], null, null, .06],
  [[19.5, 2.1, 17.5], [-.5, 12.5, 0], 9, 52],
];
const PORTRAIT = { 0: [0, 4.4, -5], 1: [-.6, 2.3, -4.9], 2: [3, -2.5, -3], 3: [3, -6.85, -4.5], 4: [5, -11.6, 1.2], 5: [0, 5.2, 0], 6: [4, 6.5, -3.6], 7: [0, 13, 0], 8: [-25000, 0, -70000], 9: [0, 13, 0] };
const posC = new THREE.CatmullRomCurve3(W.map(w => V(...w[0])), false, 'centripetal', .5), tgtC = new THREE.CatmullRomCurve3(W.map(w => V(...w[1])), false, 'centripetal', .5);
const rollC = new THREE.CatmullRomCurve3(W.map((w, i) => V(w[4] || 0, i, 0)), false, 'catmullrom', .5);
const tgtM = new THREE.CatmullRomCurve3(W.map(w => V(...(w[2] != null && PORTRAIT[w[2]] ? PORTRAIT[w[2]] : w[1]))), false, 'centripetal', .5), camTM = V(0, 0, 0), rv = V(0, 0, 0);
const stopIdx = W.map((w, i) => w[2] != null ? i : -1).filter(i => i >= 0), fovAt = stopIdx.map(i => W[i][3] || 50);
const LUT = []; { const nW = W.length - 1;
  for (let k = 0; k < N - 1; k++) { const a = stopIdx[k] / nW, b = stopIdx[k + 1] / nW, S = 900, L = [0]; let pp = posC.getPoint(a), pt = tgtC.getPoint(a);
    for (let i = 1; i <= S; i++) { const t = lerp(a, b, i / S), p = posC.getPoint(t), q = tgtC.getPoint(t); const h = Math.max(8, (p.y + pp.y) / 2); L.push(L[i - 1] + p.distanceTo(pp) / h + .3 * q.distanceTo(pt) / Math.max(h, 12)); pp = p; pt = q; }
    LUT.push({ a, b, L, tot: L[S] }); } }
const tAt = P => { const k = Math.min(N - 2, Math.max(0, Math.floor(P))), f = clamp(P - k), l = LUT[k], tgt = f * l.tot; let lo = 0, hi = l.L.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (l.L[m] < tgt) lo = m; else hi = m; } const ff = (tgt - l.L[lo]) / ((l.L[hi] - l.L[lo]) || 1); return lerp(l.a, l.b, (lo + ff) / (l.L.length - 1)); };
const camP = V(0, 0, 0), camT = V(0, 0, 0);

/* the section cut over the journey: where the floors are cut, where the facade/city are cut */
const OFF = 60, CUT = 6.6;
const ramp = (P, a, b) => sstep(a, b, P);
const secLv = P => { const on = ramp(P, 1.02, 1.2) * (1 - ramp(P, 5.25, 5.75)); return lerp(OFF, CUT, on); };
/* the city in front of the cut comes back only once the camera is clear of it, over the street */
const secFac = (P, cz) => { const on = ramp(P, 4.25, 4.85) * (P < 5.3 ? 1 : 1 - ramp(P, 5.3, 6.2) * (1 - sstep(15.5, 21, cz))); return lerp(OFF, CUT, on); };

/* ---------- scroll: smooth spring, magnetic stops, one-flight jumps ---------- */
let P = 0, PT_ = 0, vel = 0, lastIn = -1e9, lastDir = 1, snapped = true, tween = null, drawer = false, entered = false, touching = false;
const jump = c => { c = clamp(Math.round(c), 0, N - 1); const d = Math.abs(c - P); if (d < .01) return; if (d <= 1.05 && !RM) { PT_ = c; snapped = true; lastIn = -1e9; return; }
  tween = { a: P, b: c, t0: performance.now(), T: RM ? 10 : clamp(1300 + 520 * d, 1600, 4600) }; PT_ = c; snapped = true; };
const input = d => { if (!entered || drawer) return; if (tween) { PT_ = P; tween = null; } PT_ = clamp(PT_ + d, 0, N - 1); lastIn = performance.now(); lastDir = Math.sign(d) || lastDir; snapped = false; };
addEventListener('wheel', e => { if (e.ctrlKey) return; if (e.target.closest && e.target.closest('.drawer,.panelScroll')) return; e.preventDefault(); const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? innerHeight : 1; const d = e.deltaY * k; if (Math.abs(e.deltaX) > Math.abs(d)) return; input(clamp(d, -260, 260) / 820); }, { passive: false });
/* touch: vertical drives the journey, horizontal looks around */
let ty = 0, tx = 0, tP = 0, tv = 0, tl = 0, tMode = '';
const look = { x: 0, y: 0, vx: 0, vy: 0, held: false };
addEventListener('touchstart', e => { if (e.target.closest('.drawer,.panelScroll,button,a,select')) return; touching = true; tMode = ''; ty = e.touches[0].clientY; tx = e.touches[0].clientX; tl = performance.now(); tv = 0; if (tween) { PT_ = P; tween = null; } tP = PT_; }, { passive: true });
addEventListener('touchmove', e => { if (!touching || !entered || drawer) return; e.preventDefault(); const y = e.touches[0].clientY, x = e.touches[0].clientX, now = performance.now();
  if (!tMode) { if (Math.abs(x - tx) > 12 && Math.abs(x - tx) > Math.abs(y - ty) * 1.3) tMode = 'look'; else if (Math.abs(y - ty) > 8) tMode = 'scroll'; }
  if (tMode === 'look') { look.held = true; look.x = clamp((x - tx) / innerWidth * 1.4, -.6, .6); look.y = clamp((y - ty) / innerHeight * .8, -.3, .3); return; }
  if (tMode !== 'scroll') return;
  const d = (ty - y) / (innerHeight * .8); tv = lerp(tv, (d - (PT_ - tP)) / Math.max(1, now - tl) * 1000, .3); tl = now; PT_ = clamp(tP + d, 0, N - 1); lastIn = now; lastDir = Math.sign(d) || lastDir; snapped = false; }, { passive: false });
addEventListener('touchend', () => { if (!touching) return; touching = false; look.held = false; if (tMode === 'scroll') { if (Math.abs(tv) > .6) lastDir = Math.sign(tv); lastIn = performance.now() - 400; } tMode = ''; });
addEventListener('keydown', e => { if (!entered) { if (e.key === 'Enter') enter(); return; } if (e.key === 'Escape') closeDrawer(); if (drawer) return;
  if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); jump(Math.round(PT_) + 1); } if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); jump(Math.round(PT_) - 1); } if (e.key === 'Home') jump(0); if (e.key === 'End') jump(N - 1); });
const scrollUpdate = (dt, now) => {
  if (tween) { const k = clamp((now - tween.t0) / tween.T), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; P = lerp(tween.a, tween.b, e); vel = 0; if (k >= 1) { P = tween.b; tween = null; } return; }
  if (!snapped && !touching && now - lastIn > 200) { const f = PT_ - Math.floor(PT_); let c = Math.floor(PT_); if (lastDir > 0) c += f > .1 ? 1 : 0; else c += f > .9 ? 1 : 0; PT_ = clamp(c, 0, N - 1); snapped = true; }
  const w = RM ? 14 : 3.9, a = w * w * (PT_ - P) - 2 * w * vel; vel += a * dt; vel = clamp(vel, -2.2, 2.2); P += vel * dt; if (Math.abs(PT_ - P) < 1e-4 && Math.abs(vel) < 1e-3) { P = PT_; vel = 0; } };

/* ---------- UI ---------- */
const rail = $('#rail');
rail.innerHTML = CHAPTERS.map((c, i) => `<button class="ri" data-i="${i}" aria-label="${c.label}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.icon] || ICONS.pin}</svg><span>${c.label}</span></button>`).join('');
rail.addEventListener('click', e => { const b = e.target.closest('.ri'); if (b) jump(+b.dataset.i); });
const split = t => { let i = 0; return t.split(/(\s+)/).map(w => /^\s+$/.test(w) ? ' ' : w ? `<span class="w"><span style="transition-delay:${(.08 + i++ * .055).toFixed(3)}s">${w}</span></span>` : '').join(''); };
$('#chapters').innerHTML = CHAPTERS.map((c, i) => `<section class="chap" data-c="${i}" data-side="${c.side}" aria-label="${c.label}"><div class="cbox">
  ${c.tag ? `<span class="tag">${c.tag}</span>` : ''}<h2>${split(c.title)}</h2>${c.lead ? `<p class="lead fx">${c.lead}</p>` : ''}
  ${c.more ? `<button class="more fx" data-more="${i}"><i></i>Know more</button>` : ''}
  ${c.contact ? `<div class="contact fx"><a class="pill red" href="mailto:sales@rosewarecorp.com">Send an enquiry</a><a class="pill light" href="tel:+9603308554">+960 330 8554</a></div><div class="stats fx"><div><b>2007</b><span>In business since</span></div><div><b>18</b><span>Global vendor partners</span></div><div><b>12</b><span>Partner awards</span></div><div><b>All</b><span>Islands we reach</span></div></div>` : ''}
  </div>${c.caption && c.side !== 'center' ? `<p class="cap fx">${c.caption}</p>` : ''}${i === 0 ? `<div class="cue fx"><i></i>${MOBILE ? 'Swipe up to go inside' : 'Scroll to go inside'}</div>` : ''}</section>`).join('');
const chapEls = $$('.chap');
$$('[data-more]').forEach(b => b.addEventListener('click', () => openDrawer(+b.dataset.more)));
$$('[data-go]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const g = b.dataset.go; jump(g === 'talk' ? N - 1 : +g); }));
const dr = $('#drawer'), drBody = $('#drawerBody');
const projHTML = () => Object.entries(PROJECTS).map(([k, p]) => `<div class="site" data-site="${k}"><div class="siteHead"><span>${p.atoll} · ${p.place}</span><em>${p.items.length} project${p.items.length > 1 ? 's' : ''}</em></div>${p.items.map(it => `<article class="card"><div class="cardTop"><h4>${it.name}</h4><span class="yr">Completed ${it.year}</span></div><p>${it.scope}</p><div class="tags">${it.tags.map(t => `<i>${t}</i>`).join('')}</div></article>`).join('')}</div>`).join('');
const openDrawer = (i, focus) => { const c = CHAPTERS[i], m = c.more || {}; drawer = true; document.body.classList.add('drawerOpen');
  drBody.innerHTML = `<p class="kick">${m.kicker || c.label}</p><h3>${m.title || c.title}</h3>${m.body ? `<p class="body">${m.body}</p>` : ''}
    ${m.stats ? `<div class="stats">${m.stats.map(s => `<div><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}</div>` : ''}
    ${m.list ? `<ul class="list">${m.list.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${m.projects ? `<div class="sites">${projHTML()}</div><label class="exl">Find your site<select id="atollSel"><option value="">Choose your atoll</option>${AT.filter(a => a[0] !== 'male').map(a => `<option value="${a[0]}">${a[1]}</option>`).join('')}</select></label><p class="exNote" id="exNote"></p>` : ''}
    ${m.cta ? `<a class="pill red" href="mailto:sales@rosewarecorp.com?subject=${encodeURIComponent(m.cta)}">${m.cta}</a>` : `<a class="pill red" href="mailto:sales@rosewarecorp.com">Talk to an engineer</a>`}`;
  dr.classList.add('on'); dr.setAttribute('aria-hidden', 'false'); dr.querySelector('.drawerX').focus({ preventScroll: true });
  const sel = $('#atollSel'); if (sel) sel.addEventListener('change', () => { const a = AT.find(x => x[0] === sel.value); $('#exNote').textContent = a ? `${a[1]}: ${a[6]} islands. Our engineers design, install and support the full range of services here, same as in Malé.` : ''; });
  if (focus) { const el = drBody.querySelector(`[data-site="${focus}"]`); if (el) { el.classList.add('hl'); el.scrollIntoView({ block: 'center' }); } } };
const closeDrawer = () => { if (!drawer) return; drawer = false; document.body.classList.remove('drawerOpen'); dr.classList.remove('on'); dr.setAttribute('aria-hidden', 'true'); };
$('#drawerX').addEventListener('click', closeDrawer); $('#scrim').addEventListener('click', closeDrawer);
$('#aboutBtn').addEventListener('click', () => { drawer = true; document.body.classList.add('drawerOpen'); drBody.innerHTML = $('#aboutTpl').innerHTML; dr.classList.add('on'); dr.setAttribute('aria-hidden', 'false'); });
const audio = makeAudio(); const sBtn = $('#soundBtn');
const setSound = v => { audio.set(v); sBtn.classList.toggle('on', v); sBtn.setAttribute('aria-pressed', v); try { localStorage.setItem('rw-sound', v ? '1' : '0'); } catch (e) { } };
sBtn.addEventListener('click', () => setSound(!audio.on));
const tagsEl = $('#tags'); tagsEl.innerHTML = map.pins.map(p => `<button class="pinTag" data-site="${p.id}">${PROJECTS[p.id].place}<em>${PROJECTS[p.id].items.length}</em></button>`).join('');
const pinTags = $$('.pinTag'); pinTags.forEach(b => b.addEventListener('click', () => openDrawer(CH('projects'), b.dataset.site)));
/* floor indicator */
const floorEl = document.createElement('div'); floorEl.id = 'floorTag'; document.body.appendChild(floorEl);

/* ---------- pointer: look-around drag, taps on people and water ---------- */
const ray = new THREE.Raycaster(), nd = new THREE.Vector2(); let ptr = null, drag = null;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') ptr = { x: e.clientX / innerWidth * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1, m: true };
  if (drag && e.pointerType === 'mouse') { look.held = true; look.x = clamp((e.clientX - drag.x) / innerWidth * 1.6, -.7, .7); look.y = clamp((e.clientY - drag.y) / innerHeight * .9, -.35, .35); } }, { passive: true });
canvas.addEventListener('pointerdown', e => { ptr = { x: e.clientX / innerWidth * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1, tap: true, m: e.pointerType === 'mouse' }; if (e.pointerType === 'mouse') { drag = { x: e.clientX, y: e.clientY }; document.body.classList.add('grabbing'); } });
addEventListener('pointerup', () => { if (drag) { drag = null; look.held = false; document.body.classList.remove('grabbing'); } });
let ripT = -9, LANDC = null, LANDB = null;
const landCanvas = D => { const f = D.isl[D.male]; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let i = 0; i < f.length - 1; i += 2) { a = Math.min(a, f[i]); b = Math.max(b, f[i]); c = Math.min(c, f[i + 1]); d = Math.max(d, f[i + 1]); }
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const x = cv.getContext('2d'); LANDB = [a - 400, b + 400, c - 400, d + 400]; const S = 512 / (LANDB[1] - LANDB[0]), T = 512 / (LANDB[3] - LANDB[2]);
  D.isl.forEach(g => { x.beginPath(); for (let i = 0; i < g.length - 1; i += 2) { const px = (g[i] - LANDB[0]) * S, pz = (g[i + 1] - LANDB[2]) * T; i ? x.lineTo(px, pz) : x.moveTo(px, pz); } x.closePath(); x.fillStyle = '#fff'; x.fill(); }); LANDC = x.getImageData(0, 0, 512, 512).data; };
const isLand = (wx, wz) => { if (!LANDC) return false; const i = Math.floor((wx - LANDB[0]) / (LANDB[1] - LANDB[0]) * 512), j = Math.floor((wz - LANDB[2]) / (LANDB[3] - LANDB[2]) * 512); if (i < 0 || j < 0 || i > 511 || j > 511) return false; return LANDC[(j * 512 + i) * 4] > 128; };
const pointerUpdate = t => { if (!ptr || !entered) return; nd.set(ptr.x, ptr.y); ray.setFromCamera(nd, camera);
  if (ptr.tap) {
    if (PEOPLE) { const hits = ray.intersectObjects(PEOPLE.people.filter(p => p.wrap.visible).map(p => p.wrap), true); if (hits.length && hits[0].distance < 30) { let o = hits[0].object; const p = PEOPLE.people.find(pp => { let q = o; while (q) { if (q === pp.wrap) return true; q = q.parent; } return false; }); if (p) p.poke = t; } }
    if (Math.abs(P - CH('projects')) < .4) { const hits = ray.intersectObjects(map.pins.map(p => p.grp), true); if (hits.length) { const pin = map.pins.find(p => { let q = hits[0].object; while (q) { if (q === p.grp) return true; q = q.parent; } return false; }); if (pin) openDrawer(CH('projects'), pin.id); } }
  }
  const o = ray.ray.origin, d = ray.ray.direction; if (d.y < -.01 && o.y > 0) { const k = (SEA_Y - o.y) / d.y, x = o.x + d.x * k, z = o.z + d.z * k; if (MALE && k < 600 && (ptr.tap || t - ripT > .6) && !isLand(x, z)) { U.uRip.value.set(x, z, U.uT.value); ripT = t; } }
  ptr.tap = false; ptr = ptr.m ? ptr : null; };

/* ---------- resize & adaptive quality ---------- */
let dpr = Q.dpr; const resize = () => { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h); grade.uniforms.uAsp.value = w / h;
  if (MALE && MALE.sea.getRenderTarget) MALE.sea.getRenderTarget().setSize(Math.round(w * Q.refl * Math.min(dpr, 1.5)), Math.round(h * Q.refl * Math.min(dpr, 1.5))); document.body.classList.toggle('narrow', w < 760); };
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 300));
let ft = 0, fn = 0, slowT = 0, fastT = 0; const perf = dt => { if (document.hidden || dt > .2) { ft = 0; fn = 0; return; } ft += dt; fn++; if (fn < 30) return; const a = ft / fn; ft = 0; fn = 0;
  if (a > 1 / 40) { slowT++; fastT = 0; if (slowT > 1 && dpr > .75) { dpr = Math.max(.75, dpr - .15); resize(); slowT = 0; } } else if (a < 1 / 57) { fastT++; slowT = 0; if (fastT > 4 && dpr < Q.dpr) { dpr = Math.min(Q.dpr, dpr + .1); resize(); fastT = 0; } } else { slowT = fastT = 0; } };
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); document.body.classList.add('lost'); });

/* ---------- live sky chip ---------- */
const chip = $('#skyChip'); const updChip = () => { const ms = nowMs(), A = astro(ms); chip.textContent = `Live sky over Malé · ${mvClock(ms)} MVT · ${SKYKEY === 'night' ? phaseName(A.phase) : SKYKEY === 'golden' ? (A.sunAlt > 0 ? 'Golden hour' : 'Twilight') : 'Daylight'}`; };
setInterval(() => { updChip(); const k = pickSky(nowMs()); if (SKYMETA && k !== SKYKEY && !swapping) swapSky(k); }, 30000);
let swapping = false; const swapSky = k => { swapping = true; loadSky(k).then(a => { const t0 = performance.now(); const f = () => { const e = (performance.now() - t0) / 700; if (e < 1) { grade.uniforms.uFade.value = e * .85; requestAnimationFrame(f); } else { applySky(...a); updChip(); const t1 = performance.now(); const g = () => { const q = (performance.now() - t1) / 900; grade.uniforms.uFade.value = (1 - Math.min(q, 1)) * .85; if (q < 1) requestAnimationFrame(g); else swapping = false; }; g(); } }; f(); }).catch(() => { swapping = false; }); };

/* ---------- which floors to draw ---------- */
const LVY = { B3: [-12.6, -8.4], B2: [-8.4, -4.2], B1: [-4.2, 0], G: [0, 5.4], L1: [5.4, 9.6], L2: [9.6, 13.8], L3: [13.8, 18], L4: [18, 22.2], L5: [22.2, 26.4], ROOF: [26.4, 32] };
const FLOOR_NAME = { B3: 'Basement 3 · Power & cooling', B2: 'Basement 2 · Data hall', B1: 'Basement 1 · Security operations', G: 'Ground · Lobby', L1: 'Level 1 · Engineering', L2: 'Level 2 · Boardroom' };
let insideK = 0, curFloor = '', expoK = .55;
const levelVisible = (lv, camPos, inside) => { if (lv === 'FACADE') return !inside || camPos.y > -.5; if (lv === 'OUT') return camPos.y > -.5 && !inside; if (!inside) return true; const r = LVY[lv]; return camPos.y > r[0] - 4.6 && camPos.y < r[1] + 4.6; };

/* ---------- frame ---------- */
let t = 0, revealT = -1, last = performance.now(), curC = -1, lastFrame = 0;
const shadowFocus = V(0, 0, 0), sR = V(), sU = V(), UP = V(0, 1, 0), fwd = V(), right = V(), upv = V();
const frame = now => {
  requestAnimationFrame(frame); const raw = Math.max(0, (now - last) / 1000), dtR = Math.min(.25, raw), dt = Math.min(.05, dtR); last = now; t += dt; U.uT.value = t; grade.uniforms.uT.value = t; perf(raw);
  { let rem = dtR; while (rem > 1e-4) { const h = Math.min(rem, 1 / 60); scrollUpdate(h, now); rem -= h; } }
  /* camera along the journey */
  const tt = tAt(P); posC.getPoint(tt, camP); tgtC.getPoint(tt, camT); rollC.getPoint(tt, rv); const portrait = clamp((1.05 - camera.aspect) / .4); if (portrait > 0) { tgtM.getPoint(tt, camTM); camT.lerp(camTM, portrait); }
  const k = Math.min(N - 2, Math.floor(P)), f = clamp(P - k); camera.fov = lerp(fovAt[k], fovAt[Math.min(N - 1, k + 1)], sstep(0, 1, f)) * (1 + .32 * portrait);
  /* look-around: mouse hover parallax + drag, springs back */
  if (!look.held) { look.x *= Math.exp(-dt * 2.2); look.y *= Math.exp(-dt * 2.2); }
  const hx = FINE && ptr && entered && !drawer && !drag ? (ptr.x || 0) * .05 : 0, hy = FINE && ptr && entered && !drawer && !drag ? (ptr.y || 0) * .03 : 0;
  fwd.subVectors(camT, camP); const dist = fwd.length(); fwd.normalize(); right.crossVectors(fwd, UP).normalize(); upv.crossVectors(right, fwd);
  const rest = clamp(1 - Math.abs(P - Math.round(P)) * 5) * (RM ? 0 : 1);
  const yaw = look.x + hx + rest * Math.sin(t * .42) * .04, pitch = -look.y + hy + rest * Math.sin(t * .29 + 1) * .014; camT.copy(camP).addScaledVector(fwd, dist * Math.cos(yaw)).addScaledVector(right, dist * Math.sin(yaw)).addScaledVector(upv, dist * Math.sin(pitch));
  camP.y += Math.sin(t * .5) * .012 * (camP.y < 30 ? 1 : 0);
  camera.position.copy(camP); camera.up.set(0, 1, 0); camera.lookAt(camT); camera.rotateZ(rv.x);
  const alt = camP.y; camera.near = clamp(alt * .002, .05, 4000); if (alt < 40) camera.near = .05; camera.far = Math.max(12000, alt * 6); camera.updateProjectionMatrix();
  /* section planes */
  const sl = secLv(P), sf = secFac(P, camP.z); SEC.lv.constant = sl; SEC.fac.constant = sf; SEC.uLv.value = sl; SEC.uFac.value = sf; SEC.uLine.value = sl < 20 ? 1 : 0;
  /* inside the building? */
  const inside = Math.abs(camP.x) < 12.2 && camP.z < 8.4 && camP.z > -8.4 && camP.y < 26.4 && camP.y > -13;
  insideK = lerp(insideK, inside ? 1 : 0, 1 - Math.exp(-dt * 3));
  /* exposure: interiors a touch brighter, night city darker */
  /* eye adaptation: each floor has its own exposure (daylit offices are ~10x brighter than the plant room) */
  const nearB = Math.abs(camP.x) < 22 && camP.z < 14 && camP.y < 28;
  const ex = camP.y < -8.4 ? 2.4 : camP.y < -4.2 ? lerp(2.4, 1.9, sstep(-8.9, -7.9, camP.y)) : camP.y < 0 ? lerp(1.9, 1.15, sstep(-4.7, -3.7, camP.y)) : lerp(lerp(1.15, .46, sstep(-.5, .8, camP.y)), .4, sstep(5, 6, camP.y));
  expoK = lerp(expoK, nearB ? ex : 1, 1 - Math.exp(-dt * 2.5));
  renderer.toneMappingExposure = LOOKNOW.exp * expoK * (SKYKEY === "night" && nearB && camP.y > 0 ? 1.6 : 1);
  scene.fog.density = LOOKNOW.fogD * clamp(Math.pow(90 / Math.max(alt, 1), 1.3), .0005, 1) * (1 - insideK); U.uFogD.value = scene.fog.density * 1.15;
  /* chapter effects */
  const near = c => clamp(1 - Math.abs(P - c) / .8);
  const pj = near(CH('projects'));
  /* the chart fades in above ~30 km; the lagoon and city give way to it */
  const chA = sstep(28000, 95000, alt), ocA = sstep(40000, 140000, alt); map.mesh.material.opacity = chA; map.ocean.material.uniforms.uA.value = ocA; map.mesh.visible = chA > .003; map.ocean.visible = ocA > .003; map.beamM.uniforms.uA.value = chA;
  map.pins.forEach((p, i) => { p.grp.visible = chA > .01; const s = 1 + Math.sin(t * 2.2 + i) * .25, sz = alt * .011; p.ring.scale.setScalar(sz * s * (1 + pj * .5)); p.ring.material.opacity = (1.2 - s * .6) * chA; p.dot.scale.setScalar(sz * .45); p.dot.position.y = sz * .3; p.dot.material.opacity = chA;
    p.beam.scale.set(alt * .0016, alt * .2, alt * .0016); p.P.y = sz * .5; });
  U.uCloudA.value = sstep(450, 1000, alt) * (1 - sstep(9000, 45000, alt)); clouds.visible = U.uCloudA.value > .01;
  const high = alt > 4000, vhigh = alt > 60000;
  if (MALE) { const outside = (!inside || camP.y > -.5) && !(sl < 20 && camP.y < 3 && sf > 20); MALE.G.visible = outside && !vhigh; MALE.osm.visible = MALE.fill.visible = !high; const useRefl = outside && alt > 30 && alt < 1600 && sf > 20; MALE.sea.visible = useRefl; MALE.flat.visible = outside && !useRefl && ocA < .99 && (sf > 20 || alt > 200); }
  if (HQ) HQ.root.visible = !high; if (PEOPLE) PEOPLE.root.visible = !high;
  bloom.threshold = lerp(.92, 1.45, insideK);
  if (HQ) {
    for (const n in HQ.LV) HQ.LV[n].grp.visible = levelVisible(n, camP, inside);
    HQ.update(t, camP.y, inside); const nl = LOOKNOW.night; HQ.NIGHTGLOW.forEach(([m, d, n2]) => m.color.setScalar(lerp(d, n2, nl)));
  }
  if (PEOPLE) { PEOPLE.people.forEach(p => { if (p.poke && t - p.poke < .1 && p.gest) { p.gest.reset().fadeIn(.2).play(); } }); PEOPLE.update(dt, t, lv => levelVisible(lv, camP, inside)); }
  /* floor indicator */
  let fl = ''; if (inside) for (const n in LVY) { const r = LVY[n]; if (camP.y >= r[0] && camP.y < r[1]) fl = n; }
  if (fl !== curFloor) { curFloor = fl; floorEl.textContent = FLOOR_NAME[fl] || ''; floorEl.classList.toggle('on', !!FLOOR_NAME[fl] && entered); }
  /* sun shadows: the building and the plaza */
  shadowFocus.set(0, 0, 6); const half = alt > 60 ? 140 : 50, sc = sun.shadow.camera;
  if (sc.right !== half) { sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.updateProjectionMatrix(); }
  const sd = U.uSunDir.value, ts = 2 * half / Q.shadow; sR.crossVectors(sd, UP).normalize(); sU.crossVectors(sR, sd).normalize(); const r0 = shadowFocus.dot(sR), u0 = shadowFocus.dot(sU); shadowFocus.addScaledVector(sR, Math.round(r0 / ts) * ts - r0).addScaledVector(sU, Math.round(u0 / ts) * ts - u0);
  sun.target.position.copy(shadowFocus); sun.position.copy(shadowFocus).addScaledVector(sd, 300); sun.castShadow = !inside && alt < 500;
  /* DOM */
  const c = Math.round(P);
  if (c !== curC) { curC = c; $$('.ri').forEach((b, i) => { b.classList.toggle('on', i === c); b.toggleAttribute('aria-current', i === c); }); document.body.dataset.c = c; }
  chapEls.forEach(el => { const i = +el.dataset.c, on = entered && !drawer && Math.abs(P - i) < .3; if (el.classList.contains('on') !== on) el.classList.toggle('on', on); });
  const showPins = entered && pj > .6 && !drawer; pinTags.forEach((b, i) => { const v = map.pins[i].P.clone().project(camera); const vis = showPins && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1; b.classList.toggle('on', vis); if (vis) b.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - v.y) / 2 * innerHeight - 14).toFixed(1)}px) translate(${map.pins[i].id === 'kv' ? '12px,-50%' : map.pins[i].id === 'male' ? 'calc(-100% - 12px),-50%' : '-50%,-100%'})`; });
  if (revealT >= 0) { const e = clamp((now - revealT) / (RM ? 300 : 2100)); grade.uniforms.uReveal.value = e; if (e >= 1) revealT = -1; }
  pointerUpdate(t);
  composer.render(dt);
  if (!lastFrame) { lastFrame = 1; window.__frame = true; }
};

/* ---------- boot ---------- */
const loaderBar = $('#loadBar'), enterBtn = $('#enterBtn');
let bootOk = false;
const enter = () => { if (entered || !bootOk) return; entered = true; document.body.classList.add('entered'); revealT = performance.now(); let want = true; try { want = localStorage.getItem('rw-sound') !== '0'; } catch (e) { } setSound(want); setTimeout(() => $('#loader').remove(), 2400); };
enterBtn.addEventListener('click', enter);
const cp = new URLSearchParams(location.search).get('c'); if (cp) { P = PT_ = clamp(+cp, 0, N - 1); }
fetch('assets/index.json').then(r => r.json()).then(j => { SKYMETA = j; return loadSky(skyKey); }).then(async a => {
  applySky(...a); updChip(); resize(); requestAnimationFrame(frame);
  const tick = () => { loaderBar.style.transform = `scaleX(${Math.max(.08, loadP)})`; if (!bootOk) setTimeout(tick, 80); }; tick();
  const [hq, ppl, male] = await Promise.all([loadHQ({ manager, TL, U, Q }), loadPeople({ manager, U, scene }).catch(e => { console.warn('people', e); return null; }), loadMale({ scene, U, Q, TL })]);
  HQ = hq; scene.add(HQ.root); PEOPLE = ppl; MALE = male; landCanvas(male.D);
  try { captureEnv(renderer, scene, HQ, [male.G, male.sea, male.flat, ppl ? ppl.root : male.G, clouds, map.mesh, map.ocean, skyDome.mesh]); } catch (e) { console.warn('env', e); }
  renderer.compile(scene, camera); bootOk = true; loaderBar.style.transform = 'scaleX(1)'; document.body.classList.add('ready'); if (new URLSearchParams(location.search).has('auto')) enter();
}).catch(e => { console.error(e); fail('The scene could not load. Please refresh.'); });
window.__dbg = { get P() { return P; }, set P(v) { P = PT_ = v; }, jump, U, camera, scene, renderer, composer, SEC, get HQ() { return HQ; }, get PEOPLE() { return PEOPLE; } };
