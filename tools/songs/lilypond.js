"use strict";
// A reader for the LilyPond subset that the Mutopia Project's guitar pieces use: note names in three languages, \relative, \transpose, chords, ties,
// \repeat volta with \alternative, \times / \tuplet, grace notes, voices (<< {...} \\ {...} >>), \partial, \time, \key, \tempo.
// Anything it does not understand throws (never guesses), so a piece that parses has been read completely.
// Time is counted in ticks, 26880 to a whole note (divisible by 2^8, 3, 5 and 7, so triplets, quintuplets and septuplets stay whole numbers).

const WHOLE = 26880;
const STEP_MIDI = [0, 2, 4, 5, 7, 9, 11];   // c d e f g a b
const LETTERS = "cdefgab";

// ---------- note names ----------
function pitchNameParser(lang) {
  if (lang === "english") return (w) => {
    const m = /^([a-g])(ss|ff|s|f|x|sharp|flat|sharpsharp|flatflat)?$/.exec(w); if (!m) return null;
    const a = { ss: 2, ff: -2, s: 1, f: -1, x: 2, sharp: 1, flat: -1, sharpsharp: 2, flatflat: -2 }[m[2] || ""] || 0;
    return { step: LETTERS.indexOf(m[1]), alter: a };
  };
  if (lang === "deutsch") return (w) => {
    if (w === "b") return { step: 6, alter: -1 };
    if (w === "h") return { step: 6, alter: 0 };
    if (w === "es") return { step: 2, alter: -1 };
    if (w === "as") return { step: 5, alter: -1 };
    if (w === "eses") return { step: 2, alter: -2 };
    if (w === "ases") return { step: 5, alter: -2 };
    if (w === "heses") return { step: 6, alter: -2 };
    const m = /^([cdefgah])((?:is)*|(?:es)*)$/.exec(w); if (!m) return null;
    const letter = m[1] === "h" ? "b" : m[1], n = m[2].length / 2;
    return { step: LETTERS.indexOf(letter), alter: m[2].startsWith("is") ? n : -n };
  };
  return (w) => {   // nederlands (LilyPond's default)
    if (w === "es") return { step: 2, alter: -1 };
    if (w === "as") return { step: 5, alter: -1 };
    if (w === "eses") return { step: 2, alter: -2 };
    if (w === "ases") return { step: 5, alter: -2 };
    const m = /^([a-g])((?:is)*|(?:es)*)$/.exec(w); if (!m) return null;
    const n = m[2].length / 2;
    return { step: LETTERS.indexOf(m[1]), alter: m[2].startsWith("is") ? n : -n };
  };
}

// ---------- parsing ----------
// commands that may follow a note (articulations, dynamics, spanners): ignored
const POST_CMDS = new Set(["p", "pp", "ppp", "f", "ff", "fff", "mp", "mf", "sf", "sfz", "fp", "rfz", "sp", "spp", "cresc", "decresc", "dim", "fermata", "trill", "arpeggio", "prall", "mordent", "turn",
  "stopped", "open", "staccato", "tenuto", "accent", "marcato", "portato", "harmonic", "flageolet", "glissando", "laissezVibrer", "startTrillSpan", "stopTrillSpan", "breathe", "espressivo",
  "upbow", "downbow", "prallprall", "prallmordent", "lineprall", "staccatissimo", "snappizzicato", "rtoe", "ltoe", "arpeggioArrowUp", "arpeggioArrowDown", "arpeggioNormal", "noBeam",
  "startGroup", "stopGroup", "startTextSpan", "stopTextSpan", "sustainOn", "sustainOff", "thumb", "flageolet", "reverseturn", "slashturn", "upprall", "downprall", "segno", "coda", "ppppp", "pppp", "ffff", "mf"]);
// commands that stand alone between notes and carry nothing we need
const SKIP_CMDS = new Set(["voiceOne", "voiceTwo", "voiceThree", "voiceFour", "oneVoice", "stemUp", "stemDown", "stemNeutral", "slurUp", "slurDown", "slurNeutral", "tieUp", "tieDown", "tieNeutral",
  "autoBeamOn", "autoBeamOff", "break", "pageBreak", "noBreak", "noPageBreak", "easyHeadsOn", "easyHeadsOff", "dotsUp", "dotsDown", "dotsNeutral", "dynamicUp", "dynamicDown", "dynamicNeutral",
  "textLengthOn", "textLengthOff", "cadenzaOn", "cadenzaOff", "numericTimeSignature", "defaultTimeSignature", "hideNotes", "unHideNotes", "shiftOn", "shiftOff", "shiftOnn", "shiftOnnn",
  "teeny", "tiny", "small", "normalsize", "sustainOn", "sustainOff", "phrasingSlurUp", "phrasingSlurDown", "phrasingSlurNeutral", "bassFigureExtendersOn", "improvisationOn", "improvisationOff", "startStaff", "stopStaff"]);
