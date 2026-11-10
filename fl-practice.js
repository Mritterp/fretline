// Practice time: counts the minutes you spend using Fretline each day and sends them to Life Journal on this PC
// (http://localhost:8765), where they are added to Composition.
// Loaded by index.html only. The pages (in their iframes) tell it when you're active through embed.js: a click, key,
// scroll or edit, and every few seconds while any sound is playing (sightreading playback, metronome, a MIDI piano).
// Time counts while the last sign of activity is under IDLE old, so a pause to play along without touching anything
// still counts, and walking away stops the clock after IDLE.
// The daily totals live in this browser (localStorage) and are re-sent until Life Journal has them, so a day spent
// with Life Journal closed is sent the next time both are open.
(function () {
  var IDLE = 3 * 60 * 1000, TICK = 15 * 1000, SEND_EVERY = 2 * 60 * 1000, KEEP_DAYS = 60;
  var ENDPOINT = "http://localhost:8765/api/fretline/time", KEY = "fretline-practice", DEV = "fretline-device";
  var lastActive = 0, lastTick = Date.now(), dirty = false;

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function day(t) { var d = new Date(t); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function device() {
    try {
      var id = localStorage.getItem(DEV);
      if (!id) { id = "b" + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEV, id); }
      return id;
    } catch (e) { return "browser"; }
  }

  window.addEventListener("message", function (e) {
    if (e.origin === location.origin && e.data && e.data.fretline === "active") lastActive = Date.now();
  });
  ["pointerdown", "keydown"].forEach(function (t) { window.addEventListener(t, function () { lastActive = Date.now(); }, true); });

  setInterval(function () {
    var now = Date.now(), step = Math.min(now - lastTick, TICK * 2);   // a sleeping laptop doesn't count
    lastTick = now;
    if (now - lastActive > IDLE) return;
    var d = load(), k = day(now);
    d[k] = (d[k] || 0) + step / 1000;
    var cut = day(now - KEEP_DAYS * 864e5);
    Object.keys(d).forEach(function (x) { if (x < cut) delete d[x]; });
    save(d); dirty = true;
  }, TICK);

  // seconds per day -> minutes per day, the last two weeks (the server keeps each browser's latest numbers)
  function send(keepalive) {
    var d = load(), cut = day(Date.now() - 14 * 864e5), days = {};
    Object.keys(d).forEach(function (k) { if (k >= cut) days[k] = Math.round(d[k] / 6) / 10; });
    if (!Object.keys(days).length) return;
    var opts = { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: !!keepalive,
      body: JSON.stringify({ device: device(), days: days }) };
    try { opts.targetAddressSpace = "local"; } catch (e) {}
    fetch(ENDPOINT, opts).then(function (r) { if (r.ok) dirty = false; }).catch(function () {});   // Life Journal not running: try again later
  }
  setInterval(function () { if (dirty) send(false); }, SEND_EVERY);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && dirty) send(true); });
  setTimeout(function () { send(false); }, 5000);   // whatever is still waiting from earlier days

  window.FretlinePractice = { today: function () { return Math.round((load()[day(Date.now())] || 0) / 60); }, send: send };
})();
