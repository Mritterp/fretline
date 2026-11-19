"use strict";
// Fingering: choose a string and fret for every note so that the piece can be played, with a Viterbi-style search over the notes that sound together.
// This is an automatic guess (low frets, small hand movements, no two notes on one string, chords within a hand's span); it is not the editor's fingering.
const OPEN = [40, 45, 50, 55, 59, 64];   // low E .. high e, as sounding pitches
const MAX_FRET = 19;
const BEAM = 48;   // how many partial fingerings are kept after each chord

function positions(midi) {
  const out = [];
  OPEN.forEach((open, s) => { const f = midi - open; if (f >= 0 && f <= MAX_FRET) out.push({ s, f }); });
  return out;
}

function fretCost(f) { return f === 0 ? -0.4 : 0.07 * f + (f > 9 ? 0.4 * (f - 9) : 0) + (f > 12 ? 1.5 * (f - 12) : 0); }

// notes: [{ t, end, midi, id, contOf }]  (contOf: id of the note this one continues a tie from, or null)
function finger(notes) {
  const byT = new Map();
  notes.filter((n) => n.contOf == null).forEach((n) => { if (!byT.has(n.t)) byT.set(n.t, []); byT.get(n.t).push(n); });
  const times = [...byT.keys()].sort((a, b) => a - b);
  const groups = times.map((t) => {
    const list = byT.get(t), midis = [...new Set(list.map((n) => n.midi))].sort((a, b) => b - a);
    return { t, midis, list };
  });
  const lastEnd = new Map();   // not needed beyond the beam
  let layer = [{ cost: 0, assign: null, ringing: [], pos: null, last: null, prev: null }];
  groups.forEach((g, gi) => {
    // candidate fingerings of this group: one position per distinct pitch, different strings
    const opts = g.midis.map((m) => { const p = positions(m); if (!p.length) throw new Error("pitch " + m + " is outside the guitar's range (E2 to B5 at the 19th fret)"); return p.map((x) => ({ m, s: x.s, f: x.f, c: fretCost(x.f) })).sort((a, b) => a.c - b.c).slice(0, 4); });
    const combos = []; const pick = [];
    (function rec(k, used) {
      if (combos.length > 6000) return;
      if (k === opts.length) { combos.push(pick.slice()); return; }
      for (const o of opts[k]) { if (used & (1 << o.s)) continue; pick.push(o); rec(k + 1, used | (1 << o.s)); pick.pop(); }
    })(0, 0);
    if (!combos.length) {   // no way to give every note its own string: let them share, at a heavy cost, rather than fail
      (function rec(k) { if (combos.length > 3000) return; if (k === opts.length) { combos.push(pick.slice()); return; } for (const o of opts[k]) { pick.push(Object.assign({ shared: true }, o)); rec(k + 1); pick.pop(); } })(0);
    }
    if (!combos.length) throw new Error("a chord at tick " + g.t + " cannot be fingered on six strings");
    const maxEnd = Math.max(...g.list.map((n) => n.end));
    const next = [];
    for (const prev of layer) {
      const ringing = prev.ringing.filter((r) => r.end > g.t);
      for (const combo of combos) {
        let cost = prev.cost;
        const fretted = combo.filter((o) => o.f > 0).map((o) => o.f);
        combo.forEach((o) => { cost += o.c; });
        if (combo.some((o) => o.shared)) cost += 40;
        // a chord has to fit a hand: about four frets
        if (fretted.length > 1) { const span = Math.max(...fretted) - Math.min(...fretted); if (span > 3) cost += 2.2 * (span - 3) + (span > 5 ? 6 : 0); }
        const pos = fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : null;
        if (prev.pos != null && pos != null) cost += 0.42 * Math.min(Math.abs(prev.pos - pos), 8);
        // a new note on a string that is still ringing cuts that note off
        combo.forEach((o) => { if (ringing.some((r) => r.s === o.s)) cost += 7; });
        // single notes: stay near the string just used
        if (combo.length === 1 && prev.last != null) cost += 0.16 * Math.abs(combo[0].s - prev.last);
        next.push({ cost, assign: combo, ringing: ringing.concat(combo.map((o) => ({ s: o.s, end: Math.max(...g.list.filter((n) => n.midi === o.m).map((n) => n.end)) }))), pos: pos != null ? pos : prev.pos, last: combo.length === 1 ? combo[0].s : prev.last, prev });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    layer = next.slice(0, BEAM);
    void gi; void maxEnd; void lastEnd;
  });
  // walk back from the best final state
  let st = layer.reduce((a, b) => (a.cost <= b.cost ? a : b)), gi = groups.length - 1;
  const chosen = new Map();   // note id -> {s, f}
  while (st && st.assign && gi >= 0) {
    const g = groups[gi];
    st.assign.forEach((o) => g.list.filter((n) => n.midi === o.m).forEach((n) => chosen.set(n.id, { s: o.s, f: o.f })));
    st = st.prev; gi--;
  }
  // a note held over a tie keeps the string and fret of the note it continues
  const byId = new Map(notes.map((n) => [n.id, n]));
  notes.filter((n) => n.contOf != null).forEach((n) => { let o = n; while (o.contOf != null) o = byId.get(o.contOf); if (chosen.has(o.id)) chosen.set(n.id, chosen.get(o.id)); });
  return chosen;
}

module.exports = { finger, positions, OPEN };
