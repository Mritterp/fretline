"use strict";
// From the events the LilyPond reader produces to a score that the page can draw: bars, each with its voices, each voice a list of notes and rests that exactly fill the bar.
const { WHOLE } = require("./lilypond");
const U = 4;   // the data stores durations in ticks / U (6720 to a whole note: a 64th is 105, a triplet 64th 70)
const VF = { 1: "w", 2: "h", 4: "q", 8: "8", 16: "16", 32: "32", 64: "64" };
const NOTATABLE = [];   // [value, dots, ticks] from the longest down
for (const v of [1, 2, 4, 8, 16, 32, 64]) for (const dots of [1, 0]) { let t = WHOLE / v, add = t / 2; for (let k = 0; k < dots; k++) { t += add; add /= 2; } NOTATABLE.push([v, dots, t]); }
NOTATABLE.sort((a, b) => b[2] - a[2]);

function decompose(ticks) {   // a length as the fewest standard durations, longest first
  const out = []; let left = ticks;
  while (left > 0) { const d = NOTATABLE.find((x) => x[2] <= left); if (!d) throw new Error("a length of " + left + " ticks cannot be written as notes"); out.push(d); left -= d[2]; }
  return out;
}
const durOf = (written) => { let t = WHOLE / written.v, add = t / 2; for (let k = 0; k < written.dots; k++) { t += add; add /= 2; } return t; };

// ---------- the bar grid ----------
function barGrid(ast, ev) {
  const bars = []; let t = 0, sig = { num: 4, den: 4 };
  const breaks = new Set(ev.changes.partial.map((p) => p.t));   // a bar line falls wherever a partial begins a new short bar, and at the edges of repeats and endings
  ev.repeats.forEach((r) => { breaks.add(r.t0); breaks.add(r.tBody); r.alts.forEach((a) => { breaks.add(a.t0); breaks.add(a.t1); }); });
  const sortedBreaks = [...breaks].sort((a, b) => a - b);
  const times = ev.changes.time.slice().sort((a, b) => a.t - b.t), partials = new Map(ev.changes.partial.map((p) => [p.t, p.ticks]));
  let ti = 0;
  // the end: the last note, or a rest in a voice that has notes (a spacer or a rest in a voice with no notes does not extend the piece)
  const withNotes = new Set(ev.events.filter((e) => e.kind === "note" && !e.grace).map((e) => e.voiceKey));
  const endOfMusic = Math.max(...ev.events.filter((e) => !e.grace && withNotes.has(e.voiceKey) && (e.kind === "note" || e.kind === "rest")).map((e) => e.t + e.dur));
  while (t < endOfMusic) {
    while (ti < times.length && times[ti].t <= t) { sig = times[ti]; ti++; }
    const full = (WHOLE * sig.num) / sig.den;
    let len = partials.has(t) ? partials.get(t) : full;
    const nb = sortedBreaks.find((x) => x > t && x < t + len); if (nb !== undefined) len = nb - t;   // a short bar before the next partial or repeat edge
    if (t + len > endOfMusic && endOfMusic - t < len) len = endOfMusic - t;   // the last bar may be short
    bars.push({ t0: t, t1: t + len, num: sig.num, den: sig.den, full: len === full });
    t += len;
  }
  return bars;
}

