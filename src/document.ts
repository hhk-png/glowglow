/*
  Incremental document: the source, its per-line tokens, the lexer state at every
  line boundary, and the colour tag of every token. An edit re-lexes only from the
  line it touched until the lexer's context re-syncs, and re-colours only the
  window the edit can reach — the tail is reused as-is, so cost tracks the edit,
  not the file.

  Tokens are stored per line with offsets relative to the line start, so reusing
  the tail never rewrites token objects — only the `starts` and `decided` arrays
  shift.

  Colouring splits into two coupled halves, both maintained here:
    - the lexer state at line boundaries (see lexSegment)
    - document-wide open/close counts of candidate tag names, which decide which
      `<Foo>` regions are markup (see classify.decideRegions)
*/

import type { NameCounts, Region, SourceText } from './classify'
import type { GlowOptions } from './glow'
import type { Frame, Token } from './lexer'
import type { GlowMark, RenderToken } from './render'
import { classifyWindow, countNames, decideRegions, detectRegions } from './classify'
import { lexSegment } from './lexer'
import { renderLine } from './render'

/** Compare two lexer states by the future they imply; `block.start` is a past detail. */
export function sameState(a: readonly Frame[], b: readonly Frame[]): boolean {
  if (a.length !== b.length)
    return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (x.kind !== y.kind)
      return false
    if (x.kind === 'str' && y.kind === 'str') {
      if (x.delim !== y.delim || x.mark !== y.mark || x.multi !== y.multi)
        return false
    }
    else if (x.kind === 'interp' && y.kind === 'interp') {
      if (x.depth !== y.depth)
        return false
    }
    else if (x.kind === 'block' && y.kind === 'block') {
      if (x.close !== y.close)
        return false
    }
  }
  return true
}

const EMPTY_STATE: Frame[] = []
const EMPTY_TOKENS: Token[] = []
const EMPTY_TAGS: (string | null)[] = []

/** No window larger than this many lines is worth it; reclassify everything instead. */
const MAX_WINDOW_LINES = 400

/** Newlines in the old text between `from` and `to`, read line by line. */
function countNewlinesIn(lines: string[], starts: number[], from: number, to: number): number {
  let n = 0
  for (let i = lineOf(starts, from); i < starts.length; i++) {
    const base = starts[i]!
    if (base >= to)
      break
    const line = lines[i]!
    const s = Math.max(0, from - base)
    const e = Math.min(line.length, to - base)
    for (let k = s; k < e; k++) {
      if (line[k] === '\n')
        n++
    }
  }
  return n
}

function countNewlines(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n')
      n++
  }
  return n
}

function lineOf(starts: readonly number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid]! <= offset)
      lo = mid
    else
      hi = mid - 1
  }
  return lo
}

/**
 * Nearest offset <= `off` that no `<…>` region can span: walk back to the first
 * lone `<` or `>` operator. A `>` means every region closed before `off`; a `<`
 * with no `>` after it opens a region that reaches across `off`, so `off` moves
 * back to it and the walk repeats.
 */
function safeLeft(at: CharAt, starts: number[], toks: Token[][], off: number): number {
  for (;;) {
    const p = firstAngleBack(at, starts, toks, off)
    // no operator behind it, or one that closed a region: `off` is clear
    if (p < 0)
      return 0
    if (at(p) === '>')
      return off
    // a lone `<` with no `>` before `off` opens a region across it
    if (p === 0)
      return 0
    off = p
  }
}

/** Nearest offset >= `off` that no `<…>` region spans. */
function safeRight(at: CharAt, starts: number[], toks: Token[][], off: number, docEnd: number): number {
  for (let i = lineOf(starts, off); i < starts.length; i++) {
    const base = starts[i]!
    for (const t of toks[i]!) {
      const s = base + t.start
      if (s < off || t.kind !== 'op')
        continue
      const e = base + t.end
      if (e - s !== 1)
        continue
      const c = at(s)
      if (c === '<')
        return off // a region starts after `off`, so `off` itself is clear
      if (c === '>')
        return e // closed a region that reached across `off`
    }
  }
  return docEnd
}

