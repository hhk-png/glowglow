/*
  glowglow — universal, language-free syntax highlighting.

  Usage:
    glow(code)
    glow(code, { numbered: true })
    glow(['line 1', 'line 2'])
    glow(code, { language: 'ts' })   // language only annotates <code>; never affects the engine

  The engine is deliberately single-rule and language agnostic: it never guesses
  the language and it never needs one. Comments, strings, templates, numbers,
  keywords, identifiers, decorators and (real) HTML/JSX tags are all recognised
  structurally.

  Colours reuse the existing tag vocabulary so the bundled css/ themes apply
  unchanged: keywords <strong>, identifiers <b>, strings/numbers <em>, comments
  <sup>, decorators <label>, operators/brackets <i>.
*/

import { classify } from './classify'
import { lex } from './lexer'
import type { ClassifiedToken } from './classify'

export interface GlowOptions {
  /** Metadata only — written to the output <code language="…">, never read by the engine. */
  language?: string
  /** Wrap each line in a <span> so css/syntax.css can show line numbers. */
  numbered?: boolean
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderLine(src: string, toks: ClassifiedToken[], ls: number, le: number): string {
  const out: string[] = []
  let cursor = ls
  for (const t of toks) {
    if (t.end <= ls) continue
    if (t.start >= le) break
    const s = Math.max(ls, t.start)
    const e = Math.min(le, t.end)
    if (s > cursor) {
      out.push(esc(src.slice(cursor, s)))
      cursor = s
    }
    if (s < e) {
      const inner = src.slice(s, e)
      out.push(t.tag ? `<${t.tag}>${esc(inner)}</${t.tag}>` : esc(inner))
      cursor = e
    }
  }
  if (cursor < le) out.push(esc(src.slice(cursor, le)))
  return out.join('')
}

export function glow(input: string | readonly string[], opts: GlowOptions = {}): string {
  const raw = Array.isArray(input) ? input.join('\n') : String(input)
  const text = raw.replace(/\r\n?/g, '\n')

  const lines = text.split('\n')
  while (lines.length && lines[0] === '') lines.shift()
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (!lines.length) return ''

  const src = lines.join('\n')
  const toks = classify(src, lex(src))

  const out: string[] = []
  let offset = 0
  for (const line of lines) {
    const ls = offset
    const le = ls + line.length
    const rendered = renderLine(src, toks, ls, le)
    out.push(opts.numbered ? `<span>${rendered}</span>` : rendered)
    offset = le + 1 // skip the '\n'
  }

  const lang = opts.language ? ` language="${opts.language.replace(/"/g, '&quot;')}"` : ''
  return `<code${lang}>${out.join('\n')}</code>`
}
