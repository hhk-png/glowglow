// @vitest-environment happy-dom
// The editor must keep the DOM's text identical to the document's after every
// edit, and patch only the lines an edit touched.

import { describe, expect, it } from 'vitest'
import { mountGlowEditor, mountGlowLines } from '../src/dom'

function makePre(text: string): HTMLElement {
  const pre = document.createElement('pre')
  pre.textContent = text
  document.body.appendChild(pre)
  return pre
}

function domText(el: HTMLElement): string {
  return (Array.from(el.children) as HTMLElement[]).map(d => d.textContent ?? '').join('\n')
}

function pointAt(el: HTMLElement, offset: number): { node: Node, offset: number } {
  const divs = Array.from(el.children) as HTMLElement[]
  let remaining = offset
  for (const d of divs) {
    const text = d.textContent ?? ''
    if (remaining <= text.length) {
      const walker = document.createTreeWalker(d, 4 /* SHOW_TEXT */)
      let n = walker.nextNode() as Text | null
      while (n) {
        if (remaining <= n.data.length)
          return { node: n, offset: remaining }
        remaining -= n.data.length
        n = walker.nextNode() as Text | null
      }
      return { node: d, offset: 0 }
    }
    remaining -= text.length + 1
  }
  return { node: el, offset: 0 }
}

function rangeAt(el: HTMLElement, from: number, to = from): Range {
  const a = pointAt(el, from)
  const b = pointAt(el, to)
  const r = document.createRange()
  r.setStart(a.node, a.offset)
  r.setEnd(b.node, b.offset)
  return r
}

function key(el: HTMLElement, k: string, mods: KeyboardEventInit): void {
  const e = new KeyboardEvent('keydown', { key: k, cancelable: true, ...mods })
  el.dispatchEvent(e)
}

function beforeInput(el: HTMLElement, inputType: string, data: string | null, range: Range): void {
  const e = new Event('beforeinput', { cancelable: true }) as any
  e.inputType = inputType
  e.data = data
  e.getTargetRanges = () => [range]
  el.dispatchEvent(e)
}

describe('mountGlowLines (render half only)', () => {
  it('renders lines and patches them without becoming editable', () => {
    const el = makePre('const a = 1')
    const lines = mountGlowLines(el, { numbered: true })
    expect(lines.element).toBe(el)
    expect(domText(el)).toBe('const a = 1')
    expect(el.hasAttribute('contenteditable')).toBe(false)
    expect(el.querySelector('.glow-line')).not.toBeNull()

    // drive it the way another editor would: edit the document, apply the patch
    const patch = lines.document.update(5, 5, 'x')
    lines.apply(patch)
    expect(domText(el)).toBe('constx a = 1')
    expect(lines.document.value).toBe('constx a = 1')
  })

  it('keeps untouched rows when a patch touches one line', () => {
    const src = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    const el = makePre(src)
    const lines = mountGlowLines(el)
    const before = Array.from(el.children) as HTMLElement[]
    lines.apply(lines.document.update(2, 2, 'X'))
    const after = Array.from(el.children) as HTMLElement[]
    expect(after[10]).toBe(before[10])
    expect(after[0]).not.toBe(before[0])
  })

  it('setValue and destroy reset the element', () => {
    const el = makePre('a')
    const lines = mountGlowLines(el)
    lines.setValue('one\ntwo')
    expect(el.children.length).toBe(2)
    lines.destroy()
    expect(el.children.length).toBe(0)
  })
})

