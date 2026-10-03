/*
  Universal (language-free) tokenizer: one pass, emitting a flat, non-overlapping
  list of atomic tokens that fully cover the input. A context stack lets strings,
  block comments and templates span lines with quotes/braces balanced.

  Two entry points share one loop:

    lex(src)                          — the whole input, as before
    lexSegment(src, from, to, state)  — the half-open range [from, to), resumed
                                        from the state an earlier segment
                                        returned. The incremental editor lexes
                                        one line at a time and keeps the state
                                        at every line boundary.

  Every line boundary is a safe resume point: the stack carries each construct
  that spans lines (strings, templates, interpolations and block comments), and
  a segment clips its tokens at `to`, so a construct crossing the boundary comes
  out as two contiguous pieces. Splitting this way is equivalent to splitting a
  whole-input lex at every newline — see the seam-equivalence test.

  It does not decide colours — classify.ts does.
*/

export type Kind = 'comment' | 'str' | 'word' | 'num' | 'op' | 'decor' | 'ws'

export interface Token {
  kind: Kind
  start: number
  end: number
}

const ID_START = /[\p{L}_$]/u
const ID_PART = /[\p{L}\p{N}_$]/u

function isWs(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\v' || c === '\f'
}

function isDigit(c: string | undefined): boolean {
  return !!c && c >= '0' && c <= '9'
}

function isAsciiLetter(c: string | undefined): boolean {
  return !!c && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
}

// characters that may merge into a single multi-char operator token
const OP_RUN = new Set('=+-*/%!<>&|^~?:.;,')

// characters that are always emitted as their own single token
const STRUCTURAL = new Set('()[]{}')

type Mark = 'dollar' | 'brace' | 'none'

// a string-literal (incl. template/backtick) frame currently being scanned
interface StrFrame {
  kind: 'str'
  delim: string // '`' | '"' | "'" | '"""' | "'''"
  mark: Mark // 'dollar' => ${...} (backtick), 'brace' => {...} (f-string / $"..."), 'none' => plain
  multi: boolean // true when newlines are legal inside (backtick / triple quotes)
}

interface InterpFrame {
  kind: 'interp'
  depth: number // 1 == the interpolation's own opener has been consumed
}

// A block comment (`/* */`, `<!-- -->`, Lua `--[[ ]]`) whose close has not been
// seen yet. Unlike strings these have no interior syntax, so a segment that ends
// mid-comment just clips: the frame carries the way out (`close`) and where the
// run began, so the piece emitted in the segment that *does* find the close
// still covers everything from the opener to the closer.
interface BlockFrame {
  kind: 'block'
  close: string
  start: number
}

export type Frame = StrFrame | InterpFrame | BlockFrame

/** Opaque lexer state at a segment boundary. Pass it back to lexSegment verbatim. */
export type LexState = readonly Frame[]

export interface LexRun {
  tokens: Token[]
  state: Frame[]
}

// Is the identifier starting at i actually a string prefix (f"…", rf'…', $"…")?
// The quote must directly follow a 1-2 char run of r/f/b/u letters (or $) at a
// fresh word boundary. Returns the quote character when it is.
function stringPrefixAt(src: string, i: number): { q: string } | null {
  const c = src[i]!
  // must begin a fresh word
  if (i > 0 && ID_PART.test(src[i - 1]!))
    return null

  // C# / bash style $"..."
  if (c === '$') {
    const q = src[i + 1]
    if (q === '"' || q === '\'')
      return { q }
    return null
  }

  if (!isAsciiLetter(c))
    return null
  let unAscii = i
  while (unAscii < src.length && isAsciiLetter(src[unAscii]!)) unAscii++
  const runLen = unAscii - i
  if (runLen < 1 || runLen > 2)
    return null
  const q = src[unAscii]
  if (q !== '"' && q !== '\'')
    return null
  for (let k = i; k < unAscii; k++) {
    if (!'fFrRuUbB'.includes(src[k]!))
      return null
  }
  return { q }
}

