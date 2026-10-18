import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { Glow } from '../src'

describe('glow', () => {
  it('renders highlighted semantic markup', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(Glow, { code: 'const answer = 42' }),
    }))
    expect(html).toContain('<code')
    expect(html).toContain('<strong>const</strong>')
    expect(html).toContain('<em>42</em>')
  })

  it('writes the language attribute', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(Glow, { code: 'x', language: 'ts' }),
    }))
    expect(html).toContain('language="ts"')
  })

  it('renders as another element', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(Glow, { as: 'pre', code: 'x' }),
    }))
    expect(html.startsWith('<pre')).toBe(true)
  })

  it('numbers lines', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(Glow, { code: 'a\nb', numbered: true }),
    }))
    expect(html.match(/class="glow-line"/g)).toHaveLength(2)
  })
})
