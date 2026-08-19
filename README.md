# cyberspace-crt

A WebGL2 CRT with a text grid behind it. Plain ES modules — no framework, no
bundler, no build step, no dependencies.

Extracted from the `/terminal` page on [cyberspace.online](https://cyberspace.online).
The shell, commands and programs that ran on it are not included.

## How it works

The framebuffer holds beam intensity, not colour: one byte per pixel saying how
hard the gun hit that spot. Text rasterises into it from a bitmap font.

Colour is applied once, in the last shader pass, as a `vec3` multiplied over the
beam. Changing the phosphor from green to amber is one uniform and no
re-rasterisation.

Four passes run between the two:

1. **Spot** — horizontal Gaussian convolution with amplifier peaking (a
   difference of Gaussians subtracted from the signal), at source resolution.
2. **Beam** — scanline profile, widening with luma, blended with the previous
   frame for phosphor persistence.
3. **Bloom** — threshold and separable blur at quarter resolution.
4. **Composite** — barrel warp, aperture grille, phosphor tint, vignette, video
   noise, flicker, rolling shutter bar, glass edge.

## Run it

```sh
python3 -m http.server 8000    # or: npx serve, bunx serve, php -S localhost:8000
```

Then open <http://localhost:8000>.

Opening `index.html` from the filesystem does not work: the bitmap font is
fetched, and `fetch` does not accept `file://` URLs. Requires WebGL2.

## Write a program

`program.js` is everything on the screen. It default-exports an object with up
to four optional hooks:

```js
import { NORMAL, BRIGHT, BOLD, DIM, MUTED, FAINT, BG } from './src/term.js'

export default {
  init(s)      { s.term.text(2, 2, 'Hello, tube.', BRIGHT) },
  frame(s, t)  { s.term.text(2, 4, t.toFixed(1) + 's', MUTED) },
  key(s, e)    { if (e.key === '1') s.setPhosphor('vt320') },
  keyUp(s, e)  {},
}
```

`s.term` is the grid:

| | |
| --- | --- |
| `put(x, y, ch, attr, inv)` | one cell; `ch` is a character or a codepoint |
| `text(x, y, str, attr, inv)` | a run, returns the x it ended at |
| `write(str, attr)` / `writeln(...)` | at the cursor, wrapping and scrolling |
| `clear()` | blank the screen, keep the scrollback |
| `scrollView(±rows)` | move over what scrolled off |
| `putGlyph(x, y, bits, attr)` | a bitmap in one cell, instead of a glyph |

Attributes are bits and combine: `BRIGHT | BG`. `NORMAL BRIGHT BOLD DIM MUTED
FAINT` are beam levels; `BG` raises the pixels the glyph does *not* light;
`ITALIC` and `ALT` draw from a second face where one is loaded. `inv` is a
separate plane that swaps stroke and field.

Writing marks the grid dirty and it rasterises before the next frame.

## Drawing pictures

`src/vector.js` addresses the grid as a 160x100 bitmap through Braille
(U+2800-28FF is every combination of a 2x4 dot matrix). `DotCanvas` has `plot`
and `line`; `drawEdges` rotates, projects and draws a list of 3D segments.

The font need not carry any Braille: `src/bdf.js` synthesises all 256 patterns,
four arrows and six block elements for whatever cell size is loaded. Terminus
has none of them.

## The knobs

All of them are in [`config.js`](config.js), commented, with the range each was
tuned within. The values are the `sharp` preset.

| | |
| --- | --- |
| **beam** | `beam` spot sigma · `sharpen` peaking · `scanMin`/`scanMax` scanline thickness dark and lit · `decay` persistence |
| **bloom** | `threshold` cut-in · `bloomAmt` strength |
| **tube** | `fill` screen size · `curve` barrel · `glass` beyond the raster · `vignette` · `brightness` gun drive · `bg` unlit floor · `ambient` surround |
| **mask** | `maskAmt` grille depth · `maskPitch` device px per stripe · `chroma` misconvergence |
| **noise** | `noise` grain · `noiseStreak` 1 = film grain, higher = video · `snow` dropout specks · `flicker` · `roll` shutter bar · `rollSpeed` |

Also there: `PHOSPHORS` (five tints, `matrix` by default), `GRID` (80x25 and the
margins), `FONT`, and `RENDER` (supersampling, pixel budget, cursor).

Three constraints:

- `decay` is capped at 0.98. The beam pass is `max(total, prev * decay)`; at 1
  every lit pixel stays lit, above 1 the raster ramps to white.
- `beam` and the scanline widths are in *source* pixels, so the same values are a
  finer spot on a taller face.
- The faceplate is 4:3 whatever the grid is. The framebuffer is stretched onto
  it, so 80x25 in an 8x16 face is a 26% horizontal squash — as VGA text mode was
  on a 4:3 monitor.

## Fonts

Any BDF up to 16px wide. Point `FONT.regular` at it, and `FONT.bold` if the
family has one; without it `BOLD` is a one-pixel smear, as VGA did. `ITALIC`
falls back to roman — there is no synthetic italic, because shearing a 16-row
bitmap gives ragged diagonals.

Included: [Terminus](https://terminus-font.sourceforge.net/) 8x16, roman and
bold. Its bold has the same coverage as its roman, so it never falls back
mid-word.

## Layout

```
index.html     canvas, and the startup error message
main.js        entry point
config.js      every tunable value
program.js     what is on the screen
src/screen.js  font fetch, frame loop, keyboard
src/crt.js     the four shader passes
src/term.js    grid -> beam framebuffer
src/cellgrid.js  cell planes, attributes, scrollback
src/bdf.js     BDF parser, and the glyphs it synthesises
src/vector.js  Braille as a bitmap: DotCanvas, drawEdges
```

As a dependency: `import { mount } from 'cyberspace-crt'`, with the rest under
`cyberspace-crt/term`, `/crt`, `/bdf`, `/vector`.

## Licences

Code: MIT — see [LICENSE](LICENSE).

Fonts are not covered by it. Terminus Font is © 2014 Dimitar Toshkov Zhekov
under the SIL Open Font License 1.1 — [`fonts/OFL.txt`](fonts/OFL.txt).
