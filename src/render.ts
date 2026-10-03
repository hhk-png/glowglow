/*
  The line renderer shared by the one-shot `glow()` and the incremental document.

  Tokens are contiguous and cover the line, so rendering is one pass: wrap each
  token's text in its tag, escaping as we go. A line's markup never contains a
  newline, so a whole document is just its rendered lines joined with '\n' —
  which is what lets the editor replace single lines of the DOM.

  Callers can also lay their own ranges over the output — search hits, a
  diagnostic squiggle, a breakpoint marker — by passing `marks`. A mark splits
  whatever token it lands in, so the token's own colour survives around it:

      <strong>const</strong> <mark class="hit">x</mark>
*/

export interface RenderToken {
  start: number
  end: number
  /** HTML element name to wrap in, or null for plain (unwrapped) text */
  tag: string | null
}

/**
 * A range of the source to wrap in the rendered output. Marks are matched by
 * absolute offset, so they are the same numbers `Token` uses.
 */
export interface GlowMark {
  from: number
  to: number
  /** Element name to wrap the range in. Defaults to `mark`. */
  tag?: string
  /** Class for the wrapper, escaped. */
  cls?: string
}

export function esc(str: string): string {
  // most tokens (identifiers, whitespace) hold nothing to escape, so pay for
  // one scan rather than three replaces
  if (!/[&<>]/.test(str)) {
    return str
  }
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The escaped text of `[s, e)`, with every mark that overlaps it wrapped around
 * its slice. Overlapping marks are truncated rather than nested, so the output
 * is always well formed; the earlier mark wins.
 */
function marked(src: string, s: number, e: number, marks: readonly GlowMark[]): string {
  let out = ''
  let at = s
  for (const m of marks) {
    if (m.to <= s || m.from >= e)
      continue
    const a = Math.max(s, m.from, at)
    const b = Math.min(e, m.to)
    if (b <= a)
      continue
    if (a > at)
      out += esc(src.slice(at, a))
    const tag = m.tag ?? 'mark'
    const cls = m.cls ? ` class="${escAttr(m.cls)}"` : ''
    out += `<${tag}${cls}>${esc(src.slice(a, b))}</${tag}>`
    at = b
  }
  if (at < e)
    out += esc(src.slice(at, e))
  return out
}

// renderLine clips tokens to [ls, le]; `from` is the first token that can
// overlap the line, so nothing before it is rescanned. `marks` are compared
// against the token offsets, so they must be in the same space — pass them
// line-relative if the tokens are.
export function renderLine(
  src: string,
  toks: readonly RenderToken[],
  from: number,
  ls: number,
  le: number,
  marks?: readonly GlowMark[],
): string {
  const out: string[] = []
  for (let i = from; i < toks.length; i++) {
    const t = toks[i]!
    if (t.start >= le)
      break
    const s = Math.max(ls, t.start)
    const e = Math.min(le, t.end)
    if (s < e) {
      const inner = marks && marks.length ? marked(src, s, e, marks) : esc(src.slice(s, e))
      out.push(t.tag ? `<${t.tag}>${inner}</${t.tag}>` : inner)
    }
  }
  return out.join('')
}