const VALUE_CMDS = new Set(["markup", "markuplist", "once", "set", "override", "revert", "unset", "tweak", "mark", "ottava"]);
const MUSIC_CMDS = new Set(["relative", "new", "context", "transpose", "repeat", "times", "tuplet", "grace", "slashedGrace", "acciaccatura", "appoggiatura", "afterGrace", "unfoldRepeats", "sequential", "simultaneous",
  "chordmode", "lyricmode", "drummode", "figuremode", "notemode", "lyrics", "addlyrics", "time", "key", "clef", "tempo", "partial", "bar", "skip", "set", "override", "revert", "unset", "once", "tweak", "transposition", "mark"]);
const TEXT_CMDS = new Set(["lyricmode", "chordmode", "drummode", "figuremode", "notemode", "lyrics", "addlyrics"]);

function parse(src) {
  let lang = "nederlands";
  { const m = /\\include\s+"(english|deutsch|nederlands)\.ly"/.exec(src); if (m) lang = m[1]; const m2 = /\\language\s+"(\w+)"/.exec(src); if (m2) lang = m2[1]; }
  if (!["english", "deutsch", "nederlands"].includes(lang)) throw new Error("note language " + lang + " is not supported");
  const parsePitchName = pitchNameParser(lang);
  let i = 0, lastDur = { v: 4, dots: 0 };
  const vars = {}, scores = [], inert = new Set();   // inert: names defined as markup or as a bare command (once override ...): they do nothing when used
  const err = (msg) => { const line = src.slice(0, i).split("\n").length; throw new Error(msg + " (line " + line + ", near '" + src.slice(i, i + 28).replace(/\n/g, " ") + "')"); };
  const isDigit = (c) => c >= "0" && c <= "9";
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === "%") {
        if (src[i + 1] === "{") { const e = src.indexOf("%}", i + 2); if (e < 0) err("unterminated block comment"); i = e + 2; } else { while (i < src.length && src[i] !== "\n") i++; }
      } else break;
    }
  };
  const word = () => { const m = /^[A-Za-z][A-Za-z0-9_-]*/.exec(src.slice(i, i + 80)); return m ? m[0] : null; };

  function skipString() { if (src[i] !== '"') err("string expected"); i++; while (i < src.length && src[i] !== '"') { if (src[i] === "\\") i++; i++; } i++; }
  function skipBalanced(open, close) {   // from an opening bracket to its partner; strings and comments are skipped
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"') { skipString(); continue; }
      if (c === "%") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { i++; return; } }
      i++;
    }
    err("unbalanced " + open);
  }
  function skipScheme() {   // after a '#' or '$': #'sym, #'(a . b), #(lambda ...), #t, ##t, #UP, #3
    if (src[i] === "#" || src[i] === "$") i++;
    if (src[i] === "#") i++;
    if (src[i] === "'" || src[i] === "`") i++;
    if (src[i] === "(") { skipBalanced("(", ")"); return; }
    if (src[i] === '"') { skipString(); return; }
    while (i < src.length && !/[\s{}<>]/.test(src[i])) i++;
  }
  function skipArg() {   // one command argument of unknown kind: string, scheme, number, fraction, word, \markup {...}, { ... }
    ws();
    const c = src[i];
    if (c === '"') skipString();
    else if (c === "#" || c === "$") skipScheme();
    else if (c === "{") skipBalanced("{", "}");
    else if (c === "\\") { i++; const w = word(); i += (w || "").length; ws(); if (src[i] === "{") skipBalanced("{", "}"); else if (src[i] === '"') skipString(); }
    else { const m = /^[^\s{}<>]+/.exec(src.slice(i)); if (m) i += m[0].length; }
  }
  function skipProperty(hasValue) {   // \set Staff.x = #v   \override Stem #'direction = #UP   \override A.b = #v   \revert Stem #'direction
    ws();
    const w = /^[A-Za-z][A-Za-z0-9_.-]*/.exec(src.slice(i, i + 120)); if (!w) err("property name expected");
    i += w[0].length; ws();
    if (src[i] === "#" || src[i] === "'") { skipScheme(); ws(); }
    else if (!w[0].includes(".") && /^[A-Za-z]/.test(src[i] || "") && hasValue) {   // \override Grob property = value (property as a bare word)
      const w2 = /^[A-Za-z][A-Za-z0-9_.-]*/.exec(src.slice(i, i + 120)); i += w2[0].length; ws();
    }
    if (hasValue) { if (src[i] !== "=") err("= expected"); i++; skipArg(); }
  }

  // --- pitches and durations ---
  function readPitchHead() {   // c, cis, es ... then octave marks and ! ? ; null when what follows is not a note name
    const w = /^[a-z]+/.exec(src.slice(i, i + 12)); if (!w) return null;
    const p = parsePitchName(w[0]); if (!p) return null;
    i += w[0].length;
    let marks = 0; while (src[i] === "'" || src[i] === ",") { marks += src[i] === "'" ? 1 : -1; i++; }
    while (src[i] === "!" || src[i] === "?") i++;
    return { step: p.step, alter: p.alter, marks };
  }
  function readDuration() {   // 4, 8., \breve, optional *n/m ; null when none follows
    let v = null, dots = 0;
    if (isDigit(src[i])) { let s = ""; while (isDigit(src[i])) s += src[i++]; v = +s; }
    else if (src.startsWith("\\breve", i)) { v = 0.5; i += 6; }
    else if (src.startsWith("\\longa", i)) { v = 0.25; i += 6; }
    else return null;
    while (src[i] === ".") { dots++; i++; }
    const d = { v, dots, mul: [1, 1] };
    for (;;) { const save = i; while (src[i] === " " || src[i] === "	") i++; if (src[i] !== "*") { i = save; break; } i++; while (src[i] === " ") i++; let a = ""; while (isDigit(src[i])) a += src[i++]; let b = "1"; if (src[i] === "/") { i++; b = ""; while (isDigit(src[i])) b += src[i++]; } d.mul = [d.mul[0] * +a, d.mul[1] * +b]; }
    return d;
  }
  const durTicks = (d) => { let t = WHOLE / d.v, add = t / 2; for (let k = 0; k < d.dots; k++) { t += add; add /= 2; } return (t * d.mul[0]) / d.mul[1]; };
  function takeDur() { const d = readDuration(); if (d) { lastDur = { v: d.v, dots: d.dots }; return d; } return { v: lastDur.v, dots: lastDur.dots, mul: [1, 1] }; }

  // after a - ^ _ that follows a note: markup {...}, "text", #scheme, a fingering number, an articulation sign or a command such as ermata or RH #1; false when it is none of those
  function skipPostBody() {
    const d = src[i];
    if (d === "\\") {
      i++;
      if (isDigit(src[i])) { while (isDigit(src[i])) i++; return true; }
      if ("<>!()".includes(src[i])) { i++; return true; }
      const w = word(); if (!w) return false;
      i += w.length;
      if (w === "markup" || w === "markuplist") { skipArg(); return true; }
      if (!POST_CMDS.has(w)) { const save = i; ws(); if (src[i] === "#") skipScheme(); else if (src[i] === '"') skipString(); else i = save; }
      return true;
    }
    if (d === '"') { skipString(); return true; }
    if (d === "#") { skipScheme(); return true; }
    if (isDigit(d)) { while (isDigit(src[i])) i++; return true; }
    if (".->+^_!".includes(d)) { i++; return true; }
    return false;
  }
  function postEvents(ev) {   // ties, slurs, beams, articulations, dynamics, fingerings, string numbers ... after a note, rest or chord; only the tie matters
    for (;;) {
      const save = i; ws();
      const c = src[i];
      if (c === "~") { i++; ev.tie = true; continue; }
      if (c === "(" || c === ")" || c === "[" || c === "]") { i++; continue; }
      if (c === "-" || c === "^" || c === "_") { i++; if (skipPostBody()) continue; i = save; return; }
      if (c === "\\") {
        const nx = src[i + 1];
        if (nx === "<" || nx === ">" || nx === "!" || nx === "(" || nx === ")") { i += 2; continue; }
        if (isDigit(nx)) { i++; while (isDigit(src[i])) i++; continue; }   // string number \2
        if (nx === "\\") { i = save; return; }
        const w = /^[A-Za-z]+/.exec(src.slice(i + 1, i + 40));
        if (w && w[0] === "rest" && ev.kind === "note") { i += 5; ev.kind = "rest"; continue; }   // a rest drawn at a pitch (it still moves the relative-pitch reference)
        if (w && (POST_CMDS.has(w[0]) || inert.has(w[0]) || /^deprecated/.test(w[0]))) { i += 1 + w[0].length; continue; }
        i = save; return;
      }
      i = save; return;
    }
  }

  // --- music ---
  const BLOCK = new Set(["seq", "sim", "ctx", "rel", "transpose", "repeat", "tuplet", "grace", "ref", "unfold"]);
  function parseMusic() { ws(); if (src[i] === "{") { i++; return { t: "seq", items: parseItems("}") }; } if (src[i] === "<" && src[i + 1] === "<") { i += 2; return parseSim(); } const it = parseItem(); return it || { t: "seq", items: [] }; }
  function parseItems(close) {
    const items = [];
    for (;;) {
      ws();
      if (src.startsWith(close, i)) { i += close.length; return items; }
      if (i >= src.length) err("unexpected end, expected " + close);
      const it = parseItem(); if (it) items.push(it);
    }
  }
  function parseSim() {   // after <<: without \ every item runs in parallel; with \ the items between separators form one voice each
    const groups = [[]]; let sep = false;
    for (;;) {
      ws();
      if (src.startsWith(">>", i)) { i += 2; break; }
      if (src.startsWith("\\\\", i)) { i += 2; sep = true; groups.push([]); continue; }
      if (i >= src.length) err("unterminated <<");
      const it = parseItem(); if (it) groups[groups.length - 1].push(it);
    }
    const parts = [];
    if (!sep) groups[0].forEach((it) => parts.push(it));
    else groups.forEach((g) => { if (g.length) parts.push(g.length === 1 && BLOCK.has(g[0].t) ? g[0] : { t: "seq", items: g }); });
    return { t: "sim", parts };
  }
  function parseSim2() {   // the body of simultaneous { ... }
    const items = parseItems("}"); return { t: "sim", parts: items.filter(Boolean).map((x) => (BLOCK.has(x.t) ? x : { t: "seq", items: [x] })) };
  }
  function parseChordBody() {   // after '<'
    const pitches = [];
    for (;;) {
      ws();
      if (src[i] === ">") { i++; return pitches; }
      const h = readPitchHead(); if (!h) err("pitch expected in chord");
      const p = { step: h.step, alter: h.alter, marks: h.marks, tie: false };
      for (;;) {   // per-note post events: ~ fingering string-number
        const save = i; ws();
        if (src[i] === "~") { i++; p.tie = true; continue; }
        if (src[i] === "-" || src[i] === "^" || src[i] === "_") { i++; if (skipPostBody()) continue; i = save; break; }
        if (src[i] === "\\" && isDigit(src[i + 1])) { i++; while (isDigit(src[i])) i++; continue; }
        if (src[i] === "\\") {
          const w = (/^[A-Za-z]+/.exec(src.slice(i + 1, i + 30)) || [""])[0];
          if (w === "tweak") { i += 6; skipArg(); skipArg(); continue; }
          if (POST_CMDS.has(w) || inert.has(w)) { i += 1 + w.length; continue; }
          const after = src.slice(i + 1 + w.length).match(/^\s*#/);
          if (after && !MUSIC_CMDS.has(w) && !Object.prototype.hasOwnProperty.call(vars, w)) { i += 1 + w.length; ws(); skipScheme(); continue; }
        }
        i = save; break;
      }
      pitches.push(p);
    }
  }
  function parseItem() {
    ws();
    const c = src[i];
    if (c === "{") { i++; return { t: "seq", items: parseItems("}") }; }
    if (c === "<" && src[i + 1] === "<") { i += 2; return parseSim(); }
    if (c === "<") {
      i++; const pitches = parseChordBody(), d = takeDur(), ev = { t: "ev", kind: "note", pitches, dur: d, tie: false }; postEvents(ev);
      if (ev.tie && !pitches.some((p) => p.tie)) pitches.forEach((p) => (p.tie = true));
      ev.tie = pitches.some((p) => p.tie); return ev;
    }
    if (c === "|") { i++; return null; }
    if (c === "~") { i++; return { t: "tie" }; }
    if (c === "[" || c === "]" || c === "(" || c === ")") { i++; return null; }
    if (c === "\\") return parseCommand();
    if (c === "#" || c === "$") { skipScheme(); return null; }
    if (c === '"') { skipString(); return null; }
    if (c === "=" || c === "'" || c === ",") { i++; return null; }   // octave checks and the like
    if (c === "-" || c === "^" || c === "_") { i++; if (skipPostBody()) return null; err("unexpected character"); }
    if (isDigit(c)) err("unexpected number");
    const w = /^[A-Za-z]+/.exec(src.slice(i, i + 40));
    if (!w) err("unexpected character");
    const name = w[0];
    if (name === "r" || name === "R" || name === "s") {
      i += name.length; const d = takeDur(), ev = { t: "ev", kind: name === "s" ? "skip" : "rest", dur: d, full: name === "R" }; postEvents(ev); return ev;
    }
    const h = readPitchHead(); if (!h) err("not a note or command: " + name);
    const d = takeDur(), ev = { t: "ev", kind: "note", pitches: [{ step: h.step, alter: h.alter, marks: h.marks, tie: false }], dur: d, tie: false };
    postEvents(ev); if (ev.tie) ev.pitches[0].tie = true;
    return ev;
  }
  function parseCommand() {
    i++;   // the backslash
    const w = word();
    if (!w) { if (isDigit(src[i])) { while (isDigit(src[i])) i++; return null; } if ("<>!()".includes(src[i])) { i++; return null; } err("command expected"); }
    i += w.length;
    switch (w) {
      case "relative": {
        ws(); let ref = { step: 0, alter: 0, marks: 1 };   // the default reference is c'
        const save = i; const h = readPitchHead(); if (h) ref = h; else i = save;
        return { t: "rel", ref, music: parseMusic() };
      }
      case "transpose": {
        ws(); const a = readPitchHead(); ws(); const b = readPitchHead(); if (!a || !b) err("\\transpose needs two pitches");
        return { t: "transpose", from: a, to: b, music: parseMusic() };
      }
      case "new": case "context": {
        ws(); const type = word(); i += type.length; let name = null; ws();
        if (src[i] === "=") { i++; ws(); if (src[i] === '"') { const s0 = i; skipString(); name = src.slice(s0 + 1, i - 1); } else { name = word(); i += (name || "").length; } }
        ws(); if (src.startsWith("\\with", i)) { i += 5; skipArg(); }
        ws();
        if (src[i] === "\\") { const w2 = (/^[A-Za-z]+/.exec(src.slice(i + 1, i + 30)) || [""])[0]; if (TEXT_CMDS.has(w2)) { i += 1 + w2.length; skipArg(); return { t: "ctx", type: "Lyrics", name, music: { t: "seq", items: [] } }; } }
        return { t: "ctx", type, name, music: parseMusic() };
      }
      case "repeat": {
        ws(); let kind; if (src[i] === '"') { const s0 = i; skipString(); kind = src.slice(s0 + 1, i - 1); } else { kind = word(); i += kind.length; } ws(); let n = ""; while (isDigit(src[i])) n += src[i++];
        const body = parseMusic(); let alts = null; const save = i; ws();
        if (src.startsWith("\\alternative", i)) {
          i += 12; ws(); if (src[i] !== "{") err("{ expected after \\alternative"); i++; alts = [];
          for (;;) { ws(); if (src[i] === "}") { i++; break; } alts.push(parseMusic()); }
        } else i = save;
        return { t: "repeat", kind, n: +n, body, alts };
      }
      case "times": { ws(); let a = ""; while (isDigit(src[i])) a += src[i++]; if (src[i] !== "/") err("fraction expected after \\times"); i++; let b = ""; while (isDigit(src[i])) b += src[i++]; return { t: "tuplet", num: +b, den: +a, music: parseMusic() }; }   // 	imes 2/3: durations x 2/3, which is 3 notes in the time of 2
      case "tuplet": {
        ws(); let a = ""; while (isDigit(src[i])) a += src[i++]; if (src[i] !== "/") err("fraction expected after \\tuplet"); i++; let b = ""; while (isDigit(src[i])) b += src[i++];
        ws(); if (isDigit(src[i])) readDuration();
        return { t: "tuplet", num: +a, den: +b, music: parseMusic() };
      }
      case "sequential": return { t: "seq", items: (ws(), src[i] === "{" ? (i++, parseItems("}")) : [parseItem()]) };
      case "simultaneous": { ws(); if (src[i] === "{") { i++; return parseSim2(); } return parseItem(); }
      case "transposition": { ws(); const h = readPitchHead(); if (!h) err("pitch expected after \transposition"); return { t: "cmd", name: "transposition", pitch: h }; }
      case "stringTuning": { skipArg(); return null; }
      case "stringNumberSpanner": case "textSpannerDown": case "textSpannerUp": case "textSpannerNeutral": case "stringNumberOrientation": { if (w === "stringNumberSpanner") { skipArg(); skipArg(); } return null; }
      case "chordmode": case "lyricmode": case "drummode": case "figuremode": case "notemode": case "lyrics": case "addlyrics": { skipArg(); return { t: "seq", items: [] }; }
      case "grace": case "slashedGrace": case "acciaccatura": case "appoggiatura": return { t: "grace", kind: w, music: parseMusic() };
      case "afterGrace": { const main = parseMusic(), gr = parseMusic(); return { t: "seq", items: [main, { t: "grace", kind: "after", music: gr }] }; }
      case "unfoldRepeats": return { t: "unfold", music: parseMusic() };
      case "partial": { ws(); const d = readDuration(); if (!d) err("duration expected after \\partial"); return { t: "cmd", name: "partial", ticks: durTicks(d) }; }
      case "time": { ws(); let a = ""; while (isDigit(src[i])) a += src[i++]; if (src[i] !== "/") err("\\time needs n/m"); i++; let b = ""; while (isDigit(src[i])) b += src[i++]; return { t: "cmd", name: "time", num: +a, den: +b }; }
      case "key": {
        ws(); const h = readPitchHead(); if (!h) err("pitch expected after \\key"); ws();
        let mode = null; if (src[i] === "\\") { i++; mode = word(); i += mode.length; }
        return { t: "cmd", name: "key", step: h.step, alter: h.alter, mode };
      }
      case "tempo": {
        ws(); const out = { t: "cmd", name: "tempo" };
        if (src[i] === '"') { skipString(); ws(); }
        const m = /^(\d+)(\.*)\s*=\s*(\d+)(?:\s*-\s*\d+)?/.exec(src.slice(i, i + 40));
        if (m) { i += m[0].length; out.beat = { v: +m[1], dots: m[2].length }; out.bpm = +m[3]; } else if (src[i] === "\\" || src[i] === "{") { /* text only */ }
        return out;
      }
      case "clef": { ws(); skipArg(); return null; }
      case "bar": { ws(); const s0 = i; skipString(); return { t: "cmd", name: "bar", style: src.slice(s0 + 1, i - 1) }; }
      case "skip": { ws(); const d = takeDur(); return { t: "ev", kind: "skip", dur: d }; }
      case "set": skipProperty(true); return null;
      case "override": case "overrideProperty": skipProperty(true); return null;
      case "unset": case "revert": skipProperty(false); return null;
      case "once": return null;
      case "tweak": skipArg(); skipArg(); return null;
      case "change": { ws(); word2(); skipArg(); skipArg(); skipArg(); return null; }
      case "mark": case "markup": case "markuplist": case "footnote": case "ottava": case "stringNumbers": case "accidentalStyle": case "bendAfter": case "hspace": { skipArg(); return null; }
      case "header": case "paper": case "layout": case "midi": case "with": { ws(); if (src[i] === "{") skipBalanced("{", "}"); return null; }
      default:
        if (inert.has(w)) return null;
        if (Object.prototype.hasOwnProperty.call(vars, w)) return { t: "ref", name: w };
        if (SKIP_CMDS.has(w) || POST_CMDS.has(w) || /^deprecated/.test(w) || /^set(Text|Hairpin)/.test(w) || /^(merge|finger|string|rightHand|strokeFinger|fingering)[A-Za-z]*(On|Off|Up|Down|Left|Right|Neutral)$/.test(w)) return null;
        if (/^capo[0-9]*$/.test(w)) return parseMusic();   // a capo-bar marking around some notes: the notes are what matter
        if (w === "lyricsto") { skipArg(); skipArg(); return null; }
        if (w === "rest") return null;
        err("unsupported command \\" + w);
    }
    return null;
  }
  function word2() { const m = /^[A-Za-z]+/.exec(src.slice(i, i + 30)); if (m) i += m[0].length; return m ? m[0] : ""; }

  // --- top level ---
  for (;;) {
    ws(); if (i >= src.length) break;
    if (src[i] === "\\") {
      const save = i; i++; const w = word(); i += (w || "").length;
      if (w === "version" || w === "include" || w === "language") { ws(); skipString(); continue; }
      if (w === "header" || w === "paper" || w === "layout" || w === "midi") { ws(); if (src[i] === "{") skipBalanced("{", "}"); continue; }
      if (w === "book" || w === "bookpart") { ws(); if (src[i] === "{") i++; continue; }
      if (w === "score") {
        ws(); if (src[i] !== "{") err("{ expected after \\score"); i++; const items = []; let hasMidi = false, hasLayout = false;
        for (;;) {
          ws(); if (src[i] === "}") { i++; break; }
          if (src[i] === "\\") { const w2 = (/^[A-Za-z]+/.exec(src.slice(i + 1, i + 30)) || [""])[0]; if (["layout", "midi", "header"].includes(w2)) { if (w2 === "midi") hasMidi = true; if (w2 === "layout") hasLayout = true; i += 1 + w2.length; ws(); if (src[i] === "{") skipBalanced("{", "}"); continue; } }
          const m = parseItem(); if (m) items.push(m);
        }
        scores.push({ t: "seq", items, midi: hasMidi, layout: hasLayout }); continue;
      }
      if (w === "markup") { skipArg(); continue; }
      i = save; err("unsupported top-level command");
    }
    if (src[i] === "}") { i++; continue; }   // the end of a \book
    if (src[i] === "#" || src[i] === "$") { skipScheme(); continue; }
    const name = /^[A-Za-z][A-Za-z0-9_-]*/.exec(src.slice(i, i + 80));
    if (!name) err("unexpected top-level text");
    const save = i; i += name[0].length; ws();
    if (src[i] === "=") {
      i++; ws();
      if (src[i] === '"') skipString(); else if (src[i] === "#") skipScheme(); else if (isDigit(src[i])) { while (/[\d./]/.test(src[i])) i++; }
      else if (src[i] === "^" || src[i] === "_" || src[i] === "-") { i++; skipArg(); vars[name[0]] = { t: "seq", items: [] }; inert.add(name[0]); }
      else if (src[i] === String.fromCharCode(92) && VALUE_CMDS.has((/^.([A-Za-z]+)/.exec(src.slice(i, i + 20)) || [])[1])) {   // a name for a bare command or markup: it does nothing when used
        for (;;) { const w2 = (/^.([A-Za-z]+)/.exec(src.slice(i, i + 20)) || [])[1]; if (!VALUE_CMDS.has(w2)) break; parseCommand(); ws(); }
        vars[name[0]] = { t: "seq", items: [] }; inert.add(name[0]);
      }
      else if (src[i] === String.fromCharCode(92) && !MUSIC_CMDS.has((/^.([A-Za-z]+)/.exec(src.slice(i, i + 24)) || [])[1]) && !Object.prototype.hasOwnProperty.call(vars, (/^.([A-Za-z]+)/.exec(src.slice(i, i + 24)) || [])[1])) { i++; word2(); skipArg(); vars[name[0]] = { t: "seq", items: [] }; inert.add(name[0]); }
      else vars[name[0]] = parseMusic();   // music definitions are read in file order and keep their own duration state, as LilyPond does
      continue;
    }
    i = save; err("unexpected top-level word " + name[0]);
  }
  return { vars, scores, lang };
}