describe('mountGlowEditor', () => {
  it('renders one line element per line, highlighted', () => {
    const el = makePre('const a = 1\nfoo(a)')
    const ed = mountGlowEditor(el)
    const lines = Array.from(el.children) as HTMLElement[]
    expect(lines.length).toBe(2)
    expect(lines[0]!.innerHTML).toContain('<strong>const</strong>')
    expect(lines[1]!.innerHTML).toContain('<b>foo</b>')
    expect(domText(el)).toBe(ed.value)
  })

  it('inserts typed text and keeps the DOM in step', () => {
    const el = makePre('const a = 1')
    const seen: string[] = []
    const ed = mountGlowEditor(el, { onChange: v => seen.push(v) })
    beforeInput(el, 'insertText', 'x', rangeAt(el, 5))
    expect(ed.value).toBe('constx a = 1')
    expect(domText(el)).toBe('constx a = 1')
    expect(seen).toEqual(['constx a = 1'])
  })

  it('deletes backwards over a range', () => {
    const el = makePre('const a = 1')
    const ed = mountGlowEditor(el)
    beforeInput(el, 'deleteContentBackward', null, rangeAt(el, 5, 6))
    expect(ed.value).toBe('consta = 1')
    expect(domText(el)).toBe('consta = 1')
  })

  it('inserts a line break', () => {
    const el = makePre('ab')
    const ed = mountGlowEditor(el)
    beforeInput(el, 'insertLineBreak', null, rangeAt(el, 1))
    expect(ed.value).toBe('a\nb')
    expect(domText(el)).toBe('a\nb')
    expect(el.children.length).toBe(2)
  })

  it('patches only the changed lines', () => {
    const src = Array.from({ length: 50 }, (_, i) => `const v${i} = ${i}`).join('\n')
    const el = makePre(src)
    const ed = mountGlowEditor(el)
    const before = Array.from(el.children) as HTMLElement[]
    beforeInput(el, 'insertText', 'x', rangeAt(el, 5))
    const after = Array.from(el.children) as HTMLElement[]
    expect(after[0]).not.toBe(before[0]) // line 0 was re-rendered
    expect(after[10]).toBe(before[10]) // untouched lines keep their nodes
    expect(after[49]).toBe(before[49])
    expect(domText(el)).toBe(ed.value)
  })

  it('setting marks while folded leaves the rows alone', () => {
    // regression: a marks patch spans lines, which shiftFolds used to read as an
    // edit and drag the fold onto the wrong text — losing a row
    const el = makePre('alpha beta\nbeta gamma\nbeta delta')
    const ed = mountGlowEditor(el)
    ed.setFolds([{ from: 1, to: 2 }])
    const rowText = () => (el.children[1] as HTMLElement).textContent
    expect(el.children.length).toBe(2)
    expect(rowText()).toBe('▾beta gamma') // the fold marker precedes the line

    ed.setMarks([{ from: 0, to: 4, cls: 'hit' }])
    expect(el.children.length).toBe(2)
    expect(rowText()).toBe('▾beta gamma')
    expect(ed.value).toBe('alpha beta\nbeta gamma\nbeta delta')
    expect(el.querySelectorAll('mark.hit').length).toBeGreaterThan(0)
  })

  it('keeps folded lines when the IME resyncs', () => {
    // regression: readText only saw the drawn rows, so resyncing after a
    // composition deleted every folded-away line
    const el = makePre('a\nb\nc\nd')
    const ed = mountGlowEditor(el)
    ed.setFolds([{ from: 1, to: 3 }])
    expect(el.children.length).toBe(2)
    el.dispatchEvent(new Event('compositionstart'))
    el.dispatchEvent(new Event('compositionend'))
    expect(ed.value).toBe('a\nb\nc\nd')
    expect(el.children.length).toBe(2)
  })

  it('leaves folds where they are when a patch is full', () => {
    // regression: a full patch says the whole document was replaced, so running
    // the folds through it dragged every one of them to line 0
    const el = makePre('<Foo>\nplain\n</Foo>x\ny\nz')
    const lines = mountGlowLines(el)
    lines.setFolds([{ from: 3, to: 4 }])
    expect(lines.folds).toEqual([{ from: 3, to: 4 }])

    const doc = lines.document
    const at = doc.value.indexOf('</Foo>')
    const patch = doc.update(at, at + 6, '')
    expect(patch.full).toBe(true) // the pairing flipped, so everything re-decides
    lines.apply(patch)

    expect(lines.folds).toEqual([{ from: 3, to: 4 }])
    expect(lines.foldMap.visibleCount).toBe(4) // 5 lines, one hidden
    expect(el.children.length).toBe(4)
  })

  it('reports a fold marker\'s current line when it is clicked', () => {
    // regression: the marker kept the line number it was created with, so a
    // click after lines shifted toggled the wrong block
    const el = makePre('l0\nl1\nl2\nl3\nl4\nl5')
    const seen: number[] = []
    const ed = mountGlowEditor(el, { onFoldToggle: line => seen.push(line) })
    ed.setFolds([{ from: 3, to: 5 }])
    // delete line 1 outright: every fold below it moves up one line
    beforeInput(el, 'deleteContentBackward', null, rangeAt(el, 3, 6))
    const marker = el.querySelector('.glow-fold[data-line]') as HTMLElement
    expect(marker.dataset.line).toBe('3') // the attribute is stale
    marker.click()
    expect(seen).toEqual([2]) // but the fold it stands for is on line 2 now
  })

  it('keeps a fold while typing above it', () => {
    const el = makePre('a\nb\nc\nd\ne')
    const ed = mountGlowEditor(el)
    ed.setFolds([{ from: 2, to: 4 }])
    expect(el.children.length).toBe(3) // a, b, e
    beforeInput(el, 'insertText', 'Z', rangeAt(el, 0))
    expect(ed.value).toBe('Za\nb\nc\nd\ne')
    expect(el.children.length).toBe(3) // the fold still hides c and d
    expect(domText(el)).toContain('▾')
  })

  it('undoes and redoes with the keyboard', () => {
    const el = makePre('one two')
    const ed = mountGlowEditor(el)
    beforeInput(el, 'insertText', 'X', rangeAt(el, 7))
    expect(ed.value).toBe('one twoX')
    key(el, 'z', { ctrlKey: true })
    expect(ed.value).toBe('one two')
    expect(domText(el)).toBe('one two')
    key(el, 'y', { ctrlKey: true }) // Ctrl+Y redoes
    expect(ed.value).toBe('one twoX')
    key(el, 'z', { ctrlKey: true })
    key(el, 'z', { ctrlKey: true, shiftKey: true }) // Ctrl+Shift+Z redoes
    expect(ed.value).toBe('one twoX')
    key(el, 'z', { ctrlKey: true })
    expect(ed.value).toBe('one two')
  })

  it('setValue replaces everything and destroy cleans up', () => {
    const el = makePre('a')
    const ed = mountGlowEditor(el)
    ed.setValue('one\ntwo\nthree')
    expect(el.children.length).toBe(3)
    expect(domText(el)).toBe('one\ntwo\nthree')
    ed.destroy()
    expect(el.hasAttribute('contenteditable')).toBe(false)
    expect(el.children.length).toBe(0)
  })

  it('keeps multi-line constructs coloured across an edit', () => {
    const el = makePre('/* a\nb */\nconst x = 1')
    const ed = mountGlowEditor(el)
    beforeInput(el, 'insertText', 'z', rangeAt(el, 3))
    expect(ed.value).toBe('/* za\nb */\nconst x = 1')
    expect(domText(el)).toBe(ed.value)
    const lines = Array.from(el.children) as HTMLElement[]
    expect(lines[0]!.innerHTML).toContain('<sup>')
  })
})
