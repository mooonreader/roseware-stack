import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { V, rnd, lerp, clamp, sstep, makeLib, buildTerrain, buildDepthMap, buildWater, buildClouds, PT } from './world1.js';
import { buildPalms, buildShrubs, buildArchitecture, buildCoast, buildFarIslands, buildNetwork, buildShield, vegetationSpots } from './world2.js';
import { makeSkyDome, sunDirFromPx, rotForAzimuth, astro, nowMs, pickSky, LOOK, mvClock, phaseName } from './sky.js';
import { CHAPTERS, PROJECTS, ICONS } from './content.js';
import { AT } from './data.js';
import { makeAudio } from './audio.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const N = CHAPTERS.length, RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
const FINE = matchMedia('(pointer: fine)').matches;
const Q = MOBILE ? { hi: false, dpr: Math.min(devicePixelRatio, 1.5), shadow: 1024, refl: .35, aniso: 4, msaa: 0 } : { hi: true, dpr: Math.min(devicePixelRatio, 2), shadow: 2048, refl: .5, aniso: 8, msaa: 4 };
const fail = msg => { document.body.classList.add('nogl'); const e = $('#loadMsg'); if (e) e.textContent = msg; window.__fail = msg; };

/* ---------- renderer ---------- */
const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }); } catch (e) { fail('3D is not available on this device.'); throw e; }
if (!renderer.capabilities.isWebGL2) { fail('3D needs a newer browser.'); throw new Error('webgl2'); }
renderer.setPixelRatio(Q.dpr); renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
THREE.Cache.enabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 12000);

/* shared uniforms */
const U = { uT: { value: 0 }, uWater: { value: 1 }, uNight: { value: 0 }, uFogD: { value: .0003 }, uSunDir: { value: V(.4, .7, .3).normalize() }, uSunC: { value: new THREE.Color(1, .95, .85) }, uFog: { value: new THREE.Color(0x9fc3df) },
  uRip: { value: V(0, 0, -99) }, uCloudA: { value: 1 }, uNet: { value: 0 }, uSec: { value: 0 }, uHit: { value: new THREE.Vector4(0, -999, 0, 0) } };

/* ---------- loading ---------- */
const manager = new THREE.LoadingManager(); let loadP = 0, loadDone = false;
manager.onProgress = (u, a, b) => { loadP = a / b; }; manager.onLoad = () => { loadDone = true; };
const TL = new THREE.TextureLoader(manager), lib = makeLib(TL, Q);
let SKYMETA = null, skyKey = pickSky(nowMs());
const skyDome = makeSkyDome(); scene.add(skyDome.mesh);
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.bias = -.0003; sun.shadow.normalBias = .04; scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.near = 1; c.far = 600; c.left = c.bottom = -40; c.right = c.top = 40; c.updateProjectionMatrix(); }
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xe8dcc4, .35); scene.add(hemi);
scene.fog = new THREE.FogExp2(0x9fc3df, .0003);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, skyRot = 0;
const applySky = (key, meta, hdr, jpg) => {
  const L = LOOK[key], A = astro(nowMs());
  skyRot = rotForAzimuth(meta.sun_px, meta.size, A.sunAz);
  skyDome.u.tSky.value = jpg; skyDome.u.uRot.value = skyRot; skyDome.u.uExp.value = L.bg * (key === 'night' ? .55 : 1.55); skyDome.u.uGrade.value.set(...L.grade); skyDome.u.uHaze.value.set(L.fog); skyDome.u.uHazeK.value = key === 'night' ? .25 : .5;
  /* environment lighting from the HDR, rotated to match, with the sun clamped (the light handles it) */
  const es = new THREE.Scene(), em = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { t: { value: hdr }, uRot: { value: skyRot }, uK: { value: key === 'night' ? .35 : 1 } },
    vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform sampler2D t;uniform float uRot,uK;varying vec3 vD;void main(){vec3 d=normalize(vD);float c=cos(uRot),s=sin(uRot);vec3 r=vec3(d.x*c-d.z*s,d.y,d.x*s+d.z*c);vec2 uv=vec2(atan(r.z,r.x)/6.2831853+.5,asin(clamp(r.y,-1.,1.))/3.1415927+.5);vec3 col=min(texture2D(t,uv).rgb,vec3(24.))*uK;if(d.y<0.)col=mix(col,vec3(.28,.32,.34)*uK,smoothstep(0.,-.2,d.y));gl_FragColor=vec4(col,1.);}' });
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), em)); const rt = pmrem.fromScene(es, .02); scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt; em.dispose();
  const sd = sunDirFromPx(meta.sun_px, meta.size, skyRot); if (key === 'golden' && sd.y < .09) { sd.y = .09; sd.normalize(); } if (key === 'night') { sd.set(-.35, .82, .45).normalize(); }
  U.uSunDir.value.copy(sd); sun.color.set(L.sunC); sun.intensity = L.sunI; U.uSunC.value.set(L.sunC).multiplyScalar(key === 'night' ? .35 : 1);
  hemi.intensity = L.hemi; scene.fog.color.set(L.fog); scene.fog.density = L.fogD; U.uFog.value.set(L.fog); U.uFogD.value = L.fogD * 1.15; U.uWater.value = L.water; U.uNight.value = L.night;
  renderer.toneMappingExposure = L.exp; bloom.strength = L.bloom; LOOKNOW = L; SKYKEY = key; };
