/*
  Universal (language-free) tokenizer.

  Scans the whole source in one pass and emits a flat, non-overlapping list of
  atomic tokens that fully cover the input. A small context stack lets strings,
  block comments, templates and their interpolations legitimately span lines
  while nested quotes / braces stay balanced.

  The tokenizer does NOT decide colours. classify.ts turns the atomic kinds into
  semantic tags (keyword strong, identifiers b, markup pairing, etc.).
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
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '' || c === '\f'
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

type Frame = StrFrame | InterpFrame

// Is the identifier starting at i actually a string prefix (f"…", rf'…', $"…")?
// The quote must directly follow a 1-2 char run of r/f/b/u letters (or $) at a
// fresh word boundary. Returns the quote character when it is.
function stringPrefixAt(src: string, i: number): { q: string } | null {
  const c = src[i]!
  // must begin a fresh word
  if (i > 0 && ID_PART.test(src[i - 1]!)) return null

  // C# / bash style $"..."
  if (c === '$') {
    const q = src[i + 1]
    if (q === '"' || q === "'") return { q }
    return null
  }

  if (!isAsciiLetter(c)) return null
  let p = i
  while (p < src.length && isAsciiLetter(src[p]!)) p++
  const runLen = p - i
  if (runLen < 1 || runLen > 2) return null
  const q = src[p]
  if (q !== '"' && q !== "'") return null
  for (let k = i; k < p; k++) {
    if ('fFrRuUbB'.indexOf(src[k]!) === -1) return null
  }
  return { q }
}

// A prefixed string interpolates on {…} when it is a C# "$" prefix or a python
// f-string (the letters contain f/F). Plain r/b/u prefixes do not interpolate.
function isBraceInterp(src: string, start: number, q: string): boolean {
  if (src[start] === '$') return q === '"'
  for (let k = start; k < src.length; k++) {
    const ch = src[k]!
    if (ch === q) break
    if (ch === 'f' || ch === 'F') return true
  }
  return false
}

export function lex(src: string): Token[] {
  const tokens: Token[] = []
  const len = src.length
  const emit = (kind: Kind, start: number, end: number) => {
    if (end > start) tokens.push({ kind, start, end })
  }
  const stack: Frame[] = []
  const top = (): Frame | undefined => stack[stack.length - 1]

  function pushString(delim: string, mark: Mark, multi: boolean): void {
    stack.push({ kind: 'str', delim, mark, multi })
  }

  let i = 0
  while (i < len) {
    const f = top()

    // ---------------- text scanning: inside a string/template ----------------
    if (f && f.kind === 'str') {
      const frame = f
      const chunkStart = i
      let done = false

      while (i < len) {
        const c = src[i]!

        // backslash escape (also swallows an escaped newline / escaped quote)
        if (c === '\\') {
          i = Math.min(len, i + 2)
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

      // unterminated literal reaching end of input
      if (!done && i >= len && top() && top()!.kind === 'str') {
        emit('str', chunkStart, len)
        stack.pop()
      }
      continue
    }

    // ---------------- code scanning ----------------
    const c = src[i]!

    // whitespace
    if (isWs(c)) {
      let j = i
      while (j < len && isWs(src[j]!)) j++
      emit('ws', i, j)
      i = j
      continue
    }

    // line comment // …
    if (c === '/' && src[i + 1] === '/') {
      let j = i + 2
      while (j < len && src[j] !== '\n') j++
      emit('comment', i, j)
      i = j
      continue
    }

    // block comment /* … */
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const j = end === -1 ? len : end + 2
      emit('comment', i, j)
      i = j
      continue
    }

    // html block comment <!-- … -->
    if (c === '<' && src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4)
      const j = end === -1 ? len : end + 3
      emit('comment', i, j)
      i = j
      continue
    }

    // hash comment (# comment, #! shebang). Not #fff / #include / #id.
    if (c === '#' && (i + 1 >= len || isWs(src[i + 1]!) || src[i + 1] === '!')) {
      let j = i + 1
      while (j < len && src[j] !== '\n') j++
      emit('comment', i, j)
      i = j
      continue
    }

    // Lua long block comment  --[[ … ]] / --[==[ … ]==]  (multiline, unambiguous
    // because it starts with '--')
    if (c === '-' && src[i + 1] === '-') {
      const end = luaBlockEnd(src, i + 2)
      if (end !== -1) {
        emit('comment', i, end)
        i = end
        continue
      }
    }

    // SQL / Lua / Haskell style -- comment. Only when it is clearly standalone:
    // preceded by whitespace/line-start AND followed by whitespace/EOL, so glued
    // decrements (a--, --x, x = a--) stay operators.
    const prevC = i > 0 ? src[i - 1] : ''
    if (
      c === '-' &&
      src[i + 1] === '-' &&
      (prevC === '' || isWs(prevC)) &&
      (i + 2 >= len || isWs(src[i + 2]!))
    ) {
      let j = i + 2
      while (j < len && src[j] !== '\n') j++
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
    if (c === '"' || c === "'") {
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
        if (t && t.kind === 'interp') t.depth++
      } else if (c === '}') {
        if (t && t.kind === 'interp') {
          if (t.depth > 1) t.depth--
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
      while (j < len && OP_RUN.has(src[j]!)) {
        const ch = src[j]!
        if (ch === '/' && (src[j + 1] === '/' || src[j + 1] === '*')) break
        if (ch === '<' && src.startsWith('<!--', j)) break
        // never glue '<' with a following '/' — </name must stay three pieces
        // so classify can recognise closing HTML/XML tags. Only when the '<' is
        // part of this run (j > i), not when a fresh run begins at the '/'.
        if (ch === '/' && j - 1 >= i && src[j - 1] === '<') break
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

  return tokens
}

function isIdStartAt(src: string, i: number): boolean {
  return i < src.length && ID_START.test(src[i]!)
}

function scanNumber(src: string, start: number): number {
  const len = src.length
  let i = start
  const c = src[i]!

  // radix prefixes
  if (c === '0' && 'xXbBoO'.indexOf(src[i + 1] || '') !== -1) {
    i += 2
    while (i < len && /[0-9a-zA-Z_]/.test(src[i]!)) i++
    return i
  }

  // leading '.5'
  if (c === '.') i++
  while (i < len && (isDigit(src[i]!) || src[i] === '_')) i++

  // fraction
  if (src[i] === '.' && src[i + 1] !== '.') {
    i++
    while (i < len && (isDigit(src[i]!) || src[i] === '_')) i++
  }

  // exponent
  if (src[i] === 'e' || src[i] === 'E') {
    let j = i + 1
    if (src[j] === '+' || src[j] === '-') j++
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

// Lua long-bracket opener "[[", "[=[", "[==[" … starting at `from`? Returns the
// byte offset just past the matching "]]"/"]=]"/…, or -1 when it is not a long
// bracket. Used only after "--" so it can never collide with code.
function luaBlockEnd(src: string, from: number): number {
  if (src[from] !== '[') return -1
  let k = from + 1
  while (src[k] === '=') k++
  if (src[k] !== '[') return -1
  const close = ']' + src.slice(from + 1, k) + ']'
  const hit = src.indexOf(close, k + 1)
  return hit === -1 ? src.length : hit + close.length
}

export function tokenText(src: string, tok: Token): string {
  return src.slice(tok.start, tok.end)
}
