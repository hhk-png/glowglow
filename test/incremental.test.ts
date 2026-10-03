// The glowglow/incremental entry is the engine taken apart: the pieces
// glowDocument() is built from, for callers who want to assemble them their own
// way. This pins that they are all actually reachable and compose.

import { describe, expect, it } from 'vitest'
import {
  classify,
  classifyWindow,
  countNames,
  decideRegions,
  detectRegions,
  esc,
  GlowDocument,
  glowDocument,
  lex,
  lexSegment,
  renderLine,
  sameState,
  tokenText,
} from '../src/incremental'

describe('glowglow/incremental', () => {
  const src = 'const a = <b>1</b>'
  const toks = lex(src)

  it('lexes, and resumes a segment from a carried state', () => {
    expect(toks.map(t => tokenText(src, t)).join('')).toBe(src)
    const head = lexSegment(src, 0, 6, [])
    const tail = lexSegment(src, 6, src.length, head.state)
    expect([...head.tokens, ...tail.tokens].map(t => tokenText(src, t)).join('')).toBe(src)
    expect(sameState(head.state, tail.state)).toBe(true)
  })

  it('classifies, and classifies a window against whole-document counts', () => {
    const counts = countNames(detectRegions(src, toks))
    const whole = classify(src, toks).map(t => t.tag)
    const windowed = classifyWindow(src, toks, counts, false, false).map(t => t.tag)
    expect(windowed).toEqual(whole)
    expect(decideRegions(detectRegions(src, toks), counts).length).toBeGreaterThan(0)
  })

  it('renders one line, escaping as it goes', () => {
    const line = 'a < b & c'
    const t = lex(line)
    const html = renderLine(line, t.map(x => ({ ...x, tag: 'i' })), 0, 0, line.length)
    expect(html).toContain('&lt;')
    expect(html).toContain('&amp;')
    expect(esc('<&>')).toBe('&lt;&amp;&gt;')
  })

  it('lays caller ranges over the output, splitting tokens', () => {
    const line = 'const answer = 42'
    const t = lex(line).map(x => ({ ...x, tag: 'b' }))
    const marked = renderLine(line, t, 0, 0, line.length, [{ from: 6, to: 12, cls: 'hit' }])
    // the mark sits *inside* the token's own tag, so its colour survives
    expect(marked).toContain('<b><mark class="hit">answer</mark></b>')
    // and marking changes no text: strip every tag and the line is back
    const back = marked.replace(/<\/?[a-z]+(?: class="[^"]*")?>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    expect(back).toBe(line)

    const doc = glowDocument('one two three')
    const patch = doc.setMarks([{ from: 4, to: 7, cls: 'hit' }])
    expect(patch.lines[0]).toContain('<mark class="hit">two</mark>')
    expect(doc.markRanges.length).toBe(1)
  })

  it('marks a line that does not start at offset 0', () => {
    // a regression guard: line-relative tokens against absolute marks silently
    // never intersect, so anything past the first line loses its highlight
    const doc = glowDocument('first line\nsecond line')
    const at = doc.value.indexOf('second')
    doc.setMarks([{ from: at, to: at + 6, cls: 'hit' }])
    expect(doc.line(1)).toContain('<mark class="hit">second</mark>')
    expect(doc.line(0)).not.toContain('<mark')
    const patch = doc.setMarks([{ from: at, to: at + 6, cls: 'hit' }])
    expect(patch.startLine).toBe(1)
  })

  it('keeps marks on their text across an edit', () => {
    const doc = glowDocument('one two three')
    doc.setMarks([{ from: 4, to: 7, cls: 'hit' }])
    doc.update(0, 0, 'XX') // an edit before the mark shifts it
    expect(doc.value).toBe('XXone two three')
    expect(doc.line(0)).toContain('<mark class="hit">two</mark>')
    // an edit inside the mark grows it rather than losing it
    doc.update(5, 5, '-')
    expect(doc.line(0)).toContain('two')
  })

  it('hands out the document class itself, not just the factory', () => {
    const doc = glowDocument('one')
    expect(doc).toBeInstanceOf(GlowDocument)
    expect(doc.update(3, 3, '\ntwo').lines.length).toBeGreaterThan(0)
    expect(doc.lineCount).toBe(2)
  })
})