// ---------- evaluation ----------
const absStep = (p) => p.oct * 7 + p.step;
const midiOf = (p) => 12 * (p.oct + 4) + STEP_MIDI[p.step] + p.alter;
const ticksOf = (d) => { let t = WHOLE / d.v, add = t / 2; for (let k = 0; k < d.dots; k++) { t += add; add /= 2; } return (t * d.mul[0]) / d.mul[1]; };

// opts.simAfter: after << >> inside \relative, continue from the "first" or the "last" part's final note
// opts.altRel:   each \alternative continues from "seq" (the previous alternative's last note) or restarts from the "body" end
function evaluate(ast, opts) {
  opts = Object.assign({ simAfter: "first", altRel: "seq", simStart: "same" }, opts || {});
  const events = [], changes = { time: [], key: [], tempo: [], partial: [], bar: [] }, repeats = [];
  const lastByVoice = new Map();
  let unfoldAll = false, counter = 0, T = 0, instrShift = 0;   // instrShift: what 	ransposition does to every written pitch, in semitones

  // written pitch -> absolute pitch; in \relative mode `ref` is the reference {step, oct} that this call moves along
  function absolute(p, ref, tr) {
    let oct;
    if (ref) {
      const nearest = absStep(ref) + (((p.step - ref.step + 3) % 7) + 7) % 7 - 3, abs = nearest + 7 * p.marks;
      oct = Math.floor(abs / 7);
      ref.step = p.step; ref.oct = oct;
    } else oct = p.marks;
    let out = { step: p.step, alter: p.alter, oct };
    if (tr) {
      const target = absStep(out) + tr.steps, tStep = ((target % 7) + 7) % 7, tOct = Math.floor(target / 7);
      const alter = midiOf(out) + tr.semis - (12 * (tOct + 4) + STEP_MIDI[tStep]);
      if (Math.abs(alter) > 2) throw new Error("transposition needs a triple accidental");
      out = { step: tStep, alter, oct: tOct };
    }
    return out;
  }

  function ev(node, c) {   // c: {voiceKey, staff, scale, tuplet, rel, transpose, skip, grace}
    switch (node.t) {
      case "seq": for (const it of node.items) ev(it, c); return;
      case "ref": { const m = ast.vars[node.name]; if (!m) throw new Error("undefined variable " + node.name); ev(m, c); return; }
      case "unfold": unfoldAll = true; ev(node.music, c); return;
      case "tie": { const last = lastByVoice.get(c.voiceKey); if (last) { last.tie = true; last.pitches.forEach((p) => (p.tie = true)); } return; }
      case "sim": {
        const t0 = T; let tEnd = t0, first = null, last = null;
        node.parts.forEach((part, k) => {
          T = t0;
          const startRel = k > 0 && opts.simStart === "prevEnd" && last ? last : c.rel;   // each part starts from the reference before <<, or from where the part before it ended
          const cc = Object.assign({}, c, { voiceKey: c.voiceKey + "." + k, rel: startRel ? { step: startRel.step, oct: startRel.oct } : null });
          ev(part, cc);
          if (k === 0) first = cc.rel; last = cc.rel;
          tEnd = Math.max(tEnd, T);
        });
        T = tEnd;
        if (c.rel && first) { const pick = opts.simAfter === "last" ? last : first; c.rel.step = pick.step; c.rel.oct = pick.oct; }
        return;
      }
      case "ctx": {
        if (["Lyrics", "ChordNames", "FretBoards", "Dynamics", "NoteNames", "Devnull", "DrumStaff", "RhythmicStaff"].includes(node.type)) { ev(node.music, Object.assign({}, c, { skip: true })); return; }
        if (node.type === "TabStaff" || node.type === "TabVoice") { ev(node.music, Object.assign({}, c, { tab: true, staff: c.staff || "tab", voiceKey: c.voiceKey + ".T" + (node.name || ++counter) })); return; }
        let cc = c;
        if (node.type === "Staff" && c.staff && opts.printMode) { ev(node.music, Object.assign({}, c, { skip: true })); return; }   // a small staff inside a staff is an ossia (an alternative reading): left out
        if (node.type === "Staff") cc = Object.assign({}, c, { staff: node.name || "s" + (++counter), voiceKey: c.voiceKey + ".S" + (node.name || counter) });
        else if (node.type === "Voice") cc = Object.assign({}, c, { voiceKey: c.voiceKey + ".V" + (node.name || ++counter) });
        ev(node.music, cc); return;
      }
      case "rel": ev(node.music, Object.assign({}, c, { rel: { step: node.ref.step, oct: node.ref.marks + 0 } })); return;
      case "transpose": {
        const from = { step: node.from.step, alter: node.from.alter, oct: node.from.marks }, to = { step: node.to.step, alter: node.to.alter, oct: node.to.marks };
        const tr = { steps: absStep(to) - absStep(from), semis: midiOf(to) - midiOf(from) };
        if (opts.noOctaveTranspose && tr.semis % 12 === 0 && tr.steps % 7 === 0) { ev(node.music, c); return; }   // a transposition by whole octaves only moves the notes to where they are written
        if (c.transpose) { tr.steps += c.transpose.steps; tr.semis += c.transpose.semis; }
        ev(node.music, Object.assign({}, c, { transpose: tr })); return;
      }
      case "tuplet": {
        const cc = Object.assign({}, c, { scale: [c.scale[0] * node.den, c.scale[1] * node.num], tuplet: { num: node.num, den: node.den, id: ++counter + "", parent: c.tuplet || null } });
        ev(node.music, cc); return;
      }
      case "grace": ev(node.music, Object.assign({}, c, { grace: node.kind })); return;
      case "repeat": {
        if (node.kind === "unfold" || node.kind === "percent") {
          if (node.alts) throw new Error("\\repeat unfold with \\alternative is not supported");
          for (let k = 0; k < node.n; k++) ev(node.body, c);
          return;
        }
        if (node.kind !== "volta") throw new Error("\\repeat " + node.kind + " is not supported");
        const r = { n: node.n, t0: T, tBody: 0, alts: [] };
        ev(node.body, c); r.tBody = T;
        if (node.alts) {
          const atEnd = c.rel ? { step: c.rel.step, oct: c.rel.oct } : null;
          node.alts.forEach((a, k) => {
            const a0 = T;
            if (opts.altRel === "body" && k > 0 && atEnd) { c.rel.step = atEnd.step; c.rel.oct = atEnd.oct; }
            ev(a, c); r.alts.push({ t0: a0, t1: T });
          });
        }
        r.t1 = T; if (!c.skip) repeats.push(r);
        return;
      }
      case "cmd": {
        if (c.skip) return;
        if (node.name === "time") changes.time.push({ t: T, num: node.num, den: node.den });
        else if (node.name === "key") changes.key.push({ t: T, step: node.step, alter: node.alter, mode: node.mode });
        else if (node.name === "tempo" && node.bpm) changes.tempo.push({ t: T, bpm: node.bpm, beat: node.beat });
        else if (node.name === "partial") changes.partial.push({ t: T, ticks: node.ticks });
        else if (node.name === "bar") changes.bar.push({ t: T, style: node.style });
        return;
      }
      case "ev": {
        const d = (ticksOf(node.dur) * c.scale[0]) / c.scale[1];
        if (!Number.isInteger(d)) throw new Error("a duration is not a whole number of ticks");
        const e = { t: T, dur: d, kind: node.kind, voiceKey: c.voiceKey, staff: c.staff || "s0", tab: !!c.tab, written: { v: node.dur.v, dots: node.dur.dots, mul: node.dur.mul }, tuplet: c.tuplet || null, full: !!node.full, grace: c.grace || null };
        if (node.kind === "note") {
          const ref = c.rel ? { step: c.rel.step, oct: c.rel.oct } : null;   // chord notes follow one another; the chord's first note is the reference afterwards
          e.pitches = node.pitches.map((p, k) => { const a = absolute(p, ref, c.transpose); if (k === 0 && c.rel) { c.rel.step = ref.step; c.rel.oct = ref.oct; } const oct = a.oct + instrShift / 12; return { step: a.step, alter: a.alter, oct, midi: midiOf({ step: a.step, alter: a.alter, oct }), tie: p.tie }; });
          e.tie = node.tie;
        }
        else if (node.pitches && c.rel) { const ref = { step: c.rel.step, oct: c.rel.oct }; absolute(node.pitches[0], ref, null); c.rel.step = ref.step; c.rel.oct = ref.oct; }
        if (!c.skip) { events.push(e); if (!c.grace) lastByVoice.set(c.voiceKey, e); }
        if (!c.grace) T += d;
        return;
      }
      default: throw new Error("cannot evaluate " + node.t);
    }
  }
  const scanShift = (node, seen) => {   // 	ransposition anywhere in the scores or the variables they use
    if (!node || typeof node !== "object") return null;
    if (node.t === "cmd" && node.name === "transposition") return midiOf({ step: node.pitch.step, alter: node.pitch.alter, oct: node.pitch.marks }) - 60;
    if (node.t === "ref") { if (seen.has(node.name)) return null; seen.add(node.name); return scanShift(ast.vars[node.name], seen); }
    for (const k of ["items", "parts", "alts"]) if (Array.isArray(node[k])) for (const x of node[k]) { const r = scanShift(x, seen); if (r !== null) return r; }
    for (const k of ["music", "body"]) if (node[k]) { const r = scanShift(node[k], seen); if (r !== null) return r; }
    return null;
  };
  if (!opts.printMode) { let sh = null; for (const sc of ast.scores) { sh = scanShift(sc, new Set()); if (sh !== null) break; } if (sh) { if (sh % 12) throw new Error("an instrument transposition that is not whole octaves is not supported"); instrShift = sh; } }
  const top = opts.score != null ? ast.scores[opts.score] : ast.scores.find((sc) => JSON.stringify(sc).includes('"ev"') || sc.items.length) || ast.scores[0];
  if (!top) throw new Error("no \\score found");
  ev(top, { voiceKey: "r", staff: null, scale: [1, 1], tuplet: null, rel: null, transpose: null, skip: false, grace: null });
  // a TabStaff holds the pitches that actually sound on the guitar: when there is one, the engraved staff (written an octave higher) is left out
  const hasTab = events.some((e) => e.tab && e.kind === "note"), hasStaff = events.some((e) => !e.tab && e.kind === "note");
  const useTab = hasTab && !(opts.printMode && hasStaff);
  const kept = useTab ? events.filter((e) => e.tab) : events.filter((e) => !e.tab);
  return { events: kept, changes, repeats, unfold: unfoldAll, end: T, hadTab: hasTab };
}

// which score is printed and which one makes the MIDI file (often the same one)
function scoreRoles(ast) {
  const withNotes = ast.scores.map((sc, k) => k).filter((k) => JSON.stringify(ast.scores[k]).length > 40);
  const print = withNotes.find((k) => ast.scores[k].layout);
  const printIdx = print !== undefined ? print : withNotes[0] || 0;
  const midiList = withNotes.filter((k) => ast.scores[k].midi);
  const midi = midiList.length ? midiList[midiList.length - 1] : printIdx;
  return { print: printIdx, midi };
}
module.exports = { parse, evaluate, scoreRoles, WHOLE, STEP_MIDI, LETTERS, midiOf };