let LOOKNOW = LOOK.day, SKYKEY = 'day';
const loadSky = key => new Promise((res, rej) => {
  const meta = SKYMETA.sky[key]; let hdr = null, jpg = null; const done = () => { if (hdr && jpg) res([key, meta, hdr, jpg]); };
  new RGBELoader(manager).setDataType(THREE.HalfFloatType).load(`../assets/sky/${key}_env.hdr`, t => { hdr = t; done(); }, undefined, rej);
  TL.load(`../assets/sky/${key}${Q.hi ? '' : '_lo'}.jpg`, t => { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; jpg = t; done(); }, undefined, rej);
});

/* ---------- post: bloom + grade + pixel dissolve intro ---------- */
const rtc = new THREE.WebGLRenderTarget(innerWidth * Q.dpr, innerHeight * Q.dpr, { type: THREE.HalfFloatType, samples: Q.msaa });
const composer = new EffectComposer(renderer, rtc); composer.setPixelRatio(Q.dpr); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .3, .55, .92); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uReveal: { value: 0 }, uAsp: { value: innerWidth / innerHeight }, uFade: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uT,uReveal,uAsp,uFade;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 c=vUv-.5;float r=length(c*vec2(uAsp,1.));vec2 off=c*.0022*r;
      vec3 col=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
      col*=1.-smoothstep(.55,1.35,r)*.42;col+=(h(vUv*vec2(1713.,977.)+fract(uT))-.5)*.028;
      vec2 cell=floor(vec2(vUv.x*uAsp,vUv.y)*26.);float n=h(cell);float d=length((cell/26.-vec2(uAsp*.5,.5))*vec2(1.,1.15));
      float th=uReveal*1.6-.3;float m=step(d*.85+n*.42,th+.05);float edge=step(d*.85+n*.42,th+.13)-m;
      vec3 paper=vec3(.937,.906,.855)+(h(vUv*800.)-.5)*.03;col=mix(paper,col,m);col=mix(col,mix(col,vec3(.93,.6,.48),.35),edge);
      col=mix(col,vec3(.03,.04,.05),uFade);gl_FragColor=vec4(col,1.);}` });
composer.addPass(grade);

/* ---------- the world ---------- */
const depthTex = buildDepthMap();
const terrain = buildTerrain(lib, Q); scene.add(terrain);
const water = buildWater(Q, U, depthTex); water.material.uniforms.tDepth.value = depthTex; scene.add(water);
const arch = buildArchitecture(scene, lib, Q, U, renderer);
const coast = buildCoast(scene, lib, Q, U, arch.mats);
const veg = vegetationSpots(); const farPalms = buildFarIslands(scene, Q, U);
buildPalms(scene, Q, U, veg.palms.concat(Q.hi ? farPalms : farPalms.filter((_, i) => i % 2 === 0)));
buildShrubs(scene, Q, Q.hi ? veg.shrubs : veg.shrubs.filter((_, i) => i % 2 === 0));
const clouds = buildClouds(Q, U); scene.add(clouds);
const fibres = buildNetwork(scene, U); const shield = buildShield(scene, U);
const NIGHT = [...arch.NIGHT, ...coast.NIGHT];

/* ---------- camera path ---------- */
const W = [
  [[40, 232, 330], [0, 10, 0], 0, 42],
  [[30, 140, 300], [0, 5, 40]], [[14, 34, 236], [0, 3, 60]],
  [[3.6, 3.1, 152], [0, 3.8, 40], 1, 50],
  [[2.4, 2.8, 110], [0, 3.4, 20]], [[.6, 2.7, 62], [0, 3.4, 0]], [[0, 2.6, 30], [0, 3.4, 0]],
  [[0, 2.65, 13.3], [-3.4, 3.7, 0], 2, 50],
  [[0, 3.6, 8.4], [-3, 4.6, 0]], [[-6, 8.6, 6], [-16, 5.4, 0]], [[-14, 11, 13], [-22, 5, 0]],
  [[-18.5, 11.6, 16.5], [-19.4, 4.2, -1.6], 3, 50],
  [[-10, 10, 8], [-2, 3, -8]], [[-6, 8.4, 4], [0, 3, -8]], [[-4.6, 5.8, -3.6], [0, 2.5, -14]], [[0, 2.7, -8.8], [0, 2, -20]], [[0, 1.9, -13], [0, 1.75, -26]],
  [[0, 1.82, -16.4], [0, 1.74, -27], 4, 52],
  [[0, 1.85, -24.5], [0, 2, -40]], [[0, 2.4, -31.5], [3, 4, -60]], [[8, 10, -52], [40, 4, -60]], [[55, 30, -40], [40, 0, -150]], [[65, 50, 20], [40, 0, -230]],
  [[45, 62, 64], [40, 0, -250], 5, 50],
  [[-20, 90, 150], [0, 6, 0]],
  [[-150, 84, 196], [30, 4, 18], 6, 46],
  [[-60, 50, 100], [10, 6, 0]], [[10, 22, 30], [20, 3, 0]], [[27, 11, 14], [22.6, 2.5, 0]],
  [[26, 6.9, 6.4], [21.9, 2.4, -1.3], 7, 50],
  [[25, 8.5, 12], [10, 6, 30]], [[18, 10, 16], [0, 6, 30]], [[6, 13, 21], [-30, 4, 60]],
  [[-12.8, 11.6, 13.6], [-60, 1.5, 90], 8, 50],
];
/* portrait framing: subjects centred instead of offset beside the text */
const PORTRAIT = { 2: [0, 3.9, 0], 3: [-22.6, 4.2, -.6], 6: [10, 4, 12], 7: [22.65, 2.4, -.9], 1: [0, 3.8, 40] };
const posC = new THREE.CatmullRomCurve3(W.map(w => V(...w[0])), false, 'centripetal', .5), tgtC = new THREE.CatmullRomCurve3(W.map(w => V(...w[1])), false, 'centripetal', .5);
const tgtM = new THREE.CatmullRomCurve3(W.map(w => V(...(w[2] != null && PORTRAIT[w[2]] ? PORTRAIT[w[2]] : w[1]))), false, 'centripetal', .5), camTM = V(0, 0, 0);
const stopIdx = W.map((w, i) => w[2] != null ? i : -1).filter(i => i >= 0), fovAt = stopIdx.map(i => W[i][3] || 50);
const LUT = []; { const nW = W.length - 1;
  for (let k = 0; k < N - 1; k++) { const a = stopIdx[k] / nW, b = stopIdx[k + 1] / nW, S = 200, L = [0]; let pp = posC.getPoint(a), pt = tgtC.getPoint(a);
    for (let i = 1; i <= S; i++) { const t = lerp(a, b, i / S), p = posC.getPoint(t), q = tgtC.getPoint(t); L.push(L[i - 1] + p.distanceTo(pp) + .2 * q.distanceTo(pt)); pp = p; pt = q; }
    LUT.push({ a, b, L, tot: L[S] }); } }
const tAt = P => { const k = Math.min(N - 2, Math.max(0, Math.floor(P))), f = clamp(P - k), l = LUT[k], tgt = f * l.tot; let lo = 0, hi = l.L.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (l.L[m] < tgt) lo = m; else hi = m; } const ff = (tgt - l.L[lo]) / ((l.L[hi] - l.L[lo]) || 1); return lerp(l.a, l.b, (lo + ff) / (l.L.length - 1)); };
const camP = V(0, 0, 0), camT = V(0, 0, 0);

/* ---------- scroll: smooth spring, magnetic stops, one-flight jumps ---------- */
let P = 0, PT_ = 0, vel = 0, lastIn = -1e9, lastDir = 1, snapped = true, tween = null, drawer = false, entered = false, touching = false;
const jump = c => { c = clamp(Math.round(c), 0, N - 1); const d = Math.abs(c - P); if (d < .01) return; if (d <= 1.05 && !RM) { PT_ = c; snapped = true; lastIn = -1e9; return; }
  tween = { a: P, b: c, t0: performance.now(), T: RM ? 10 : clamp(1100 + 420 * d, 1300, 3600) }; PT_ = c; snapped = true; };
const input = d => { if (!entered || drawer) return; if (tween) { PT_ = P; tween = null; } PT_ = clamp(PT_ + d, 0, N - 1); lastIn = performance.now(); lastDir = Math.sign(d) || lastDir; snapped = false; };
addEventListener('wheel', e => { if (e.ctrlKey) return; if (e.target.closest && e.target.closest('.drawer,.panelScroll')) return; e.preventDefault(); const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? innerHeight : 1; let d = e.deltaY * k; if (Math.abs(e.deltaX) > Math.abs(d)) return; input(clamp(d, -260, 260) / 720); }, { passive: false });
let ty = 0, tP = 0, tv = 0, tl = 0;
addEventListener('touchstart', e => { if (e.target.closest('.drawer,.panelScroll,button,a,select')) return; touching = true; ty = e.touches[0].clientY; tl = performance.now(); tv = 0; if (tween) { PT_ = P; tween = null; } tP = PT_; }, { passive: true });
addEventListener('touchmove', e => { if (!touching || !entered || drawer) return; e.preventDefault(); const y = e.touches[0].clientY, now = performance.now(); const d = (ty - y) / (innerHeight * .75); tv = lerp(tv, (d - (PT_ - tP)) / Math.max(1, now - tl) * 1000, .3); tl = now; PT_ = clamp(tP + d, 0, N - 1); lastIn = now; lastDir = Math.sign(d) || lastDir; snapped = false; }, { passive: false });
addEventListener('touchend', () => { if (!touching) return; touching = false; if (Math.abs(tv) > .6) lastDir = Math.sign(tv); lastIn = performance.now() - 400; });
addEventListener('keydown', e => { if (!entered) { if (e.key === 'Enter') enter(); return; } if (e.key === 'Escape') closeDrawer(); if (drawer) return;
  if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); jump(Math.round(PT_) + 1); } if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); jump(Math.round(PT_) - 1); } if (e.key === 'Home') jump(0); if (e.key === 'End') jump(N - 1); });
const scrollUpdate = (dt, now) => {
  if (tween) { const k = clamp((now - tween.t0) / tween.T), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; P = lerp(tween.a, tween.b, e); vel = 0; if (k >= 1) { P = tween.b; tween = null; } return; }
  if (!snapped && !touching && now - lastIn > 200) { const f = PT_ - Math.floor(PT_); let c = Math.floor(PT_); if (lastDir > 0) c += f > .1 ? 1 : 0; else c += f > .9 ? 1 : 0; PT_ = clamp(c, 0, N - 1); snapped = true; }
  const w = RM ? 14 : 4.6, a = w * w * (PT_ - P) - 2 * w * vel; vel += a * dt; vel = clamp(vel, -2.6, 2.6); P += vel * dt; if (Math.abs(PT_ - P) < 1e-4 && Math.abs(vel) < 1e-3) { P = PT_; vel = 0; } };

/* ---------- UI ---------- */
const rail = $('#rail');
rail.innerHTML = CHAPTERS.map((c, i) => `<button class="ri" data-i="${i}" aria-label="${c.label}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.icon]}</svg><span>${c.label}</span></button>`).join('');
rail.addEventListener('click', e => { const b = e.target.closest('.ri'); if (b) jump(+b.dataset.i); });
const split = t => { let i = 0; return t.split(/(\s+)/).map(w => /^\s+$/.test(w) ? ' ' : w ? `<span class="w"><span style="transition-delay:${(.08 + i++ * .055).toFixed(3)}s">${w}</span></span>` : '').join(''); };
$('#chapters').innerHTML = CHAPTERS.map((c, i) => `<section class="chap" data-c="${i}" data-side="${c.side}" aria-label="${c.label}"><div class="cbox">
  ${c.tag ? `<span class="tag">${c.tag}</span>` : ''}<h2>${split(c.title)}</h2>${c.lead ? `<p class="lead fx">${c.lead}</p>` : ''}
  ${c.more ? `<button class="more fx" data-more="${i}"><i></i>Know more</button>` : ''}
  ${c.contact ? `<div class="contact fx"><a class="pill red" href="mailto:sales@rosewarecorp.com">Send an enquiry</a><a class="pill light" href="tel:+9603308554">+960 330 8554</a></div><div class="stats fx"><div><b>2007</b><span>In business since</span></div><div><b>18</b><span>Global vendor partners</span></div><div><b>12</b><span>Partner awards</span></div><div><b>All</b><span>Islands we reach</span></div></div>` : ''}
  </div>${c.caption && c.side !== 'center' ? `<p class="cap fx">${c.caption}</p>` : ''}${i === 0 ? `<div class="cue fx"><i></i>${MOBILE ? 'Swipe up to discover' : 'Scroll to discover'}</div>` : ''}</section>`).join('');
