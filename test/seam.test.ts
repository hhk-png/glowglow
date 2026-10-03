// The incremental editor lexes one line at a time and stores tokens clipped at
// each newline. Everything downstream assumes that is equivalent to lexing the
// whole input at once. These two properties are the load-bearing ones:
//
//   1. segmenting line by line reproduces a whole-input lex split at newlines
//   2. that split colours exactly like the unsplit tokens
//
// If either breaks, the incremental engine silently mis-colours — so they are
// pinned here rather than left to the parity test alone.

import type { Frame, Token } from '../src/lexer'
import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { lex, lexSegment } from '../src/lexer'

/** Split every multi-line token at each '\n', keeping the newline on the left piece. */
function splitAtNewlines(src: string, toks: Token[]): Token[] {
  const out: Token[] = []
  for (const t of toks) {
    let s = t.start
    for (let i = t.start; i < t.end; i++) {
      if (src[i] === '\n') {
        out.push({ kind: t.kind, start: s, end: i + 1 })
        s = i + 1
      }
    }
    if (s < t.end)
      out.push({ kind: t.kind, start: s, end: t.end })
  }
  return out
}

/** Lex line by line, carrying the state across each newline — what the editor does. */
function lexLines(src: string): Token[] {
  const out: Token[] = []
  let state: readonly Frame[] = []
  let from = 0
  const run = (to: number) => {
    const r = lexSegment(src, from, to, state)
    out.push(...r.tokens)
    state = r.state
    from = to
  }
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n')
      run(i + 1)
  }
  if (from < src.length)
    run(src.length)
  return out
}

// One character per source byte, carrying the tag that colours it. Splitting a
// token changes its boundaries but must never change which tag covers a byte —
// that, not token identity, is the equivalence the editor relies on.
const TAG_CODE: Record<string, string> = {
  strong: 'K',
  b: 'I',
  em: 'S',
  sup: 'C',
  label: 'D',
  i: 'O',
}
function tagsOf(src: string, toks: Token[]): string {
  const out = Array.from({ length: src.length }).fill('.')
  for (const t of classify(src, toks)) {
    const code = t.tag ? TAG_CODE[t.tag]! : '.'
    for (let i = t.start; i < t.end; i++) out[i] = code
  }
  return out.join('')
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHA = [
  '<',
  '>',
  '/',
  '\\',
  '"',
  '\'',
  '`',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  '$',
  '@',
  '#',
  '-',
  '*',
  '=',
  '+',
  '!',
  '?',
  ':',
  ';',
  ',',
  '.',
  '0',
  'a',
  'b',
  'x',
  'Z',
  '_',
  ' ',
  '\t',
  '\n',
  '\r',
  '&',
  '|',
  '^',
  '~',
  'é',
  '中',
  '\r\n',
  '<!--',
  '-->',
  '/*',
  '*/',
  '//',
  '${',
  'f"',
  '"""',
  '0x',
  '--[[',
  ']]',
]

/** Lex each line as its OWN string (what the document does), not a slice of the whole. */
function lexPerLine(src: string): Token[] {
  const out: Token[] = []
  let state: readonly Frame[] = []
  let p = 0
  while (p < src.length || p === 0) {
    const nl = src.indexOf('\n', p)
    const end = nl === -1 ? src.length : nl + 1
    const line = src.slice(p, end)
    const run = lexSegment(line, 0, line.length, state, false)
    for (const t of run.tokens) out.push({ kind: t.kind, start: t.start + p, end: t.end + p })
    state = run.state
    if (end >= src.length)
      break
    p = end
  }
  return out
}

/** One character per source byte, carrying the token kind covering it. */
function kindsOf(src: string, toks: Token[]): string {
  const out = Array.from({ length: src.length }).fill('.')
  for (const t of toks) {
    for (let i = t.start; i < t.end; i++) out[i] = t.kind[0]!
  }
  return out.join('')
}

describe('segment lexing', () => {
  it('line-by-line equals a whole lex split at newlines', () => {
    const rnd = mulberry32(0x5EA5EED)
    for (let n = 0; n < 20000; n++) {
      const len = Math.floor(rnd() * 50)
      let src = ''
      for (let i = 0; i < len; i++)
        src += ALPHA[Math.floor(rnd() * ALPHA.length)]
      expect(lexLines(src)).toEqual(splitAtNewlines(src, lex(src)))
    }
  })

  it('lexing each line as its own string equals lex()', () => {
    const rnd = mulberry32(0x51EED)
    for (let n = 0; n < 20000; n++) {
      const len = Math.floor(rnd() * 50)
      let src = ''
      for (let i = 0; i < len; i++)
        src += ALPHA[Math.floor(rnd() * ALPHA.length)]
      const a = kindsOf(src, lexPerLine(src))
      const b = kindsOf(src, lex(src))
      if (a !== b) {
        throw new Error(`per-line differs: ${JSON.stringify(src)}
 got=${a}
want=${b}`)
      }
    }
  })

  it('a single whole-input segment equals lex()', () => {
    for (const src of ['', 'a', '/* x', '`${', '<div className="x">', 'a\n\nb']) {
      expect(lexSegment(src, 0, src.length, []).tokens).toEqual(lex(src))
    }
  })

  it('is resumable at every line boundary in a fixture', () => {
    const src = [
      'const re = /a/g',
      '/* block',
      '   spanning',
      '   lines */',
      'const t = `x ${',
      '  y + `${z}`',
      '}`',
      '<!-- html',
      'comment -->',
      '--[[ lua',
      ']]',
      '"""triple',
      'quote"""',
    ].join('\n')
    expect(lexLines(src)).toEqual(splitAtNewlines(src, lex(src)))
  })
})

describe('seam equivalence', () => {
  it('splitting at newlines never changes any tag', () => {
    const rnd = mulberry32(0xC0FFEE)
    for (let n = 0; n < 30000; n++) {
      const len = Math.floor(rnd() * 50)
      let src = ''
      for (let i = 0; i < len; i++)
        src += ALPHA[Math.floor(rnd() * ALPHA.length)]
      expect(tagsOf(src, splitAtNewlines(src, lex(src)))).toBe(tagsOf(src, lex(src)))
    }
  })
})
