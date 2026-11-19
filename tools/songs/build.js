"use strict";
// Builds the Songbook data: songs/index.json and songs/<id>.json, from the Mutopia Project's LilyPond sources listed in pieces.json.
//   node tools/songs/build.js            build everything (downloads the sources into tools/songs/cache/ the first time)
//   node tools/songs/build.js 109 1431   build only these pieces
// A piece is only written if its notes, read from the LilyPond source, agree with the MIDI file Mutopia made from the same source (see verify.js).
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { parse, evaluate, scoreRoles, WHOLE } = require("./lilypond");
const { readMidi } = require("./midi");
const { compare, playSegments, onsets } = require("./verify");
const { build, U } = require("./score");
const { finger } = require("./tab");
const { measure } = require("./difficulty");
const { stripComments } = require("./util");

const ROOT = path.join(__dirname, "..", ".."), CACHE = path.join(__dirname, "cache"), OUT = path.join(ROOT, "songs");
const pieces = require("./pieces.json");
const only = process.argv.slice(2);

function fetchTo(url, file) { if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); execFileSync("curl", ["-s", "-f", "-m", "60", "-o", file, url]); } return file; }
const KEYNAME = (k) => "CDEFGAB"[k.step] + (k.alter > 0 ? "#" : k.alter < 0 ? "b" : "") + (k.mode === "minor" ? "m" : "");

function verifyAndEvaluate(src, ast, midi) {
  const roles = scoreRoles(ast);
  const hasExtra = src.includes("TabStaff") || src.includes("chordmode");
  const tried = [];
  for (const noOct of [false, true]) for (const simStart of ["same", "prevEnd"]) for (const simAfter of ["first", "last"]) for (const altRel of ["seq", "body"]) {
    const opts = { noOctaveTranspose: noOct, simStart, simAfter, altRel, score: roles.midi };
    let ev; try { ev = evaluate(ast, opts); } catch (e) { tried.push(e.message); continue; }
    const r = compare(ev.events, ev.repeats, ev.end, midi, { allowExtraMidi: hasExtra });
    if (!r.ok) { tried.push(r.results.map((x) => x.detail).join(" | ")); continue; }
    const strict = !r.graceOnly && !(r.results.find((x) => x.ok) || {}).detail;
    // the notes as engraved: no instrument transposition (that is for the MIDI only), the staff rather than a tab staff
    const printEv = evaluate(ast, Object.assign({}, opts, { score: roles.print, printMode: true, noOctaveTranspose: false }));
    const note = [];
    {   // the printed notes must contain every note of the score that made the MIDI (same times and pitch classes; the octave may differ by the clef convention)
      const a = onsets(ev.events, playSegments(ev.repeats, ev.end, "unfolded"), 384), b = onsets(printEv.events, playSegments(printEv.repeats, printEv.end, "unfolded"), 384);
      const key = (x) => x[0] + ":" + (((x[1] % 12) + 12) % 12);
      const bs = new Set(b.map(key)), missing = a.filter((x) => !bs.has(key(x)));
      if (missing.length) throw new Error("the printed score lacks " + missing.length + " notes that the MIDI has");
      const as = new Set(a.map(key)), extra = b.filter((x) => !as.has(key(x)));
      if (extra.length) note.push(extra.length + " notes in the printed score are not in the MIDI (a voice the MIDI leaves out)");
    }
    return { ev: printEv, opts, mode: r.mode, verified: r.graceOnly ? "pitches" : (r.results.find((x) => x.ok) || {}).detail ? "subset" : "exact", note };
  }
  throw new Error("could not be matched to its MIDI file: " + tried.slice(-2).join(" || ").slice(0, 400));
}

