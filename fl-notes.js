// A Notes button at the end of every page's tab row (next to Playback, on the right): a small window for notes and reminders.
// The text is kept in this browser (localStorage) and is the same on every page: type on one page and it is there on the others.
(function () {
  var KEY = "fretline-notes", memory = "";
  function read() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return memory; } }
  function write(text) { memory = text; try { localStorage.setItem(KEY, text); } catch (e) {} }

  var CSS = [
    ".fl-notes-btn { cursor: pointer; background: transparent; }",
    ".fl-notes-btn[aria-expanded='true'] { border-color: var(--bark, #3d3a30); color: var(--bark, #3d3a30); background: var(--linen, #e8e0d0); }",
    ".fl-notes-btn.has-notes::after { content: ' \\25CF'; font-size: 7px; vertical-align: 2px; color: var(--clay, #b07a5a); }",   // a small dot: there is something written
    ".fl-notes-panel { width: 360px; }",
    ".fl-notes-panel textarea { display: block; width: 100%; min-height: 230px; max-height: 60vh; resize: vertical; box-sizing: border-box; padding: 9px 10px;",
    "  font: 13px/1.5 var(--font-body, Helvetica, Arial, sans-serif); letter-spacing: 0; text-transform: none; color: var(--bark, #3d3a30);",
    "  background: #fbf8f1; border: 1px solid var(--wheat, #c4b89a); border-radius: 0; }",
    ".fl-notes-panel textarea:focus { outline: none; border-color: var(--bark, #3d3a30); }",
    ".fl-notes-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sage, #8a9e7e); }",
    ".fl-notes-clear { font: inherit; letter-spacing: 0.14em; text-transform: uppercase; padding: 4px 10px; border: 1px solid var(--wheat, #c4b89a); background: transparent; color: var(--moss, #5c6b52); cursor: pointer; }",
    ".fl-notes-clear:hover { border-color: var(--sage, #8a9e7e); color: var(--bark, #3d3a30); }",
  ].join("\n");

  function build() {
    var host = window.FretlineTools && window.FretlineTools.host();
    if (!host || document.querySelector(".fl-notes-btn")) return;
    var header = host.closest("header") || host.parentNode;
    var style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);

    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "site-tab fl-notes-btn"; btn.textContent = "Notes";
    btn.title = "Notes and reminders (kept on this device, the same on every page)";
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "fl-notes-panel");
    host.appendChild(btn);

    var panel = document.createElement("div");
    panel.id = "fl-notes-panel"; panel.className = "fl-pb-panel fl-notes-panel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Notes and reminders");
    panel.innerHTML =
      '<div class="fl-pb-head"><span>Notes</span><span>Every page</span></div>' +
      '<textarea id="fl-notes-text" spellcheck="true" placeholder="Notes and reminders…" aria-label="Notes and reminders"></textarea>' +
      '<div class="fl-notes-foot"><span id="fl-notes-status">Saved on this device</span><button type="button" class="fl-notes-clear">Clear</button></div>';
    header.appendChild(panel);

    var text = panel.querySelector("#fl-notes-text"), status = panel.querySelector("#fl-notes-status"), timer = null;
    function mark() { btn.classList.toggle("has-notes", text.value.trim().length > 0); }
    text.value = read(); mark();
    text.addEventListener("input", function () {
      status.textContent = "Saving…"; mark();
      clearTimeout(timer);
      timer = setTimeout(function () { write(text.value); status.textContent = "Saved on this device"; }, 250);
    });
    window.addEventListener("pagehide", function () { if (timer) { clearTimeout(timer); write(text.value); } });
    // a change made on another page shows up here (unless you are typing in this box right now)
    window.addEventListener("storage", function (e) {
      if (e.key !== KEY) return;
      if (document.activeElement !== text) text.value = e.newValue || "";
      mark();
    });
    panel.querySelector(".fl-notes-clear").addEventListener("click", function () {
      if (!text.value.trim() || window.confirm("Clear all your notes?")) { text.value = ""; write(""); mark(); status.textContent = "Cleared"; text.focus(); }
    });

    function place() {   // the panel's right edge lines up with the button's (on phones the CSS pins it to the header's sides)
      var h = header.getBoundingClientRect(), b = btn.getBoundingClientRect();
      panel.style.right = Math.max(12, Math.round(h.right - b.right)) + "px";
    }
    function open(yes) {
      panel.hidden = !yes; btn.setAttribute("aria-expanded", String(yes));
      if (yes) { place(); text.focus(); }
    }
    btn.addEventListener("click", function () { open(panel.hidden); });
    document.addEventListener("pointerdown", function (e) { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) open(false); });
    window.addEventListener("resize", function () { if (!panel.hidden) place(); });
    // keys typed in the window stay in the window, so the page's own shortcuts (space, arrows, letters, 7) don't fire while you write;
    // Escape closes it. The Alt page shortcuts still work, since they listen before this point.
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { open(false); btn.focus(); }
      e.stopPropagation();
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) open(false);
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") e.stopPropagation();   // pressing the button isn't a page shortcut
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
