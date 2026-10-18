import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Glow } from '../src'

describe('glow', () => {
  it('renders highlighted semantic markup', () => {
    const html = renderToStaticMarkup(createElement(Glow, { code: 'const answer = 42' }))
    expect(html).toContain('<code>')
    expect(html).toContain('<strong>const</strong>')
    expect(html).toContain('<em>42</em>')
  })

  it('writes the language attribute', () => {
    const html = renderToStaticMarkup(createElement(Glow, { code: 'x', language: 'ts' }))
    expect(html).toContain('language="ts"')
  })

  it('renders as another element', () => {
    const html = renderToStaticMarkup(createElement(Glow, { as: 'pre', code: 'x' }))
    expect(html.startsWith('<pre')).toBe(true)
  })

  it('numbers lines', () => {
    const html = renderToStaticMarkup(createElement(Glow, { code: 'a\nb', numbered: true }))
    expect(html.match(/class="glow-line"/g)).toHaveLength(2)
  })
})
