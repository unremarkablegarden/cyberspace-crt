// The program on the screen.
//
// Optional hooks, each called with the Screen:
//
//   init(s)        once, before the first frame
//   frame(s, t)    every frame; t is seconds since start
//   key(s, e)      KeyboardEvent (keyUp likewise)
//
// s.term is the grid: put/text/write/writeln, the attribute constants, an
// inverse plane, a scrollback. Writing marks the grid dirty; it rasterises
// before the next frame.

import { NORMAL, BRIGHT, BOLD, DIM, MUTED, FAINT, BG } from './src/term.js'
import { DotCanvas, drawEdges } from './src/vector.js'
import { PHOSPHORS } from './config.js'

// --- box drawing ----------------------------------------------------------

const BOX = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }

function frame(term, x, y, w, h, attr = NORMAL) {
  term.put(x, y, BOX.tl, attr)
  term.put(x + w - 1, y, BOX.tr, attr)
  term.put(x, y + h - 1, BOX.bl, attr)
  term.put(x + w - 1, y + h - 1, BOX.br, attr)
  for (let i = 1; i < w - 1; i++) {
    term.put(x + i, y, BOX.h, attr)
    term.put(x + i, y + h - 1, BOX.h, attr)
  }
  for (let j = 1; j < h - 1; j++) {
    term.put(x, y + j, BOX.v, attr)
    term.put(x + w - 1, y + j, BOX.v, attr)
  }
}

/** A title written over the top rule. */
function label(term, x, y, text, attr = NORMAL) {
  term.text(x, y, ` ${text} `, attr)
}

function blank(term, x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) term.put(x + i, y + j, ' ')
}

// --- model ----------------------------------------------------------------
// A cube, as twelve line segments.

const V = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
]

const CUBE = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
].map(([a, b]) => [V[a], V[b]])

// --- layout ---------------------------------------------------------------

const PANEL = { x: 1, y: 2, w: 47, h: 19 }
const SIDE = { x: 49, y: 2, w: 30, h: 19 }

const TYPED = 'The framebuffer holds beam intensity, not colour: one byte per '
  + 'pixel saying how hard the gun hit that spot. Colour is a vec3 in the last pass.'

/** Greedy word wrap. */
function wrap(str, width) {
  const out = ['']
  for (const word of str.split(' ')) {
    const i = out.length - 1
    if (!out[i]) out[i] = word
    else if (out[i].length + 1 + word.length <= width) out[i] += ' ' + word
    else out.push(word)
  }
  return out
}

const LINES = wrap(TYPED, 76)

const PHOSPHOR_NAMES = Object.keys(PHOSPHORS)

export default {
  init(s) {
    const { term } = s

    this.dots = new DotCanvas(term, PANEL.w - 2, PANEL.h - 2)
    this.spin = true
    this.typed = 0
    this.phosphor = 0

    // Title bar. Inverse is a plane of its own, not an attribute: put()'s last
    // argument.
    for (let x = 0; x < term.cols; x++) term.put(x, 0, ' ', NORMAL, 1)
    term.text(2, 0, 'CYBERSPACE-CRT', BOLD, 1)
    term.text(18, 0, 'a WebGL2 tube with a text grid behind it', NORMAL, 1)

    frame(term, PANEL.x, PANEL.y, PANEL.w, PANEL.h, MUTED)
    label(term, PANEL.x + 2, PANEL.y, 'VECTOR', NORMAL)

    frame(term, SIDE.x, SIDE.y, SIDE.w, SIDE.h, MUTED)
    label(term, SIDE.x + 2, SIDE.y, 'BEAM LEVELS', NORMAL)

    const rows = [
      ['BRIGHT', BRIGHT], ['NORMAL', NORMAL], ['BOLD', BOLD],
      ['MUTED', MUTED], ['DIM', DIM], ['FAINT (fill only)', FAINT],
    ]
    rows.forEach(([name, attr], i) => {
      const y = SIDE.y + 2 + i
      term.text(SIDE.x + 2, y, name.padEnd(18), attr)
      term.text(SIDE.x + 21, y, '█████', attr)
    })

    // Inverse swaps stroke and field. BG raises the field only.
    term.text(SIDE.x + 2, SIDE.y + 9, ' INVERSE ', NORMAL, 1)
    term.text(SIDE.x + 12, SIDE.y + 9, ' ')
    for (let i = 0; i < 15; i++) term.put(SIDE.x + 13 + i, SIDE.y + 9, ' ', BG)
    term.text(SIDE.x + 14, SIDE.y + 9, 'BG ground', BG)

    term.text(SIDE.x + 2, SIDE.y + 11, 'PHOSPHOR', MUTED)
    this.drawPhosphors(s)

    term.text(SIDE.x + 2, SIDE.y + 14, '1-5  colour', DIM)
    term.text(SIDE.x + 2, SIDE.y + 15, 'SPC  hold the cube', DIM)

    // Bottom rule and hint row.
    for (let x = 0; x < term.cols; x++) term.put(x, 21, '─', MUTED)
    term.text(2, 24, 'config.js', BRIGHT)
    term.text(12, 24, 'holds every knob    ', MUTED)
    term.text(32, 24, 'program.js', BRIGHT)
    term.text(43, 24, 'holds this screen', MUTED)
  },

  drawPhosphors(s) {
    const { term } = s
    PHOSPHOR_NAMES.forEach((name, i) => {
      const on = i === this.phosphor
      term.text(SIDE.x + 2 + i * 5, SIDE.y + 12, ` ${i + 1} `, on ? BRIGHT : DIM, on ? 1 : 0)
    })
    term.text(SIDE.x + 2, SIDE.y + 13, PHOSPHOR_NAMES[this.phosphor].padEnd(20), MUTED)
  },

  frame(s, t) {
    const { term } = s

    // Redrawn each frame. blit() skips empty cells, so the box around it
    // survives.
    if (this.spin) this.angle = t
    const dc = this.dots
    dc.clear()
    drawEdges(dc, CUBE, {
      yaw: this.angle ?? 0,
      pitch: 0.42 + Math.sin((this.angle ?? 0) * 0.7) * 0.22,
      scale: 22,
      ox: dc.w / 2,
      oy: dc.h / 2,
      focal: 6,
    })
    blank(term, PANEL.x + 1, PANEL.y + 1, PANEL.w - 2, PANEL.h - 2)
    dc.blit(term, NORMAL, PANEL.x + 1, PANEL.y + 1)

    // Typewriter, 24 characters a second, two rows, looping.
    const want = Math.floor(t * 24) % (TYPED.length + 60)
    if (want !== this.typed) {
      this.typed = want
      let left = want
      for (let row = 0; row < 2; row++) {
        const line = LINES[row] ?? ''
        const n = Math.max(0, Math.min(left, line.length))
        term.text(2, 22 + row, line.slice(0, n).padEnd(76), row === 0 ? NORMAL : MUTED)
        left -= line.length
      }
    }
  },

  key(s, e) {
    if (e.key === ' ') {
      this.spin = !this.spin
      e.preventDefault()
      return
    }
    const n = Number(e.key)
    if (n >= 1 && n <= PHOSPHOR_NAMES.length) {
      this.phosphor = n - 1
      s.setPhosphor(PHOSPHOR_NAMES[this.phosphor])
      this.drawPhosphors(s)
    }
  },
}
