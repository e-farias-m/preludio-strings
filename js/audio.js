// audio.js
// Lightweight synthesized instrument tones using the Web Audio API.
// No audio files — every sound is generated. Lazily creates the
// AudioContext on first user gesture to respect autoplay policies.

const AudioEngine = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try { ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  // ── ENVELOPE HELPER ─────────────────────────────────────────────────────
  function applyEnvelope(gainNode, t0, attack, decay, sustainLevel, releaseStart, release, peak = 0.9) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0001), t0 + attack + decay);
    g.setValueAtTime(Math.max(sustainLevel, 0.0001), releaseStart);
    g.exponentialRampToValueAtTime(0.0001, releaseStart + release);
  }

  // ── BOWED STRING VOICE (violin / viola / cello) ─────────────────────────
  // A bowed string is a rich sawtooth spectrum shaped by the instrument's body
  // resonance, with the bow adding a band of noise that trembles slightly.
  // The three instruments differ in how high that body resonance sits: the
  // violin is bright, the viola sits in the middle, and the cello is dark and
  // round.
  const STRING_VOICES = {
    violin: { cutoff: 5.0, body: 320, bodyGain: 6, noise: 0.05, noiseBand: 2.4, detune: 0.0035, trem: 0.3, attack: 0.045 },
    viola:  { cutoff: 4.0, body: 240, bodyGain: 5, noise: 0.055, noiseBand: 1.9, detune: 0.003, trem: 0.34, attack: 0.05 },
    cello:  { cutoff: 2.8, body: 150, bodyGain: 5, noise: 0.07, noiseBand: 1.3, detune: 0.002, trem: 0.4, attack: 0.06 },
  };

  function playBowedString(freq, duration = 1.1, voiceId = 'violin') {
    const c = getCtx();
    const t0 = c.currentTime + 0.02;
    const v = STRING_VOICES[voiceId] || STRING_VOICES.violin;
    const out = c.createGain();
    out.connect(c.destination);

    // The body: a lowpass that opens as the bow settles, plus a small peak at
    // the instrument's air resonance.
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 1.8, t0);
    filter.frequency.linearRampToValueAtTime(Math.max(freq * v.cutoff, v.body * 2.2), t0 + 0.12);
    filter.frequency.linearRampToValueAtTime(Math.max(freq * v.cutoff * 0.7, v.body), t0 + duration);
    filter.Q.value = 0.9;

    const body = c.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = v.body;
    body.Q.value = 1.1;
    body.gain.value = v.bodyGain;

    filter.connect(body).connect(out);

    // Two sawtooths a hair apart give the round, chorused sound a section
    // makes; the sine on top keeps the centre of the note solid.
    const osc1 = c.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;
    const osc1Gain = c.createGain();
    osc1Gain.gain.value = 0.6;

    const osc2 = c.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq * (1 + v.detune);
    const osc2Gain = c.createGain();
    osc2Gain.gain.value = 0.4;

    const osc3 = c.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = freq * 2;
    const osc3Gain = c.createGain();
    osc3Gain.gain.value = 0.12;

    // Bow noise: a band of noise around the note, trembling with the bow arm.
    const noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const noise = c.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = c.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = Math.max(freq * v.noiseBand, 240);
    noiseFilter.Q.value = 0.9;
    const noiseGain = c.createGain();
    noiseGain.gain.value = v.noise;

    const trem = c.createOscillator();
    trem.frequency.value = 5.8;
    const tremGain = c.createGain();
    tremGain.gain.value = v.noise * v.trem;
    trem.connect(tremGain).connect(noiseGain.gain);

    osc1.connect(osc1Gain).connect(filter);
    osc2.connect(osc2Gain).connect(filter);
    osc3.connect(osc3Gain).connect(filter);
    noise.connect(noiseFilter).connect(noiseGain).connect(out);

    // Vibrato arrives after the note has settled, the way a player's hand does.
    const vibrato = c.createOscillator();
    vibrato.frequency.value = 5.4;
    const vibratoGain = c.createGain();
    vibratoGain.gain.setValueAtTime(0, t0);
    vibratoGain.gain.linearRampToValueAtTime(freq * 0.0055, t0 + 0.45);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc1.frequency);
    vibratoGain.connect(osc2.frequency);

    applyEnvelope(out, t0, v.attack, 0.1, 0.72, t0 + duration - 0.2, 0.2, 0.85);

    [osc1, osc2, osc3, noise, trem, vibrato].forEach(o => o.start(t0));
    [osc1, osc2, osc3, noise, trem, vibrato].forEach(o => o.stop(t0 + duration + 0.1));
  }

  // ── METRONOME CLICK ──────────────────────────────────────────────────────
  // `opts.sound` picks the timbre ('click' | 'wood' | 'beep') and `opts.volume`
  // scales the level (0…1). Both default so existing callers are unaffected.
  function playClick(accent = false, when = 0, opts = {}) {
    const c = getCtx();
    const t0 = c.currentTime + when + 0.01;
    const volume = typeof opts.volume === 'number' ? Math.max(0, Math.min(1, opts.volume)) : 1;
    const sound = opts.sound || 'click';
    const osc = c.createOscillator();
    let peak;
    if (sound === 'wood') {
      osc.type = 'triangle';
      osc.frequency.value = accent ? 1000 : 680;
      peak = accent ? 0.22 : 0.14;
    } else if (sound === 'beep') {
      osc.type = 'sine';
      osc.frequency.value = accent ? 1320 : 880;
      peak = accent ? 0.16 : 0.1;
    } else {
      osc.type = 'square';
      osc.frequency.value = accent ? 1400 : 900;
      peak = accent ? 0.18 : 0.11;
    }
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, peak * volume), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.08);
  }

  // ── PUBLIC: play a note on one of the string instruments ────────────────
  // Every instrument this app teaches is a string instrument, so the voice is
  // always the bowed string one. `voice` names which of the three it is —
  // violin, viola or cello each have their own body.
  function playInstrumentNote(freq, fingeringType, duration = 1.1, voice = null) {
    getCtx(); // ensure unlocked on this gesture
    playBowedString(freq, duration, voice || 'violin');
  }

  // ── CHORD ──────────────────────────────────────────────────────────────
  function playChord(freqs, fingeringType, duration = 1.1, voice = null) {
    if (!freqs || freqs.length === 0) return;
    freqs.forEach(freq => {
      if (freq == null) return;
      playInstrumentNote(freq, fingeringType, duration, voice);
    });
  }

  function unlock() {
    const c = getCtx();
    if (c.state === 'suspended') {
      try { c.resume(); } catch (e) {}
    }
    try {
      const buffer = c.createBuffer(1, 1, 22050);
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(c.destination);
      source.start(0);
    } catch (e) {}
  }

  return { playInstrumentNote, playChord, playClick, unlock };
})();