/** Offset of the nearest lone `<` or `>` operator strictly before `off`, or -1. */
function firstAngleBack(at: CharAt, starts: number[], toks: Token[][], off: number): number {
  for (let i = lineOf(starts, off); i >= 0; i--) {
    const base = starts[i]!
    const arr = toks[i]!
    for (let j = arr.length - 1; j >= 0; j--) {
      const t = arr[j]!
      const s = base + t.start
      if (s >= off || t.kind !== 'op')
        continue
      const e = base + t.end
      if (e - s === 1 && (at(s) === '<' || at(s) === '>'))
        return s
    }
  }
  return -1
}

/** Can no `<…>` region span `off`? True when the nearest operator behind it closes one. */
function candidateSafe(at: CharAt, starts: number[], toks: Token[][], off: number): boolean {
  const p = firstAngleBack(at, starts, toks, off)
  return p < 0 || at(p) === '>'
}

/** Count lone `<`/`>` operator tokens in lines [lo, hi). */
function countAngles(at: CharAt, starts: number[], toks: Token[][], lo: number, hi: number): number {
  let n = 0
  for (let i = lo; i < hi && i < toks.length; i++) {
    const base = starts[i]!
    for (const t of toks[i]!) {
      if (t.kind !== 'op')
        continue
      const e = base + t.end
      const s = base + t.start
      if (e - s === 1 && (at(s) === '<' || at(s) === '>'))
        n++
    }
  }
  return n
}

/**
 * Everything the colouring half needs to know about the document *before* an
 * edit, captured while the old arrays are still intact (the fast path below
 * rewrites them in place).
 */
interface OldSide {
  /** Length of the old text. */
  len: number
  /** First and last offsets of the re-lexed lines, in the old text. */
  edgeLo: number
  edgeHi: number
  /** Whether the document had any lone `<`/`>` operator before the edit. */
  hadAngles: boolean
  /** Lone operators in the re-lexed old lines. */
  angles: number
  /** Region-safe bounds around the re-lexed lines, in the old text. */
  lo: number
  hi: number
  /** Candidate regions the old text had between `lo` and `hi`. */
  cands: Region[]
}

/**
 * Sort marks by offset and cut out overlaps (the earlier one wins), so the
 * renderer can assume both `from` and `to` only ever increase.
 */
function normalizeMarks(marks: readonly GlowMark[]): GlowMark[] {
  const sorted = [...marks].filter(m => m.to > m.from).sort((a, b) => a.from - b.from)
  const out: GlowMark[] = []
  for (const m of sorted) {
    const prev = out[out.length - 1]
    if (prev && m.from < prev.to) {
      // overlapping: keep the earlier mark and clip this one past it
      if (m.to <= prev.to)
        continue
      out.push({ ...m, from: prev.to })
    }
    else {
      out.push({ ...m })
    }
  }
  return out
}

/** Move marks along with an edit, the way an editor keeps its highlights. */
function shiftMarks(marks: GlowMark[], from: number, to: number, insertLen: number): GlowMark[] {
  const delta = insertLen - (to - from)
  return marks.map((m) => {
    if (m.to <= from)
      return m
    if (m.from >= to)
      return { ...m, from: m.from + delta, to: m.to + delta }
    // the edit happened inside the mark: it swallows the insertion and keeps
    // whatever it already covered
    return { ...m, from: Math.min(m.from, from), to: Math.max(m.to, from + insertLen) }
  })
}

const marksLo = (marks: readonly GlowMark[]): number => (marks.length ? marks[0]!.from : Infinity)
const marksHi = (marks: readonly GlowMark[]): number => (marks.length ? marks[marks.length - 1]!.to : -1)

/** What an edit changed, in the new document's line numbering. */
export interface GlowPatch {
  /** Index in the new document where the changed lines begin. */
  startLine: number
  /** How many of the old document's lines these replace. */
  removed: number
  /** Rendered inner HTML of each new line, in order — no `.glow-line` wrapper. */
  lines: string[]
  /** True when the whole document was re-rendered; `startLine`/`removed` then cover all of it. */
  full: boolean
  /**
   * True when the *text* is untouched and only caller marks changed — the lines
   * are re-rendered, but nothing was inserted or removed. A renderer that keeps
   * state tied to line numbers (folds, for one) must not move it for these.
   */
  marks?: boolean
}

