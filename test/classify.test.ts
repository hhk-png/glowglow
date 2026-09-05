import { describe, expect, test } from 'vitest'
import { classify } from '../src/classify'
import { lex } from '../src/lexer'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** render the whole src the way the renderer would, for assertions on <b>/<strong>/… */
function html(src: string): string {
  const toks = classify(src, lex(src))
  let out = ''
  let cursor = 0
  for (const t of toks) {
    if (t.start < cursor) throw new Error('overlapping tokens')
    if (t.start > cursor) out += esc(src.slice(cursor, t.start))
    const txt = src.slice(t.start, t.end)
    out += t.tag ? `<${t.tag}>${esc(txt)}</${t.tag}>` : esc(txt)
    cursor = t.end
  }
  if (cursor < src.length) out += esc(src.slice(cursor))
  return out
}

describe('classify — semantic colour tags', () => {
  test('keywords -> strong, other identifiers -> b', () => {
    expect(html('const x = payload')).toContain('<strong>const</strong>')
    expect(html('const x = payload')).toContain('<b>payload</b>')
  })

  test('property access after a dot stays a plain identifier', () => {
    expect(html('a.type')).toContain('<b>type</b>')
    expect(html('a.type')).not.toContain('<strong>type</strong>')
  })

  test('atomic kinds map to the fixed tag vocabulary', () => {
    const h = html('x = 1 // c') // word b, op i, num em, comment sup
    expect(h).toContain('<b>x</b>')
    expect(h).toContain('<i>=</i>')
    expect(h).toContain('<em>1</em>')
    expect(h).toContain('<sup>// c</sup>')
    expect(html('@dec')).toContain('<label>@dec</label>')
  })

  test('markup: known html tag is a tag even without a close', () => {
    const h = html('<div class="x">')
    expect(h).toContain('<strong>div</strong>')
    expect(h).toContain('<b>class</b>')
    expect(h).toContain('<em>"</em>')
  })

  test('markup: self-closing unknown element is a tag', () => {
    expect(html('<Foo />')).toContain('<strong>Foo</strong>')
  })

  test('markup: unmatched custom element is NOT a tag', () => {
    expect(html('<Foo>')).not.toContain('<strong>Foo</strong>')
  })

  test('markup: matched pair promotes an unknown element to a tag', () => {
    const h = html('<Foo>hi</Foo>')
    // both the opener and the closer names become <strong>
    expect(h.split('<strong>Foo</strong>').length - 1).toBe(2)
    expect(h).toContain('>hi<')
  })

  test('ts generic Foo<T> is never promoted to markup', () => {
    const h = html('const v = Foo<T>')
    expect(h).not.toContain('<strong>Foo</strong>')
    expect(h).not.toContain('<strong>T</strong>')
  })

  test('comparisons stay operators + identifiers', () => {
    const h = html('if (a < b)')
    expect(h).not.toContain('<strong>a')
    expect(h).not.toContain('<strong>b')
    expect(h).toContain('<i>&lt;</i>')
  })

  test('prose between matched tags is left uncoloured; code between braces is not', () => {
    const tag = html('<p>Hello</p>')
    // tag name strong, prose plain
    expect(tag).toContain('<strong>p</strong>')
    expect(tag).toContain('>Hello<')
    expect(tag).not.toContain('<b>Hello</b>')
    // JSX expression region keeps code colours, so the brace gap is not prose
    const jsx = html('<Comp a={x} b={y} />')
    expect(jsx).toContain('<b>x</b>')
    expect(jsx).toContain('<b>y</b>')
    expect(jsx).toContain('<strong>Comp</strong>')
  })
})