// ---------- voices ----------
function build(ev, opts) {
  opts = opts || {};
  const notes = ev.events.filter((e) => e.kind === "note");
  const staves = new Set(notes.map((e) => e.staff));
  if (staves.size > 1) throw new Error("more than one staff has notes (" + [...staves].join(", ") + ")");
  const bars = barGrid(null, ev);
  const barAt = (t) => { for (let k = 0; k < bars.length; k++) if (t >= bars[k].t0 && t < bars[k].t1) return k; return -1; };
  // voices that have notes, ordered from the highest to the lowest by average pitch
  const byVoice = new Map();
  ev.events.forEach((e) => { if (!byVoice.has(e.voiceKey)) byVoice.set(e.voiceKey, []); byVoice.get(e.voiceKey).push(e); });
  const voices = [...byVoice.entries()].filter(([, list]) => list.some((e) => e.kind === "note" && !e.grace))
    .map(([key, list]) => { const ns = list.filter((e) => e.kind === "note" && !e.grace); const avg = ns.reduce((s, e) => s + e.pitches.reduce((q, p) => q + p.midi, 0) / e.pitches.length, 0) / ns.length; return { key, list, avg }; })
    .sort((a, b) => b.avg - a.avg);
  // graces wait for the main note that follows them
  const gracesBefore = new Map();   // "voiceKey@t" -> [{pitches, written, kind}]
  ev.events.filter((e) => e.grace && e.kind === "note").forEach((g) => { const k = g.voiceKey + "@" + g.t; if (!gracesBefore.has(k)) gracesBefore.set(k, []); gracesBefore.get(k).push(g); });

  const out = bars.map((b) => ({ t0: b.t0, t1: b.t1, num: b.num, den: b.den, voices: voices.map(() => []) }));
  voices.forEach((voice, vi) => {
    // the voice's events in time order, cut at the bar lines
    const list = voice.list.filter((e) => !e.grace && e.kind !== undefined).sort((a, b) => a.t - b.t || (a.kind === "note" ? 1 : -1));
    const pieces = [];   // {bar, t, dur, ev, first, last}
    const lastEnd = bars[bars.length - 1].t1;
    for (const e of list) {
      if (e.t >= lastEnd) continue;
      let t = e.t; const end = Math.min(e.t + e.dur, lastEnd);
      const first = barAt(t); if (first < 0) throw new Error("an event lies outside the bars at tick " + t);
      let k = first, firstPiece = true;
      while (t < end) {
        const b = bars[k]; if (!b) throw new Error("an event runs past the last bar");
        const stop = Math.min(end, b.t1);
        pieces.push({ bar: k, t, dur: stop - t, ev: e, first: firstPiece, last: stop === end });
        firstPiece = false; t = stop; k++;
      }
    }
    // per bar: fill the gaps with rests, cut pieces into standard durations
    bars.forEach((b, k) => {
      const mine = pieces.filter((p) => p.bar === k);
      let cursor = b.t0; const items = [];
      const rest = (ticks, hidden, tuplet) => { decompose(ticks).forEach(([v, dots, tk]) => { items.push({ o: (cursor - b.t0) / U, u: tk / U, d: VF[v], dt: dots, r: 1, h: hidden ? 1 : 0 }); cursor += tk; }); };
      for (const p of mine) {
        if (p.t < cursor) { if (p.ev.kind === "skip" || p.ev.kind === "rest") continue; throw new Error("overlapping events in one voice at tick " + p.t + " (bar " + (k + 1) + ")"); }
        if (p.t > cursor) rest(p.t - cursor, true);
        if (p.ev.kind === "skip") { rest(p.dur, true); continue; }
        if (p.ev.kind === "rest") {
          if (p.dur === b.t1 - b.t0 && b.t1 - b.t0 === (WHOLE * b.num) / b.den) { items.push({ o: 0, u: p.dur / U, d: "w", dt: 0, r: 1, h: 0, fm: 1 }); cursor += p.dur; continue; }   // a whole-bar rest
          if (p.ev.tuplet) { items.push({ o: (cursor - b.t0) / U, u: p.dur / U, d: VF[p.ev.written.v], dt: p.ev.written.dots, r: 1, h: 0, tp: [p.ev.tuplet.num, p.ev.tuplet.den, p.ev.tuplet.id] }); cursor += p.dur; if (p.ev.tuplet.parent) throw new Error("nested tuplets are not supported"); continue; }
          decompose(p.dur).forEach(([v, dots, tk]) => { items.push({ o: (cursor - b.t0) / U, u: tk / U, d: VF[v], dt: dots, r: 1, h: 0 }); cursor += tk; });
          continue;
        }
        // a note or chord: one item per standard duration, tied together where it is cut
        const e = p.ev; if (e.tuplet && e.tuplet.parent) throw new Error("nested tuplets are not supported");
        let parts;
        if (e.tuplet) {
          if (!(p.first && p.last)) throw new Error("a tuplet note is cut by a bar line");
          parts = [[e.written.v, e.written.dots, p.dur]];
        } else if (p.first && p.last && e.written.mul[0] === 1 && e.written.mul[1] === 1 && durOf(e.written) === p.dur) parts = [[e.written.v, e.written.dots, p.dur]];
        else parts = decompose(p.dur);
        parts.forEach(([v, dots, tk], pi) => {
          const lastPart = pi === parts.length - 1, endsEvent = p.last && lastPart;
          const item = { o: (cursor - b.t0) / U, u: tk / U, d: VF[v], dt: dots, r: 0, n: e.pitches.map((q) => [q.step, q.alter, q.oct, endsEvent ? (q.tie ? 1 : 0) : 1]) };
          if (e.tuplet) item.tp = [e.tuplet.num, e.tuplet.den, e.tuplet.id];
          if (p.first && pi === 0) { const g = gracesBefore.get(e.voiceKey + "@" + e.t); if (g) item.g = g.map((x) => ({ n: x.pitches.map((q) => [q.step, q.alter, q.oct]), d: VF[x.written.v] || "16", s: x.grace === "acciaccatura" || x.grace === "slashedGrace" || x.grace === "grace" ? 1 : 0 })); }
          items.push(item); cursor += tk;
        });
      }
      if (cursor < b.t1) rest(b.t1 - cursor, true);
      if (cursor !== b.t1) throw new Error("bar " + (k + 1) + " is not filled exactly (ends at " + cursor + ", should end at " + b.t1 + ")");
      out[k].voices[vi] = items;
    });
  });
  // a voice that is nothing but hidden rests in a bar is left out of that bar; if every voice is hidden rests, one stays
  out.forEach((b) => { b.voices = b.voices.map((items) => (items.every((i) => i.r && i.h) ? [] : items)); });
  return { bars, out, voices: voices.map((v) => v.key) };
}

module.exports = { build, barGrid, decompose, U, VF };
