// The fold map is the projection a virtualised renderer draws through, so every
// direction of it has to agree with the others.

import { describe, expect, it } from 'vitest'
import { foldMap, shiftFolds } from '../src/fold'

/** The document line at every visible row, which is what a renderer draws. */
function rows(folds: Parameters<typeof foldMap>[0], lineCount: number): number[] {
  const map = foldMap(folds, lineCount)
  return Array.from({ length: map.visibleCount }, (_, r) => map.lineAt(r))
}

describe('foldMap', () => {
  it('is the identity with nothing folded', () => {
    const map = foldMap([], 5)
    expect(map.visibleCount).toBe(5)
    expect(rows([], 5)).toEqual([0, 1, 2, 3, 4])
    expect(map.hiddenAt(2)).toBe(0)
    expect([0, 1, 2, 3, 4].map(l => map.rowOf(l))).toEqual([0, 1, 2, 3, 4])
  })

  it('keeps the first folded line visible and hides the rest', () => {
    const map = foldMap([{ from: 2, to: 5 }], 8)
    expect(map.visibleCount).toBe(5) // 8 lines, 3 hidden
    expect(map.hiddenCount).toBe(3)
    expect(rows([{ from: 2, to: 5 }], 8)).toEqual([0, 1, 2, 6, 7])
    expect(map.hiddenAt(2)).toBe(3)
    expect(map.hiddenAt(3)).toBe(0)
    expect(map.rowOf(2)).toBe(2)
    expect(map.rowOf(3)).toBe(-1)
    expect(map.rowOf(5)).toBe(-1)
    expect(map.rowOf(6)).toBe(3)
  })

  it('handles folds at both ends', () => {
    expect(rows([{ from: 0, to: 2 }], 5)).toEqual([0, 3, 4])
    expect(rows([{ from: 3, to: 4 }], 5)).toEqual([0, 1, 2, 3])
  })

  it('stacks several folds', () => {
    const folds = [{ from: 1, to: 2 }, { from: 6, to: 9 }]
    expect(rows(folds, 11)).toEqual([0, 1, 3, 4, 5, 6, 10])
    const map = foldMap(folds, 11)
    // rows: 0 1 3 4 5 6 10 — the second fold is drawn on row 5, not 4
    expect(map.hiddenAt(1)).toBe(1)
    expect(map.hiddenAt(5)).toBe(3)
    expect(map.rowOf(4)).toBe(3)
    expect(map.rowOf(7)).toBe(-1)
    // a caret parked on a hidden line falls back to the fold's row
    expect(map.foldRowOf(7)).toBe(5)
    expect(map.foldRowOf(4)).toBe(-1)
  })

  it('drops folds that hide nothing or overlap an earlier one', () => {
    expect(rows([{ from: 2, to: 2 }], 5)).toEqual([0, 1, 2, 3, 4])
    // the second overlaps the first, so it is dropped rather than merged
    expect(rows([{ from: 1, to: 4 }, { from: 2, to: 6 }], 8)).toEqual([0, 1, 5, 6, 7])
  })

  it('clips folds to the document', () => {
    expect(rows([{ from: 3, to: 99 }], 5)).toEqual([0, 1, 2, 3])
    expect(rows([{ from: -5, to: 1 }], 4)).toEqual([0, 2, 3])
  })

  it('round-trips: every drawn row maps back to its line', () => {
    const cases: Array<[Array<{ from: number, to: number }>, number]> = [
      [[], 6],
      [[{ from: 0, to: 1 }], 6],
      [[{ from: 4, to: 5 }], 6],
      [[{ from: 1, to: 2 }, { from: 4, to: 5 }], 6],
      [[{ from: 0, to: 99 }], 6],
    ]
    for (const [folds, lineCount] of cases) {
      const map = foldMap(folds, lineCount)
      for (let r = 0; r < map.visibleCount; r++) {
        const line = map.lineAt(r)
        expect(line, `row ${r}`).toBeGreaterThanOrEqual(0)
        expect(line, `row ${r}`).toBeLessThan(lineCount)
        expect(map.rowOf(line), `row ${r} -> line ${line}`).toBe(r)
      }
      // and every line is either drawn exactly once, or hidden
      const drawn = new Set(Array.from({ length: map.visibleCount }, (_, r) => map.lineAt(r)))
      for (let l = 0; l < lineCount; l++) {
        const row = map.rowOf(l)
        if (row >= 0)
          expect(drawn.has(l), `line ${l}`).toBe(true)
        else
          expect(drawn.has(l), `line ${l}`).toBe(false)
      }
    }
  })
})

describe('shiftFolds', () => {
  it('moves folds the edit was before', () => {
    expect(shiftFolds([{ from: 5, to: 8 }], 1, 0, 2)).toEqual([{ from: 7, to: 10 }])
  })

  it('leaves folds the edit was after alone', () => {
    expect(shiftFolds([{ from: 1, to: 2 }], 5, 0, 3)).toEqual([{ from: 1, to: 2 }])
  })

  it('extends a fold the edit landed inside', () => {
    // inserting two lines inside a 3-line fold grows it to five
    expect(shiftFolds([{ from: 1, to: 4 }], 2, 0, 2)).toEqual([{ from: 1, to: 6 }])
    // deleting inside it shrinks it
    expect(shiftFolds([{ from: 1, to: 4 }], 2, 2, 0)).toEqual([{ from: 1, to: 2 }])
  })

  it('drops a fold an edit collapsed to nothing', () => {
    expect(shiftFolds([{ from: 3, to: 4 }], 3, 2, 0)).toEqual([])
  })
})
