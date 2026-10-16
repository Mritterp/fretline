// Volume, tone and the loudness EQ shared by every Fretline page, so playback sounds the same wherever you are and changing it in
// one place changes it everywhere (the pages share this browser's localStorage, and the `storage` event carries a change to the others).
// A page connects its notes to FretlineAudio.out(ctx) instead of ctx.destination, and reads FretlineAudio.get().tone for its waveform.
(function () {
  var KEY = "fretline-audio", DEFAULTS = { volume: 100, tone: "triangle", eq: true }, TONES = ["sine", "triangle", "square"];
  var MULTIPLIER = 4;   // the volume slider runs 0-100%, and 100% is four times the raw level (notes are scheduled at low levels)
  var listeners = [], memory = null;

  function clean(v) {
    var volume = Number(v && v.volume);
    return {
      volume: isFinite(volume) ? Math.max(0, Math.min(100, volume)) : DEFAULTS.volume,
      tone: v && TONES.indexOf(v.tone) >= 0 ? v.tone : DEFAULTS.tone,
      eq: v && typeof v.eq === "boolean" ? v.eq : DEFAULTS.eq,
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

  // Equal-loudness EQ: the ear needs more level to hear low notes as loud as mid ones, and its sensitivity wobbles above 1 kHz.
  // These filters follow two-thirds of the ISO 226:2003 60-phon contour (relative to 1 kHz) from 63 Hz to 5 kHz, fitted to
  // within about 0.4 dB: +17 dB at 63 Hz, +12 at 100, +7 at 200, +2 at 400, ~0 at 1 kHz, a small lift around 1.6 kHz and a
  // 3 dB dip near 2.8 kHz. Two-thirds rather than all of it, since the full curve (+22 dB at low E) is more than small
  // speakers can play cleanly. Nothing above 5 kHz is changed; no note sits up there.
  var EQ = [
    { type: "lowshelf", frequency: 360, gain: 4.9 },
    { type: "lowshelf", frequency: 170, gain: 5.4 },
    { type: "lowshelf", frequency: 72, gain: 11.6 },
    { type: "peaking", frequency: 1620, Q: 1.5, gain: 2.6 },
    { type: "peaking", frequency: 2780, Q: 1.5, gain: -3.2 },
  ];
  // With the EQ on, everything is first turned down 6 dB: the app already plays close to the limiter at full volume, and
  // without this headroom the limiter flattens most of the bass boost again (measured: a low E gains ~10 dB over A440 with
  // the trim, only ~6.5 dB without it). Mid and high notes come out a few dB quieter as the price.
  var EQ_TRIM = Math.pow(10, -6 / 20);

  // per AudioContext: volume gain -> EQ trim -> EQ filters -> limiter (squashes peaks above about -3 dBFS instead of clipping)
  var outputs = new WeakMap();
  function out(ctx) {
    var existing = outputs.get(ctx);
    if (existing) return existing;
    var gain = ctx.createGain(), trim = ctx.createGain(), filters = [];
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.1;
    gain.connect(trim);
    var node = trim;
    EQ.forEach(function (b) {
      var f = ctx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.frequency; if (b.Q) f.Q.value = b.Q;
      node.connect(f); node = f; filters.push(f);
    });
    node.connect(limiter); limiter.connect(ctx.destination);
    // turning the EQ off sets every filter flat (0 dB) and the trim to unity, so already-sounding notes follow the switch too
    function apply(v) {
      gain.gain.value = v.volume / 100 * MULTIPLIER;
      trim.gain.value = v.eq ? EQ_TRIM : 1;
      filters.forEach(function (f, i) { f.gain.value = v.eq ? EQ[i].gain : 0; });
    }
    apply(get());
    listeners.push(apply);
    outputs.set(ctx, gain);
    return gain;
  }

  window.FretlineAudio = { get: get, set: set, out: out, onChange: function (fn) { listeners.push(fn); }, multiplier: MULTIPLIER, eq: EQ };
})();
