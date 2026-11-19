"use strict";
// A small Standard MIDI File reader: notes (start tick, end tick, pitch), tempo changes, time and key signatures.
function readMidi(buf) {
  let p = 0;
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; }, u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  if (buf.toString("latin1", 0, 4) !== "MThd") throw new Error("not a MIDI file");
  p = 4; const hlen = u32(); const format = u16(), ntrks = u16(), division = u16(); p = 8 + hlen;
  if (division & 0x8000) throw new Error("SMPTE time division is not supported");
  const out = { ppq: division, format, notes: [], tempos: [], timeSigs: [], keySigs: [] };
  for (let tr = 0; tr < ntrks; tr++) {
    if (buf.toString("latin1", p, p + 4) !== "MTrk") throw new Error("track expected");
    p += 4; const len = u32(), end = p + len; let tick = 0, status = 0; const open = new Map();
    const vlq = () => { let v = 0, b; do { b = buf[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (p < end) {
      tick += vlq();
      let b = buf[p];
      if (b === 0xff) {
        p++; const type = buf[p++], l = vlq(), data = buf.subarray(p, p + l); p += l;
        if (type === 0x51) out.tempos.push({ tick, usPerQuarter: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x58) out.timeSigs.push({ tick, num: data[0], den: 1 << data[1] });
        else if (type === 0x59) out.keySigs.push({ tick, sharps: (data[0] << 24) >> 24, minor: data[1] === 1 });
        continue;
      }
      if (b === 0xf0 || b === 0xf7) { p++; const l = vlq(); p += l; continue; }
      if (b & 0x80) { status = b; p++; }
      const kind = status >> 4, ch = status & 15;
      if (kind === 0x9 || kind === 0x8) {
        const pitch = buf[p++], vel = buf[p++];
        const key = ch + ":" + pitch;
        if (kind === 0x9 && vel > 0) { if (!open.has(key)) open.set(key, []); open.get(key).push(tick); }
        else { const q = open.get(key); if (q && q.length) { const s = q.shift(); out.notes.push({ tick: s, end: tick, pitch, ch, track: tr }); } }
      } else if (kind === 0xc || kind === 0xd) p += 1;
      else p += 2;
    }
    p = end;
  }
  out.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  return out;
}
module.exports = { readMidi };
