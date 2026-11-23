// harmony-core.js: the theory of the Harmony Map (harmony_map.html), without its screen layout, so other pages can use it.
// The Piano page uses it to name the chords of a progression the way the map does (function, numeral, secondary roles) and to say how one chord
// leads to the next. It is a copy of the map's tables, not a second opinion: `node tools/harmony-core-data.js check` fails if the two drift apart.
(function () {
  "use strict";
  const mod = (n) => ((n % 12) + 12) % 12;

  // ---- tables (from harmony_map.html; keep in step with `node tools/harmony-core-data.js check`) ----
  // chord shapes: semitones above the root
  const Q = {"maj7":[0,4,7,11],"m7":[0,3,7,10],"dom7":[0,4,7,10],"m7b5":[0,3,6,10],"dim7":[0,3,6,9],"dim":[0,3,6],"maj":[0,4,7],"min":[0,3,7],"sus7":[0,5,7,10],"dom7b5":[0,4,6,10]};
  // the functions on the map: region T/S/D (tonic / subdominant / dominant), ring out (major-mode chord) / in (minor-mode chord), off = semitones above the tonic,
  // bass = semitones above the chord's own root for inversions, tr / jz = [traditional name, quality] and [jazz name, quality], adv = advanced map only
  const MAIN = [
    {"id":"I","region":"T","ring":"out","off":0,"tr":["I","maj"],"jz":["I△","maj7"]},
    {"id":"vi","region":"T","ring":"out","off":9,"tr":["vi","min"],"jz":["vi7","m7"]},
    {"id":"iii","region":"T","ring":"out","off":4,"tr":["iii","min"],"jz":["iii7","m7"]},
    {"id":"io","region":"T","ring":"out","off":0,"tr":["i°","dim"],"jz":["i°7","dim7"]},
    {"id":"i","region":"T","ring":"in","off":0,"tr":["i","min"],"jz":["i","min"]},
    {"id":"bIII","region":"T","ring":"in","off":3,"tr":["♭III","maj"],"jz":["♭III△","maj7"]},
    {"id":"vio","region":"T","ring":"in","off":9,"tr":["vi°","dim"],"jz":["vi7♭5","m7b5"]},
    {"id":"IV","region":"S","ring":"out","off":5,"tr":["IV","maj"],"jz":["IV△","maj7"]},
    {"id":"ii","region":"S","ring":"out","off":2,"tr":["ii","min"],"jz":["ii7","m7"]},
    {"id":"iv","region":"S","ring":"in","off":5,"tr":["iv","min"],"jz":["iv7","m7"]},
    {"id":"iio","region":"S","ring":"in","off":2,"tr":["ii°","dim"],"jz":["ii7♭5","m7b5"]},
    {"id":"bVI","region":"S","ring":"in","off":8,"tr":["♭VI","maj"],"jz":["♭VI△","maj7"]},
    {"id":"bII","region":"S","ring":"in","off":1,"tr":["♭II","maj"],"jz":["♭II△","maj7"],"adv":1},
    {"id":"II","region":"S","ring":"out","off":2,"tr":["II","maj"],"jz":["II7♭5","dom7b5"],"adv":1},
    {"id":"subii","region":"S","ring":"out","off":8,"tr":["♭vi7","m7"],"jz":["subii7","m7"],"adv":1},
    {"id":"bIII07","region":"S","ring":"out","off":3,"tr":["♭III°7","dim7"],"jz":["♭III°7","dim7"],"adv":1},
    {"id":"V7","region":"D","ring":"out","off":7,"tr":["V7","dom7"],"jz":["V7","dom7"]},
    {"id":"V7in","region":"D","ring":"in","off":7,"tr":["V7","dom7"],"jz":["V7","dom7"]},
    {"id":"bVII","region":"D","ring":"in","off":10,"tr":["♭VII","maj"],"jz":["♭VII7","dom7"]},
    {"id":"V","region":"D","ring":"in","off":7,"tr":["V","maj"],"jz":["V","maj"],"adv":1},
    {"id":"N6","region":"D","ring":"in","off":1,"tr":["N⁶","maj"],"jz":["N⁶","maj"],"bass":4},
    {"id":"vii07","region":"D","ring":"in","off":11,"tr":["vii°7","dim7"],"jz":["vii°7","dim7"]},
    {"id":"viio","region":"D","ring":"out","off":11,"tr":["vii°","dim"],"jz":["vii7♭5","m7b5"]},
    {"id":"N7","region":"D","ring":"out","off":1,"tr":["N⁷","dom7"],"jz":["subV7","dom7"]},
    {"id":"I64","region":"D","ring":"out","off":0,"tr":["I⁶₄","maj"],"jz":["I⁶₄","maj"],"bass":7},
    {"id":"V7sus4","region":"D","ring":"out","off":7,"tr":["V7sus4","sus7"],"jz":["V7sus4","sus7"]},
    {"id":"i64","region":"D","ring":"in","off":0,"tr":["i⁶₄","min"],"jz":["i⁶₄","min"],"bass":7}
  ];
  // the approach chords the map hangs on each target: semitones above the target's root, quality, label
  const ROLES = {"ii":{"off":2,"q":"m7","lab":"ii7"},"iio":{"off":2,"q":"m7b5","lab":"ii7♭5"},"V7":{"off":7,"q":"dom7","lab":"V7"},"V7in":{"off":7,"q":"dom7","lab":"V7"},"N6":{"off":1,"q":"maj","bass":4,"lab":"N⁶"},"vii07":{"off":11,"q":"dim7","lab":"vii°7"},"subii":{"off":8,"q":"m7"},"N7":{"off":1,"q":"dom7"},"I64":{"off":0,"q":"maj","bass":7,"lab":"I⁶₄"},"V7sus4":{"off":7,"q":"sus7","lab":"V7sus4"},"i64":{"off":0,"q":"min","bass":7,"lab":"i⁶₄"}};
  // the eight clusters: the target chord, the suffix used in the labels (V7/V, ii7/II...), which approach chords it has, and gr = its N⁷ is the German sixth
  const TARGETS = [
    {"t":"IV","suf":"IV","roles":["ii","iio","V7","V7in","N6","vii07","subii","N7","I64","V7sus4","i64"],"gr":false},
    {"t":"ii","suf":"II","roles":["ii","iio","V7","N6","vii07","subii","N7","I64","V7sus4"],"gr":false},
    {"t":"V7","suf":"V","roles":["ii","iio","V7","V7in","N6","vii07","subii","N7","I64","V7sus4"],"gr":true},
    {"t":"bVII","suf":"♭VII","roles":["ii","V7","N6","vii07","subii","N7","I64","V7sus4"],"gr":false},
    {"t":"bVI","suf":"♭VI","roles":["ii","V7","N6","vii07","subii","N7","I64","V7sus4"],"gr":false},
    {"t":"bIII","suf":"♭III","roles":["ii","V7","N6","vii07","subii","N7","I64","V7sus4"],"gr":false},
    {"t":"vi","suf":"VI","roles":["ii","iio","V7","N6","vii07","subii","N7","I64","V7sus4"],"gr":false},
    {"t":"iii","suf":"III","roles":["iio","V7","N6","vii07","subii","N7","I64","V7sus4"],"gr":false}
  ];

  // ---- logic (ported from the map's own rules) ----
  const REGION_NAME = { T: "tonic", S: "subdominant", D: "dominant" };
  const FAMILY = { maj: "M", maj7: "M", min: "m", m7: "m", dom7: "D", dom7b5: "Db5", dim: "h", m7b5: "h", dim7: "d7", sus7: "s7" };   // a triad and its seventh chord are the same function
  const SEVENTH = new Set(["maj7", "m7", "dom7", "m7b5", "dim7", "dom7b5", "sus7"]);
  const MAIN_BY_ID = new Map(MAIN.map((n) => [n.id, n]));
  const FROM_MINOR = new Set(["i", "bIII", "vio", "iv", "iio", "bVI", "bVII"]);   // minor-mode chords heard in a major key (borrowed from the parallel minor)
  const FROM_MAJOR = new Set(["I", "vi", "iii", "io", "IV", "ii"]);                // major-mode chords heard in a minor key (borrowed from the parallel major)
  const TARGET_ORDER = ["V7", "ii", "IV", "vi", "iii", "bVII", "bVI", "bIII"];   // which target is tried first for a chord that could be an approach to several
  const ROLE_ORDER = ["V7", "vii07", "ii", "iio", "N7", "subii", "V7sus4", "N6", "I64", "V7in", "i64"];
  const ROLE_TEXT = {
    V7: "secondary dominant: the V7 of {t}", V7in: "secondary dominant: the V7 of {t}", ii: "secondary ii: leads to the V7 of {t}", iio: "secondary ii°: leads to the V7 of {t}",
    vii07: "leading-tone diminished 7th of {t}", N7: "tritone substitute for the V7 of {t}", subii: "sub-ii: the ii of the tritone-substitute approach to {t}",
    V7sus4: "suspended dominant of {t}", N6: "Neapolitan sixth leading to the V7 of {t}", I64: "cadential 6/4 over the dominant of {t}", i64: "cadential 6/4 over the dominant of {t}",
  };

  // the map quality that names a chord, from "does it contain the note x semitones above its root"; null when the map has no name for it (augmented, sus4 triad, ...)
  function qualityOf(has) {
    if (has(4)) {
      if (has(8) && !has(7)) return null;                       // augmented
      if (has(11)) return "maj7";
      if (has(10)) return has(6) && !has(7) ? "dom7b5" : "dom7";
      return "maj";
    }
    if (has(3)) {
      if (has(6) && !has(7)) return has(9) ? "dim7" : has(10) ? "m7b5" : "dim";
      if (has(10)) return "m7";
      return "min";                                             // minor triads, m6, minor-major 7: the map's minor chord
    }
    if (has(5) && has(7)) return has(10) ? "sus7" : null;       // a sus4 triad is not on the map; the 7sus4 is
    return null;
  }

  // Where a played chord sits on the map, for a key: { pc, minor }. chord = { rootPc, q (a map quality), bassPc }.
  // Returns { id, kind: "main" | "member", role, target, region, ring, off, q, bass, label, borrowed, text } or null when the chord is not on the map.
  function classify(chord, key) {
    if (!chord || !chord.q) return null;
    const off = mod(chord.rootPc - key.pc), fam = FAMILY[chord.q], seventh = SEVENTH.has(chord.q), bassOff = mod(chord.bassPc - key.pc);
    let best = null, bestScore = -1;
    MAIN.forEach((n) => {
      if (n.off !== off || !(FAMILY[n.tr[1]] === fam || FAMILY[n.jz[1]] === fam)) return;
      let score = 0;
      if (n.bass !== undefined) { if (mod(n.off + n.bass) !== bassOff || bassOff === off) return; score += 2; }   // an inversion node only for that inversion
      if (n.ring === (key.minor ? "in" : "out")) score += 1;
      if (score > bestScore) { best = n; bestScore = score; }
    });
    if (best) {
      const label = (seventh ? best.jz : best.tr)[0];
      const borrowed = key.minor ? (FROM_MAJOR.has(best.id) ? "parallel major" : "") : (FROM_MINOR.has(best.id) ? "parallel minor" : "");
      return { id: best.id, kind: "main", role: undefined, target: undefined, region: best.region, ring: best.ring, off, q: chord.q, bass: best.bass, label, borrowed, text: "" };
    }
    for (const role of ROLE_ORDER) {
      const r = ROLES[role]; if (!r || FAMILY[r.q] !== fam) continue;
      if (r.bass !== undefined && (mod(off + r.bass) !== bassOff || bassOff === off)) continue;
      for (const tid of TARGET_ORDER) {
        const T = TARGETS.find((x) => x.t === tid); if (!T || !T.roles.includes(role)) continue;
        const tn = MAIN_BY_ID.get(T.t); if (mod(tn.off + r.off) !== off) continue;
        let lab = r.lab;
        if (role === "subii") lab = seventh ? "subii7" : "♭vi7";
        if (role === "N7") lab = seventh ? "subV7" : (T.gr ? "Gr+⁶" : "N⁷");
        return { id: T.t + "/" + role, kind: "member", role, target: T.t, region: tn.region, ring: tn.ring, off, q: chord.q, bass: r.bass, label: lab + "/" + T.suf, borrowed: "",
          text: ROLE_TEXT[role].replace("{t}", (tn.tr[0] === "V7" ? "V" : tn.tr[0])) + (role === "N7" && T.gr ? " (also the German augmented sixth, Gr+⁶)" : "") };
      }
    }
    return null;
  }

  // how one chord relates to the next (the map's own wording). A and B are classify() results.
  function relation(A, B) {
    if (!A || !B || !Q[A.q] || !Q[B.q]) return "chromatic connection";
    const rootOf = (n) => mod(n.off), pcsOf = (n) => new Set(Q[n.q].map((i) => mod(n.off + i)));
    const d = mod(rootOf(B) - rootOf(A)), PA = pcsOf(A), PB = pcsOf(B);
    let shared = 0; PB.forEach((p) => { if (PA.has(p)) shared++; });
    const domA = ["dom7", "dom7b5"].includes(A.q) || A.id === "V", domB = ["dom7", "dom7b5"].includes(B.q), minorA = ["m7", "m7b5", "min", "dim"].includes(A.q);
    const tonicB = B.region === "T" && B.kind === "main";
    const role = A.role || A.id, regions = A.region && B.region;
    let t;
    if (role === "V7sus4" && domB && d === 0) t = "suspension resolves into the dominant";
    else if ((role === "I64" || role === "i64") && domB && d === 7) t = "cadential 6/4 resolves into the dominant";
    else if (role === "N6" && domB) t = "Neapolitan sixth → dominant";
    else if (A.q === "dim7") t = d === 1 ? "diminished 7th → resolves to its target (acts as a leading-tone chord)" : [4, 7, 10].includes(d) ? "diminished 7th, spelled another way, resolving to its target" : "diminished 7th moving to a different chord";
    else if (domA && d === 5) t = tonicB ? "authentic resolution: dominant → tonic" : "dominant resolves to its target (secondary dominant)";
    else if (domA && d === 11) t = "tritone-substitute resolution: sub V7 resolves in place of the V7";
    else if (domA && String(A.id).startsWith("V7") && (B.id === "vi" || B.id === "bVI")) t = "deceptive cadence: dominant → vi / ♭VI instead of the tonic";
    else if (minorA && domB && d === 5) t = "ii–V: the ii leads to its dominant";
    else if (minorA && domB && d === 11) t = "ii → sub V7: the ii–V with a tritone-substitute V";
    else if (!regions) t = "chromatic connection";
    else if (A.region === "S" && B.region === "T") t = "plagal-type: subdominant → tonic";
    else if (A.region === "S" && B.region === "D") t = "predominant → dominant";
    else if (A.region === "T" && B.region === "S") t = "tonic → predominant (leaving home)";
    else if (A.region === "T" && B.region === "D") t = "tonic → dominant: straight to tension, skipping the predominant";
    else if (A.region === "T" && B.region === "T") t = "tonic → tonic: a color change over a shared home";
    else if (A.region === "D" && B.region === "T") t = "dominant → tonic family";
    else if (A.region === B.region) t = "moves within the " + REGION_NAME[A.region] + " region";
    else t = "chromatic connection";
    return t + (shared ? " · " + shared + " shared note" + (shared > 1 ? "s" : "") : "");
  }

  window.HarmonyCore = { Q, MAIN, ROLES, TARGETS, REGION_NAME, FAMILY, SEVENTH, qualityOf, classify, relation, MAIN_BY_ID };
})();
