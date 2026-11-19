# Songbook data tools

These scripts build the data behind the Songbook page (`songbook_body.html` -> `songbook.html`): `songs/index.json` and one `songs/<id>.json` per piece.
You only need them to add or change pieces; the built data is committed.

    node tools/songs/build.js            # build everything (downloads sources into tools/songs/cache/ the first time; needs curl)
    node tools/songs/build.js 109 1431   # try only some pieces (prints, writes nothing)

## Where the music comes from

The Mutopia Project (https://www.mutopiaproject.org) publishes public-domain and openly licensed editions as LilyPond source, with a MIDI file made from the same source.
`pieces.json` lists the chosen pieces (Mutopia id, section, title, license). `songs/CREDITS.md` is generated from it with each typesetter and license.
CC BY-SA pieces (the Bach canons) keep their license: their data files are CC BY-SA 3.0.

## Pipeline

1. `lilypond.js` reads the LilyPond subset these pieces use (three note-name languages, `\relative`, `\transpose`, chords, ties, `\repeat volta` with `\alternative`,
   tuplets, graces, voices, `\partial`). It throws on anything it does not understand, so a piece that parses has been read completely.
2. `verify.js` + `midi.js` compare every note's start time and pitch with the edition's MIDI file. The conventions LilyPond leaves open (what a `<< ... \ ... >>` is relative to, and
   so on) are tried until one matches. A piece is only built if it matches, and the result is recorded as `exact`, `subset` (the MIDI also plays chords or a tab staff that are not shown)
   or `pitches` (ornaments shift the timing, so only how often each pitch sounds is compared: weaker evidence).
3. `score.js` turns the notes into bars: the bar grid (time signatures, pickups, short bars before repeats), voices, ties, tuplets, graces.
4. `tab.js` chooses a string and fret for every note (a Viterbi-style search favouring low frets, small hand movements and chords within about four frets). The page shows notation only, so this
   fingering is used only to feed the difficulty estimate, and is not kept in the data.
5. `difficulty.js` estimates a score from speed, chords, hand movement (from the fingering), stretches, high positions, accidentals, rhythm and length; `build.js` cuts it into four levels.
   It is a proxy, so any one piece can be a level off.

Pitch convention: guitar music is written an octave above where it sounds. The notation shows the pitch as engraved; the fingering uses the sounding pitch (written minus an octave).

## Adding a piece

Add its entry to `pieces.json` (copy one and change `id`, `ly`, `mid`, `title`, `composer`, `section`, `license`), run `node tools/songs/build.js <id>`, and read the message if it fails.
Duets (a flute and a guitar, two guitars) are not supported: the page shows one guitar.
