// After any edit, the document's per-line colour tags must equal what a full
// classify of the reconstructed text produces — the incremental colouring is
// exact, not approximate.

import type { GlowDocument } from '../src/document'
import type { Token } from '../src/lexer'
import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { glowDocument } from '../src/document'

/** Tag every token of the document by classifying the whole thing at once. */
function truthTags(doc: GlowDocument): (string | null)[][] {
  const flat: Token[] = []
  const counts: number[] = []
  for (let i = 0; i < doc.lineCount; i++) {
    const ts = doc.lineTokens(i)
    counts.push(ts.length)
    flat.push(...ts)
  }
  const tagged = classify(doc.value, flat)
  const out: (string | null)[][] = []
  let k = 0
  for (const n of counts) {
    const line: (string | null)[] = []
    for (let j = 0; j < n; j++) line.push(tagged[k++]!.tag)
    out.push(line)
  }
  return out
}

function checkTags(doc: GlowDocument): void {
  const want = truthTags(doc)
  const got = Array.from({ length: doc.lineCount }, (_, i) => doc.lineTags(i))
  expect(got).toEqual(want)
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
  '<div>',
  '</div>',
  '<Foo>',
  '</Foo>',
  '<p>',
  '</p>',
  '<br/>',
  'hi',
  '<span ',
]

function fuzz(seed: number, iterations: number, start: string): void {
  const rnd = mulberry32(seed)
  const doc = glowDocument(start)
  let shadow = start
  for (let k = 0; k < iterations; k++) {
    const from = Math.floor(rnd() * (shadow.length + 1))
    const maxDel = Math.min(shadow.length - from, 5)
    const to = from + Math.floor(rnd() * (maxDel + 1))
    const nIns = Math.floor(rnd() * 4)
    let insert = ''
    for (let i = 0; i < nIns; i++)
      insert += ALPHA[Math.floor(rnd() * ALPHA.length)]
    doc.update(from, to, insert)
    shadow = shadow.slice(0, from) + insert + shadow.slice(to)
    expect(doc.value).toBe(shadow)
    checkTags(doc)
  }
}

describe('incremental colouring', () => {
  it('matches a full classify across edits on markup-heavy text', () => {
    const src = [
      '<div class="a">',
      '  <p>Hello world</p>',
      '  <span id="x">text</span>',
      '</div>',
      'const x = { "key": 1 }',
    ].join('\n')
    fuzz(0x9E1, 8000, src)
  })

  it('matches when an unpaired element becomes paired', () => {
    const doc = glowDocument('<Foo>hi')
    doc.update(doc.value.length, doc.value.length, '</Foo>')
    checkTags(doc)
  })

  it('matches when a pair breaks apart', () => {
    const doc = glowDocument('<Foo>hi</Foo> tail')
    const at = doc.value.indexOf('</Foo>')
    doc.update(at, at + 6, '')
    checkTags(doc)
  })

  it('handles prose repaint when a far pair flips', () => {
    const doc = glowDocument('<Foo>\nplain words here\ntail\n</Foo>')
    checkTags(doc)
    doc.update(doc.value.length, doc.value.length, '\nmore')
    checkTags(doc)
  })

  it('matches across adversarial text', () => {
    const rnd = mulberry32(0xABCD)
    for (const start of ['', '<a>', '<Foo></Foo>', '{ "k": 1 }', '<p>hi</p>', '<Foo>', '<br/>']) {
      const doc = glowDocument(start)
      let shadow = start
      for (let k = 0; k < 800; k++) {
        const from = Math.floor(rnd() * (shadow.length + 1))
        const maxDel = Math.min(shadow.length - from, 5)
        const to = from + Math.floor(rnd() * (maxDel + 1))
        const nIns = Math.floor(rnd() * 4)
        let insert = ''
        for (let i = 0; i < nIns; i++)
          insert += ALPHA[Math.floor(rnd() * ALPHA.length)]
        doc.update(from, to, insert)
        shadow = shadow.slice(0, from) + insert + shadow.slice(to)
        expect(doc.value).toBe(shadow)
        checkTags(doc)
      }
    }
  })
})