const chapEls = $$('.chap');
$$('[data-more]').forEach(b => b.addEventListener('click', () => openDrawer(+b.dataset.more)));
$$('[data-go]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); jump(+b.dataset.go); }));
const dr = $('#drawer'), drBody = $('#drawerBody');
const projHTML = () => Object.entries(PROJECTS).map(([k, p]) => `<div class="site" data-site="${k}"><div class="siteHead"><span>${p.atoll} · ${p.place}</span><em>${p.items.length} project${p.items.length > 1 ? 's' : ''}</em></div>${p.items.map(it => `<article class="card"><div class="cardTop"><h4>${it.name}</h4><span class="yr">Completed ${it.year}</span></div><p>${it.scope}</p><div class="tags">${it.tags.map(t => `<i>${t}</i>`).join('')}</div></article>`).join('')}</div>`).join('');
const openDrawer = (i, focus) => { const c = CHAPTERS[i], m = c.more || {}; drawer = true; document.body.classList.add('drawerOpen');
  drBody.innerHTML = `<p class="kick">${m.kicker || c.label}</p><h3>${m.title || c.title}</h3>${m.body ? `<p class="body">${m.body}</p>` : ''}
    ${m.stats ? `<div class="stats">${m.stats.map(s => `<div><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}</div>` : ''}
    ${m.list ? `<ul class="list">${m.list.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${m.projects ? `<div class="sites">${projHTML()}</div><label class="exl">Find your site<select id="atollSel"><option value="">Choose your atoll</option>${AT.filter(a => a[0] !== 'male').map(a => `<option value="${a[0]}">${a[1]}</option>`).join('')}</select></label><p class="exNote" id="exNote"></p>` : ''}
    ${m.cta ? `<a class="pill red" href="mailto:sales@rosewarecorp.com?subject=${encodeURIComponent(m.cta)}">${m.cta}</a>` : `<a class="pill red" href="mailto:sales@rosewarecorp.com">Talk to an engineer</a>`}`;
  dr.classList.add('on'); dr.setAttribute('aria-hidden', 'false'); dr.querySelector('.drawerX').focus({ preventScroll: true });
  const sel = $('#atollSel'); if (sel) sel.addEventListener('change', () => exploreAtoll(sel.value));
  if (focus) { const el = drBody.querySelector(`[data-site="${focus}"]`); if (el) { el.classList.add('hl'); el.scrollIntoView({ block: 'center' }); } } };
const closeDrawer = () => { if (!drawer) return; drawer = false; document.body.classList.remove('drawerOpen'); dr.classList.remove('on'); dr.setAttribute('aria-hidden', 'true'); exploreAtoll(''); };
$('#drawerX').addEventListener('click', closeDrawer); $('#scrim').addEventListener('click', closeDrawer);
$('#aboutBtn').addEventListener('click', () => { drawer = true; document.body.classList.add('drawerOpen'); drBody.innerHTML = $('#aboutTpl').innerHTML; dr.classList.add('on'); dr.setAttribute('aria-hidden', 'false'); });
let exSel = null; const exploreAtoll = id => { exSel = id ? AT.find(a => a[0] === id) : null; const n = $('#exNote'); if (n) n.textContent = exSel ? `${exSel[1]}: ${exSel[6]} islands. Our engineers design, install and support the full range of services here, same as in Malé.` : ''; };
/* sound */
const audio = makeAudio(); const sBtn = $('#soundBtn');
const setSound = v => { audio.set(v); sBtn.classList.toggle('on', v); sBtn.setAttribute('aria-pressed', v); try { localStorage.setItem('rw-sound', v ? '1' : '0'); } catch (e) { } };
sBtn.addEventListener('click', () => setSound(!audio.on));
/* project pin labels */
const tagsEl = $('#tags'); tagsEl.innerHTML = arch.map.pins.map(p => `<button class="pinTag" data-site="${p.id}">${PROJECTS[p.id].place}<em>${PROJECTS[p.id].items.length}</em></button>`).join('');
const pinTags = $$('.pinTag'); pinTags.forEach(b => b.addEventListener('click', () => openDrawer(7, b.dataset.site)));

/* ---------- pointer: water ripples, shield touch ---------- */
const ray = new THREE.Raycaster(), nd = new THREE.Vector2(); let ptr = null;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') ptr = { x: e.clientX / innerWidth * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1, m: true }; }, { passive: true });
canvas.addEventListener('pointerdown', e => { ptr = { x: e.clientX / innerWidth * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1, tap: true }; });
let ripT = -9, ripL = V(1e9, 0, 0);
const pointerUpdate = t => { if (!ptr || !entered) return; nd.set(ptr.x, ptr.y); ray.setFromCamera(nd, camera);
  if (U.uSec.value > .3) { const h = ray.intersectObject(shield, false); if (h.length) { U.uHit.value.set(h[0].point.x, h[0].point.y, h[0].point.z, ptr.tap ? 1 : .6); } }
  const o = ray.ray.origin, d = ray.ray.direction; if (d.y < -.01) { const k = -o.y / d.y, x = o.x + d.x * k, z = o.z + d.z * k; if (k < 260 && (ptr.tap || (t - ripT > .5 && Math.hypot(x - ripL.x, z - ripL.z) > 4))) { U.uRip.value.set(x, z, U.uT.value); ripT = t; ripL.set(x, 0, z); } }
  if (ptr.tap) { const hits = ray.intersectObjects(arch.map.pins.map(p => p.grp), true); if (hits.length && Math.abs(P - 7) < .4) { const pin = arch.map.pins.find(p => hits[0].object.parent === p.grp); if (pin) openDrawer(7, pin.id); } }
  ptr.tap = false; ptr = ptr.m ? ptr : null; };
setInterval(() => { U.uHit.value.w *= .9; }, 100);

/* ---------- resize & adaptive quality ---------- */
let dpr = Q.dpr; const resize = () => { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h); grade.uniforms.uAsp.value = w / h;
  if (water.getRenderTarget) water.getRenderTarget().setSize(Math.round(w * Q.refl * Math.min(dpr, 1.5)), Math.round(h * Q.refl * Math.min(dpr, 1.5))); document.body.classList.toggle('narrow', w < 760); };
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 300));
let ft = 0, fn = 0, slowT = 0, fastT = 0; const perf = dt => { if (document.hidden || dt > .2) { ft = 0; fn = 0; return; } ft += dt; fn++; if (fn < 30) return; const a = ft / fn; ft = 0; fn = 0;
  if (a > 1 / 40) { slowT++; fastT = 0; if (slowT > 1 && dpr > .75) { dpr = Math.max(.75, dpr - .15); resize(); slowT = 0; } } else if (a < 1 / 57) { fastT++; slowT = 0; if (fastT > 4 && dpr < Q.dpr) { dpr = Math.min(Q.dpr, dpr + .1); resize(); fastT = 0; } } else { slowT = fastT = 0; } };
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); document.body.classList.add('lost'); });