function buildPiece(p) {
  const ly = fs.readFileSync(fetchTo(p.ly, path.join(CACHE, p.id + ".ly")), "utf8");
  const midi = readMidi(fs.readFileSync(fetchTo(p.mid, path.join(CACHE, p.id + ".mid"))));
  const ast = parse(ly);
  const v = verifyAndEvaluate(ly, ast, midi), ev = v.ev;
  const bare = stripComments(ly);
  const clef8 = bare.includes("treble_8") || bare.includes("G_8") || bare.includes("violin_8");
  if (clef8) ev.events.forEach((e) => { if (e.pitches) e.pitches.forEach((q) => { q.oct += 1; q.midi += 12; }); });   // written pitch: what a plain treble clef would show
  const sc = build(ev);
  const { bars, out } = sc;

  // keys
  const keys = ev.changes.key.slice().sort((a, b) => a.t - b.t);
  keys.forEach((k) => { if (k.mode && !["major", "minor"].includes(k.mode)) throw new Error("key mode " + k.mode + " is not supported"); });
  const keyAt = (t) => { let cur = null; for (const k of keys) if (k.t <= t) cur = k; return cur; };

  // repeats -> bar markers
  const barOf = new Map(bars.map((b, k) => [b.t0, k])); barOf.set(bars[bars.length - 1].t1, bars.length);
  const marks = bars.map(() => ({}));
  const at = (t, what) => { if (!barOf.has(t)) throw new Error(what + " does not start on a bar line (tick " + t + ")"); return barOf.get(t); };
  for (const r of ev.repeats) {
    const s = at(r.t0, "a repeat"); marks[s].rs = 1;
    if (!r.alts.length) { const e = at(r.tBody, "a repeat end") - 1; marks[e].re = (marks[e].re || 0) + 1; continue; }
    const M = r.alts.length;
    r.alts.forEach((a, k) => {
      const first = at(a.t0, "an alternative"), last = at(a.t1, "an alternative") - 1;
      const text = M === r.n ? (k + 1) + "." : k === 0 ? "1.-" + (r.n - M + 1) + "." : (r.n - M + k + 1) + ".";
      for (let b = first; b <= last; b++) marks[b].vo = { t: first === last ? text : b === first ? text : "", p: first === last ? "be" : b === first ? "b" : b === last ? "e" : "m" };
      if (k < M - 1) marks[last].re = 1;
    });
    if (!r.alts.length) marks[at(r.tBody, "a repeat end") - 1].re = 1;
    if (M && r.alts.length) { /* the last alternative ends the passage: no repeat sign */ }
  }
  marks[marks.length - 1].fin = 1;

  // play order, repeats unfolded
  const segs = playSegments(ev.repeats, ev.end, "unfolded"), play = [];
  segs.forEach(([a, b]) => { const first = bars.findIndex((x) => x.t0 >= a), lastIdx = bars.map((x, k) => (x.t0 < b ? k : -1)).filter((k) => k >= 0).pop(); if (first >= 0 && lastIdx >= first) { const prev = play[play.length - 1]; if (prev && prev[1] + 1 === first) prev[1] = lastIdx; else play.push([first, lastIdx]); } });

  // tab
  const notes = []; let id = 0;
  const lastNoteOf = new Map();   // voice index -> Map(midi -> note id awaiting a continuation)
  const itemNotes = new Map();
  const midiOf = (n) => 12 * (n[2] + 4) + [0, 2, 4, 5, 7, 9, 11][n[0]] + n[1] - 12;   // sounding pitch: guitar music is written an octave above where it sounds
  const order = [];   // [barIndex, voiceIndex, item] in time order per voice
  out.forEach((b, bi) => b.voices.forEach((items, vi) => items.forEach((it) => { if (!it.r) order.push([bi, vi, it]); })));
  order.sort((x, y) => x[1] - y[1] || x[0] - y[0] || x[2].o - y[2].o);
  for (const [bi, vi, it] of order) {
    const pending = lastNoteOf.get(vi) || new Map(); lastNoteOf.set(vi, pending);
    const t = bars[bi].t0 + it.o * U, end = t + it.u * U, ids = [];
    const nextPending = new Map();
    it.n.forEach((n) => {
      const m = midiOf(n), contOf = pending.has(m) ? pending.get(m) : null, nid = id++;
      notes.push({ id: nid, t, end, midi: m, contOf });
      ids.push(nid); if (n[3]) nextPending.set(m, nid);
    });
    lastNoteOf.set(vi, nextPending); itemNotes.set(it, ids);
  }
  const chosen = finger(notes);
  const fingered = [];
  for (const [it, ids] of itemNotes) it.n.forEach((n, k) => { const c = chosen.get(ids[k]); if (!c) throw new Error("a note was not fingered"); n.push(6 - c.s, c.f); fingered.push({ t: notes[ids[k]].t, f: c.f }); });
  // MIDI tempo (quarter notes per minute)
  const BS = String.fromCharCode(92), marked = bare.includes(BS + "tempo") || bare.includes("tempoWholesPerMinute");   // an edition without a tempo marking plays at the MIDI default of 120: for those, start from a gentle practice tempo instead
  const tempo = marked && midi.tempos.length ? Math.round(60000000 / midi.tempos[0].usPerQuarter) : 80;

  const outBars = out.map((b, k) => {
    const o = { len: (b.t1 - b.t0) / U };
    if (k === 0 || b.num !== out[k - 1].num || b.den !== out[k - 1].den) o.ts = [b.num, b.den];
    const key = keyAt(b.t0), prevKey = k ? keyAt(out[k - 1].t0) : null;
    if (key && (k === 0 || key !== prevKey)) o.ks = KEYNAME(key); else if (!key && k === 0) o.ks = "C";
    Object.assign(o, marks[k]);
    o.v = b.voices;
    return o;
  });
  const stats = measure({ bars: outBars.map((b) => ({ len: b.len, voices: b.v })), tempo }, fingered);
  // the page shows notation only: the fingering was needed for the difficulty estimate, and is not kept
  outBars.forEach((b) => b.v.forEach((items) => items.forEach((it) => { if (it.n) it.n.forEach((n) => { n.length = 4; }); })));
  return {
    id: p.id, title: p.title, composer: p.composer, section: p.section, license: p.license, source: { name: "Mutopia Project", url: p.info },
    maintainer: ((ly.match(/maintainer\s*=\s*"([^"]*)"/) || [])[1] || "").trim(), tempo, tempoMarked: marked, stats, verified: v.verified, notes: v.note, bars: outBars, play,
  };
}

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
const built = [], failed = [];
for (const p of pieces) {
  if (only.length && !only.includes(p.id)) continue;
  try { const data = buildPiece(p); built.push(data); console.log("ok   ", p.id.padEnd(5), p.title.padEnd(44), "bars", String(data.bars.length).padStart(3), "level-score", data.stats.score, "verified:", data.verified, data.notes.length ? "[" + data.notes.join("; ") + "]" : ""); }
  catch (e) { failed.push([p.id, p.title, e.message]); console.log("FAIL ", p.id.padEnd(5), p.title, "->", e.message.slice(0, 220)); }
}
// difficulty levels from the estimated score; the cut points are tuned on this collection so that every level has pieces
const CUTS = [30, 45, 58];   // below 30 Beginner, below 45 Easy, below 58 Intermediate, else Advanced
const LEVELS = ["Beginner", "Easy", "Intermediate", "Advanced"];
built.forEach((b) => { b.level = CUTS.filter((c) => b.stats.score >= c).length + 1; });
if (!only.length) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith(".json") || f === "CREDITS.md") fs.unlinkSync(path.join(OUT, f));
  built.forEach((b) => fs.writeFileSync(path.join(OUT, b.id + ".json"), JSON.stringify(b)));
  const index = { levels: LEVELS, sections: [{ id: "folk", name: "Folk & traditional" }, { id: "classical", name: "Classical guitar" }, { id: "canons", name: "Canons" }],
    pieces: built.map((b) => ({ id: b.id, title: b.title, composer: b.composer, section: b.section, level: b.level, score: b.stats.score, bars: b.stats.bars, minutes: b.stats.minutes, tempo: b.tempo,
      ts: b.bars[0].ts, ks: b.bars[0].ks, license: b.license, verified: b.verified })) };
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
  const lines = ["# Songbook credits", "", "Every piece in the Songbook is an arrangement read from the LilyPond source of an edition in the [Mutopia Project](https://www.mutopiaproject.org), and checked against the MIDI file Mutopia made from the same source. The notation and tab here are derived from those editions.", "", "- **Public Domain**: the typesetters placed their editions in the public domain.", "- **CC BY 3.0**: [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). Credit the typesetter named below.", "- **CC BY-SA 3.0**: [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Credit the typesetter and share any adaptation (including these data files) under the same license.", "", "| Piece | Composer | Typeset by | License | Source |", "|---|---|---|---|---|"];
  built.forEach((b) => lines.push("| " + b.title + " | " + b.composer + " | " + (b.maintainer || "") + " | [" + b.license.name + "](" + b.license.url + ") | [Mutopia " + b.id + "](" + b.source.url + ") |"));
  fs.writeFileSync(path.join(OUT, "CREDITS.md"), lines.join("\n") + "\n");
  const counts = [1, 2, 3, 4].map((l) => built.filter((b) => b.level === l).length);
  console.log("levels (Beginner, Easy, Intermediate, Advanced):", counts.join(", "), "| total", built.length, "| written to songs/");
  const size = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log("songs/ is", Math.round(size / 1024), "KB");
}
if (failed.length) console.log("not built:", failed.map((x) => x[0] + " (" + x[2].slice(0, 80) + ")").join("; "));
module.exports = { buildPiece };
