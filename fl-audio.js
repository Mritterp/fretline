// Volume, tone and the loudness EQ shared by every Fretline page, so playback sounds the same wherever you are and changing it in
// one place changes it everywhere (the pages share this browser's localStorage, and the `storage` event carries a change to the others).
// A page connects its notes to FretlineAudio.out(ctx) instead of ctx.destination, and reads FretlineAudio.get().tone for its waveform.
(function () {
  var KEY = "fretline-audio", TONES = ["sine", "triangle", "square"];
  // the synth: attack (ms), decay (s), sustain (% of the note's level) and release (s); the reverb: dry/wet (%) and decay time (s)
  var DEFAULTS = { volume: 70, muted: false, tone: "triangle", eq: true, attack: 25, decay: 1, sustain: 25, release: 0.25, reverbMix: 10, reverbDecay: 1.5 };
  var RANGE = { attack: [2, 400], decay: [0.05, 4], sustain: [0, 100], release: [0.02, 3], reverbMix: [0, 100], reverbDecay: [0.3, 6] };
  var MULTIPLIER = 4;   // the volume slider runs 0-100%, and 100% is four times the raw level (notes are scheduled at low levels)
  var listeners = [], memory = null;

  function num(v, key, lo, hi) { var n = Number(v && v[key]); return isFinite(n) && v && v[key] !== null && v[key] !== "" ? Math.max(lo, Math.min(hi, n)) : DEFAULTS[key]; }
  function clean(v) {
    var out = { volume: num(v, "volume", 0, 100), muted: !!(v && v.muted === true), tone: v && TONES.indexOf(v.tone) >= 0 ? v.tone : DEFAULTS.tone, eq: v && typeof v.eq === "boolean" ? v.eq : DEFAULTS.eq };
    Object.keys(RANGE).forEach(function (k) { out[k] = num(v, k, RANGE[k][0], RANGE[k][1]); });
    return out;
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
    // reverb: the signal goes straight to the limiter (dry) and, when the reverb is on, also through a convolver (wet); the mix is equal-power.
    // The convolver is only built, and fed, while the dry/wet is above zero, so an unused reverb costs nothing.
    var dry = ctx.createGain(), wet = ctx.createGain(), conv = null, fed = false, irSeconds = 0, irTimer = null;
    node.connect(dry); dry.connect(limiter); wet.connect(limiter); limiter.connect(ctx.destination);
    function swapIR(seconds) {   // a new tail: fade the wet signal out, swap the impulse response, fade back in
      irSeconds = seconds;
      clearTimeout(irTimer);
      irTimer = setTimeout(function () {
        var m = get().reverbMix / 100, t = ctx.currentTime;
        wet.gain.cancelScheduledValues(t); wet.gain.setTargetAtTime(0, t, 0.01);
        setTimeout(function () { conv.buffer = makeIR(ctx, irSeconds); var t2 = ctx.currentTime; wet.gain.cancelScheduledValues(t2); wet.gain.setTargetAtTime(Math.sin(get().reverbMix / 100 * Math.PI / 2), t2, 0.03); }, 60);
      }, 250);
    }
    // turning the EQ off sets every filter flat (0 dB) and the trim to unity, so already-sounding notes follow the switch too
    function apply(v) {
      var t0 = ctx.currentTime; gain.gain.cancelScheduledValues(t0); gain.gain.setTargetAtTime(v.muted ? 0 : v.volume / 100 * MULTIPLIER, t0, 0.01);   // eased, so muting and un-muting do not click
      trim.gain.value = v.eq ? EQ_TRIM : 1;
      filters.forEach(function (f, i) { f.gain.value = v.eq ? EQ[i].gain : 0; });
      var mix = v.reverbMix / 100;
      dry.gain.value = Math.cos(mix * Math.PI / 2);
      if (mix > 0 && !conv) { conv = ctx.createConvolver(); conv.buffer = makeIR(ctx, v.reverbDecay); irSeconds = v.reverbDecay; conv.connect(wet); }
      if (conv) {
        if (mix > 0 && !fed) { node.connect(conv); fed = true; } else if (mix === 0 && fed) { try { node.disconnect(conv); } catch (e) {} fed = false; }
        if (Math.abs(v.reverbDecay - irSeconds) > 0.04 && mix > 0) swapIR(v.reverbDecay); else wet.gain.value = Math.sin(mix * Math.PI / 2);
      }
    }
    apply(get());
    listeners.push(apply);
    outputs.set(ctx, gain);
    return gain;
  }

  // A made-up room: stereo noise that dies away evenly (down 60 dB after `seconds`) and gets darker as it goes, like a real space. About 1.4 MB for
  // a 4 s tail at 44.1 kHz; nothing is downloaded.
  function makeIR(ctx, seconds) {
    var rate = ctx.sampleRate, len = Math.max(64, Math.round(seconds * rate)), buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), lp = 0;
      for (var i = 0; i < len; i++) {
        var x = i / len, a = 0.85 * Math.exp(-3.2 * x) + 0.06;   // the low-pass closes over the tail
        lp += a * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-6.9 * x) * Math.min(1, i / (0.004 * rate));   // 4 ms fade-in so the tail does not start with a tick
      }
    }
    return buf;
  }

  // One note through the shared output with the shared synth settings. t = when it starts (ctx time), level = its peak, dur = how long the key is held
  // (leave dur out for a note you let go of yourself with release()). Returns { osc, release }.
  // The level rises through two gains that each ease toward their target, so the note starts with no slope at all (a straight ramp has a corner at its start,
  // and that corner is the click); the attack setting is about the time from 10 % to 90 %.
  function note(ctx, o) {
    var s = get(), t = o.t === undefined ? ctx.currentTime : o.t, level = o.level === undefined ? 0.22 : o.level;
    var tau = Math.max(0.0008, s.attack / 1000 / 2.6), sus = s.sustain / 100, rel = Math.max(0.02, s.release);
    var osc = ctx.createOscillator(), g1 = ctx.createGain(), g2 = ctx.createGain();
    osc.type = s.tone; osc.frequency.value = 440 * Math.pow(2, (o.midi - 69) / 12);
    g1.gain.setValueAtTime(0, t); g1.gain.setTargetAtTime(level, t, tau);
    g2.gain.setValueAtTime(0, t); g2.gain.setTargetAtTime(1, t, tau);
    var held = o.dur === undefined, end = held ? 0 : t + o.dur, decayAt = t + 6 * tau;
    if (sus < 0.999 && (held || decayAt < end)) g1.gain.setTargetAtTime(level * sus, decayAt, Math.max(0.012, s.decay / 4));   // down to the sustain level in about the decay time
    osc.connect(g1).connect(g2).connect(out(ctx)); osc.start(t);
    if (!held) { g1.gain.setTargetAtTime(0, end, rel / 6); try { osc.stop(end + rel * 1.4 + 0.06); } catch (e) {} }
    return {
      osc: osc,
      release: function (quick) {   // for held notes: let go now
        var now = ctx.currentTime, r = quick ? 0.04 : rel;
        g1.gain.cancelScheduledValues(now); g1.gain.setValueAtTime(g1.gain.value, now); g1.gain.setTargetAtTime(0, now, r / 6);
        try { osc.stop(now + r * 1.4 + 0.06); } catch (e) {}
      },
    };
  }

  window.FretlineAudio = { note: note, defaults: DEFAULTS, range: RANGE, get: get, set: set, out: out, onChange: function (fn) { listeners.push(fn); }, multiplier: MULTIPLIER, eq: EQ };

  // ---------- the Playback button: volume, tone and the EQ switch, at the end of every page's tab row ----------
  // Built here so every page gets the same panel; each page's own .site-tab styling makes the button match its tabs.
  // It is a <button>, not an <a class="site-tab">, so the tab links and the Alt+1..6 page shortcuts (embed.js) leave it alone.
  var CSS = [
    ".fl-pb-btn { cursor: pointer; background: transparent; }",
    ".fl-pb-btn[aria-expanded='true'] { border-color: var(--bark, #3d3a30); color: var(--bark, #3d3a30); background: var(--linen, #e8e0d0); }",
    ".fl-pb-panel { position: absolute; top: 100%; z-index: 50; width: 280px; margin-top: 6px; padding: 16px 18px 18px; box-sizing: border-box;",
    "  background: var(--parchment, #f5f0e8); border: 1px solid var(--bark, #3d3a30); color: var(--bark, #3d3a30);",
    "  font-family: var(--font-body, Helvetica, Arial, sans-serif); text-align: left; letter-spacing: 0; text-transform: none; }",
    ".fl-pb-panel[hidden] { display: none; }",
    ".fl-pb-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--wheat, #c4b89a); padding-bottom: 8px; margin-bottom: 14px; }",
    ".fl-pb-head span { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; }",
    ".fl-pb-head span + span { color: var(--sage, #8a9e7e); letter-spacing: 0.14em; }",
    ".fl-pb-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--moss, #5c6b52); margin: 0 0 7px; }",
    ".fl-pb-label b { font-family: var(--font-display, Georgia, serif); font-weight: 400; font-size: 16px; letter-spacing: 0; text-transform: none; color: var(--bark, #3d3a30); }",
    ".fl-pb-panel input[type=range] { width: 100%; margin: 0 0 16px; accent-color: var(--bark, #3d3a30); }",
    ".fl-pb-volrow { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }",
    ".fl-pb-volrow input[type=range] { flex: 1; margin: 0; min-width: 0; }",
    ".fl-pb-volrow.muted input[type=range] { opacity: 0.4; }",
    ".fl-pb-mute { font: inherit; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; padding: 6px 10px; border: 1px solid var(--bark, #3d3a30); background: transparent; color: var(--bark, #3d3a30); cursor: pointer; }",
    ".fl-pb-mute[aria-pressed='true'] { background: var(--bark, #3d3a30); color: var(--parchment, #f5f0e8); }",
    ".fl-pb-seg { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--bark, #3d3a30); margin-bottom: 16px; }",
    ".fl-pb-seg button { font: inherit; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; padding: 8px 4px; border: 0; border-radius: 0; background: transparent; color: var(--bark, #3d3a30); cursor: pointer; }",
    ".fl-pb-seg button + button { border-left: 1px solid var(--bark, #3d3a30); }",
    ".fl-pb-seg button[aria-pressed='true'] { background: var(--bark, #3d3a30); color: var(--parchment, #f5f0e8); }",
    ".fl-pb-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--moss, #5c6b52); }",
    ".fl-pb-check input { width: 14px; height: 14px; margin: 0; accent-color: var(--bark, #3d3a30); cursor: pointer; }",
    ".fl-pb-hint { margin: 6px 0 0; font-size: 11px; line-height: 1.5; color: var(--moss, #5c6b52); }",
    ".fl-pb-panel { max-height: 82vh; overflow-y: auto; }",
    ".fl-pb-sub { margin: 18px 0 10px; padding-top: 12px; border-top: 1px solid var(--wheat, #c4b89a); font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--sage, #8a9e7e); }",
    ".fl-pb-panel input[type=range].fl-pb-tight { margin-bottom: 11px; }",
    ".fl-pb-reset { font: inherit; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; margin-top: 16px; padding: 6px 12px; border: 1px solid var(--wheat, #c4b89a); background: transparent; color: var(--moss, #5c6b52); cursor: pointer; }",
    ".fl-pb-reset:hover { border-color: var(--sage, #8a9e7e); color: var(--bark, #3d3a30); }",
    // the Playback and Notes buttons live together on the right side of the header, level with the tabs
    ".fl-tools { display: flex; gap: 8px; margin-left: auto; align-self: flex-end; margin-bottom: 4px; }",
    // phones: the tab grid is full, so the buttons sit in the header's top-right corner, level with the Fretline title
    "@media (max-width: 700px) {",
    "  .fl-tools { position: absolute; top: 12px; right: 12px; margin: 0; gap: 6px; }",
    "  .fl-tools .site-tab { width: auto; min-width: 0; padding: 6px 12px; }",
    "  .fl-pb-panel { left: 12px; right: 12px !important; width: auto; }",
    "}",
  ].join("\n");

  // where the header buttons go: a box on the right of the tab row, made once and shared (the Notes button joins it from fl-notes.js)
  window.FretlineTools = {
    host: function () {
      var box = document.querySelector(".fl-tools"), nav = document.querySelector("nav.site-tabs");
      if (box || !nav) return box;
      box = document.createElement("div"); box.className = "fl-tools";
      nav.parentNode.insertBefore(box, nav.nextSibling);
      return box;
    },
  };

  // the synth and reverb sliders: key, label, unit, step, how the number is shown
  var SLIDERS = [
    ["attack", "Attack", "ms", 1, function (v) { return Math.round(v); }], ["decay", "Decay", "s", 0.05, function (v) { return v.toFixed(2); }],
    ["sustain", "Sustain", "%", 1, function (v) { return Math.round(v); }], ["release", "Release", "s", 0.01, function (v) { return v.toFixed(2); }],
    ["reverbMix", "Dry / wet", "%", 1, function (v) { return Math.round(v); }], ["reverbDecay", "Decay time", "s", 0.1, function (v) { return v.toFixed(1); }],
  ];
  function sliderRow(d) {
    return '<label class="fl-pb-label" for="fl-pb-' + d[0] + '">' + d[1] + ' <span><b id="fl-pb-' + d[0] + '-value"></b> ' + d[2] + '</span></label>' +
      '<input type="range" class="fl-pb-tight" id="fl-pb-' + d[0] + '" min="' + RANGE[d[0]][0] + '" max="' + RANGE[d[0]][1] + '" step="' + d[3] + '">';
  }

  function buildPanel() {
    var nav = document.querySelector("nav.site-tabs");
    if (!nav || document.querySelector(".fl-pb-btn")) return;
    var header = nav.closest("header") || nav.parentNode;
    if (getComputedStyle(header).position === "static") header.style.position = "relative";   // sticky headers already anchor the panel

    var style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);

    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "site-tab fl-pb-btn"; btn.textContent = "Playback";
    btn.title = "Volume, tone and loudness EQ (the same on every page)";
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "fl-pb-panel");
    window.FretlineTools.host().appendChild(btn);

    var panel = document.createElement("div");
    panel.id = "fl-pb-panel"; panel.className = "fl-pb-panel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Playback settings");
    panel.innerHTML =
      '<div class="fl-pb-head"><span>Playback</span><span>Every page</span></div>' +
      '<label class="fl-pb-label" for="fl-pb-volume">Volume <span><b id="fl-pb-volume-value"></b> %</span></label>' +
      '<div class="fl-pb-volrow" id="fl-pb-volrow"><input type="range" id="fl-pb-volume" min="0" max="100" step="1"><button type="button" class="fl-pb-mute" id="fl-pb-mute" aria-pressed="false" title="Silence everything (the same on every page)">Mute</button></div>' +
      '<div class="fl-pb-label">Tone</div>' +
      '<div class="fl-pb-seg" role="group" aria-label="Tone">' +
      TONES.map(function (t) { return '<button type="button" data-tone="' + t + '">' + t + "</button>"; }).join("") + "</div>" +
      '<label class="fl-pb-check"><input type="checkbox" id="fl-pb-eq"> Equal-loudness EQ</label>' +
      '<p class="fl-pb-hint">Lifts low notes and evens out the highs to match how the ear hears, so every note sounds about as loud as the others.</p>' +
      '<div class="fl-pb-sub">Synth</div>' + SLIDERS.slice(0, 4).map(sliderRow).join("") +
      '<div class="fl-pb-sub">Reverb</div>' + SLIDERS.slice(4).map(sliderRow).join("") +
      '<button type="button" class="fl-pb-reset" id="fl-pb-reset">Reset the sound</button>';
    header.appendChild(panel);

    var vol = panel.querySelector("#fl-pb-volume"), volText = panel.querySelector("#fl-pb-volume-value"), eqBox = panel.querySelector("#fl-pb-eq");
    var toneBtns = panel.querySelectorAll("[data-tone]"), muteBtn = panel.querySelector("#fl-pb-mute"), volRow = panel.querySelector("#fl-pb-volrow");
    function show(v) {
      vol.value = String(Math.round(v.volume)); volText.textContent = vol.value;
      muteBtn.setAttribute("aria-pressed", String(v.muted)); muteBtn.textContent = v.muted ? "Muted" : "Mute"; volRow.classList.toggle("muted", v.muted);
      btn.textContent = v.muted ? "Playback · muted" : "Playback";
      toneBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tone") === v.tone)); });
      eqBox.checked = v.eq;
      SLIDERS.forEach(function (d) { var el = panel.querySelector("#fl-pb-" + d[0]); el.value = String(v[d[0]]); panel.querySelector("#fl-pb-" + d[0] + "-value").textContent = d[4](+v[d[0]]); });
    }
    show(get()); listeners.push(show);
    vol.addEventListener("input", function () { set({ volume: +vol.value, muted: false }); });   // moving the slider un-mutes
    muteBtn.addEventListener("click", function () { set({ muted: !get().muted }); });
    toneBtns.forEach(function (b) { b.addEventListener("click", function () { set({ tone: b.getAttribute("data-tone") }); }); });
    eqBox.addEventListener("change", function () { set({ eq: eqBox.checked }); });
    SLIDERS.forEach(function (d) { panel.querySelector("#fl-pb-" + d[0]).addEventListener("input", function (e) { var p = {}; p[d[0]] = +e.target.value; set(p); }); });
    panel.querySelector("#fl-pb-reset").addEventListener("click", function () { set({ volume: DEFAULTS.volume, tone: DEFAULTS.tone, eq: DEFAULTS.eq, attack: DEFAULTS.attack, decay: DEFAULTS.decay, sustain: DEFAULTS.sustain, release: DEFAULTS.release, reverbMix: DEFAULTS.reverbMix, reverbDecay: DEFAULTS.reverbDecay, muted: false }); });

    function place() {   // line the panel's right edge up with the button's (on phones the CSS pins it to the header's sides instead)
      var h = header.getBoundingClientRect(), b = btn.getBoundingClientRect();
      panel.style.right = Math.max(12, Math.round(h.right - b.right)) + "px";
    }
    function open(yes) {
      panel.hidden = !yes; btn.setAttribute("aria-expanded", String(yes));
      if (yes) place();
    }
    btn.addEventListener("click", function () { open(panel.hidden); });
    document.addEventListener("pointerdown", function (e) { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) open(false); });
    window.addEventListener("resize", function () { if (!panel.hidden) place(); });
    // keys pressed in the panel stay in the panel, so the page's own shortcuts (space, arrows, letters) don't fire while
    // you adjust a slider; Escape closes it. The Alt page shortcuts still work, since they listen before this point.
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { open(false); btn.focus(); }
      e.stopPropagation();
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) open(false);
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") e.stopPropagation();   // pressing the button isn't a page shortcut
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildPanel);
  else buildPanel();
})();