/* ---------- live sky chip ---------- */
const chip = $('#skyChip'); const updChip = () => { const ms = nowMs(), A = astro(ms); chip.textContent = `Live sky over Malé · ${mvClock(ms)} MVT · ${SKYKEY === 'night' ? phaseName(A.phase) : SKYKEY === 'golden' ? (A.sunAlt > 0 ? 'Golden hour' : 'Twilight') : 'Daylight'}`; };
setInterval(() => { updChip(); const k = pickSky(nowMs()); if (SKYMETA && k !== SKYKEY && !swapping) swapSky(k); }, 30000);
let swapping = false; const swapSky = k => { swapping = true; loadSky(k).then(a => { let t0 = performance.now(); const f = () => { const e = (performance.now() - t0) / 700; if (e < 1) { grade.uniforms.uFade.value = e * .85; requestAnimationFrame(f); } else { applySky(...a); updChip(); let t1 = performance.now(); const g = () => { const q = (performance.now() - t1) / 900; grade.uniforms.uFade.value = (1 - Math.min(q, 1)) * .85; if (q < 1) requestAnimationFrame(g); else swapping = false; }; g(); } }; f(); }).catch(() => { swapping = false; }); };

/* ---------- frame ---------- */
const clock = new THREE.Clock(); let t = 0, revealT = -1, last = performance.now(), curC = -1, lastFrame = 0;
const slabOut = [0, 0, 0, 0, 0], seamI = [1.2, 1.2, 1.2, 1.2, 1.2, 1.2];
const shadowFocus = V(0, 0, 0), sR = V(), sU = V(), UP = V(0, 1, 0);
const frame = now => {
  requestAnimationFrame(frame); const raw = Math.max(0, (now - last) / 1000), dtR = Math.min(.25, raw), dt = Math.min(.05, dtR); last = now; t += dt; U.uT.value = t; grade.uniforms.uT.value = t; perf(raw);
  { let rem = dtR; while (rem > 1e-4) { const h = Math.min(rem, 1 / 60); scrollUpdate(h, now); rem -= h; } }
  /* camera */
  const tt = tAt(P); posC.getPoint(tt, camP); tgtC.getPoint(tt, camT); const portrait = clamp((1.05 - camera.aspect) / .4); if (portrait > 0) { tgtM.getPoint(tt, camTM); camT.lerp(camTM, portrait); }
  const k = Math.min(N - 2, Math.floor(P)), f = clamp(P - k); camera.fov = lerp(fovAt[k], fovAt[Math.min(N - 1, k + 1)], sstep(0, 1, f)) * (1 + .3 * portrait);
  if (FINE && ptr && entered && !drawer) { const px = ptr.x || 0, py = ptr.y || 0; camT.x += px * .9 * (P < .5 ? 12 : 1); camT.y += py * .5 * (P < .5 ? 8 : 1); }
  camP.y += Math.sin(t * .35) * .04; camera.position.copy(camP); camera.lookAt(camT); camera.near = camP.y > 60 ? 1 : .08; camera.updateProjectionMatrix();
  /* chapter-driven effects */
  const near = c => clamp(1 - Math.abs(P - c) / .8);
  U.uCloudA.value = clamp(1 - (P - .2) / .7); clouds.visible = U.uCloudA.value > .01;
  U.uNet.value = sstep(0, 1, near(5)) * 1; fibres.forEach(m => m.visible = U.uNet.value > .01);
  U.uSec.value = sstep(0, 1, near(6)); shield.visible = U.uSec.value > .01;
  const stackOn = near(2), lay = CHAPTERS[Math.round(P)]?.layer;
  arch.stack.slabs.forEach((s, i) => { const tgt = lay === i ? .55 : 0; slabOut[i] = lerp(slabOut[i], tgt, 1 - Math.exp(-dt * 3)); s.m.position.z = slabOut[i]; s.face.emissiveIntensity = lerp(.25, .9, LOOKNOW.night) + (lay === i ? .8 : 0); });
  arch.stack.seams.forEach((m, i) => { const tgt = (lay === -1 ? 2.4 + Math.sin(t * 2 - i * .7) * 1.2 : lay != null && lay >= 0 && lay < 5 && (i === lay || i === lay + 1) ? 6 : 1.2) * (lay === 5 ? 1.6 : 1); seamI[i] = lerp(seamI[i], tgt, 1 - Math.exp(-dt * 4)); m.emissiveIntensity = seamI[i]; });
  arch.stack.edge.material.opacity = .35 + (lay === 5 ? .5 : 0) + stackOn * .2 + LOOKNOW.night * .25;
  arch.fans.forEach((fn2, i) => fn2.rotation.y += dt * (9 + i));
  const pj = near(7); arch.map.beamM.uniforms.uA.value = .35 + pj * .9; arch.map.pins.forEach((p, i) => { const s = 1 + Math.sin(t * 2.2 + i) * .25; p.ring.scale.setScalar(s * (1 + pj)); p.ring.material.opacity = (1.2 - s * .6) * (.4 + pj); });
  if (exSel) { const p = arch.map.toW(exSel[2], exSel[3]); arch.map.hl.position.set(p.x, arch.map.top + .012, p.z); arch.map.hl.scale.setScalar(Math.max(exSel[4], exSel[5]) * .0108 * 1.25); arch.map.hl.material.opacity = .8 + Math.sin(t * 3) * .2; } else arch.map.hl.material.opacity = 0;
  /* night lights */
  const nl = LOOKNOW.night; NIGHT.forEach(([m, d, n]) => { m.emissiveIntensity = lerp(d, n, nl); }); arch.nightLights.forEach(([l, I]) => l.intensity = I * nl);
  if (!Q.hi && arch.pool.material.emissive) arch.pool.material.emissiveIntensity = nl * .8;
  /* sun shadow box follows what we look at, snapped to texels */
  shadowFocus.copy(camT); shadowFocus.y = 0; if (shadowFocus.length() > 70) shadowFocus.setLength(70); if (P < 1.2) shadowFocus.set(0, 0, 40 * clamp(P));
  const dist = camera.position.distanceTo(camT), half = Math.pow(1.3, Math.round(Math.log(clamp(dist * .9, 22, 95)) / Math.log(1.3))), sc = sun.shadow.camera;
  if (sc.right !== half) { sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.updateProjectionMatrix(); }
  const sd = U.uSunDir.value, ts = 2 * half / Q.shadow; sR.crossVectors(sd, UP).normalize(); sU.crossVectors(sR, sd).normalize(); const r0 = shadowFocus.dot(sR), u0 = shadowFocus.dot(sU); shadowFocus.addScaledVector(sR, Math.round(r0 / ts) * ts - r0).addScaledVector(sU, Math.round(u0 / ts) * ts - u0);
  sun.target.position.copy(shadowFocus); sun.position.copy(shadowFocus).addScaledVector(sd, 200);
  /* DOM */
  const c = Math.round(P);
  if (c !== curC) { curC = c; $$('.ri').forEach((b, i) => { b.classList.toggle('on', i === c); b.toggleAttribute('aria-current', i === c); }); document.body.dataset.c = c; }
  chapEls.forEach(el => { const i = +el.dataset.c, on = entered && !drawer && Math.abs(P - i) < .32; if (el.classList.contains('on') !== on) el.classList.toggle('on', on); });
  /* pin labels */
  const showPins = entered && Math.abs(P - 7) < .45 && !drawer; pinTags.forEach((b, i) => { const v = arch.map.pins[i].P.clone().project(camera); const vis = showPins && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1; b.classList.toggle('on', vis); if (vis) b.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - v.y) / 2 * innerHeight - 12).toFixed(1)}px) translate(${arch.map.pins[i].id === 'kv' ? '-100%,-50%' : arch.map.pins[i].id === 'male' ? '0%,-50%' : '-50%,-100%'})`; });
  /* intro reveal */
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
fetch('../assets/index.json').then(r => r.json()).then(j => { SKYMETA = j; return loadSky(skyKey); }).then(a => {
  applySky(...a); updChip();
  const tick = () => { loaderBar.style.transform = `scaleX(${Math.max(.08, loadP)})`; if (loadDone || loadP >= 1) { renderer.compile(scene, camera); bootOk = true; document.body.classList.add('ready'); if (new URLSearchParams(location.search).has('auto')) enter(); } else setTimeout(tick, 60); }; tick();
  resize(); requestAnimationFrame(frame);
}).catch(e => { console.error(e); fail('The scene could not load. Please refresh.'); });
const cp = new URLSearchParams(location.search).get('c'); if (cp) { P = PT_ = clamp(+cp, 0, N - 1); }
window.__dbg = { get P() { return P; }, jump, U, camera, scene, renderer, composer };
