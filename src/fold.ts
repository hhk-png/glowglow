/*
  Folding is a view concern, not a lexing one: the document is untouched, only
  the question "which lines does a renderer draw" changes.

  So this is just the mapping, kept apart from whatever decided the folds (brace
  matching, an outline, a hand-written list) and from the renderer that uses it —
  a virtualised list asks `lineAt(row)` and draws, nothing else.
*/

export interface GlowFold {
  /** First line of the fold. It stays visible, carrying the collapsed marker. */
  from: number
  /** Last line of the fold, inclusive. The lines after `from` are hidden. */
  to: number
  /** Text for the collapsed marker. Defaults to how many lines it hides. */
  label?: string
}

export interface GlowFoldMap {
  /** How many rows are drawn with these folds collapsed. */
  readonly visibleCount: number
  /** How many lines these folds hide in total. */
  readonly hiddenCount: number
  /** How many lines the fold drawn at `row` hides, or 0 when `row` is not a fold. */
  hiddenAt: (row: number) => number
  /** The document line drawn at `row`. */
  lineAt: (row: number) => number
  /** The row a document line is drawn at, or -1 when a fold hides it. */
  rowOf: (line: number) => number
  /**
   * The row of the fold that hides `line`, or -1 when the line is drawn. Lets a
   * caret parked on a hidden line fall back to the fold's own row.
   */
  foldRowOf: (line: number) => number
}

interface Run {
  /** The fold's first line. */
  from: number
  /** The fold's last line. */
  to: number
  /** The row `from` is drawn at. */
  row: number
  /** Hidden lines before this fold. */
  before: number
  /** Hidden lines up to and including this fold. */
  after: number
  /** The fold's label, if it has one. */
  label?: string
}

/** Sort, clip and drop folds that hide nothing or overlap an earlier one. */
function normalize(folds: readonly GlowFold[], lineCount: number): GlowFold[] {
  const clipped = folds
    .map(f => ({ ...f, from: Math.max(0, Math.min(f.from, lineCount - 1)), to: Math.min(f.to, lineCount - 1) }))
    .filter(f => f.to > f.from)
    .sort((a, b) => a.from - b.from)
  const out: GlowFold[] = []
  for (const f of clipped) {
    const prev = out[out.length - 1]
    if (prev && f.from <= prev.to)
      continue // overlaps an earlier fold: the earlier one wins
    out.push(f)
  }
  return out
}

/**
 * Move folds along with an edit, so a collapsed block stays around its own text.
 * Folds wholly after the edit shift; one the edit lands inside keeps its first
 * line and takes on whatever was inserted.
 */
export function shiftFolds(
  folds: readonly GlowFold[],
  startLine: number,
  removed: number,
  added: number,
): GlowFold[] {
  const delta = added - removed
  const end = startLine + removed
  const out: GlowFold[] = []
  for (const f of folds) {
    if (f.to < startLine) {
      out.push(f)
      continue
    }
    if (f.from >= end) {
      out.push({ ...f, from: f.from + delta, to: f.to + delta })
      continue
    }
    // the edit is inside the fold: its first line is kept, and everything after
    // the edit shifts, so the fold grows or shrinks by the same delta
    const from = Math.min(f.from, startLine)
    const to = f.to + delta
    if (to > from)
      out.push({ ...f, from, to })
  }
  return out
}

/**
 * The document line drawn at each visible row, given some collapsed ranges.
 * Folds are clipped to the document, and overlapping ones are dropped.
 *
 *     const map = foldMap([{ from: 2, to: 5 }], doc.lineCount)
 *     map.visibleCount   // 3 fewer rows
 *     map.lineAt(0)      // 0
 *     map.lineAt(3)      // 6 — the line after the fold
 *     map.hiddenAt(2)    // 3 — the row that carries the marker
 */
export function foldMap(folds: readonly GlowFold[], lineCount: number): GlowFoldMap {
  const runs: Run[] = []
  let hidden = 0
  for (const f of normalize(folds, lineCount)) {
    const hides = f.to - f.from
    runs.push({ from: f.from, to: f.to, row: f.from - hidden, before: hidden, after: hidden + hides, label: f.label })
    hidden += hides
  }
  const total = hidden
  const n = runs.length

  /** Index of the last run satisfying `test`, or -1. */
  function search(test: (r: Run) => boolean): number {
    let lo = 0
    let hi = n - 1
    let best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (test(runs[mid]!)) {
        best = mid
        lo = mid + 1
      }
      else {
        hi = mid - 1
      }
    }
    return best
  }

  return {
    visibleCount: Math.max(0, lineCount - total),
    hiddenCount: total,
    hiddenAt(row: number): number {
      const i = search(r => r.row <= row)
      const r = runs[i]
      return r && r.row === row ? r.after - r.before : 0
    },
    lineAt(row: number): number {
      // only folds that start *before* this row have pushed it down — the row a
      // fold starts on is its first line, which stays visible
      const i = search(r => r.row < row)
      return row + (i < 0 ? 0 : runs[i]!.after)
    },
    rowOf(line: number): number {
      const inside = search(r => r.from <= line)
      const r = runs[inside]
      if (r && line > r.from && line <= r.to)
        return -1 // folded away
      const i = search(x => x.to < line)
      return line - (i < 0 ? 0 : runs[i]!.after)
    },
    foldRowOf(line: number): number {
      const i = search(r => r.from <= line)
      const r = runs[i]
      return r && line > r.from && line <= r.to ? r.row : -1
    },
  }
}
