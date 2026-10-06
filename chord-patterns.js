// The approved chord patterns, shared by the Sightreading page and the Scale Lab so there is one list to edit.
// Grid format: one string per fret row (first row = the pattern's lowest fret), one token per string from low E to high e;
// a token is a chord-tone degree ("1" "3" "5" "♭3" "♭7" ...) or "-" for no note. Keys are the chord quality symbols.
// Patterns from ALTERNATES_FROM (1-based Pos) onward are alternate voicings: shown in the Chord Lab's "Alternate voicings" section
// and skipped by the position cycling in Sightreading.
(function () {
  var DEGREE_IV = { "1": 0, "2": 2, "♭3": 3, "3": 4, "4": 5, "♭5": 6, "5": 7, "°7": 9, "♭7": 10, "7": 11 };
  var OPEN = [40, 45, 50, 55, 59, 64];   // low E .. high e
  var APPROVED = {
    "": [ // major triad
      ["1 - - - 5 1", "- - - 3 - -", "- 5 1 - - -", "- - - - - -"],   // Pos 1
      ["- 5 1 - - -", "- - - - - -", "- - - 5 - 3", "- - - - 1 -"],   // Pos 2
      ["- - - 5 - 3", "- - - - 1 -", "- - 3 - - -", "- 1 - - - -"],   // Pos 3
      ["- 1 - - - 5", "- - - - - -", "- - 5 1 3 -", "- - - - - -"],   // Pos 4
      ["- - 5 1 3 -", "- - - - - -", "- - - - - -", "- - - - - 1"],   // Pos 5
    ],
    "-": [ // minor triad
      ["1 - - ♭3 5 1", "- - - - - -", "- 5 1 - - -", "- - - - - -"],   // Pos 1
      ["- - 1 - - -", "- - - - - ♭3", "- - - 5 - -", "- - - - 1 -"],   // Pos 2 (4 strings)
      ["- - - 5 - -", "- - ♭3 - 1 -", "- - - - - -", "- 1 - - - -"],   // Pos 3 (4 strings)
      ["- 1 - - - 5", "- - - - ♭3 -", "- - 5 1 - -", "- - - - - -"],   // Pos 4
      ["- - 5 - - -", "- - - - - -", "- - - - - -", "- - - ♭3 5 1"],  // Pos 5 (D-string 5th + top-3-string barre)
    ],
    "°": [ // diminished triad (optional notes from the chart are not drawn)
      ["1 - - ♭3 - -", "- ♭5 - - - -", "- - 1 - - -", "- - - - - -"],   // Pos 1 (high-e 1 removed)
      ["- - 1 - - -", "- - - ♭5 - ♭3", "- - - - - -", "- - - - 1 -"],   // Pos 2
      ["- - ♭3 - 1 -", "♭5 - - - - -", "- 1 - - - -"],   // Pos 3 (G-string 1 removed, B-string 1 added)
      ["- - ♭5 - ♭3 -", "- - - 1 - -", "- ♭3 - - - -", "- - - - - -"],   // Pos 4
      ["- ♭3 - - - -", "- - - - ♭5 -", "- - - ♭3 - 1", "- - - - - -"],   // Pos 5
    ],
    "°7": [ // diminished 7 (the five chart shapes: 3 drop-2 + 2 drop-3; dim7 repeats every 3 frets, so roots may sit on any note)
      ["- - - ♭3 - -", "- ♭5 - - - -", "- - 1 - °7 -"],   // Pos 1: drop 2 on A-D-G-B
      ["- - 1 - °7 -", "- - - ♭5 - ♭3"],                    // Pos 2: drop 2 on D-G-B-e
      ["- - 1 - - -", "♭3 - - ♭5 - -", "- °7 - - - -"],   // Pos 3: drop 2 on E-A-D-G
      ["- - - °7 - ♭5", "- 1 - - - -", "- - - - ♭3 -"],   // Pos 4: drop 3 on A-G-B-e
      ["- - °7 - ♭5 -", "1 - - ♭3 - -"],                   // Pos 5: drop 3 on E-D-G-B
    ],
    "7": [ // dominant 7: the five CAGED forms (E, D, C, A, G), shapes found in outside F7 listings
      ["1 - ♭7 - 5 1", "- - - 3 - -", "- 5 - - - -"],   // Pos 1: E-shape, F7 = 1-3-1-2-1-1
      ["- - 1 - - -", "- - - - ♭7 -", "- - - 5 - 3"],   // Pos 2: D-shape, F7 = x-x-3-5-4-5
      ["- - - - 1 -", "- - 3 - - -", "- 1 - ♭7 - -"],   // Pos 3: C-shape, F7 = x-8-7-8-6-x
      ["- 1 - ♭7 - 5", "- - - - - -", "- - 5 - 3 -"],   // Pos 4: A-shape, F7 = x-8-10-8-10-8
      ["- - 5 1 3 -", "- - - - - ♭7"],                   // Pos 5: G-shape, F7 = x-x-10-10-10-11
    ],
    "-7": [ // minor 7: the five CAGED forms, shapes found in outside F listings
      ["1 - ♭7 ♭3 5 1","- - - - - -","- 5 - - - -"],   // Pos 1: E-shape F = 1-3-1-1-1-1
      ["- - 1 - - -","- - - - ♭7 ♭3","- - - 5 - -"],   // Pos 2: D-shape F = x-x-3-5-4-4
      ["- - ♭3 - - -","- - - - - -","- 1 - ♭7 - -","- - - - ♭3 -"],   // Pos 3: C-shape F = x-8-6-8-9-x
      ["- 1 - ♭7 - 5","- - - - ♭3 -","- - 5 - - -"],   // Pos 4: A-shape F = x-8-10-8-9-8
      ["- - - - ♭3 -","- - 5 1 - -","- - - - - ♭7"],   // Pos 5: G-shape F = x-x-10-10-9-11
    ],
    "Δ7": [ // major 7: Pos 1-5 run up the neck for C (open C-form, A, G, E, D shapes); Pos 6 is an alternate (the old C-shape)
      ["- - - 5 7 3","- - - - - -","- - 3 - - -","- 1 - - - -"],   // Pos 1: open C-form, C = x-3-2-0-0-0 (F = x-8-7-5-5-5)
      ["- 1 - - - 5","- - - 7 - -","- - 5 - 3 -"],   // Pos 2: A-shape F = x-8-10-9-10-8
      ["- - 5 1 3 -","- - - - - -","- - - - - 7"],   // Pos 3: G-shape F = x-x-10-10-10-12
      ["1 - - - 5 1","- - 7 3 - -","- 5 - - - -"],   // Pos 4: E-shape F = 1-3-2-2-1-1
      ["- 5 1 - - -","- - - - - -","- - - 5 7 3"],   // Pos 5: D-shape F = x-3-3-5-5-5
      ["- - 3 - - -","- 1 - - - -","- - - 7 - -","- - - - 3 -"],   // Pos 6 (alternate): C-shape F = x-8-7-9-10-x
    ],
    "ø7": [ // half-diminished 7: four sourced movable shapes
      ["- - - - ♭5 -","1 - ♭7 ♭3 - -"],   // Pos 1: Root on E, A-string muted (drop 3) F = 1-x-1-1-0-x
      ["- - 1 - - -","- - - ♭5 ♭7 ♭3"],   // Pos 2: D-form F = x-x-3-4-4-4
      ["- 1 - ♭7 - -","- - ♭5 - ♭3 -"],   // Pos 3: A-form F = x-8-9-8-9-x
      ["- - - - - ♭5","- 1 - ♭7 - -","- - - - ♭3 -"],   // Pos 4: A-G-B-e form F = x-8-x-8-9-7
    ],
    "sus4": [ // sus4: E, D, C-form, A, G (G-shape top e root added at the user's request)
      ["1 - - - 5 1","- - - - - -","- 5 1 4 - -"],   // Pos 1: E-shape F = 1-3-3-3-1-1
      ["- - 1 - - -","- - - - - -","- - - 5 - -","- - - - 1 4"],   // Pos 2: D-shape F = x-x-3-5-6-6
      ["- - - 5 - -","- - - - 1 -","- - - - - -","- 1 4 - - -"],   // Pos 3: C-form F = x-8-8-5-6-x
      ["- 1 - - - 5","- - - - - -","- - 5 1 - -","- - - - 4 -"],   // Pos 4: A-shape F = x-8-10-10-11-8
      ["- - 5 1 - -","- - - - 4 -","- - - - - -","- - - - - 1"],   // Pos 5: G-shape (user-specified top e root) F = x-x-10-10-11-13
    ],
    "sus2": [ // sus2: three sourced movable shapes
      ["1 - - - 5 -","- - - - - -","- 5 1 - - 2"],   // Pos 1: E-form F = 1-3-3-x-1-3
      ["- 1 - - 2 5","- - - - - -","- - 5 1 - -"],   // Pos 2: A-shape F = x-8-10-10-8-8
      ["- 2 5 - - -","- - - - - -","- - - 2 - -","1 - - - 5 -"],   // Pos 3: 13-10-10-12-13-x form F = 13-10-10-12-13-x
    ],
    "-Δ7": [ // minor-major 7: four sourced movable shapes (E, D, A, G)
      ["1 - - ♭3 5 1","- - 7 - - -","- 5 - - - -"],   // Pos 1: E-shape F = 1-3-2-1-1-1
      ["- - 1 - - -","- - - - - ♭3","- - - 5 7 -"],   // Pos 2: D-shape F = x-x-3-5-5-4
      ["5 1 - - - 5","- - - 7 ♭3 -","- - 5 - - -"],   // Pos 3: A-shape F = 8-8-10-9-9-8
      ["- - - - - 7","- - - ♭3 5 -","- - - - - -","- - 1 - - -"],   // Pos 4: G-form F = x-x-15-13-13-12
    ],
  };
  var ALTERNATES_FROM = { "°7": 4, "Δ7": 6 };

  var parsed = {};
  function parse(key) {
    if (!APPROVED[key]) return null;
    if (!parsed[key]) {
      parsed[key] = APPROVED[key].map(function (rows) {
        var notes = [];
        rows.forEach(function (line, row) { line.trim().split(/\s+/).forEach(function (tok, s) { if (tok !== "-") notes.push({ s: s, row: row, iv: DEGREE_IV[tok] }); }); });
        return notes;
      });
    }
    return parsed[key];
  }
  // Every place the quality's patterns fit between fretLo and fretHi for this root, lowest first (ties keep the data order):
  // [{ f, pIdx, notes: [{ s, fret, iv }] }]. primaryOnly leaves out the alternate voicings.
  function placements(rootPc, key, fretLo, fretHi, primaryOnly) {
    var patterns = parse(key), out = [];
    if (!patterns) return out;
    var limit = primaryOnly && ALTERNATES_FROM[key] ? ALTERNATES_FROM[key] - 1 : patterns.length;
    patterns.forEach(function (notes, pIdx) {
      if (pIdx >= limit) return;
      var rn = notes.filter(function (n) { return n.iv === 0; })[0];
      var first = ((((rootPc - OPEN[rn.s] - rn.row) % 12) + 12) % 12);
      for (var f = first; f <= fretHi; f += 12) {
        if (!notes.every(function (n) { return f + n.row >= fretLo && f + n.row <= fretHi; })) continue;
        out.push({ f: f, pIdx: pIdx, notes: notes.map(function (n) { return { s: n.s, fret: f + n.row, iv: n.iv }; }) });
      }
    });
    return out.map(function (o, i) { return [o, i]; }).sort(function (x, y) { return x[0].f - y[0].f || x[1] - y[1]; }).map(function (x) { return x[0]; });
  }
  window.FretlinePatterns = { APPROVED: APPROVED, ALTERNATES_FROM: ALTERNATES_FROM, placements: placements };
})();
