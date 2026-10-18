import { describe, expect, it } from 'vitest'
import { glowDocument } from '../src/document'

describe('caller marks', () => {
  it('sorts, filters and clips overlapping ranges', () => {
    const doc = glowDocument('abcdefghij')

    // unsorted input exercises the sort comparator
    doc.setMarks([{ from: 6, to: 8 }, { from: 0, to: 4 }])
    expect(doc.markRanges).toEqual([{ from: 0, to: 4 }, { from: 6, to: 8 }])

    // a range fully inside the previous one is dropped
    doc.setMarks([{ from: 0, to: 6 }, { from: 2, to: 4 }])
    expect(doc.markRanges).toEqual([{ from: 0, to: 6 }])

    // a partial overlap is clipped to start where the previous one ends
    doc.setMarks([{ from: 0, to: 4 }, { from: 2, to: 6 }])
    expect(doc.markRanges).toEqual([{ from: 0, to: 4 }, { from: 4, to: 6 }])

    // empty ranges are filtered out
    doc.setMarks([{ from: 3, to: 3 }])
    expect(doc.markRanges).toEqual([])

    // setting no marks when there were none returns without a patch
    expect(doc.setMarks([])).toEqual({ startLine: 0, removed: 0, lines: [], full: false })
  })

  it('moves marks with edits before, after and inside them', () => {
    const doc = glowDocument('abcdefgh')
    doc.setMarks([{ from: 0, to: 2 }])

    // an edit after the mark leaves it untouched
    doc.applyEdit(5, 5, 'X')
    expect(doc.markRanges).toEqual([{ from: 0, to: 2 }])

    // an edit inside the mark keeps whatever it already covered
    doc.applyEdit(1, 1, '-')
    expect(doc.markRanges).toEqual([{ from: 0, to: 2 }])

    // an edit before the mark shifts it
    doc.applyEdit(0, 0, 'Y')
    expect(doc.markRanges).toEqual([{ from: 1, to: 3 }])
  })

  it('rebases marks onto the lines that contain them', () => {
    const doc = glowDocument('aaa\nbbb\nccc\nddd')
    doc.setMarks([{ from: 0, to: 3 }, { from: 8, to: 11 }])

    expect(doc.lineHtml(0)).toContain('<mark>aaa</mark>')
    expect(doc.lineHtml(1)).not.toContain('<mark>')
    expect(doc.lineHtml(2)).toContain('<mark>ccc</mark>')
    expect(doc.lineHtml(3)).not.toContain('<mark>')
  })

  it('renders the whole document with and without line wrappers', () => {
    const doc = glowDocument('const a = 1\nfoo(a)')
    expect(doc.render()).toContain('<strong>const</strong>')
    expect(doc.render()).not.toContain('glow-line')
    expect(doc.render({ numbered: true })).toContain('class="glow-line"')
    expect(doc.render({ numbered: true }).match(/class="glow-line"/g)).toHaveLength(2)
  })

  it('falls back to a full rebuild when the window would be too large', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i}`)
    lines[0] = '<div>'
    lines[5] = '</div>'
    lines[10] = '<span>'
    lines[450] = '</span>'
    lines[490] = '<div>'

    const doc = glowDocument(lines.join('\n'))
    // editing at the end of the line where a decided region ends forces the
    // window to back up to the previous decided region
    const at = doc.lineStart(450) + doc.lineText(450).length
    const patch = doc.applyEdit(at, at, 'x')

    expect(patch.full).toBe(true)
    expect(doc.lineText(450)).toBe('</span>x')
  })
})
