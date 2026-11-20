import * as THREE from 'three';
/* ---------- real sun and moon over Malé (low-precision ephemeris after SunCalc / Meeus) ---------- */
const RAD = Math.PI / 180, MLAT = 4.1755, MLON = 73.5093;
const jd = ms => ms / 86400000 - .5 + 2440588 - 2451545;
const raDec = (l, b) => { const e = RAD * 23.4397; return [Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)), Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))]; };
const sunEq = d => { const M = RAD * (357.5291 + .98560028 * d), C = RAD * (1.9148 * Math.sin(M) + .02 * Math.sin(2 * M) + .0003 * Math.sin(3 * M)), L = M + C + RAD * 102.9372 + Math.PI; const [ra, dec] = raDec(L, 0); return { ra, dec, dist: 149598000 }; };
const moonEq = d => { const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d), l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F); const [ra, dec] = raDec(l, b); return { ra, dec, dist: 385001 - 20905 * Math.cos(M) }; };
const horiz = (d, c) => { const phi = RAD * MLAT, H = RAD * (280.16 + 360.9856235 * d) + RAD * MLON - c.ra; return { alt: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)), az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) + Math.PI }; };
export const astro = ms => {
  const d = jd(ms), s = sunEq(d), m = moonEq(d), sh = horiz(d, s);
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)), inc = Math.atan2(s.dist * Math.sin(phi), m.dist - s.dist * Math.cos(phi)), ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { sunAlt: sh.alt / RAD, sunAz: sh.az, phase: .5 + .5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
};
export const phaseName = p => ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'][Math.round(p * 8) % 8];
export const nowMs = () => {
  const q = new URLSearchParams(location.search).get('t'); if (!q) return Date.now();
  const m = q.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (m) { const n = new Date(Date.now() + 5 * 3600e3); n.setUTCHours(+m[1], +(m[2] || 0), 0, 0); return n.getTime() - 5 * 3600e3; }
  const p = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(q) ? q : q + '+05:00'); return isFinite(p) ? p : Date.now();
};
export const mvClock = ms => { const t = new Date(ms + 5 * 3600e3); return String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0'); };
/* which photographic sky fits this moment */
export const pickSky = ms => { const a = astro(ms); return a.sunAlt > 11 ? 'day' : a.sunAlt > -7 ? 'golden' : 'night'; };

/* per-sky look: exposure of the photo, sun light, fog and water tints */
export const LOOK = {
  day:    { bg: 1.0, grade: [1, 1, 1], sunI: 3.4, sunC: 0xfff1de, hemi: .35, fog: 0x9fc3df, fogD: .00028, bloom: .28, exp: 1.0, night: 0, water: 1.0, glow: 0 },
  golden: { bg: 1.05, grade: [1.03, .98, .96], sunI: 2.6, sunC: 0xffb27a, hemi: .3, fog: 0xb7a2a6, fogD: .00034, bloom: .45, exp: 1.08, night: .35, water: .72, glow: .5 },
  night:  { bg: .5, grade: [.55, .68, 1.05], sunI: .55, sunC: 0x9fb4ff, hemi: .18, fog: 0x0d1626, fogD: .00045, bloom: .85, exp: 1.15, night: 1, water: .22, glow: 1 },
};

/* equirect sky dome with rotation (so the sun sits at its real bearing) */
export const makeSkyDome = () => {
  const u = { tSky: { value: null }, uRot: { value: 0 }, uExp: { value: 1 }, uGrade: { value: new THREE.Vector3(1, 1, 1) }, uHaze: { value: new THREE.Color(0x9fc3df) }, uHazeK: { value: .55 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `uniform sampler2D tSky;uniform float uRot,uExp,uHazeK;uniform vec3 uGrade,uHaze;varying vec3 vD;
      void main(){vec3 d=normalize(vD);float c=cos(uRot),s=sin(uRot);vec3 r=vec3(d.x*c-d.z*s,d.y,d.x*s+d.z*c);
      vec2 uv=vec2(atan(r.z,r.x)/6.2831853+.5,asin(clamp(r.y,-1.,1.))/3.1415927+.5);
      vec3 col=texture2D(tSky,uv).rgb;col=pow(col,vec3(2.2))*uExp*uGrade;
      float h=1.-smoothstep(0.,.16,abs(d.y));col=mix(col,uHaze,h*uHazeK*.6);
      if(d.y<0.)col=mix(col,uHaze*.85,smoothstep(0.,-.08,d.y));
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), m); mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, u };
};
/* direction of the sun pixel in an equirect image, for a given rotation */
export const sunDirFromPx = (px, size, rot) => {
  const u = (px[0] + .5) / size[0], v = 1 - (px[1] + .5) / size[1];
  const phi = (u - .5) * 2 * Math.PI, lat = (v - .5) * Math.PI;
  const r = new THREE.Vector3(Math.cos(lat) * Math.cos(phi), Math.sin(lat), Math.cos(lat) * Math.sin(phi));
  /* invert the dome rotation (dome maps world d -> r by +rot) */
  const c = Math.cos(-rot), s = Math.sin(-rot);
  return new THREE.Vector3(r.x * c - r.z * s, r.y, r.x * s + r.z * c).normalize();
};
/* rotation that puts the HDR's sun at a real compass azimuth (world: +x east, -z north) */
export const rotForAzimuth = (px, size, az) => {
  const u = (px[0] + .5) / size[0], phiH = (u - .5) * 2 * Math.PI;
  const wx = Math.sin(az), wz = -Math.cos(az), phiW = Math.atan2(wz, wx);
  return phiH - phiW;
};
