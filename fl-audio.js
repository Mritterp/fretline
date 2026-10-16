// Volume and tone shared by every Fretline page, so playback sounds the same wherever you are and changing it in one place
// changes it everywhere (the pages share this browser's localStorage, and the `storage` event carries a change to the others).
// A page connects its notes to FretlineAudio.out(ctx) instead of ctx.destination, and reads FretlineAudio.get().tone for its waveform.
(function () {
  var KEY = "fretline-audio", DEFAULTS = { volume: 100, tone: "triangle" }, TONES = ["sine", "triangle", "square"];
  var MULTIPLIER = 4;   // the volume slider runs 0-100%, and 100% is four times the raw level (notes are scheduled at low levels)
  var listeners = [], memory = null;

  function clean(v) {
    var volume = Number(v && v.volume);
    return {
      volume: isFinite(volume) ? Math.max(0, Math.min(100, volume)) : DEFAULTS.volume,
      tone: v && TONES.indexOf(v.tone) >= 0 ? v.tone : DEFAULTS.tone,
    };
  }
  function get() {
    try { var raw = localStorage.getItem(KEY); if (raw) return clean(JSON.parse(raw)); } catch (e) {}
    return clean(memory || DEFAULTS);
  }
  function fire(v) { listeners.slice().forEach(function (fn) { try { fn(v); } catch (e) {} }); }
  function set(patch) {
    var v = clean(Object.assign(get(), patch));
    memory = v;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    fire(v);
  }
  window.addEventListener("storage", function (e) { if (e.key === KEY) fire(get()); });

  // Equal-loudness EQ: the ear needs more level to hear low notes as loud as mid ones and is most sensitive around 2-5 kHz
  // (ISO 226, ~60 phon). This makes up a gentle part of that difference, not all of it (the full contour would be ~+20 dB at
  // low E): about +7 dB at 65 Hz, +6 at 100, +3 at 200, ~0 by 1 kHz, and a 3 dB dip centred on 3.2 kHz. Nothing above 5 kHz is
  // touched, since no note sits up there. Two stacked low shelves give a slope that keeps rising toward the bass instead of a flat step.
  var EQ = [
    { type: "lowshelf", frequency: 250, gain: 4 },
    { type: "lowshelf", frequency: 100, gain: 4 },
    { type: "peaking", frequency: 3200, Q: 0.9, gain: -3 },
  ];

  // one gain + EQ + limiter per AudioContext: the gain follows the shared volume, the limiter squashes peaks above about -3 dBFS instead of clipping
  var outputs = new WeakMap();
  function out(ctx) {
    var existing = outputs.get(ctx);
    if (existing) return existing;
    var gain = ctx.createGain();
    gain.gain.value = get().volume / 100 * MULTIPLIER;
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.1;
    var node = gain;
    EQ.forEach(function (b) {
      var f = ctx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.frequency; f.gain.value = b.gain; if (b.Q) f.Q.value = b.Q;
      node.connect(f); node = f;
    });
    node.connect(limiter); limiter.connect(ctx.destination);
    listeners.push(function (v) { gain.gain.value = v.volume / 100 * MULTIPLIER; });
    outputs.set(ctx, gain);
    return gain;
  }

  window.FretlineAudio = { get: get, set: set, out: out, onChange: function (fn) { listeners.push(fn); }, multiplier: MULTIPLIER, eq: EQ };
})();