export class GlowDocument {
  /**
   * The document text, one string per line (each including its trailing newline).
   * Storing it this way is what keeps an edit from materialising the whole
   * text: V8 flattens a freshly concatenated string the moment anything indexes
   * it, which costs a full copy per keystroke and grows with the file.
   */
  private lines: string[]
  /** Total characters, so nothing has to re-measure the text. */
  private len: number
  /** Absolute offset of each line start. */
  private starts: number[]
  /** Per line: tokens covering the line's segment (incl. its trailing '\n'), offsets relative to the line start. */
  private toks: Token[][]
  /** Per line: lexer state at the line start. */
  private states: Frame[][]
  /** Per line: colour tag of each token, parallel to `toks`. */
  private tags: (string | null)[][]
  /** Document-wide candidate-region name counts, driving `paired`. */
  private counts: NameCounts
  /** The regions that are markup, sorted by `s`. */
  private decided: Array<{ s: number, e: number }>
  /** Lone `<`/`>` operator tokens in the whole document — 0 means plain code. */
  private angleCount: number
  /** Caller ranges laid over the output (search hits, diagnostics), sorted and non-overlapping. */
  private marks: GlowMark[] = []

  /** Where the colouring half reads characters and token text from. */
  private readonly src: SourceText

  constructor(text: string) {
    const lexed = lexLines(splitLines(text))
    this.lines = lexed.lines
    this.len = text.length
    this.starts = lexed.starts
    this.toks = lexed.toks
    this.states = lexed.states
    this.tags = []
    this.src = { at: off => this.at(off), of: tok => this.of(tok) }
    this.counts = { open: new Map(), close: new Map() }
    this.decided = []
    this.angleCount = 0
    this.rebuild()
  }

  get value(): string {
    return this.lines.join('')
  }

  get lineCount(): number {
    return this.starts.length
  }

  /** Absolute offset where line `i` starts. */
  lineStart(i: number): number {
    return this.starts[i]!
  }

  /** Index of the line containing `offset`. */
  lineAt(offset: number): number {
    return lineOf(this.starts, Math.max(0, Math.min(offset, this.len)))
  }

  /** The length of line `i` as rendered — its segment without the trailing newline. */
  private visibleLen(i: number): number {
    const text = this.lines[i]!
    return text.endsWith('\n') ? text.length - 1 : text.length
  }

  /** The text of line `i`, without its trailing newline. */
  lineText(i: number): string {
    return this.lines[i]!.slice(0, this.visibleLen(i))
  }

  /** The character at an absolute offset, or '' past the end. */
  private at(offset: number): string {
    const i = lineOf(this.starts, offset)
    return this.lines[i]![offset - this.starts[i]!] ?? ''
  }

  /** The text a token covers (tokens never span lines here). */
  private of(tok: Token): string {
    const i = lineOf(this.starts, tok.start)
    const base = this.starts[i]!
    return this.lines[i]!.slice(tok.start - base, tok.end - base)
  }

  /** Colour tag of line `i`'s tokens, parallel to `lineTokens(i)`. */
  lineTags(i: number): (string | null)[] {
    return this.tags[i]!
  }

  /** Tokens of line `i` with absolute offsets. */
  lineTokens(i: number): Token[] {
    const base = this.starts[i]!
    return this.toks[i]!.map(t => ({ kind: t.kind, start: base + t.start, end: base + t.end }))
  }

