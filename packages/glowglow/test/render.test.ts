import { describe, expect, it } from 'vitest'
import { renderLine } from '../src/render'

describe('renderLine marks', () => {
  const src = 'abcdef'
  const tokens = [{ start: 0, end: 6, tag: 'b' }]

  it('splits a token around a mark and keeps the token tag', () => {
    const html = renderLine(src, tokens, 0, 0, 6, [{ from: 2, to: 4, tag: 'u' }])
    expect(html).toBe('<b>ab<u>cd</u>ef</b>')
  })

  it('uses the default mark wrapper and an optional class', () => {
    expect(renderLine(src, tokens, 0, 0, 6, [{ from: 2, to: 4 }]))
      .toBe('<b>ab<mark>cd</mark>ef</b>')
    expect(renderLine(src, tokens, 0, 0, 6, [{ from: 2, to: 4, cls: 'hit' }]))
      .toBe('<b>ab<mark class="hit">cd</mark>ef</b>')
  })

  it('skips a mark that has no visible span left', () => {
    // the second mark is already consumed by the first one
    const html = renderLine(src, tokens, 0, 0, 6, [
      { from: 2, to: 4 },
      { from: 3, to: 3 },
    ])
    expect(html).toBe('<b>ab<mark>cd</mark>ef</b>')
  })
})
