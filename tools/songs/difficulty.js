"use strict";
// An estimated difficulty from what is on the page. This is a proxy, built from counts a player would feel (speed, chords, hand movement, stretches, high positions, accidentals, rhythm);
// it knows nothing about musicality, interpretation or how awkward a passage feels under the fingers, so it can be a level off for any single piece.
const { WHOLE } = require("./lilypond");
const U = 4;

// score: { bars: [{ num, den, voices: [items] }], tempo }, notes: [{ t, midi, s, f }] with s 1 (high e)..6 (low E), f fret
function measure(piece, fingered) {
  const quarter = WHOLE / 4 / U;   // data units in a quarter note
  let totalQ = 0, noteCount = 0, maxPoly = 1, chordOnsets = 0, onsetCount = 0, accidentals = 0, shortNotes = 0, tuplets = 0, voicesBoth = 0, highFret = 0, stretch = 0;
  const bars = piece.bars;
  bars.forEach((b) => { totalQ += b.len / quarter; });
  const onsets = new Map();
  bars.forEach((b, bi) => {
    const moving = b.voices.filter((v) => v.some((i) => !i.r)).length; if (moving >= 2) voicesBoth++;
    b.voices.forEach((v) => v.forEach((i) => {
      if (i.r) return;
      noteCount += i.n.length;
      if (i.tp) tuplets++;
      if (["16", "32", "64"].includes(i.d)) shortNotes += i.n.length;
      i.n.forEach((p) => { if (p[1] !== 0) accidentals++; });
      const key = bi + ":" + i.o; onsets.set(key, (onsets.get(key) || 0) + i.n.length);
    }));
  });
  onsets.forEach((n) => { onsetCount++; if (n >= 3) chordOnsets++; maxPoly = Math.max(maxPoly, n); });
  // hand movement and stretch from the fingering, in time order
  let shifts = 0, last = null, stretched = 0, groups = 0;
  const byT = new Map();
  fingered.forEach((n) => { if (!byT.has(n.t)) byT.set(n.t, []); byT.get(n.t).push(n); highFret = Math.max(highFret, n.f); });
  [...byT.keys()].sort((a, b) => a - b).forEach((t) => {
    const fr = byT.get(t).map((n) => n.f).filter((f) => f > 0); groups++;
    if (fr.length) { const pos = fr.reduce((a, b) => a + b, 0) / fr.length; if (last != null) shifts += Math.min(Math.abs(pos - last), 7); last = pos; if (fr.length > 1 && Math.max(...fr) - Math.min(...fr) >= 3) stretched++; }
  });
  void stretch;
  const bpm = piece.tempo || 100, seconds = (totalQ * 60) / bpm;
  const nps = noteCount / Math.max(seconds, 1);
  // peak density: the busiest bar, in notes per second
  let peak = 0; bars.forEach((b) => { const n = b.voices.reduce((sum, v) => sum + v.filter((i) => !i.r).reduce((q, i) => q + i.n.length, 0), 0); const barSeconds = (b.len / quarter) * 60 / bpm; if (barSeconds > 0.6) peak = Math.max(peak, n / barSeconds); });
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const parts = {
    speed: 26 * clamp(nps / 9) + 8 * clamp((peak - 4) / 10),
    chords: 8 * clamp(chordOnsets / Math.max(onsetCount, 1) / 0.35) + 5 * clamp((maxPoly - 2) / 3),
    movement: 14 * clamp(shifts / Math.max(groups, 1) / 1.4),
    stretch: 7 * clamp(stretched / Math.max(groups, 1) / 0.15),
    position: 6 * clamp((highFret - 5) / 9),
    accidentals: 7 * clamp(accidentals / Math.max(noteCount, 1) / 0.25),
    rhythm: 6 * clamp(shortNotes / Math.max(noteCount, 1) / 0.5) + 3 * clamp(tuplets / 12),
    independence: 6 * clamp(voicesBoth / Math.max(bars.length, 1)),
    length: 5 * clamp(bars.length / 64),
  };
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  return { score: Math.round(score * 10) / 10, parts, nps: Math.round(nps * 100) / 100, highFret, maxPoly, bars: bars.length, notes: noteCount, minutes: Math.round(seconds / 6) / 10 };
}

// four levels; the cut points are tuned on the whole collection (see build.js) so that each level has pieces in it
const LEVELS = ["Beginner", "Easy", "Intermediate", "Advanced"];
module.exports = { measure, LEVELS };