  /**
   * The marks overlapping `[ls, le)`, rebased to start at `ls` — `line(i)` hands
   * the renderer line-relative tokens, so the marks have to be in that space too.
   * Assumes `marks` is sorted and disjoint.
   */
  private marksIn(ls: number, le: number): readonly GlowMark[] {
    const m = this.marks
    if (!m.length)
      return m
    // first mark that could still reach into the line
    let lo = 0
    let hi = m.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (m[mid]!.to <= ls)
        lo = mid + 1
      else
        hi = mid
    }
    const out: GlowMark[] = []
    for (let i = lo; i < m.length && m[i]!.from < le; i++) {
      const x = m[i]!
      out.push({ ...x, from: x.from - ls, to: x.to - ls })
    }
    return out
  }

  /** Rendered inner HTML of line `i` — no `.glow-line` wrapper. */
  line(i: number): string {
    const toks = this.toks[i]!
    const tags = this.tags[i]!
    const rt: RenderToken[] = []
    for (let j = 0; j < toks.length; j++)
      rt.push({ start: toks[j]!.start, end: toks[j]!.end, tag: tags[j]! })
    const ls = this.starts[i]!
    return renderLine(this.lines[i]!, rt, 0, 0, this.visibleLen(i), this.marksIn(ls, ls + this.lines[i]!.length))
  }

  /** The ranges currently laid over the output. */
  get markRanges(): readonly GlowMark[] {
    return this.marks
  }

  /**
   * Replace the callers' ranges (search hits, diagnostics). The text does not
   * change, so this returns a patch covering just the lines whose markup did —
   * hand it to the same renderer that applies edits.
   */
  setMarks(marks: readonly GlowMark[]): GlowPatch {
    const before = this.marks
    const after = normalizeMarks(marks)
    this.marks = after

    const lo = Math.min(marksLo(before), marksLo(after))
    const hi = Math.max(marksHi(before), marksHi(after))
    if (lo >= hi)
      return { startLine: 0, removed: 0, lines: [], full: false }

    const startLine = lineOf(this.starts, lo)
    const lastLine = lineOf(this.starts, hi - 1)
    return {
      startLine,
      removed: lastLine - startLine + 1,
      lines: this.renderLines(startLine, lastLine + 1),
      full: false,
      marks: true,
    }
  }

  /** Inner HTML of every line, joined with '\n'. */
  render(opts: GlowOptions = {}): string {
    const out: string[] = []
    for (let i = 0; i < this.starts.length; i++) {
      const inner = this.line(i)
      out.push(opts.numbered ? `<span class="glow-line">${inner}</span>` : inner)
    }
    return out.join('\n')
  }

  /**
   * Replace `[from, to)` with `insert`. Re-lexes and re-colours from the touched
   * line until the context matches the old one again, then reuses the rest.
   */
  update(from: number, to: number, insert: string): GlowPatch {
    const oldLines = this.lines
    const oldStarts = this.starts
    const oldToks = this.toks
    const oldStates = this.states
    const oldTags = this.tags
    const oldLen = this.len
    const oldLineCount = oldStarts.length
    const at: CharAt = off => this.at(off)

    const delta = insert.length - (to - from)
    if (this.marks.length)
      this.marks = shiftMarks(this.marks, from, to, insert.length)
    const startLine = lineOf(oldStarts, from)
    const toLine = lineOf(oldStarts, to)
    const deltaLines = countNewlines(insert) - countNewlinesIn(oldLines, oldStarts, from, to)
    const totalNewLines = oldLineCount + deltaLines
    const endLine = startLine + countNewlines(insert)

    // The new text of the lines the edit touched, built from the pieces around
    // it. Nothing here ever touches the rest of the document, which is what
    // keeps V8 from flattening a whole-file string on every keystroke.
    const startOff = oldStarts[startLine]!
    const toOff = oldStarts[toLine]!
    const regionText = oldLines[startLine]!.slice(0, from - startOff)
      + insert
      + oldLines[toLine]!.slice(to - toOff)
    const region = splitLines(regionText)
    // a trailing empty piece is the *next* old line continuing, not a new one
    if (region.length > 1 && region[region.length - 1] === '' && toLine + 1 < oldLineCount)
      region.pop()
    const lineTextAt = (k: number): string =>
      k < startLine + region.length ? region[k - startLine]! : oldLines[k - deltaLines]!

    // if the edit swallowed every line from `startLine` on there is no prefix to
    // reuse; lex and colour the whole thing afresh (rare, and always correct)
    if (startLine >= totalNewLines) {
      const flat = oldLines.slice(0, startLine).join('') + regionText + oldLines.slice(toLine + 1).join('')
      const re = lexLines(splitLines(flat))
      this.lines = re.lines
      this.starts = re.starts
      this.toks = re.toks
      this.states = re.states
      this.len = flat.length
      this.rebuild()
      return { startLine: 0, removed: oldLineCount, lines: this.renderLines(0, re.lines.length), full: true }
    }

    let state: readonly Frame[] = oldStates[startLine]!
    let converged = -1
    // lex the dirty lines into locals — the common path below must not copy the file
    const dirtyLines: string[] = []
    const dirtyToks: Token[][] = []
    const dirtyStates: Frame[][] = []

    for (let line = startLine; line < totalNewLines; line++) {
      const text = lineTextAt(line)
      dirtyLines.push(text)
      dirtyStates.push(state as Frame[])
      const run = lexSegment(text, 0, text.length, state, false)
      dirtyToks.push(run.tokens.length === 0 ? EMPTY_TOKENS : run.tokens)
      state = run.state.length === 0 ? EMPTY_STATE : run.state

      // once past the edit, an equal state means the tail lexes as it did before
      const next = line + 1
      if (next > endLine) {
        const o = next - deltaLines
        if (o >= 0 && o < oldLineCount && sameState(state, oldStates[o]!)) {
          converged = next
          break
        }
      }
    }

    const mark = converged === -1 ? totalNewLines : converged
    const oldEndLine = mark - deltaLines

    // Everything the colouring half needs from the OLD state, taken now, while
    // the old arrays are still intact.
    const oldEdgeLo = oldStarts[startLine]!
    const oldEdgeHi = oldEndLine < oldLineCount ? oldStarts[oldEndLine]! : oldLen
    const hadAngles = this.angleCount > 0
    const oldAngles = countAngles(at, oldStarts, oldToks, startLine, oldEndLine)
    const oldLo = !hadAngles || candidateSafe(at, oldStarts, oldToks, oldEdgeLo) ? oldEdgeLo : safeLeft(at, oldStarts, oldToks, oldEdgeLo)
    const oldHi = !hadAngles || candidateSafe(at, oldStarts, oldToks, oldEdgeHi) ? oldEdgeHi : safeRight(at, oldStarts, oldToks, oldEdgeHi, oldLen)
    const oldCands = detectRegions(this.src, tokensInRange(oldStarts, oldToks, oldLo, oldHi))
    const oldSide: OldSide = { len: oldLen, edgeLo: oldEdgeLo, edgeHi: oldEdgeHi, hadAngles, angles: oldAngles, lo: oldLo, hi: oldHi, cands: oldCands }

    let window: { loLine: number, hiLine: number } | null

    if (deltaLines === 0) {
      // No line appears or vanishes — what typing does. Swap the dirty lines in
      // place and shift only the offsets that follow them, so nothing is copied
      // wholesale and no array is reallocated.
      for (let k = startLine; k < mark; k++) {
        this.lines[k] = dirtyLines[k - startLine]!
        this.toks[k] = dirtyToks[k - startLine]!
        this.states[k] = dirtyStates[k - startLine]!
        if (k > startLine)
          this.starts[k] = this.starts[k - 1]! + this.lines[k - 1]!.length
      }
      for (let k = mark; k < totalNewLines; k++)
        this.starts[k] = this.starts[k]! + delta
      this.len = oldLen + delta
      window = this.recolor(oldSide, startLine, oldEndLine, mark, delta, from, oldTags, at)
    }
    else {
      // lines were added or removed: rebuild the arrays, reusing the tail
      const newLines = oldLines.slice(0, startLine)
      const newStarts = oldStarts.slice(0, startLine)
      const newToks = oldToks.slice(0, startLine)
      const newStates = oldStates.slice(0, startLine)
      const newTags: (string | null)[][] = oldTags.slice(0, startLine)
      let pos = oldStarts[startLine]!
      for (let k = startLine; k < mark; k++) {
        const text = dirtyLines[k - startLine]!
        newLines[k] = text
        newStarts[k] = pos
        pos += text.length
        newToks[k] = dirtyToks[k - startLine]!
        newStates[k] = dirtyStates[k - startLine]!
      }
      for (let k = mark; k < totalNewLines; k++) {
        const o = k - deltaLines
        newLines[k] = oldLines[o]!
        newStarts[k] = oldStarts[o]! + delta
        newToks[k] = oldToks[o]!
        newStates[k] = oldStates[o]!
        newTags[k] = oldTags[o]!
      }

      this.lines = newLines
      this.starts = newStarts
      this.toks = newToks
      this.states = newStates
      this.tags = newTags
      this.len = oldLen + delta

      window = this.recolor(oldSide, startLine, oldEndLine, mark, delta, from, oldTags, at)
    }

    if (window === null)
      return { startLine: 0, removed: oldLineCount, lines: this.renderLines(0, this.starts.length), full: true }
    const { loLine, hiLine } = window
    return {
      startLine: loLine,
      removed: hiLine - deltaLines - loLine,
      lines: this.renderLines(loLine, hiLine),
      full: false,
    }
  }

  /** Rendered inner HTML for lines [lo, hi) — no wrappers. */
  private renderLines(lo: number, hi: number): string[] {
    const out: string[] = []
    for (let i = lo; i < hi; i++) out.push(this.line(i))
    return out
  }

  // ---- colouring ----------------------------------------------------------

  /** Offsets of every token in lines [lo, hi), relative tokens made absolute. */
  private flatLines(starts: number[], toks: Token[][], lo: number, hi: number): Token[] {
    const out: Token[] = []
    for (let i = lo; i < hi && i < toks.length; i++) {
      const base = starts[i]!
      for (const t of toks[i]!) out.push({ kind: t.kind, start: base + t.start, end: base + t.end })
    }
    return out
  }

  /** Full recompute of counts, decided regions and tags. */
  private rebuild(): void {
    const flat = this.flatLines(this.starts, this.toks, 0, this.starts.length)
    const candidates = detectRegions(this.src, flat)
    this.counts = countNames(candidates)
    this.decided = decideRegions(candidates, this.counts).map(r => ({ s: r.start, e: r.end }))
    this.angleCount = countAngles(off => this.at(off), this.starts, this.toks, 0, this.starts.length)
    const tagged = classifyWindow(this.src, flat, this.counts, false, false)
    this.tags = []
    let k = 0
    for (let i = 0; i < this.toks.length; i++) {
      const line: (string | null)[] = []
      for (let j = 0; j < this.toks[i]!.length; j++) line.push(tagged[k++]!.tag)
      this.tags.push(line.length === 0 ? EMPTY_TAGS : line)
    }
  }

  /** End of the last decided region ending at or before `off`, or 0. */
  private decidedEndBefore(off: number): number {
    // `decided` is sorted by s, and regions are disjoint, so e grows with s too
    let lo = 0
    let hi = this.decided.length - 1
    let best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.decided[mid]!.e <= off) {
        best = mid
        lo = mid + 1
      }
      else {
        hi = mid - 1
      }
    }
    return best < 0 ? 0 : this.decided[best]!.e
  }

  /** Start of the first decided region starting at or after `off`, or `len`. */
  private decidedStartAfter(off: number, len: number): number {
    let lo = 0
    let hi = this.decided.length - 1
    let best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.decided[mid]!.s >= off) {
        best = mid
        hi = mid - 1
      }
      else {
        lo = mid + 1
      }
    }
    return best < 0 ? len : this.decided[best]!.s
  }

  private recolor(
    old: OldSide,
    oldStartLine: number,
    oldEndLine: number,
    newEndLine: number,
    delta: number,
    from: number,
    oldTags: (string | null)[][],
    at: CharAt,
  ): { loLine: number, hiLine: number } | null {
    const { len: oldLen, edgeLo: oldEdgeLo, edgeHi: oldEdgeHi, lo: oldLo, hi: oldHi, cands: oldCands } = old
    const newLen = this.len

    // --- candidate regions the window contributes, after the edit ---
    // The range is widened so no `<…>` region straddles it: a `<` elsewhere can
    // gain its `>` from the edit, and then the counts must change too.
    const newEdgeLo = this.starts[oldStartLine]!
    const newEdgeHi = newEndLine < this.starts.length ? this.starts[newEndLine]! : newLen
    const newAngles = countAngles(at, this.starts, this.toks, oldStartLine, newEndLine)
    this.angleCount += newAngles - old.angles
    const newLo = !this.angleCount || candidateSafe(at, this.starts, this.toks, newEdgeLo) ? newEdgeLo : safeLeft(at, this.starts, this.toks, newEdgeLo)
    const newHi = !this.angleCount || candidateSafe(at, this.starts, this.toks, newEdgeHi) ? newEdgeHi : safeRight(at, this.starts, this.toks, newEdgeHi, newLen)
    const newCands = detectRegions(this.src, tokensInRange(this.starts, this.toks, newLo, newHi))

    // --- update document-wide counts and see whether any name changed sides ---
    const isPaired = (name: string): boolean =>
      (this.counts.open.get(name) ?? 0) > 0 && (this.counts.close.get(name) ?? 0) > 0
    const touched = new Set<string>()
    const bump = (r: Region, by: number) => {
      touched.add(r.name)
      const m = r.closer ? this.counts.close : this.counts.open
      m.set(r.name, (m.get(r.name) ?? 0) + by)
    }
    const oldPaired = new Map<string, boolean>()
    for (const r of oldCands) {
      if (!oldPaired.has(r.name))
        oldPaired.set(r.name, isPaired(r.name))
    }
    for (const r of oldCands) bump(r, -1)
    for (const r of newCands) bump(r, +1)

    // a name crossing zero re-decides every region with it, anywhere in the file
    for (const name of touched) {
      if (oldPaired.get(name) !== isPaired(name)) {
        this.rebuild()
        return null
      }
    }

    // --- pick the window ---
    // A prose gap only exists between two decided regions, so the window starts
    // just after one (the gap touching the edit is then whole) and ends just
    // before another. With none inside, the dirty lines suffice — that is what
    // keeps plain code, which has no markup at all, from re-colouring the file.
    const startLineStart = this.starts[oldStartLine]!
    const dirtyEndOld = oldEdgeHi
    let wLo = this.decidedEndBefore(from)
    // Back up past whole lines: a region is decided from its `<` *and* the
    // tokens after it, so re-lexing a line can invalidate a region whose `<` is
    // on that line even though the edit is later. The window must cover every
    // re-lexed token.
    while (wLo > 0 && lineOf(this.starts, wLo) >= oldStartLine)
      wLo = this.decidedEndBefore(wLo - 1)
    let wHiOld = this.decidedStartAfter(dirtyEndOld, oldLen)
    if (
      !this.decided.some(r => r.s >= wLo && r.s < wHiOld)
      && newLo === newEdgeLo && newHi === newEdgeHi
      && oldLo === oldEdgeLo && oldHi === oldEdgeHi
    ) {
      // nothing decided inside and both edges are region-safe, so the dirty
      // lines alone are enough
      wLo = Math.max(wLo, startLineStart)
      wHiOld = dirtyEndOld
    }
    const wHi = wHiOld + delta
    const leftBounded = wLo > 0 && this.decidedEndBefore(wLo) === wLo
    const rightBounded = wHiOld < oldLen && this.decidedStartAfter(wHiOld, oldLen) === wHiOld

    const lineEndOf = (i: number): number => (i + 1 < this.starts.length ? this.starts[i + 1]! : newLen)
    let loLine = lineOf(this.starts, wLo)
    // A line belongs to the window if it starts before `wHi`; the only line at
    // `wHi` itself that does is a trailing empty one, whose start is the end of
    // the text. (`wHi` may land exactly on a line start — then that line is out.)
    let hiLine = wHi >= newLen
      ? this.starts.length
      : Math.min(lineOf(this.starts, Math.max(0, wHi - 1)) + 1, this.starts.length)
    while (loLine < hiLine && loLine < oldStartLine && lineEndOf(loLine) <= wLo) loLine++
    while (hiLine - 1 > loLine && hiLine - 1 >= newEndLine && this.starts[hiLine - 1]! >= wHi) hiLine--
    if (hiLine - loLine > MAX_WINDOW_LINES) {
      this.rebuild()
      return null
    }
    const windowToks = tokensInRange(this.starts, this.toks, wLo, wHi)
    const tagged = classifyWindow(this.src, windowToks, this.counts, leftBounded, rightBounded)

    // --- rebuild the decided list over the window, shifting the tail ---
    const tail = this.decided.filter(r => r.s >= wHiOld).map(r => ({ s: r.s + delta, e: r.e + delta }))
    const head = this.decided.filter(r => r.e <= wLo)
    const fresh = decideRegions(detectRegions(this.src, windowToks), this.counts)
      .map(r => ({ s: r.start, e: r.end }))
    this.decided = [...head, ...fresh, ...tail]

    // --- write tags, token by token ---
    // A boundary line may be covered only from `wLo` (or only up to `wHi`): its
    // in-window tokens take the new tag, the rest keep the one they had, which
    // is still right because the window's edges sit at decided-region bounds —
    // nothing outside them can have been re-decided.
    const deltaLines = newEndLine - oldEndLine
    let ti = 0
    for (let i = loLine; i < hiLine; i++) {
      const base = this.starts[i]!
      const cur = this.tags[i]
      const line: (string | null)[] = []
      let j = 0
      for (const t of this.toks[i]!) {
        const s = base + t.start
        const e = base + t.end
        if (s >= wLo && e <= wHi) {
          line.push(tagged[ti++]!.tag)
        }
        else {
          // before the window: the same line as before the edit; after it: the
          // line that shifted down by the edit's line delta
          const prev = s < wLo ? (cur ?? oldTags[i]) : (cur ?? oldTags[i - deltaLines])
          line.push(prev?.[j] ?? null)
        }
        j++
      }
      this.tags[i] = line.length === 0 ? EMPTY_TAGS : line
    }
    return { loLine, hiLine }
  }
}

