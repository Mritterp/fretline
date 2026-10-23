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
    ".fl-pb-seg { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--bark, #3d3a30); margin-bottom: 16px; }",
    ".fl-pb-seg button { font: inherit; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; padding: 8px 4px; border: 0; border-radius: 0; background: transparent; color: var(--bark, #3d3a30); cursor: pointer; }",
    ".fl-pb-seg button + button { border-left: 1px solid var(--bark, #3d3a30); }",
    ".fl-pb-seg button[aria-pressed='true'] { background: var(--bark, #3d3a30); color: var(--parchment, #f5f0e8); }",
    ".fl-pb-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--moss, #5c6b52); }",
    ".fl-pb-check input { width: 14px; height: 14px; margin: 0; accent-color: var(--bark, #3d3a30); cursor: pointer; }",
    ".fl-pb-hint { margin: 6px 0 0; font-size: 11px; line-height: 1.5; color: var(--moss, #5c6b52); }",
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
      '<input type="range" id="fl-pb-volume" min="0" max="100" step="1">' +
      '<div class="fl-pb-label">Tone</div>' +
      '<div class="fl-pb-seg" role="group" aria-label="Tone">' +
      TONES.map(function (t) { return '<button type="button" data-tone="' + t + '">' + t + "</button>"; }).join("") + "</div>" +
      '<label class="fl-pb-check"><input type="checkbox" id="fl-pb-eq"> Equal-loudness EQ</label>' +
      '<p class="fl-pb-hint">Lifts low notes and evens out the highs to match how the ear hears, so every note sounds about as loud as the others.</p>';
    header.appendChild(panel);

    var vol = panel.querySelector("#fl-pb-volume"), volText = panel.querySelector("#fl-pb-volume-value"), eqBox = panel.querySelector("#fl-pb-eq");
    var toneBtns = panel.querySelectorAll("[data-tone]");
    function show(v) {
      vol.value = String(Math.round(v.volume)); volText.textContent = vol.value;
      toneBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tone") === v.tone)); });
      eqBox.checked = v.eq;
    }
    show(get()); listeners.push(show);
    vol.addEventListener("input", function () { set({ volume: +vol.value }); });
    toneBtns.forEach(function (b) { b.addEventListener("click", function () { set({ tone: b.getAttribute("data-tone") }); }); });
    eqBox.addEventListener("change", function () { set({ eq: eqBox.checked }); });

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
