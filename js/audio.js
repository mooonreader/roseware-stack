/* Generated ambience: ocean swell and a slow, warm pad. No audio files. */
export const makeAudio = () => {
  let ctx = null, master = null, on = false, started = false;
  const start = () => {
    if (started) return; started = true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    /* reverb */
    const rev = ctx.createConvolver(), len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    rev.buffer = ir; const wet = ctx.createGain(); wet.gain.value = .55; rev.connect(wet); wet.connect(master);
    /* ocean */
    const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), nd = nb.getChannelData(0); let b = 0; for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b = (b + .02 * w) / 1.02; nd[i] = b * 3.2; }
    const mkSurf = (freq, q, gainV, rate, phase) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.playbackRate.value = .9 + Math.random() * .2;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = gainV;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rate; lg.gain.value = gainV * .9; lfo.connect(lg); lg.connect(g.gain); lfo.start(ctx.currentTime + phase);
      const fl = ctx.createOscillator(), fg = ctx.createGain(); fl.frequency.value = rate; fg.gain.value = freq * .6; fl.connect(fg); fg.connect(f.frequency); fl.start(ctx.currentTime + phase);
      s.connect(f); f.connect(g); g.connect(master); g.connect(rev); s.start(); };
    mkSurf(520, .6, .22, .085, 0); mkSurf(900, .4, .12, .13, 2.1); mkSurf(2600, .3, .035, .11, 4.3);
    /* pad: Am9 - Fmaj7 - Cmaj7 - G6, eight seconds each */
    const padBus = ctx.createGain(); padBus.gain.value = .055; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; padBus.connect(lp); lp.connect(master); lp.connect(rev);
    const CH = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 64, 67], [55, 59, 62, 64, 71]], hz = m => 440 * Math.pow(2, (m - 69) / 12);
    let k = 0; const play = () => { const t0 = ctx.currentTime, ch = CH[k++ % CH.length];
      ch.forEach((m, i) => { for (const det of [-6, 6]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = i === 0 ? 'sine' : 'triangle'; o.frequency.value = hz(m - (i === 0 ? 12 : 0)); o.detune.value = det;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(i === 0 ? .9 : .5, t0 + 3); g.gain.linearRampToValueAtTime(i === 0 ? .8 : .42, t0 + 7); g.gain.linearRampToValueAtTime(0, t0 + 11); o.connect(g); g.connect(padBus); o.start(t0); o.stop(t0 + 11.2); } }); };
    if (ctx.state === 'running') play(); setInterval(() => { if (ctx.state === 'running') play(); }, 8000);
  };
  const set = v => { on = v; if (v) start(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume(); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(v ? .9 : 0, ctx.currentTime, .6); };
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });
  return { set, get on() { return on; } };
};
