/* People: archviz mannequins (Mixamo X Bot), sitting and typing, talking, walking. Poses are aimed bone by bone. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FLOOR_Y, AMB, SEC } from './hq.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/* Blender (x, y, z) -> three (x, z, -y) */
const B2T = (x, y, z) => V(x, z, -y);
let seed = 3; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

/* ---- the cast, from the building layout (Blender coords for desks/chairs) ---- */
const cast = () => {
  const P = [];
  const deskSit = (lv, x, y, rz, pose = 'type', z = 0) => { const s = Math.sin(rz), c = Math.cos(rz); P.push({ lv, pose, pos: B2T(x + .62 * s, y - .62 * c, FLOOR_Y[lv] + z), ry: rz + Math.PI }); };
  /* B1 security operations centre: tiers of desks facing the wall */
  [[-.2, 0], [-2.6, .25], [-5.0, .5]].forEach(([yy, h], r) => { for (let k = 0; k < 4; k++) if (!(r === 2 && k === 0) && !(r === 1 && k === 3)) deskSit('B1', -3.2 + k * 3.7 + (k % 2 ? -.3 : .3), yy, 0, k === 2 && r === 0 ? 'talk' : 'type', h); });
  P.push({ lv: 'B1', pose: 'stand', pos: B2T(1.2, 1.9, FLOOR_Y.B1), ry: Math.PI * .1, clip: 'agree' });
  /* B2 data hall: two engineers */
  P.push({ lv: 'B2', pose: 'stand', pos: B2T(3.0, -2.0, FLOOR_Y.B2), ry: Math.PI * .5, clip: 'idle', reach: true });
  P.push({ lv: 'B2', pose: 'walk', path: [B2T(.3, -6.2, FLOOR_Y.B2), B2T(.3, 3.6, FLOOR_Y.B2)] });
  /* B3 plant room */
  P.push({ lv: 'B3', pose: 'stand', pos: B2T(-2.0, -4.6, FLOOR_Y.B3), ry: -Math.PI * .2, clip: 'idle' });
  P.push({ lv: 'B3', pose: 'walk', path: [B2T(-9.5, -3.2, FLOOR_Y.B3), B2T(6.0, -3.2, FLOOR_Y.B3)] });
  /* G lobby */
  P.push({ lv: 'G', pose: 'stand', pos: B2T(.6, 2.9, 0), ry: 0, clip: 'idle' });                       /* receptionist behind the desk */
  P.push({ lv: 'G', pose: 'stand', pos: B2T(-.4, .9, 0), ry: Math.PI, clip: 'agree' });               /* visitor at the desk */
  P.push({ lv: 'G', pose: 'walk', path: [B2T(-2.2, -7.2, 0), B2T(-2.2, .2, 0), B2T(-8, .6, 0)] });
  P.push({ lv: 'G', pose: 'walk', path: [B2T(4.2, .4, 0), B2T(4.2, -7.4, 0)] });
  P.push({ lv: 'G', pose: 'sit', pos: B2T(-8.2, -5.0, 0), ry: Math.PI, seat: .45 }); P.push({ lv: 'G', pose: 'sittalk', pos: B2T(-6.9, -5.0, 0), ry: Math.PI, seat: .45 });
  /* L1 engineering floor */
  const clusters = [[-3, -4.6], [3.6, -4.6], [-3, -.6], [3.6, -.6], [9.6, -2.6]];
  clusters.forEach(([cx, cy], ci) => { for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { if (rnd() < .3) continue; deskSit('L1', cx + (i - 1) * 1.45, cy + s * .42, s < 0 ? 0 : Math.PI, rnd() < .2 ? 'talk' : 'type'); } });
  P.push({ lv: 'L1', pose: 'stand', pos: B2T(-2.1, 4.6, FLOOR_Y.L1), ry: 0, clip: 'agree' }, { lv: 'L1', pose: 'stand', pos: B2T(-2.9, 3.9, FLOOR_Y.L1), ry: Math.PI * .8, clip: 'headShake' });
  P.push({ lv: 'L1', pose: 'walk', path: [B2T(-5.5, 1.4, FLOOR_Y.L1), B2T(11, 1.4, FLOOR_Y.L1)] });
  [[8.4, 4.7, Math.PI], [10, 4.7, Math.PI], [9.2, 6.0, 0]].forEach(([x, y, r]) => P.push({ lv: 'L1', pose: 'sittalk', pos: B2T(x, y, FLOOR_Y.L1), ry: r, seat: .46 }));
  /* L2 boardroom + lounge */
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) { if ((k + (s > 0 ? 1 : 0)) % 3 === 0) continue; P.push({ lv: 'L2', pose: k === 2 && s > 0 ? 'sittalk' : 'sit', pos: B2T(.4 + k * 1.3, 4.4 + s * 1.25, FLOOR_Y.L2), ry: s > 0 ? 0 : Math.PI, seat: .5 }); }
  P.push({ lv: 'L2', pose: 'stand', pos: B2T(6.9, 7.0, FLOOR_Y.L2), ry: Math.PI * 1.25, clip: 'agree', present: true });
  P.push({ lv: 'L2', pose: 'sit', pos: B2T(-3, -5.55, FLOOR_Y.L2), ry: Math.PI, seat: .45 }, { lv: 'L2', pose: 'sittalk', pos: B2T(5, -5.55, FLOOR_Y.L2), ry: Math.PI, seat: .45 });
  /* upper floors: a few at desks (seen in the section) */
  ['L3', 'L4', 'L5'].forEach(lv => clusters.forEach(([cx, cy]) => { for (let i = 0; i < 3; i++) for (const s of [-1, 1]) if (rnd() < .28) deskSit(lv, cx + (i - 1) * 1.45, cy + s * .42, s < 0 ? 0 : Math.PI, 'type'); }));
  /* outside on the plaza */
  P.push({ lv: 'OUT', pose: 'walk', path: [V(-30, 0, 10.2), V(14, 0, 10.2)] }, { lv: 'OUT', pose: 'walk', path: [V(30, 0, 20.8), V(-30, 0, 20.8)] }, { lv: 'OUT', pose: 'walk', path: [V(15.4, 0, -30), V(15.4, 0, 10.4), V(-6, 0, 10.4)] }, { lv: 'OUT', pose: 'walk', path: [V(23.6, 0, 40), V(23.6, 0, -40)] }, { lv: 'OUT', pose: 'stand', pos: V(3.2, 0, 10.0), ry: -.6, clip: 'agree' }, { lv: 'OUT', pose: 'stand', pos: V(4.1, 0, 10.6), ry: 2.4, clip: 'idle' });
  return P;
};

