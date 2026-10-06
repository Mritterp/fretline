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

  // the tab links switch pages inside index.html (modified clicks still open a new tab as usual)
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.site-tab");
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var target = (a.getAttribute("href") || "").split("?")[0].split("#")[0].split("/").pop().replace(/\.html$/, "");
    if (!target) return;
    e.preventDefault();
    window.parent.postMessage({ fretline: "go", page: target }, location.origin);
  }, true);
})();
