/*
  Semantic classification pass.

  Turns the language-neutral atomic tokens from lex() into colour tags using
  context that is still language-free:
    - cross-language keywords => <strong> (skipped after a `.` property access)
    - any other identifier     => <b>
    - HTML / XML tags          => only when the structure looks like markup
      (a known element name, a self-closing tag, or a matched open/close pair)
      so TS generics like Foo<T> and comparisons like a < b are never mis-coloured.
    - plain prose between two recognised tags in a genuinely mark-up file
      is left uncoloured; code around JSX braces stays code-coloured.
*/

import { HTML_TAGS, isKeyword } from './keywords'
import { tokenText } from './lexer'
import type { Kind, Token } from './lexer'

export interface ClassifiedToken {
  kind: Kind
  start: number
  end: number
  /** HTML element name to wrap in, or null for plain (unwrapped) text */
  tag: string | null
}

type Role = 'name' | 'attr' | 'text'

interface Region {
  from: number // token index of the '<'
  nameIdx: number // token index of the tag-name word
  to: number // token index of the closing '>' (or '/>')
  open: boolean
  closer: boolean
  selfClose: boolean
}

// characters that mark prose (text nodes) — presence of others keeps the gap as code
const CODEISH_OP = /[=;<>()[\]]/

export function classify(src: string, toks: Token[]): ClassifiedToken[] {
  const n = toks.length
  const text = (tok: Token) => tokenText(src, tok)
  const role: Array<Role | null> = new Array(n).fill(null)

  // --- find candidate tag regions -------------------------------------------
  const nextNW = (idx: number): number => {
    for (let k = idx + 1; k < n; k++) if (toks[k]!.kind !== 'ws') return k
    return -1
  }

  const regions: Region[] = []
  for (let idx = 0; idx < n; idx++) {
    const t = toks[idx]!
    if (t.kind !== 'op' || text(t) !== '<') continue

    const j = nextNW(idx)
    if (j < 0) continue
    const jt = toks[j]!

    let nameIdx = -1
    let open = false
    let closer = false
    if (jt.kind === 'word' && jt.start === t.end) {
      open = true
      nameIdx = j
    } else if (jt.kind === 'op' && text(jt) === '/' && jt.start === t.end) {
      const w = nextNW(j)
      if (w >= 0 && toks[w]!.kind === 'word' && toks[w]!.start === jt.end) {
        closer = true
        nameIdx = w
      }
    }
    if (nameIdx < 0) continue

    // scan forward for the '>' that ends this tag
    let term = -1
    let selfClose = false
    let invalid = false
    for (let m = nameIdx + 1; m < n; m++) {
      const mt = toks[m]!
      if (mt.kind === 'ws') continue
      const s = text(mt)
      if (mt.kind === 'op') {
        if (s === '>') {
          term = m
          break
        }
        if (s === '/>') {
          selfClose = true
          term = m
          break
        }
        if (s === '/') {
          const nn = nextNW(m)
          if (nn >= 0 && toks[nn]!.kind === 'op' && text(toks[nn]!) === '>' && toks[nn]!.start === mt.end) {
            selfClose = true
            term = nn
            break
          }
          continue
        }
        // an attribute operator ( = : . ? - … ) is fine; anything structural is not
        if (s.includes('<') || /[()[\]]/.test(s)) {
          invalid = true
          break
        }
        continue
      }
      if (mt.kind === 'word' || mt.kind === 'str' || mt.kind === 'num') continue
      invalid = true
      break
    }
    if (invalid || term < 0) continue
    regions.push({ from: idx, nameIdx, to: term, open, closer, selfClose })
  }

  // --- decide which candidates are real markup ------------------------------
  const openNames = new Set<string>()
  const closeNames = new Set<string>()
  for (const r of regions) {
    ;(r.closer ? closeNames : openNames).add(text(toks[r.nameIdx]!).toLowerCase())
  }
  const paired = new Set<string>()
  for (const name of openNames) if (closeNames.has(name)) paired.add(name)

  const isTag = (r: Region): boolean => {
    const name = text(toks[r.nameIdx]!).toLowerCase()
    if (HTML_TAGS.has(name)) return true
    if (paired.has(name)) return true
    return r.open && r.selfClose
  }
  const decided = regions.filter(isTag)

  for (const r of decided) {
    role[r.nameIdx] = 'name'
    if (r.open) {
      for (let m = r.nameIdx + 1; m < r.to; m++) {
        if (toks[m]!.kind === 'word' && !role[m]) role[m] = 'attr'
      }
    }
  }

  // --- uncoloured prose only when it really reads like markup text ----------
  const intervals = decided.map(r => ({
    s: toks[r.from]!.start,
    e: toks[r.to]!.end,
    fi: r.from,
    ti: r.to,
  }))
  for (let g = 0; g < intervals.length - 1; g++) {
    const a = intervals[g]!
    const b = intervals[g + 1]!
    if (a.s >= b.s) continue

    let prose = true
    for (let m = a.ti + 1; m < b.fi; m++) {
      const mt = toks[m]!
      if (mt.kind === 'op' && CODEISH_OP.test(text(mt))) {
        prose = false
        break
      }
      if (mt.kind === 'word' || mt.kind === 'ws' || mt.kind === 'str' || mt.kind === 'num') continue
      prose = false
      break
    }
    if (prose) {
      for (let m = a.ti + 1; m < b.fi; m++) {
        if (toks[m]!.kind === 'word') role[m] = 'text'
      }
    }
  }

  // --- quoted object keys ------------------------------------------------
  // In JSON (and quoted keys in JS/Python dicts etc.) a key is a quoted string
  // whose following token is a single ':' and whose preceding token is '{' or
  // ','. Give the key the identifier colour <b> so it reads apart from string
  // *values* (which stay <em>). Ternary branches ("a" : … after '?') and other
  // plain strings never match because they are not preceded by '{' or ','.
  const keyIdx = new Set<number>()
  for (let i = 0; i < n; i++) {
    const t = toks[i]!
    if (t.kind !== 'str') continue
    if (i > 0 && toks[i - 1]!.kind === 'str' && toks[i - 1]!.end === t.start) continue
    let j = i
    while (j + 1 < n && toks[j + 1]!.kind === 'str' && toks[j + 1]!.start === toks[j]!.end) j++
    let k = j + 1
    while (k < n && toks[k]!.kind === 'ws') k++
    let p = i - 1
    while (p >= 0 && toks[p]!.kind === 'ws') p--
    const hasColon = k < n && toks[k]!.kind === 'op' && text(toks[k]!) === ':'
    const afterObject = p >= 0 && toks[p]!.kind === 'op' && (text(toks[p]!) === '{' || text(toks[p]!) === ',')
    if (hasColon && afterObject) {
      for (let m = i; m <= j; m++) keyIdx.add(m)
    }
    i = j
  }

  // --- final pass: kind + context -> tag -------------------------------------
  const out: ClassifiedToken[] = []
  for (let i = 0; i < n; i++) {
    const t = toks[i]!
    let tag: string | null = null
    switch (t.kind) {
      case 'comment':
        tag = 'sup'
        break
      case 'str':
        tag = keyIdx.has(i) ? 'b' : 'em'
        break
      case 'num':
        tag = 'em'
        break
      case 'decor':
        tag = 'label'
        break
      case 'op':
        tag = 'i'
        break
      case 'ws':
        break
      case 'word': {
        const r = role[i]
        if (r === 'name') tag = 'strong'
        else if (r === 'attr') tag = 'b'
        else if (r === 'text') tag = null
        else {
          const w = text(t)
          const prev = t.start > 0 ? src[t.start - 1] : ''
          // skip keyword colour after a property access: obj.type, str.match
          tag = isKeyword(w) && prev !== '.' ? 'strong' : 'b'
        }
        break
      }
    }
    out.push({ kind: t.kind, start: t.start, end: t.end, tag })
  }
  return out
}
