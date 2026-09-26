import { expect, it } from 'vitest'
import { glow } from '../src/index'
import { lex } from '../src/lexer'

// how many random sources the invariant check walks
const ITERATIONS = 20000

// deterministic PRNG so a failure is reproducible
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHA = [...'<>/\\"\'`{}()[]$@#-*=+!?:;,.0abxZ_ \t\n\r&|^~é中', '\r\n', '<!--', '-->', '/*', '*/', '//', '${', 'f"', '"""', '0x']

function unesc(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}
function stripTags(html: string): string {
  return unesc(html.replace(/<\/?[a-z]+>/g, '').replace(/^<code[^>]*>/, '').replace(/<\/code>$/, ''))
}
function normalize(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[0] === '') lines.shift()
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

it('invariant: tokens are contiguous, in-bounds and cover the whole source', () => {
  const rnd = mulberry32(0xC0FFEE)
  const failures: string[] = []
  let checked = 0

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const len = Math.floor(rnd() * 40)
    let src = ''
    for (let k = 0; k < len; k++) src += ALPHA[Math.floor(rnd() * ALPHA.length)]

    const toks = lex(src)
    checked++

    if (toks.length && toks[0]!.start !== 0)
      failures.push(`first token does not start at 0: ${JSON.stringify(src)}`)
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!
      if (t.start < 0 || t.end > src.length || t.start >= t.end) {
        failures.push(`out of bounds token ${JSON.stringify(t)} for ${JSON.stringify(src)}`)
      }
      if (i > 0 && toks[i - 1]!.end !== t.start) {
        failures.push(`gap/overlap at ${i} for ${JSON.stringify(src)}`)
      }
    }
    if (toks.length) {
      if (toks[toks.length - 1]!.end !== src.length)
        failures.push(`last token does not reach end: ${JSON.stringify(src)}`)
    }
    else if (src.length > 0) {
      failures.push(`empty token list for non-empty source ${JSON.stringify(src)}`)
    }

    // the property the deleted code used to backstop: no text may be dropped
    const expected = normalize(src)
    let got: string
    try {
      got = stripTags(glow(src))
    }
    catch (e) {
      failures.push(`glow threw on ${JSON.stringify(src)}: ${String(e)}`)
      continue
    }
    if (got !== expected) {
      failures.push(`text loss/gain: ${JSON.stringify(src)} -> ${JSON.stringify(got)}`)
    }
  }

  // Reports every counter-example at once rather than stopping at the first,
  // and the count assertion guards against the loop silently not running.
  expect(failures).toEqual([])
  expect(checked).toBe(ITERATIONS)
})
