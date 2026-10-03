/*
  Turns the language-neutral tokens from lex() into colour tags.

    keywords  => <strong>   (except after a `.`)
    other ids => <b>
    markup    => only when the structure really is markup — a known element, a
                 self-closing tag, or a matched pair — so Foo<T> and `a < b`
                 are never mis-coloured
    prose between two real tags is left uncoloured

  The whole-input entry point is `classify`. `classifyWindow` runs the same
  passes over a slice of the token stream, taking the document-wide open/close
  region counts and the fact that the slice is bounded by a decided region on
  each side — that is what lets the incremental editor re-colour only the lines
  an edit touched while still seeing markup pairing across the whole file.
*/

import type { Kind, Token } from './lexer'
import { HTML_TAGS, isKeyword } from './keywords'
import { tokenText } from './lexer'

export interface ClassifiedToken {
  kind: Kind
  start: number
  end: number
  /** HTML element name to wrap in, or null for plain (unwrapped) text */
  tag: string | null
}

type Role = 'name' | 'attr' | 'text'

export interface Region {
  from: number // token index of the '<'
  nameIdx: number // token index of the tag-name word
  to: number // token index of the closing '>' (or '/>')
  start: number // absolute offset of '<'
  end: number // absolute offset just past '>'
  name: string // lowercased tag name
  open: boolean
  closer: boolean
  selfClose: boolean
}

/**
 * Where classify reads the source from. The one-shot API passes a plain string;
 * the incremental document passes per-line accessors, so a window can be
 * coloured without ever materialising the whole text.
 */
export type SourceText = string | { at: (offset: number) => string, of: (tok: Token) => string }

function readerOf(src: SourceText): { at: (offset: number) => string, of: (tok: Token) => string } {
  return typeof src === 'string'
    ? { at: off => src[off] ?? '', of: tok => tokenText(src, tok) }
    : src
}

/** Region-name -> count, over some set of regions. */
export interface NameCounts {
  open: Map<string, number>
  close: Map<string, number>
}

// characters that mark prose (text nodes) — presence of others keeps the gap as code
const CODEISH_OP = /[=;<>()[\]]/

/**
 * Every candidate `<…>` region in `toks`. A candidate is not yet known to be
 * markup — `decideRegions` rules on that.
 */
export function detectRegions(src: SourceText, toks: Token[]): Region[] {
  const n = toks.length
  const { of: text } = readerOf(src)

  const nextNW = (idx: number): number => {
    for (let k = idx + 1; k < n; k++) {
      if (toks[k]!.kind !== 'ws')
        return k
    }
    return -1
  }

  const regions: Region[] = []
  for (let idx = 0; idx < n; idx++) {
    const t = toks[idx]!
    if (t.kind !== 'op' || text(t) !== '<')
      continue

    const j = nextNW(idx)
    if (j < 0)
      continue
    const jt = toks[j]!

    let nameIdx = -1
    let open = false
    let closer = false
    if (jt.kind === 'word' && jt.start === t.end) {
      open = true
      nameIdx = j
    }
    else if (jt.kind === 'op' && text(jt) === '/' && jt.start === t.end) {
      const w = nextNW(j)
      if (w >= 0 && toks[w]!.kind === 'word' && toks[w]!.start === jt.end) {
        closer = true
        nameIdx = w
      }
    }
    if (nameIdx < 0)
      continue

    // scan forward for the '>' that ends this tag
    let term = -1
    let selfClose = false
    let invalid = false
    for (let m = nameIdx + 1; m < n; m++) {
      const mt = toks[m]!
      if (mt.kind === 'ws')
        continue
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
        // a lone '/' is attribute noise (`/>` arrives as one token) and falls
        // through; an attribute operator is fine, anything structural is not
        if (s.includes('<') || /[()[\]]/.test(s)) {
          invalid = true
          break
        }
        continue
      }
      if (mt.kind === 'word' || mt.kind === 'str' || mt.kind === 'num')
        continue
      invalid = true
      break
    }
    if (invalid || term < 0)
      continue
    regions.push({
      from: idx,
      nameIdx,
      to: term,
      start: t.start,
      end: toks[term]!.end,
      name: text(toks[nameIdx]!).toLowerCase(),
      open,
      closer,
      selfClose,
    })
  }
  return regions
}