/* bones aimed in character space (+z forward, +y up). rest directions of the X Bot T-pose */
const REST = { UpLeg: V(0, -1, 0), Leg: V(0, -1, 0), Foot: V(0, -.3, 1).normalize(), Spine: V(0, 1, 0), Spine1: V(0, 1, 0), Spine2: V(0, 1, 0), Neck: V(0, 1, 0), Head: V(0, 1, 0), LArm: V(1, 0, 0), LForeArm: V(1, 0, 0), LHand: V(1, 0, 0), RArm: V(-1, 0, 0), RForeArm: V(-1, 0, 0), RHand: V(-1, 0, 0) };
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), tv = V(0, 0, 0);
/* set a chain of bones so each points along its world-space (character-space) direction */
const aimChain = (chain) => { qp.identity(); for (const [bone, rest, dir] of chain) { tv.copy(dir).normalize(); qa.setFromUnitVectors(rest, tv); qb.copy(qp).invert().multiply(qa); bone.quaternion.copy(qb); qp.copy(qa); } };

export const loadPeople = async ({ manager, U, scene }) => {
  const loader = new GLTFLoader(manager); loader.setMeshoptDecoder(MeshoptDecoder);
  const g = await new Promise((res, rej) => loader.load('assets/people/xbot.glb', res, undefined, rej));
  const clips = {}; g.animations.forEach(a => clips[a.name] = a);
  /* materials: white body, RoseWare red / graphite joints, per-floor brightness */
  const matCache = {};
  const mats = (amb, red) => { const k = amb + (red ? 'r' : 'g'); if (matCache[k]) return matCache[k];
    const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(.92, .91, .89).multiplyScalar(amb), roughness: .55, metalness: 0, envMapIntensity: .35 * amb });
    const joint = new THREE.MeshStandardMaterial({ color: red ? new THREE.Color(0xe2231a).multiplyScalar(Math.max(.5, amb)) : new THREE.Color(0x2a2c31), roughness: .45, metalness: .1, envMapIntensity: .4 * amb });
    [body, joint].forEach(m => { m.clippingPlanes = [SEC.lv]; });
    return matCache[k] = [body, joint]; };
  /* contact shadow under each figure */
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const blobM = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }); blobM.clippingPlanes = [SEC.lv];
  const blobG = new THREE.PlaneGeometry(.9, .9).rotateX(-Math.PI / 2);
  const root = new THREE.Group(); root.name = 'people'; scene.add(root);
  const P = cast(), people = [];
  P.forEach((p, i) => {
    const o = SkeletonUtils.clone(g.scene); const amb = AMB[p.lv] || 1.1; const [body, joint] = mats(amb, i % 3 !== 1);
    o.traverse(m => { if (m.isSkinnedMesh) { m.material = /Joints/i.test(m.name) ? joint : body; m.frustumCulled = false; m.castShadow = p.lv === 'OUT'; } });
    const B = {}; o.traverse(b => { if (b.isBone) B[b.name.replace('mixamorig', '').replace(':', '')] = b; });
    const wrap = new THREE.Group(); wrap.add(o); root.add(wrap);
    const blob = new THREE.Mesh(blobG, blobM); blob.position.y = .012; blob.renderOrder = 1; wrap.add(blob);
    const pp = { ...p, o, wrap, B, ph: rnd() * 100, mixer: null, hips0: B.Hips.position.clone(), hipsScale: B.Hips.position.y / 1.04 };
    if (p.pose === 'walk') { pp.mixer = new THREE.AnimationMixer(o); pp.mixer.clipAction(clips.walk).play(); pp.mixer.timeScale = .95; pp.s = rnd(); pp.len = 0; for (let k = 1; k < p.path.length; k++) pp.len += p.path[k].distanceTo(p.path[k - 1]); pp.dirSign = 1; }
    else if (p.pose === 'stand') { pp.mixer = new THREE.AnimationMixer(o); const a = pp.mixer.clipAction(clips.idle); a.play(); a.time = rnd() * 3;
      if (p.clip && p.clip !== 'idle' && clips[p.clip]) { pp.gest = pp.mixer.clipAction(clips[p.clip]); pp.gest.setLoop(THREE.LoopOnce); pp.gest.clampWhenFinished = false; pp.nextG = 1 + rnd() * 4; } }
    if (p.pos) { wrap.position.copy(p.pos); wrap.rotation.y = p.ry || 0; }
    people.push(pp);
  });
  const Lr = V(0, 0, 0), Rr = V(0, 0, 0), tmp = V(0, 0, 0);
  /* seated pose: legs, back, arms (typing or talking), head */
  const seated = (p, t, talk, typing) => {
    const B = p.B, ph = p.ph, br = Math.sin(t * 1.6 + ph) * .012, seatY = p.seat != null ? p.seat : .5;
    B.Hips.position.set(p.hips0.x, (seatY + .1) * p.hipsScale, p.hips0.z - .06 * p.hipsScale); B.Hips.quaternion.identity();
    const lean = typing ? .2 : talk ? .05 + Math.sin(t * .7 + ph) * .05 : -.05;
    for (const [s, sx] of [['Left', 1], ['Right', -1]]) {
      aimChain([[B[s + 'UpLeg'], REST.UpLeg, V(sx * .1, -.08, 1)], [B[s + 'Leg'], REST.Leg, V(sx * .02, -1, .14 + (s === 'Left' ? Math.sin(ph) * .1 : 0))], [B[s + 'Foot'], REST.Foot, V(0, -.25, 1)]]);
    }
    const sp = V(0, 1, lean + br); const head = V(Math.sin(t * .23 + ph) * (talk ? .35 : .12), 1, lean + .12 + (talk ? Math.sin(t * 1.1 + ph) * .05 : 0));
    aimChain([[B.Spine, REST.Spine, sp], [B.Spine1, REST.Spine1, sp], [B.Spine2, REST.Spine2, V(0, 1, lean * 1.2 + br)], [B.Neck, REST.Neck, head], [B.Head, REST.Head, head]]);
    /* arms are children of Spine2 -> shoulder; aim from Spine2's world frame */
    const spQ = new THREE.Quaternion(); B.Shoulder = B.LeftShoulder;
    const armSide = (s, sx) => {
      let ua, fa, hd;
      if (typing) { const k = Math.sin(t * 13 + ph + sx) * .03, k2 = Math.sin(t * 9.3 + ph * 2 + sx) * .025; ua = V(sx * .28, -.9, .38); fa = V(-sx * .28, .1 + k, 1); hd = V(-sx * .2, -.15 + k2, 1); }
      else if (talk && s === 'Right') { const g = Math.sin(t * 1.9 + ph), g2 = Math.sin(t * 3.1 + ph); ua = V(sx * .3, -.85, .35 + g * .1); fa = V(-sx * (.2 + g2 * .2), .55 + g * .3, .8); hd = V(-sx * .1, .3 + g * .3, 1); }
      else { ua = V(sx * .22, -.95, .25); fa = V(-sx * .45, -.05, 1); hd = V(-sx * .3, -.2, 1); }
      const sh = B[s + 'Shoulder']; sh.quaternion.identity();
      /* parent world (character space) rotation of the arm = rotation of Spine2 chain */
      spQ.identity(); for (const n of ['Spine', 'Spine1', 'Spine2']) spQ.multiply(B[n].quaternion); spQ.multiply(sh.quaternion);
      const R = s === 'Left' ? 'L' : 'R';
      qp.copy(spQ); const chain = [[B[s + 'Arm'], REST[R + 'Arm'], ua], [B[s + 'ForeArm'], REST[R + 'ForeArm'], fa], [B[s + 'Hand'], REST[R + 'Hand'], hd]];
      for (const [bone, rest, dir] of chain) { tv.copy(dir).normalize(); qa.setFromUnitVectors(rest, tv); qb.copy(qp).invert().multiply(qa); bone.quaternion.copy(qb); qp.copy(qa); }
    };
    armSide('Left', 1); armSide('Right', -1);
  };
  const update = (dt, t, visible) => {
    for (const p of people) {
      const vis = visible(p.lv); p.wrap.visible = vis; if (!vis) continue;
      if (p.pose === 'walk') {
        const sp = 1.15; p.s += dt * sp / p.len * p.dirSign; if (p.s > 1) { p.s = 1; p.dirSign = -1; } if (p.s < 0) { p.s = 0; p.dirSign = 1; }
        let d = p.s * p.len, k = 1; while (k < p.path.length - 1 && d > p.path[k].distanceTo(p.path[k - 1])) { d -= p.path[k].distanceTo(p.path[k - 1]); k++; }
        const a = p.path[k - 1], b = p.path[k], L = a.distanceTo(b) || 1; tmp.copy(a).lerp(b, Math.min(1, d / L)); p.wrap.position.copy(tmp);
        const dir = b.clone().sub(a).multiplyScalar(p.dirSign); const ry = Math.atan2(dir.x, dir.z); let dr = ry - p.wrap.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.wrap.rotation.y += dr * Math.min(1, dt * 6);
        p.mixer.update(dt);
      } else if (p.pose === 'stand') {
        if (p.gest) { p.nextG -= dt; if (p.nextG < 0) { p.gest.reset().setEffectiveWeight(1).fadeIn(.4).play(); p.nextG = 5 + rnd() * 6; } }
        p.mixer.update(dt);
        if (p.reach) { const B = p.B; aimChain([]); B.RightArm.quaternion.slerp(qa.setFromUnitVectors(REST.RArm, V(-.2, .1, 1).normalize()), .7); }
      } else seated(p, t, p.pose === 'talk' || p.pose === 'sittalk', p.pose === 'type' || p.pose === 'talk' && Math.sin(t * .3 + p.ph) > .3);
    }
  };
  return { people, update, root };
};
