// Measures the built bundle. Run with `pnpm bench` (builds first, so it always
// measures current source).
//
// The size ladder is the point. Rendering used to be quadratic in the line
// count — renderLine restarted at the head of the token array for every line —
// which cost 21 s on a 20000-line file and 5 s on a 10000-line one, while 100
// lines looked perfectly fine. Watch the us/line column: it should stay flat
// across the ladder, and roughly double if the cost per line doubles with size.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { glow, glowDocument } from '../dist/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// real code, repeated to reach a target line count
const sample = readFileSync(join(root, 'preview/samples/typescript.ts'), 'utf8')
const sampleLines = sample.replace(/\r\n?/g, '\n').split('\n')

function code(lines) {
  const out = []
  while (out.length < lines)
    out.push(...sampleLines)
  return out.slice(0, lines).join('\n')
}

/** Median of `runs` timings, after a warm-up, in milliseconds. */
function median(fn, runs = 15) {
  fn()
  const times = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

function table(title, columns, rows) {
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)))
  const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ')
  process.stdout.write(`\n${title}\n${line(columns)}\n${widths.map(w => '-'.repeat(w)).join('  ')}\n`)
  for (const r of rows)
    process.stdout.write(`${line(r)}\n`)
}

const SIZES = [100, 1000, 5000, 10000, 20000]

table(
  'glow() — real code (preview/samples/typescript.ts)',
  ['lines', 'chars', 'median', 'us/line'],
  SIZES.map((n) => {
    const src = code(n)
    const ms = median(() => glow(src))
    return [n, src.length, `${ms.toFixed(2)}ms`, (ms / n * 1000).toFixed(1)]
  }),
)

// inputs chosen to starve the tokenizer's terminator scans
const ADVERSARIAL = [
  ['8000 unclosed "<"', '<a '.repeat(8000)],
  ['8000 "</"', '</a '.repeat(8000)],
  ['8000 unterminated strings', 'x = "abc\n'.repeat(8000)],
  ['4000 nested templates', '`${'.repeat(4000)],
  ['8000 tag pairs', '<p>hi</p> '.repeat(8000)],
  ['one 56k-char line', 'x = 1; '.repeat(8000)],
  ['8000 json keys', '{ "key": 1, '.repeat(8000)],
]

table(
  'glow() — adversarial input',
  ['case', 'chars', 'median', 'us/char'],
  ADVERSARIAL.map(([name, src]) => {
    const ms = median(() => glow(src))
    return [name, src.length, `${ms.toFixed(2)}ms`, (ms / src.length * 1000).toFixed(3)]
  }),
)

// The point of the incremental engine: editing one line must not cost O(file).
// A keystroke is one insert + one delete at the same offset. Watch the us/edit
// column — it should stay far below the `glow()` column above for the same size,
// and the patch should stay a line or two regardless of the ladder.
const EDITS = 2000

table(
  'glowDocument() — one keystroke (insert then delete)',
  ['lines', 'chars', 'median edit', 'avg patch', 'vs glow()'],
  SIZES.map((n) => {
    const src = code(n)
    const fullMs = median(() => glow(src))
    const doc = glowDocument(src)
    const at = Math.floor(src.length / 2)
    for (let i = 0; i < 100; i++) {
      doc.update(at, at, 'x')
      doc.update(at, at + 1, '')
    }
    let patch = 0
    const ms = median(() => {
      patch = 0
      for (let i = 0; i < EDITS; i++) {
        patch += doc.update(at, at, 'x').lines.length
        doc.update(at, at + 1, '')
      }
    }, 5)
    const perEdit = ms / (EDITS * 2)
    return [
      n,
      src.length,
      `${(perEdit * 1000).toFixed(1)}us`,
      (patch / EDITS).toFixed(1),
      `${(perEdit / fullMs * 100).toFixed(1)}%`,
    ]
  }),
)

process.stdout.write('\n')