// A prefixed string interpolates on {…} when it is a C# "$" prefix or a python
// f-string (the letters contain f/F). Plain r/b/u prefixes do not interpolate.
function isBraceInterp(src: string, start: number, q: string): boolean {
  if (src[start] === '$')
    return q === '"'
  for (let k = start; k < src.length; k++) {
    const ch = src[k]!
    if (ch === q)
      break
    if (ch === 'f' || ch === 'F')
      return true
  }
  return false
}

/**
 * Lex the half-open range [from, to) of `src`, resumed from `state`. A segment
 * boundary must be where an earlier segment stopped; every line boundary is one.
 * `lex` is the whole-input case, `lexSegment(src, 0, src.length, [])`.
 */
export function lexSegment(
  src: string,
  from: number,
  to: number,
  state: readonly Frame[],
  /** Whether this segment reaches the end of the input (so an open literal ends here). */
  eof: boolean = to >= src.length,
): LexRun {
  const tokens: Token[] = []
  const len = src.length
  // how far the emitted tokens reach, so a construct opened on the last byte
  // (whose handling only runs at the top of the next iteration) can be closed
  let covered = from
  const emit = (kind: Kind, start: number, end: number) => {
    if (end > start) {
      tokens.push({ kind, start, end })
      covered = end
    }
  }
  // Copy so the caller's checkpoint is never mutated by this segment. A carried
  // block frame's opener lies behind us and its piece was emitted by an earlier
  // segment, so the run this segment emits starts here — re-pointing it also
  // discards the stale absolute offset a reused line may have carried.
  const stack: Frame[] = state.map(f =>
    f.kind === 'block' ? { kind: 'block', close: f.close, start: from } : { ...f },
  )
  const top = (): Frame | undefined => stack[stack.length - 1]

  function pushString(delim: string, mark: Mark, multi: boolean): void {
    stack.push({ kind: 'str', delim, mark, multi })
  }

  let i = from
  while (i < to) {
    const f = top()

    // ---------------- resuming inside a block comment ----------------
    if (f && f.kind === 'block') {
      const idx = src.indexOf(f.close, i)
      if (idx !== -1 && idx + f.close.length <= to) {
        // the close is in this segment: one token from the opener to the closer
        emit('comment', Math.max(f.start, from), idx + f.close.length)
        i = idx + f.close.length
        stack.pop()
      }
      else {
        // still open at the segment end: clip here, the frame carries on
        emit('comment', Math.max(f.start, from), to)
        i = to
      }
      continue
    }

    // ---------------- text scanning: inside a string/template ----------------
    if (f && f.kind === 'str') {
      const frame = f
      const chunkStart = i
      let done = false

      while (i < to) {
        const c = src[i]!

        // backslash escape (also swallows an escaped newline / escaped quote)
        if (c === '\\') {
          i = Math.min(to, i + 2)
          continue
        }

        // a bare newline ends a single-line string (the quote never closed)
        if (c === '\n' && !frame.multi) {
          emit('str', chunkStart, i)
          stack.pop()
          done = true
          break
        }

        // ${…} interpolation (backtick templates, some shell)
        if (frame.mark === 'dollar' && c === '$' && src[i + 1] === '{') {
          emit('str', chunkStart, i)
          emit('op', i, i + 2)
          stack.push({ kind: 'interp', depth: 1 })
          i += 2
          done = true
          break
        }

        // {…} interpolation (f-strings, C# "$…"); {{ }} escapes a literal brace
        if (frame.mark === 'brace' && c === '{') {
          if (src[i + 1] === '{') {
            i += 2
            continue
          }
          emit('str', chunkStart, i)
          emit('op', i, i + 1)
          stack.push({ kind: 'interp', depth: 1 })
          i += 1
          done = true
          break
        }

        // closing delimiter
        const first = frame.delim[0]!
        if (c === first) {
          if (frame.delim.length === 1 || src.startsWith(frame.delim, i)) {
            emit('str', chunkStart, i) // literal text before the closing delimiter
            const span = frame.delim.length
            emit('str', i, i + span) // the closing delimiter itself
            i += span
            stack.pop()
            done = true
            break
          }
          i++ // lone quote inside a triple-quoted literal
          continue
        }

        i++
      }

      if (!done) {
        // the literal is still open at `to`: emit this segment's piece and keep
        // the frame for the next one. Only the end of the input pops it.
        emit('str', chunkStart, to)
        if (eof && top() && top()!.kind === 'str')
          stack.pop()
      }
      continue
    }

    // ---------------- code scanning ----------------
    const c = src[i]!

    // whitespace
    if (isWs(c)) {
      let j = i
      while (j < to && isWs(src[j]!)) j++
      emit('ws', i, j)
      i = j
      continue
    }

    // line comment // …
    if (c === '/' && src[i + 1] === '/') {
      let j = i + 2
      while (j < to && src[j] !== '\n') j++
      emit('comment', i, j)
      i = j
      continue
    }

    // block comment /* … */  — only the opener here; the block frame emits the
    // whole run once it finds the close (or clips at the segment end otherwise)
    if (c === '/' && src[i + 1] === '*') {
      stack.push({ kind: 'block', close: '*/', start: i })
      i += 2
      continue
    }

    // html block comment <!-- … -->
    if (c === '<' && src.startsWith('<!--', i)) {
      stack.push({ kind: 'block', close: '-->', start: i })
      i += 4
      continue
    }

    // hash comment (# comment, #! shebang). Not #fff / #include / #id.
    if (c === '#' && (i + 1 >= len || isWs(src[i + 1]!) || src[i + 1] === '!')) {
      let j = i + 1
      while (j < to && src[j] !== '\n') j++
      emit('comment', i, j)
      i = j
      continue
    }

    // Lua long block comment  --[[ … ]] / --[==[ … ]==]  (multiline, unambiguous
    // because it starts with '--'). Only the opener is pushed here.
    if (c === '-' && src[i + 1] === '-') {
      const open = luaOpen(src, i + 2)
      if (open) {
        stack.push({ kind: 'block', close: open.close, start: i })
        i = open.end
        continue
      }
    }

    // SQL / Lua / Haskell style -- comment. Only when it is clearly standalone:
    // preceded by whitespace/line-start AND followed by whitespace/EOL, so glued
    // decrements (a--, --x, x = a--) stay operators.
    const prevC = i > 0 ? src[i - 1] : ''
    if (
      c === '-'
      && src[i + 1] === '-'
      && (prevC === '' || isWs(prevC))
      && (i + 2 >= to || isWs(src[i + 2]!))
    ) {
      let j = i + 2
      while (j < to && src[j] !== '\n') j++
      emit('comment', i, j)
      i = j
      continue
    }

    // backtick template string
    if (c === '`') {
      emit('str', i, i + 1) // opening backtick
      i += 1
      pushString('`', 'dollar', true)
      continue
    }

    // single / double quote strings (plain or triple; prefixed f"/$" handled below)
    if (c === '"' || c === '\'') {
      const triple = src[i + 1] === c && src[i + 2] === c
      const span = triple ? 3 : 1
      emit('str', i, i + span) // opening quote(s)
      i += span
      pushString(triple ? c.repeat(3) : c, 'none', triple)
      continue
    }

    // decorator / at-rule  @name  (but not email local@domain: the '@' must not
    // be glued to a preceding identifier character)
    if (c === '@' && !(i > 0 && ID_PART.test(src[i - 1]!))) {
      if (isIdStartAt(src, i + 1)) {
        let j = i + 1
        while (j < len && ID_PART.test(src[j]!)) j++
        emit('decor', i, j)
        i = j
        continue
      }
      emit('op', i, i + 1)
      i++
      continue
    }

    // number (0x/0b/0o, separators, decimals, exponents, suffixes)
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      const s = i
      i = scanNumber(src, i)
      emit('num', s, i)
      continue
    }

    // word / identifier, or a prefixed string (f"…", $"…")
    if (ID_START.test(c)) {
      const pre = stringPrefixAt(src, i)
      if (pre) {
        const q = pre.q
        // advance to the quote that ends the prefix (letters or $)
        let p = i
        while (p < len && src[p] !== q) p++
        const triple = src[p + 1] === q && src[p + 2] === q
        const span = triple ? 3 : 1
        const mark: Mark = isBraceInterp(src, i, q) ? 'brace' : 'none'
        emit('str', i, p + span) // prefix + opening quote(s)
        i = p + span
        pushString(triple ? q.repeat(3) : q, mark, triple)
        continue
      }
      let j = i
      while (j < len && ID_PART.test(src[j]!)) j++
      emit('word', i, j)
      i = j
      continue
    }

    // structural brackets (single tokens; braces drive interpolation depth)
    if (STRUCTURAL.has(c)) {
      const t = top()
      if (c === '{') {
        if (t && t.kind === 'interp')
          t.depth++
      }
      else if (c === '}') {
        if (t && t.kind === 'interp') {
          if (t.depth > 1)
            t.depth--
          else stack.pop()
        }
      }
      emit('op', i, i + 1)
      i++
      continue
    }

    // run of operator characters (===, =>, ++, ?., ::, …)
    if (OP_RUN.has(c)) {
      let j = i
      while (j < to && OP_RUN.has(src[j]!)) {
        const ch = src[j]!
        if (ch === '/' && (src[j + 1] === '/' || src[j + 1] === '*'))
          break
        if (ch === '<' && src.startsWith('<!--', j))
          break
        // never glue '<' with a following '/' — </name must stay three pieces
        // so classify can recognise closing HTML/XML tags. Only when the '<' is
        // part of this run (j > i), not when a fresh run begins at the '/'.
        if (ch === '/' && j - 1 >= i && src[j - 1] === '<')
          break
        j++
      }
      emit('op', i, j)
      i = j
      continue
    }

    // any other single character
    emit('op', i, i + 1)
    i++
  }

  // A block comment opened on the last byte never reached the top of an
  // iteration, so its frame is still open with nothing emitted for it. (Every
  // other opener — quote, backtick, prefix, ${ — emits its delimiter on push,
  // so `covered` is already at `to`.)
  if (covered < to) {
    const t = top()
    if (t && t.kind === 'block')
      emit('comment', Math.max(t.start, from), to)
  }

  return { tokens, state: stack }
}