/** Add `regions`' names into a fresh count set. */
export function countNames(regions: readonly Region[]): NameCounts {
  const counts: NameCounts = { open: new Map(), close: new Map() }
  for (const r of regions) {
    const m = r.closer ? counts.close : counts.open
    m.set(r.name, (m.get(r.name) ?? 0) + 1)
  }
  return counts
}

/** The regions that really are markup, given document-wide name counts. */
export function decideRegions(regions: readonly Region[], counts: NameCounts): Region[] {
  const paired = (name: string): boolean =>
    (counts.open.get(name) ?? 0) > 0 && (counts.close.get(name) ?? 0) > 0
  return regions.filter((r) => {
    if (HTML_TAGS.has(r.name))
      return true
    if (paired(r.name))
      return true
    return r.open && r.selfClose
  })
}

/**
 * Tag `toks`, where `toks` is either the whole document or a slice of it.
 *
 * When it is a slice, `counts` must be the document-wide counts (so pairing
 * sees markup outside the slice), and `leftBounded` / `rightBounded` say whether
 * the slice begins just after a decided region / ends just before one — prose
 * between that neighbour and the slice's first/last region is only text when the
 * slice really is bounded by markup.
 */
export function classifyWindow(
  src: SourceText,
  toks: Token[],
  counts: NameCounts,
  leftBounded: boolean,
  rightBounded: boolean,
): ClassifiedToken[] {
  const n = toks.length
  const { at, of: text } = readerOf(src)
  // eslint-disable-next-line e18e/prefer-array-fill -- its suggested `.fill()` form widens to unknown[]
  const role: Array<Role | null> = Array.from({ length: n }, () => null)

  const decided = decideRegions(detectRegions(src, toks), counts)

  for (const r of decided) {
    role[r.nameIdx] = 'name'
    if (r.open) {
      for (let m = r.nameIdx + 1; m < r.to; m++) {
        if (toks[m]!.kind === 'word' && !role[m])
          role[m] = 'attr'
      }
    }
  }

  // --- uncoloured prose only when it really reads like markup text ----------
  // Gap between the token ranges `ti` and `fi` (exclusive). -1 / n stand for the
  // bounding decided region just outside the slice.
  const gaps: Array<[number, number]> = []
  for (let g = 1; g < decided.length; g++)
    gaps.push([decided[g - 1]!.to, decided[g]!.from])
  if (leftBounded && decided.length)
    gaps.push([-1, decided[0]!.from])
  if (rightBounded && decided.length)
    gaps.push([decided[decided.length - 1]!.to, n])

  for (const [ti, fi] of gaps) {
    let prose = true
    for (let m = ti + 1; m < fi; m++) {
      const mt = toks[m]!
      if (mt.kind === 'op' && CODEISH_OP.test(text(mt))) {
        prose = false
        break
      }
      if (mt.kind === 'word' || mt.kind === 'ws' || mt.kind === 'str' || mt.kind === 'num')
        continue
      prose = false
      break
    }
    if (prose) {
      for (let m = ti + 1; m < fi; m++) {
        if (toks[m]!.kind === 'word')
          role[m] = 'text'
      }
    }
  }

  // --- quoted object keys ------------------------------------------------
  // A quoted string followed by ':' and preceded by '{' or ',' is a key, so it
  // takes the identifier colour instead of the string colour. A ternary branch
  // ("a" : …) has no '{' or ',' before it, so it stays a string.
  const keyIdx = new Set<number>()
  for (let i = 0; i < n; i++) {
    const t = toks[i]!
    if (t.kind !== 'str')
      continue
    // every adjacent run of string tokens is consumed below via `i = j`, so the
    // loop only ever lands on the first token of a run
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
        if (r === 'name') {
          tag = 'strong'
        }
        else if (r === 'attr') {
          tag = 'b'
        }
        else if (r === 'text') {
          tag = null
        }
        else {
          const w = text(t)
          const prev = t.start > 0 ? at(t.start - 1) : ''
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

export function classify(src: SourceText, toks: Token[]): ClassifiedToken[] {
  return classifyWindow(src, toks, countNames(detectRegions(src, toks)), false, false)
}
