// The incremental lexer must agree, byte for byte, with lexing the whole text
// at once after any sequence of edits. This fuzzes random edits and compares the
// per-character token kind, which is what everything downstream reads.

import type { GlowDocument } from '../src/document'
import type { Kind } from '../src/lexer'
import { describe, expect, it } from 'vitest'
import { glowDocument } from '../src/document'
import { lex } from '../src/lexer'

const KIND: Record<Kind, string> = {
  comment: 'C',
  str: 'S',
  word: 'w',
  num: 'n',
  op: 'o',
  decor: 'd',
  ws: ' ',
}

function wholeKindMap(src: string): string {
  const out = Array.from({ length: src.length }).fill('.')
  for (const t of lex(src)) {
    for (let i = t.start; i < t.end; i++) out[i] = KIND[t.kind]
  }
  return out.join('')
}

function docKindMap(doc: GlowDocument): string {
  const n = doc.value.length
  const out = Array.from({ length: n }).fill('.')
  for (let i = 0; i < doc.lineCount; i++) {
    for (const t of doc.lineTokens(i)) {
      // a token outside the text would mean a stale line offset — catch it here
      if (t.start < 0 || t.end > n || t.start >= t.end)
        throw new Error(`token ${t.kind} [${t.start},${t.end}) outside 0..${n}`)
      for (let k = t.start; k < t.end; k++) out[k] = KIND[t.kind]
    }
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

// fragments biased to open and close the constructs that span lines
const ALPHA = [
  'a',
  'b',
  'x',
  ' ',
  '\t',
  '\n',
  '\r\n',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  '=',
  ',',
  '"',
  '\'',
  '`',
  '\\',
  '/*',
  '*/',
  '//',
  '<!--',
  '-->',
  '--[[',
  ']]',
  '${',
  '"""',
  '\'\'\'',
  'f"',
  '$"',
  '@x',
  '0x1f',
  'ré',
  '中',
]

function randomEdit(rnd: () => number, len: number): { from: number, to: number, insert: string } {
  const from = Math.floor(rnd() * (len + 1))
  const maxDel = Math.min(len - from, 6)
  const to = from + Math.floor(rnd() * (maxDel + 1))
  const n = Math.floor(rnd() * 5)
  let insert = ''
  for (let i = 0; i < n; i++)
    insert += ALPHA[Math.floor(rnd() * ALPHA.length)]
  return { from, to, insert }
}

function check(seed: number, iterations: number, start: string): void {
  const rnd = mulberry32(seed)
  const doc = glowDocument(start)
  let shadow = start
  for (let n = 0; n < iterations; n++) {
    const { from, to, insert } = randomEdit(rnd, shadow.length)
    doc.update(from, to, insert)
    shadow = shadow.slice(0, from) + insert + shadow.slice(to)
    expect(doc.value).toBe(shadow)
    expect(doc.lineCount).toBe(shadow.split('\n').length)
    expect(docKindMap(doc)).toBe(wholeKindMap(shadow))
  }
}

describe('incremental document', () => {
  it('matches a whole lex after random edits on real-ish code', () => {
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
      'function f(a) { return a < b && c > d }',
    ].join('\n')
    check(0x1234, 4000, src)
  })

  it('matches a whole lex after random edits on adversarial text', () => {
    const rnd = mulberry32(0xBEEF)
    const starts = ['', 'a', '\n', '/*', '`${', '"', '<p>hi</p>', '<!--', '--[[', 'f"x{', '\'\'\'']
    for (const start of starts) {
      for (let k = 0; k < 200; k++) {
        const { from, to, insert } = randomEdit(rnd, start.length)
        const doc = glowDocument(start)
        doc.update(from, to, insert)
        const shadow = start.slice(0, from) + insert + start.slice(to)
        expect(doc.value).toBe(shadow)
        const a = docKindMap(doc)
        const b = wholeKindMap(shadow)
        if (a !== b) {
          let at = 0
          while (at < a.length && a[at] === b[at]) at++
          const lines: string[] = []
          for (let i = 0; i < doc.lineCount; i++) lines.push(`${doc.lineStart(i)}:${doc.lineTokens(i).map(t => `${t.kind + t.start}-${t.end}`).join(',')}`)
          throw new Error(`MISMATCH prev=${JSON.stringify((doc as any).__prev)} prevStarts=${(doc as any).__prevStarts} k=${k} from=${from} to=${to} insert=${JSON.stringify(insert)} at=${at} text=${JSON.stringify(shadow)}
 got=${a}
want=${b}
lines=${lines.join(' | ')}`)
        }
      }
    }
  })

  it('counts a trailing newline as its own empty line', () => {
    const cases: Array<[string, number]> = [['', 1], ['a', 1], ['a\n', 2], ['\n', 2], ['a\nb', 2], ['a\n\n', 3]]
    for (const [text, lines] of cases) {
      const doc = glowDocument(text)
      expect(doc.lineCount).toBe(lines)
      // the lines read back into exactly the source
      const back = Array.from({ length: doc.lineCount }, (_, i) => doc.lineText(i)).join('\n')
      expect(back).toBe(text)
      if (text === '' || text.endsWith('\n'))
        expect(doc.line(doc.lineCount - 1)).toBe('')
    }
  })

  it('reuses the tail — a one-line edit does not re-lex the file', () => {
    const src = Array.from({ length: 2000 }, (_, i) => `const v${i} = ${i} + f(x)`).join('\n')
    const doc = glowDocument(src)
    const edit = doc.update(5, 5, 'z')
    // the edit is on line 0 and changes no cross-line state, so only line 0 is dirty
    expect(edit.startLine).toBe(0)
    expect(edit.lines.length).toBe(1)
    expect(edit.removed).toBe(1) // line 0 is replaced; nothing else is touched
    expect(edit.full).toBe(false)
    expect(doc.lineCount).toBe(2000)
  })

  it('follows an unterminated block comment across a later edit', () => {
    const doc = glowDocument('a = 1\nb = 2\nc = 3')
    // open a block comment on line 0; everything after is comment now
    doc.update(1, 1, '/*')
    expect(docKindMap(doc)).toBe(wholeKindMap(doc.value))
    expect(wholeKindMap(doc.value).slice(2)).toMatch(/^C+$/)
    // close it again
    doc.update(doc.value.length, doc.value.length, '\n*/ x')
    expect(docKindMap(doc)).toBe(wholeKindMap(doc.value))
  })
})
