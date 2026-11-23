#!/usr/bin/env node
// Keeps harmony-core.js (the theory the Piano page uses) in step with harmony_map.html.
//   node tools/harmony-core-data.js print   prints the theory tables (JSON) as read from harmony_map.html
//   node tools/harmony-core-data.js check   compares them with harmony-core.js and exits 1 if they differ
// harmony_map.html keeps its theory and its screen layout together in one table; this reads the theory columns only
// (the ids, functions, offsets and names), never the coordinates.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error("harmony_map.html: cannot find " + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error("harmony_map.html: cannot find the end of " + startMarker);
  return src.slice(a + startMarker.length, b);
}
const evalLit = (code) => vm.runInNewContext("(" + code + ")", {});

function fromMap() {
  const src = fs.readFileSync(path.join(root, "harmony_map.html"), "utf8");
  const Q = evalLit("{" + slice(src, "const Q = {", "\n  };") + "}");
  const main = evalLit("[" + slice(src, "const MAIN = [", "\n  ];") + "]");
  const clusters = evalLit("[" + slice(src, "const CLUSTERS = [", "\n  ];") + "]");
  const roles = evalLit("{" + slice(src, "const ROLES = {", "\n  };") + "}");
  const MAIN = main.map((m) => {
    const o = { id: m.id, region: m.region, ring: m.ring, off: m.off, tr: m.tr, jz: m.jz };
    if (m.bass !== undefined) o.bass = m.bass;
    if (m.adv) o.adv = 1;
    return o;
  });
  const ROLES = {};
  Object.entries(roles).forEach(([k, r]) => { ROLES[k] = { off: r.off, q: r.q }; if (r.bass !== undefined) ROLES[k].bass = r.bass; if (r.lab) ROLES[k].lab = r.lab; });
  const TARGETS = clusters.map((c) => ({ t: c.t, suf: c.suf, roles: Object.keys(c.pos), gr: !!c.gr }));
  return { Q, MAIN, ROLES, TARGETS };
}

function fromCore() {
  const sandbox = { window: {}, self: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "harmony-core.js"), "utf8"), sandbox);
  const H = sandbox.window.HarmonyCore || sandbox.self.HarmonyCore;
  if (!H) throw new Error("harmony-core.js did not define HarmonyCore");
  return { Q: H.Q, MAIN: H.MAIN, ROLES: H.ROLES, TARGETS: H.TARGETS };
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === "print") {
    const d = fromMap();
    console.log("Q: " + JSON.stringify(d.Q));
    console.log("MAIN: [\n" + d.MAIN.map((m) => "  " + JSON.stringify(m)).join(",\n") + "\n]");
    console.log("ROLES: " + JSON.stringify(d.ROLES));
    console.log("TARGETS: [\n" + d.TARGETS.map((t) => "  " + JSON.stringify(t)).join(",\n") + "\n]");
  } else if (mode === "check") {
    const a = JSON.stringify(fromMap()), b = JSON.stringify(fromCore());
    if (a === b) { console.log("harmony-core.js matches harmony_map.html"); process.exit(0); }
    const A = fromMap(), B = fromCore(); const bad = [];
    ["Q", "ROLES"].forEach((k) => { if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) bad.push(k); });
    A.MAIN.forEach((m, i) => { if (JSON.stringify(m) !== JSON.stringify(B.MAIN[i])) bad.push("MAIN[" + i + "] " + m.id); });
    if (A.MAIN.length !== B.MAIN.length) bad.push("MAIN length " + A.MAIN.length + " vs " + B.MAIN.length);
    A.TARGETS.forEach((t, i) => { if (JSON.stringify(t) !== JSON.stringify(B.TARGETS[i])) bad.push("TARGETS[" + i + "] " + t.t); });
    console.error("harmony-core.js differs from harmony_map.html: " + (bad.join(", ") || "(structure)") + "\nUpdate harmony-core.js (run `node tools/harmony-core-data.js print` to see the map's tables).");
    process.exit(1);
  } else { console.error("usage: node tools/harmony-core-data.js print|check"); process.exit(2); }
}
module.exports = { fromMap, fromCore };