/** Lex the whole input. */
export function lex(src: string): Token[] {
  return lexSegment(src, 0, src.length, []).tokens
}

function isIdStartAt(src: string, i: number): boolean {
  return i < src.length && ID_START.test(src[i]!)
}

function scanNumber(src: string, start: number): number {
  const len = src.length
  let i = start
  const c = src[i]!

  // radix prefixes
  const nx = src[i + 1]
  if (c === '0' && nx !== undefined && 'xXbBoO'.includes(nx)) {
    i += 2
    while (i < len && /\w/.test(src[i]!)) i++
    return i
  }

  // leading '.5'
  if (c === '.')
    i++
  while (i < len && (isDigit(src[i]!) || src[i] === '_')) i++

  // fraction
  if (src[i] === '.' && src[i + 1] !== '.') {
    i++
    while (i < len && (isDigit(src[i]!) || src[i] === '_')) i++
  }

  // exponent
  if (src[i] === 'e' || src[i] === 'E') {
    let j = i + 1
    if (src[j] === '+' || src[j] === '-')
      j++
    if (isDigit(src[j])) {
      i = j
      while (i < len && (isDigit(src[i]!) || src[i] === '_')) i++
    }
  }

  // short alpha suffix (bigint 1n, rust 10u32 …) but never more than 6 letters;
  // trailing digits keep rust-style suffixed literals (u8, f32) as one token.
  let p = i
  while (p < len && isAsciiLetter(src[p]!)) p++
  if (p > i && p - i <= 6) {
    while (p < len && (isDigit(src[p]!) || src[p] === '_')) p++
    i = p
  }
  return i
}

// Lua long-bracket opener "[[" / "[=[" / "[==[" … starting at `from`? Returns
// the matching close (`]]` / `]=]` / …) and the offset just past the opener, or
// null when it is not a long bracket. Used only after "--" so it can never
// collide with code.
function luaOpen(src: string, from: number): { close: string, end: number } | null {
  if (src[from] !== '[')
    return null
  let k = from + 1
  while (src[k] === '=') k++
  if (src[k] !== '[')
    return null
  const eq = src.slice(from + 1, k)
  return { close: `]${eq}]`, end: k + 1 }
}

export function tokenText(src: string, tok: Token): string {
  return src.slice(tok.start, tok.end)
}
