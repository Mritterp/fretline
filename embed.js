// Shared by every Fretline page (loaded first in each <head>).
// The pages live inside index.html, which keeps all of them loaded and just shows one at a time, so switching tabs never
// throws away what you were doing. This file is the page's side of that arrangement:
//  - opened on its own (not inside index.html), a page sends you to index.html, which loads it in place;
//    add ?standalone to the address to see a page by itself (handy for testing);
//  - inside index.html, the tab links ask index.html to switch instead of navigating;
//  - sound is paused while a page is hidden and picked up again when you return.
(function () {
  var file = location.pathname.split("/").pop() || "fretline.html";
  var name = file.replace(/\.html$/, "");
  var embedded = window.parent !== window;
  if (!embedded) {
    if (!/[?&]standalone\b/.test(location.search) && name !== "index") {
      location.replace("index.html" + location.search + "#" + name);
    }
    return;
  }

  // every AudioContext this page makes, so the sound can be paused while the page is hidden
  var Native = window.AudioContext || window.webkitAudioContext, contexts = [], wasRunning = [];
  if (Native) {
    var Tracked = new Proxy(Native, { construct: function (T, args) { var c = new T(...args); contexts.push(c); return c; } });
    window.AudioContext = Tracked;
    if (window.webkitAudioContext) window.webkitAudioContext = Tracked;
  }
  window.__fretlineHidden = false;
  window.__fretlineContexts = contexts;   // for checking the pause/resume by hand
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || e.origin !== location.origin || !e.data) return;
    if (e.data.fretline === "hide") {
      window.__fretlineHidden = true;
      wasRunning = contexts.filter(function (c) { return c.state === "running"; });
      wasRunning.forEach(function (c) { try { c.suspend(); } catch (err) {} });
    } else if (e.data.fretline === "show") {
      window.__fretlineHidden = false;
      wasRunning.forEach(function (c) { try { c.resume(); } catch (err) {} });
      wasRunning = [];
    }
  });

  // practice time (fl-practice.js in index.html): tell it when you're active here, and every few seconds while sound plays
  var lastPing = 0, sounding = 0;
  function active() { var now = Date.now(); if (now - lastPing < 5000) return; lastPing = now; window.parent.postMessage({ fretline: "active" }, location.origin); }
  ["pointerdown", "keydown", "wheel", "input"].forEach(function (t) { document.addEventListener(t, active, { capture: true, passive: true }); });
  var Src = window.AudioScheduledSourceNode;   // oscillators: notes, chords and metronome clicks, including ones scheduled ahead
  if (Src && Src.prototype.start) {
    var start = Src.prototype.start;
    Src.prototype.start = function () {
      var node = this, done = false;
      sounding++;
      node.addEventListener("ended", function () { if (!done) { done = true; sounding--; } });
      return start.apply(node, arguments);
    };
  }
  setInterval(function () {
    if (sounding > 0 && !window.__fretlineHidden && contexts.some(function (c) { return c.state === "running"; })) active();
  }, 10000);

  // the tab links switch pages inside index.html (modified clicks still open a new tab as usual)
  function pageOf(a) { return (a.getAttribute("href") || "").split("?")[0].split("#")[0].split("/").pop().replace(/\.html$/, ""); }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.site-tab");
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var target = pageOf(a);
    if (!target) return;
    e.preventDefault();
    window.parent.postMessage({ fretline: "go", page: target }, location.origin);
  }, true);

  // Alt+1..6 jumps to a page, Alt+[ / Alt+] steps to the previous / next one. The order is the page's own tab bar.
  // e.code, not e.key: Option+digit on a Mac (and AltGr layouts) types a symbol instead of the digit.
  function tabs() { return Array.prototype.slice.call(document.querySelectorAll("a.site-tab")); }
  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var list = tabs(), idx = -1, m = /^Digit([1-9])$/.exec(e.code);
    if (!list.length) return;
    if (m) idx = parseInt(m[1], 10) - 1;
    else if (e.code === "BracketLeft" || e.code === "BracketRight") {
      var cur = list.findIndex(function (a) { return a.classList.contains("current"); });
      idx = (cur + (e.code === "BracketRight" ? 1 : -1) + list.length) % list.length;
    }
    if (idx < 0 || idx >= list.length) return;
    e.preventDefault();
    window.parent.postMessage({ fretline: "go", page: pageOf(list[idx]) }, location.origin);
  }, true);
  document.addEventListener("DOMContentLoaded", function () {
    tabs().forEach(function (a, i) { a.title = "Alt+" + (i + 1) + "  ·  Alt+[ / Alt+] for previous / next page"; });
  });
})();
