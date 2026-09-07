# Fretline

A random melodic-line generator for guitar sightreading practice — pick a clef
(guitar/treble/bass/piano grand staff), key, fretboard position or pitch range,
time signature, and rhythmic difficulty; it engraves a fresh line with VexFlow,
plays it back with a metronome, lets you click any bar to start playback there,
and shows a fretboard + mode-detection panel for the current position.

Live app: https://claude.ai/code/artifact/b0f71811-d152-4e1b-a595-7abeb8a99003

## Files

- `fretline_body.html` — the actual editable source (HTML/CSS/JS). Edit this one.
- `vexflow.js` — a pinned copy of the VexFlow notation-rendering library
  (`vexflow@5.0.0`, `build/cjs/vexflow.js` — the variant with fonts embedded as
  base64, so it renders with no network access). Committed directly rather
  than fetched at build time, so the build is reproducible without internet.
- `splice.js` — build script. Splices `vexflow.js` into `fretline_body.html`
  at the `/*__VEXFLOW_BUNDLE__*/` marker, byte-for-byte via Node Buffers (not
  string/text APIs — see "Gotcha" below), producing `fretline.html`.
- `fretline.html` — the built, publish-ready file. **Generated — don't edit
  directly**, run `node splice.js` after editing `fretline_body.html` instead.
- `serve.js` — a tiny static file server for local preview (no dependencies).

## Workflow

```bash
# after editing fretline_body.html:
node splice.js          # rebuilds fretline.html

# to preview locally:
node serve.js            # serves the folder on http://127.0.0.1:8934
# then open http://127.0.0.1:8934/fretline.html
```

To publish an update to the live Claude.ai Artifact, use the Artifact tool
with `file_path` pointing at the built `fretline.html` and `url` set to the
existing artifact URL above (so it updates in place rather than creating a
new one).

### Gotcha: don't splice with PowerShell text pipelines

`vexflow.js` contains raw (non-escaped) UTF-8 multi-byte characters for
SMuFL music glyphs. Windows PowerShell's `Get-Content`/`-replace` text
pipeline was tried early on and silently mangled those bytes (classic
UTF-8-read-as-Latin1 double-encoding), corrupting every notehead/clef glyph
without throwing an error. `splice.js` avoids this entirely by working on
raw `Buffer`s. If you ever reimplement the splice step, keep it byte-level —
don't round-trip the VexFlow file through a text-mode string API.

## Architecture notes

- No build tooling, no dependencies, no bundler — everything is one HTML
  file with two inline `<script>` tags (VexFlow, then the app). This is
  deliberate: it needs to be publishable as a single-file Claude Artifact.
- Notation rendering uses VexFlow (not a hand-rolled SVG renderer) — see the
  `renderScore`/`buildVoicesForMeasure`/`buildStaveNote` functions.
- Guitar clef mode writes notation one octave above the sounding pitch
  (`transposeWritten: 12`), matching real guitar sheet-music convention;
  playback still uses the true sounding pitch. See the `CLEFS` table.
- Bar layout wraps measures into rows sized to the container's width via a
  `ResizeObserver` (not a `load`/`resize` listener — those were tried first
  and don't reliably fire with a real width in a backgrounded/hidden
  browser tab; `ResizeObserver` does, since it reports the real size as
  soon as there is one).
- Playback uses Web Audio, scheduled up front each run. Pause suspends the
  `AudioContext` itself (rather than tearing down scheduled nodes), so
  already-scheduled notes/metronome clicks just wait and resume exactly
  where they left off. Highlighting polls `audioCtx.currentTime` on a
  `setInterval` (50ms) — **not** `requestAnimationFrame**, which can stall
  indefinitely in a backgrounded/inactive tab and silently freeze the
  highlight mid-playback (confirmed by hitting this bug once already).
- The "Mode in use" fretboard diagram intentionally shows the position's
  fret window *plus one extra fret*, so scale shapes that resolve just past
  the box (e.g. Mixolydian's flat seventh) aren't cut off. This only widens
  the diagram — the actual pitch pool/generation still uses the position's
  own (unextended) fret range.
- Visual design follows a "Midsound Films" design system handed off from a
  separate Claude Design session: Parchment/Linen/Wheat/Sage/Moss/Clay/Bark
  palette, Georgia + Helvetica, zero border radius, no shadows. See the
  `:root` custom properties at the top of the `<style>` block.