/** A single character of the text, by absolute offset. */
type CharAt = (offset: number) => string

/** Tokens whose extent lies wholly inside [lo, hi). */
function tokensInRange(starts: number[], toks: Token[][], lo: number, hi: number): Token[] {
  const out: Token[] = []
  for (let i = lineOf(starts, lo); i < starts.length; i++) {
    const base = starts[i]!
    if (base >= hi)
      break
    if (!toks[i])
      throw new Error(`hole at line ${i}: toks.length=${toks.length} starts.length=${starts.length} lo=${lo} hi=${hi}`)
    for (const t of toks[i]!) {
      const s = base + t.start
      const e = base + t.end
      if (s >= lo && e <= hi)
        out.push({ kind: t.kind, start: s, end: e })
    }
  }
  return out
}

/** Split text into lines, each keeping its trailing newline. */
function splitLines(text: string): string[] {
  if (text === '')
    return ['']
  const out: string[] = []
  let p = 0
  for (;;) {
    const nl = text.indexOf('\n', p)
    if (nl === -1) {
      out.push(text.slice(p))
      break
    }
    out.push(text.slice(p, nl + 1))
    p = nl + 1
  }
  return out
}

/** Lex each line's text on its own, carrying the state across lines. */
function lexLines(lines: string[]): { lines: string[], starts: number[], toks: Token[][], states: Frame[][] } {
  const count = lines.length
  const starts: number[] = []
  const toks: Token[][] = []
  const states: Frame[][] = []
  starts.length = count
  toks.length = count
  states.length = count
  let state: readonly Frame[] = EMPTY_STATE
  let pos = 0
  for (let i = 0; i < count; i++) {
    const line = lines[i]!
    starts[i] = pos
    states[i] = state.length === 0 ? EMPTY_STATE : (state as Frame[])
    // offsets come back relative to the line, which is how they are stored.
    // Each line is its own segment, so only the caller knows where the input ends.
    const run = lexSegment(line, 0, line.length, state, false)
    toks[i] = run.tokens.length === 0 ? EMPTY_TOKENS : run.tokens
    state = run.state.length === 0 ? EMPTY_STATE : run.state
    pos += line.length
  }
  return { lines, starts, toks, states }
}

export function glowDocument(text: string): GlowDocument {
  return new GlowDocument(text)
}
