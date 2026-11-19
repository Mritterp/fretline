"use strict";
// Checks a parsed piece against the MIDI file that Mutopia generated from the same LilyPond source: every note's start time and pitch must match.
const { WHOLE } = require("./lilypond");

// the segments of the written timeline in the order they are played, repeats and alternatives expanded
function playSegments(repeats, end, mode) {
  const segs = []; let cur = 0;
  const rs = repeats.slice().sort((a, b) => a.t0 - b.t0);
  for (const r of rs) {
    if (r.t0 < cur) continue;   // nested: not expanded
    segs.push([cur, r.t0]);
    if (mode === "written") { segs.push([r.t0, r.t1]); cur = r.t1; continue; }
    const M = r.alts.length;
    for (let pass = 1; pass <= r.n; pass++) {
      segs.push([r.t0, r.tBody]);
      if (M) { const k = Math.max(0, Math.min(M - 1, pass - (r.n - M) - 1)); segs.push([r.alts[k].t0, r.alts[k].t1]); }
      if (mode === "once" && pass === 1) break;
    }
    cur = r.t1;
  }
  segs.push([cur, end]);
  return segs.filter((s) => s[1] > s[0]);
}

function onsets(events, segs, ppq) {   // [tick, pitch] for every struck note, in the order played
  // ties: a pitch that continues a tie from the previous event of the same voice is not struck again, and the note rings for the whole chain
  const byVoice = new Map();
  events.filter((e) => e.kind === "note" && !e.grace).forEach((e) => { if (!byVoice.has(e.voiceKey)) byVoice.set(e.voiceKey, []); byVoice.get(e.voiceKey).push(e); });
  const cont = new Map(), total = new Map();   // cont: event -> pitches held over; total: "tick:pitch" of a struck note -> its whole sounding time
  for (const list of byVoice.values()) {
    list.sort((x, y) => x.t - y.t);
    list.forEach((e, k) => e.pitches.forEach((p) => { const nx = list[k + 1]; if (p.tie && nx && nx.pitches.some((q) => q.midi === p.midi)) { if (!cont.has(nx)) cont.set(nx, new Set()); cont.get(nx).add(p.midi); } }));
    for (let k = list.length - 1; k >= 0; k--) list[k].pitches.forEach((p) => { const nx = list[k + 1], more = p.tie && nx && nx.pitches.some((q) => q.midi === p.midi) ? total.get(nx.t + ":" + p.midi + ":" + nx.voiceKey) || 0 : 0; total.set(list[k].t + ":" + p.midi + ":" + list[k].voiceKey, list[k].dur + more); });
  }
  const raw = []; let base = 0;
  for (const [a, b] of segs) {
    for (const e of events) {
      if (e.kind !== "note" || e.grace || e.t < a || e.t >= b) continue;
      e.pitches.forEach((p) => {
        if (cont.has(e) && cont.get(e).has(p.midi)) return;
        raw.push([Math.round(((e.t - a + base) * ppq) / (WHOLE / 4)), p.midi, Math.round(((total.get(e.t + ":" + p.midi + ":" + e.voiceKey) || e.dur) * ppq) / (WHOLE / 4))]);
      });
    }
    base += b - a;
  }
  raw.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  // a note struck while the same pitch still rings (in another voice, or a unison) may or may not be in the MIDI file, depending on the LilyPond version that made it:
  // those notes are "restrikes" and either outcome is accepted; every other note must match exactly
  const endOf = new Map(), out = [], restrikes = new Set();
  for (const [t, pitch, dur] of raw) { if (endOf.has(pitch) && t < endOf.get(pitch)) { restrikes.add(t + ":" + pitch); out.push([t, pitch]); continue; } endOf.set(pitch, t + dur); out.push([t, pitch]); }
  out.restrikes = restrikes;
  return out;
}

// two voices striking the same pitch together are one note in the MIDI file
function uniq(list) { return list.filter((x, k) => k === 0 || x[0] !== list[k - 1][0] || x[1] !== list[k - 1][1]); }

function compare(events, repeats, end, midi, opts) {
  const mid = uniq(midi.notes.map((n) => [n.tick, n.pitch]).sort((x, y) => x[0] - y[0] || x[1] - y[1]));
  const hasGrace = events.some((e) => e.grace);
  const res = [];
  for (const mode of ["unfolded", "written", "once"]) {
    const mine = onsets(events, playSegments(repeats, end, mode), midi.ppq);
    let ok, detail = "";
    if (hasGrace) {   // grace notes shift the timing around them; compare the pitches in order
      // the MIDI plays the grace notes too, and they shift the timing around them, so compare how often each pitch is struck: every pitch of mine must be in the MIDI at least that often
      const count = (list) => { const m = new Map(); list.forEach((x) => m.set(x[1], (m.get(x[1]) || 0) + 1)); return m; };
      const cm = count(mid), cn = count(uniq(mine)); let short = 0;
      for (const [p, n] of cn) short += Math.max(0, n - (cm.get(p) || 0));
      let extra = 0; for (const [p, n] of cm) extra += Math.max(0, n - (cn.get(p) || 0));
      ok = short <= Math.ceil(0.01 * mine.length) && extra <= graceCount(events) + 2 + Math.ceil(0.02 * mid.length); detail = "pitches only; mine short by " + short + ", MIDI has " + extra + " more (" + graceCount(events) + " grace notes)";
    } else {
      const key = (x) => x[0] + ":" + x[1], mineSet = new Set(uniq(mine).map(key)), midSet = new Set(mid.map(key));
      const missing = [...midSet].filter((k) => !mineSet.has(k)), extra = [...mineSet].filter((k) => !midSet.has(k) && !mine.restrikes.has(k));
      ok = missing.length === 0 && extra.length === 0;
      // MIDI files of pieces with a tab staff or chord symbols also play those: every note of mine must then be in the MIDI, though it may have more
      if (!ok && opts && opts.allowExtraMidi && extra.length === 0) { ok = true; detail = "subset: the MIDI also plays " + missing.length + " notes of an accompaniment or tab staff"; }
      if (!ok) detail = `in the MIDI but not mine: ${missing.length} (${missing.slice(0, 4).join(" ")}); in mine but not the MIDI: ${extra.length} (${extra.slice(0, 4).join(" ")})`;
    }
    res.push({ mode, ok, detail, count: mine.length });
    if (ok) return { ok: true, mode, graceOnly: hasGrace, results: res };
  }
  return { ok: false, results: res };
}
const graceCount = (events) => events.filter((e) => e.grace && e.kind === "note").reduce((n, e) => n + e.pitches.length, 0);
function isSubsequence(a, b) { let j = 0; for (const x of b) if (j < a.length && x === a[j]) j++; return j === a.length; }

module.exports = { playSegments, compare, onsets, uniq };
