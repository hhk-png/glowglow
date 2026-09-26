/*
  glowglow — universal, language-free syntax highlighting.

  The engine never guesses the language and never needs one: comments, strings,
  templates, numbers, keywords, identifiers, decorators and real HTML/JSX tags
  are recognised structurally.

  Tags match the bundled css/ vocabulary: keywords <strong>, identifiers <b>,
  strings/numbers <em>, comments <sup>, decorators <label>, ops <i>.

  glow() normalises CRLF and drops blank leading/trailing lines. Callers that
  need to map their own offsets into the output should use glowSource() rather
  than re-deriving that.
*/

import type { ClassifiedToken } from './classify'
import { classify } from './classify'
import { lex } from './lexer'

export interface GlowOptions {
  /** Metadata only — written to the output <code language="…">, never read by the engine. */
  language?: string
  /** Wrap each line in a <span class="glow-line"> so css/syntax.css can show line numbers. */
  numbered?: boolean
}

/** What `glow()` renders for a given input, and where the input's characters went. */
export interface GlowSource {
  /** The exact text the rendered markup contains, in document order. */
  text: string
  /** Map an offset in the original input to the matching offset in `text`, clamped to its length. */
  offset: (inputOffset: number) => number
}

function toRaw(input: string | readonly string[]): string {
  return Array.isArray(input) ? input.join('\n') : String(input)
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// lex() emits contiguous tokens that cover the whole source, so every byte of a
// line belongs to exactly one token — nothing to fill in, nothing left over.
function renderLine(src: string, toks: ClassifiedToken[], ls: number, le: number): string {
  const out: string[] = []
  for (const t of toks) {
    if (t.end <= ls)
      continue
    if (t.start >= le)
      break
    const s = Math.max(ls, t.start)
    const e = Math.min(le, t.end)
    if (s < e) {
      const inner = src.slice(s, e)
      out.push(t.tag ? `<${t.tag}>${esc(inner)}</${t.tag}>` : esc(inner))
    }
  }
  return out.join('')
}

/** Normalise CRLF and drop blank leading/trailing lines. */
function prepare(raw: string): { text: string, shift: number } {
  const normalized = raw.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  let shift = 0
  while (lines.length && lines[0] === '') {
    lines.shift()
    shift += 1
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return { text: lines.join('\n'), shift }
}

/** The markup inside a <code> element — no wrapper. */
function render(text: string, opts: GlowOptions): string {
  if (!text) {
    return ''
  }

  const toks = classify(text, lex(text))
  const out: string[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    const ls = offset
    const le = ls + line.length
    const rendered = renderLine(text, toks, ls, le)
    out.push(opts.numbered ? `<span class="glow-line">${rendered}</span>` : rendered)
    offset = le + 1 // skip the '\n'
  }
  return out.join('\n')
}

/**
 * The markup that belongs *inside* a `<code>` element — for when you already own
 * the element and want to keep its attributes.
 *
 *     el.innerHTML = glowInner(code)
 */
export function glowInner(input: string | readonly string[], opts: GlowOptions = {}): string {
  return render(prepare(toRaw(input)).text, opts)
}

/**
 * The text `glow()` renders, plus a mapper from `input` offsets into it — for
 * putting your own markers (elements carrying an `id`, search hits) back after
 * highlighting replaces the source with tagged markup.
 *
 *     const { text, offset } = glowSource(code)
 */
export function glowSource(input: string | readonly string[]): GlowSource {
  const raw = toRaw(input)
  const { text, shift } = prepare(raw)

  return {
    text,
    offset(inputOffset: number): number {
      const upto = Math.max(0, Math.min(inputOffset, raw.length))
      // the prefix is normalised the same way `prepare` normalises the whole
      // input, so an offset inside a CRLF pair lands at the start of the pair
      const mapped = raw.slice(0, upto).replace(/\r\n?/g, '\n').length - shift
      return Math.max(0, Math.min(mapped, text.length))
    },
  }
}

/**
 * Highlight `input` and return a complete `<code>` element as a string. Returns
 * an empty string when the input has no content.
 */
export function glow(input: string | readonly string[], opts: GlowOptions = {}): string {
  const text = prepare(toRaw(input)).text
  if (!text) {
    return ''
  }

  const lang = opts.language ? ` language="${opts.language.replace(/"/g, '&quot;')}"` : ''
  return `<code${lang}>${render(text, opts)}</code>`
}
