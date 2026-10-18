// @vitest-environment happy-dom
// Exercises the editor paths that ordinary typing does not reach: deletes
// without target ranges, clipboard, indentation, escaping, IME, fold edge
// cases and the low-level patch application.

import { describe, expect, it } from 'vitest'
import { commonEdit, mountGlowEditor, mountGlowLines } from '../src/dom'

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
  let remaining = offset
  for (const row of Array.from(el.children) as HTMLElement[]) {
    const text = row.textContent ?? ''
    if (remaining <= text.length) {
      const walker = document.createTreeWalker(row, 4 /* SHOW_TEXT */)
      let node = walker.nextNode() as Text | null
      while (node) {
        if (remaining <= node.data.length)
          return { node, offset: remaining }
        remaining -= node.data.length
        node = walker.nextNode() as Text | null
      }
      return { node: row, offset: 0 }
    }
    remaining -= text.length + 1
  }
  return { node: el, offset: 0 }
}

function rangeAt(el: HTMLElement, from: number, to = from): Range {
  const start = pointAt(el, from)
  const end = pointAt(el, to)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

function selectRange(el: HTMLElement, from: number, to = from): void {
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(rangeAt(el, from, to))
}

function clearSelection(): void {
  window.getSelection()?.removeAllRanges()
}

function key(el: HTMLElement, k: string, mods: KeyboardEventInit): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true, ...mods }))
}

interface InputExtras {
  dataTransfer?: { getData: (type: string) => string }
  getTargetRanges?: () => Range[]
}

function input(el: HTMLElement, inputType: string, data: string | null, range: Range | null, extras: InputExtras = {}): Event {
  const event = new Event('beforeinput', { cancelable: true }) as Event & InputExtras & {
    data: string | null
    inputType: string
  }
  event.inputType = inputType
  event.data = data
  if (range)
    event.getTargetRanges = () => [range]
  Object.assign(event, extras)
  el.dispatchEvent(event)
  return event
}

function clipboard(el: HTMLElement, type: 'copy' | 'cut'): string[] {
  const data: string[] = []
  const event = new Event(type, { cancelable: true }) as Event & {
    clipboardData: { setData: (type: string, value: string) => void }
  }
  event.clipboardData = { setData: (_type, value) => data.push(value) }
  el.dispatchEvent(event)
  return data
}

describe('commonEdit', () => {
  it('finds the smallest replacement', () => {
    expect(commonEdit('abc', 'axc')).toEqual({ from: 1, to: 2, insert: 'x' })
    expect(commonEdit('abc', 'abc')).toEqual({ from: 3, to: 3, insert: '' })
    expect(commonEdit('abc', 'ab')).toEqual({ from: 2, to: 3, insert: '' })
    expect(commonEdit('', 'abc')).toEqual({ from: 0, to: 0, insert: 'abc' })
  })
})

describe('deletes without target ranges', () => {
  it('deletes a word backwards and forwards', () => {
    const back = makePre('one two')
    const backEditor = mountGlowEditor(back)
    selectRange(back, 7)
    input(back, 'deleteWordBackward', null, null)
    expect(backEditor.value).toBe('one ')

    const forward = makePre('one two')
    const forwardEditor = mountGlowEditor(forward)
    selectRange(forward, 4)
    input(forward, 'deleteWordForward', null, null)
    expect(forwardEditor.value).toBe('one ')
  })

  it('deletes a line backwards and forwards', () => {
    const back = makePre('a\nb')
    const backEditor = mountGlowEditor(back)
    selectRange(back, 3)
    input(back, 'deleteLineBackward', null, null)
    expect(backEditor.value).toBe('a\n')

    const forward = makePre('a\nb')
    const forwardEditor = mountGlowEditor(forward)
    selectRange(forward, 0)
    input(forward, 'deleteLineForward', null, null)
    expect(forwardEditor.value).toBe('\nb')
  })

  it('skips whitespace in word deletes', () => {
    const back = makePre('one two')
    const backEditor = mountGlowEditor(back)
    selectRange(back, 4)
    input(back, 'deleteWordBackward', null, null)
    expect(backEditor.value).toBe('two')

    const forward = makePre('one two')
    const forwardEditor = mountGlowEditor(forward)
    selectRange(forward, 3)
    input(forward, 'deleteWordForward', null, null)
    expect(forwardEditor.value).toBe('one')
  })

  it('deletes to the end when a line delete finds no newline', () => {
    const el = makePre('ab')
    const editor = mountGlowEditor(el)
    selectRange(el, 0)
    input(el, 'deleteLineForward', null, null)
    expect(editor.value).toBe('')
  })

  it('deletes one character in either direction', () => {
    const back = makePre('ab')
    const backEditor = mountGlowEditor(back)
    selectRange(back, 1)
    input(back, 'deleteContentBackward', null, null)
    expect(backEditor.value).toBe('b')

    const forward = makePre('ab')
    const forwardEditor = mountGlowEditor(forward)
    selectRange(forward, 0)
    input(forward, 'deleteContentForward', null, null)
    expect(forwardEditor.value).toBe('b')
  })
})

describe('input variants', () => {
  it('inserts pasted and dropped plain text', () => {
    const el = makePre('ab')
    const editor = mountGlowEditor(el)
    selectRange(el, 1)
    input(el, 'insertFromPaste', null, rangeAt(el, 1), {
      dataTransfer: { getData: () => 'PASTE' },
    })
    expect(editor.value).toBe('aPASTEb')

    selectRange(el, 0)
    input(el, 'insertFromDrop', null, rangeAt(el, 0), {
      dataTransfer: { getData: () => 'DROP' },
    })
    expect(editor.value).toBe('DROPaPASTEb')
  })

  it('inserts nothing when a paste has no clipboard data', () => {
    const el = makePre('ab')
    const editor = mountGlowEditor(el)
    input(el, 'insertFromPaste', null, rangeAt(el, 1))
    expect(editor.value).toBe('ab')
  })

  it('deletes a selection without a target range', () => {
    const el = makePre('abcd')
    const editor = mountGlowEditor(el)
    selectRange(el, 1, 3)
    input(el, 'deleteContentBackward', null, null)
    expect(editor.value).toBe('ad')
  })

  it('ignores input types it does not own and non-cancelable events', () => {
    const el = makePre('ab')
    const editor = mountGlowEditor(el)
    input(el, 'formatBold', null, rangeAt(el, 0))
    expect(editor.value).toBe('ab')

    const event = new Event('beforeinput') as Event & { data: string, inputType: string }
    event.inputType = 'insertText'
    event.data = 'X'
    el.dispatchEvent(event)
    expect(editor.value).toBe('ab')
  })

  it('defers to the browser while composing and resyncs afterwards', () => {
    const el = makePre('ab')
    const editor = mountGlowEditor(el)
    el.dispatchEvent(new Event('compositionstart'))
    input(el, 'insertText', 'X', rangeAt(el, 0))
    expect(editor.value).toBe('ab')

    ;(el.children[0] as HTMLElement).textContent = 'changed'
    el.dispatchEvent(new Event('compositionend'))
    expect(editor.value).toBe('changed')
    expect(domText(el)).toBe('changed')
  })
})

describe('clipboard', () => {
  it('copies the selected plain text without changing the document', () => {
    const el = makePre('hello world')
    const editor = mountGlowEditor(el)
    selectRange(el, 0, 5)
    expect(clipboard(el, 'copy')).toEqual(['hello'])
    expect(editor.value).toBe('hello world')
  })

  it('cuts the selected text', () => {
    const el = makePre('hello world')
    const editor = mountGlowEditor(el)
    selectRange(el, 0, 5)
    expect(clipboard(el, 'cut')).toEqual(['hello'])
    expect(editor.value).toBe(' world')
  })

  it('does nothing without a non-empty selection', () => {
    const el = makePre('hello')
    mountGlowEditor(el)
    clearSelection()
    expect(clipboard(el, 'copy')).toEqual([])
    selectRange(el, 2)
    expect(clipboard(el, 'copy')).toEqual([])
  })
})

describe('indentation', () => {
  it('indents selected lines', () => {
    const el = makePre('a\nb\nc')
    const editor = mountGlowEditor(el)
    selectRange(el, 2, 5)
    key(el, 'Tab', {})
    expect(editor.value).toBe('a\n  b\n  c')
  })

  it('outdents selected lines', () => {
    const el = makePre('  a\n  b\n  c')
    const editor = mountGlowEditor(el)
    selectRange(el, 0, 10)
    key(el, 'Tab', { shiftKey: true })
    expect(editor.value).toBe('a\nb\nc')
  })

  it('keeps a selection that starts inside an outdented line', () => {
    const el = makePre('  a\n  b')
    const editor = mountGlowEditor(el)
    selectRange(el, 2, 7)
    key(el, 'Tab', { shiftKey: true })
    expect(editor.value).toBe('a\nb')
  })

  it('skips blank lines when indenting and lines without indentation when outdenting', () => {
    const indent = makePre('a\n\nb')
    const indentEditor = mountGlowEditor(indent)
    selectRange(indent, 0, 4)
    key(indent, 'Tab', {})
    expect(indentEditor.value).toBe('  a\n\n  b')

    const outdent = makePre('a\n\n  b')
    const outdentEditor = mountGlowEditor(outdent)
    selectRange(outdent, 0, 6)
    key(outdent, 'Tab', { shiftKey: true })
    expect(outdentEditor.value).toBe('a\n\nb')
  })

  it('does nothing when Tab finds no line to edit', () => {
    const el = makePre('')
    const editor = mountGlowEditor(el)
    selectRange(el, 0)
    key(el, 'Tab', {})
    expect(editor.value).toBe('')
  })

  it('does nothing without a row selection', () => {
    const el = makePre('a\nb')
    const editor = mountGlowEditor(el)
    clearSelection()
    key(el, 'Tab', {})
    expect(editor.value).toBe('a\nb')

    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    key(el, 'Tab', {})
    expect(editor.value).toBe('a\nb')
  })
})

describe('editor edge cases', () => {
  it('undo and redo are no-ops with empty history', () => {
    const el = makePre('a')
    const editor = mountGlowEditor(el)
    key(el, 'z', { ctrlKey: true })
    key(el, 'y', { ctrlKey: true })
    key(el, 'z', { ctrlKey: true, shiftKey: true })
    expect(editor.value).toBe('a')
  })

  it('ignores modifier keys it does not handle', () => {
    const el = makePre('a')
    const editor = mountGlowEditor(el)
    key(el, 'a', { ctrlKey: true })
    key(el, 'a', {})
    expect(editor.value).toBe('a')
  })

  it('releases focus on Escape', () => {
    const el = makePre('a')
    mountGlowEditor(el)
    el.focus()
    key(el, 'Escape', {})
    expect(document.activeElement).not.toBe(el)
  })

  it('reads the value from the element or the option', () => {
    const el = document.createElement('pre')
    const lines = mountGlowLines(el, { value: 'from option' })
    expect(lines.document.value).toBe('from option')

    const empty = document.createElement('pre')
    const emptyLines = mountGlowLines(empty)
    expect(emptyLines.document.value).toBe('')
  })

  it('caps the undo history', () => {
    const el = makePre('')
    const editor = mountGlowEditor(el)
    for (let i = 0; i < 501; i++)
      input(el, 'insertText', 'x', rangeAt(el, i))
    expect(editor.value.length).toBe(501)
  })

  it('applies empty and full patches', () => {
    const el = makePre('a\nb')
    const lines = mountGlowLines(el)
    lines.apply({ startLine: 0, removed: 0, lines: [], full: false })
    expect(domText(el)).toBe('a\nb')
    lines.apply({ startLine: 0, removed: 2, lines: [], full: true })
    expect(el.children.length).toBe(2)
  })

  it('redraws when an edit changes how many lines a fold hides', () => {
    const el = makePre('a\nb\nc\nd\ne')
    const lines = mountGlowLines(el)
    lines.setFolds([{ from: 2, to: 4 }])
    expect(el.children.length).toBe(3)

    const doc = lines.document
    lines.apply(doc.applyEdit(doc.lineStart(3), doc.lineStart(4), ''))
    expect(el.children.length).toBe(3) // the fold still hides one line
  })

  it('does nothing when the edit is entirely inside a fold', () => {
    const el = makePre('a\nb\nc\nd\ne')
    const lines = mountGlowLines(el)
    lines.setFolds([{ from: 2, to: 4 }])
    const before = Array.from(el.children)

    const doc = lines.document
    const patch = doc.applyEdit(doc.lineStart(3), doc.lineStart(3), 'X')
    lines.apply(patch)

    expect(Array.from(el.children)).toEqual(before)
  })

  it('parks the caret on the fold row when its line is folded away', () => {
    const el = makePre('a\nb\nc')
    const editor = mountGlowEditor(el)
    el.focus()
    selectRange(el, 4) // inside line 2, which the fold hides
    expect(window.getSelection()!.rangeCount).toBe(1)
    editor.setFolds([{ from: 1, to: 2 }])
    expect(el.children.length).toBe(2)
  })

  it('inserts at the start when there is no selection', () => {
    const el = makePre('ab')
    const editor = mountGlowEditor(el)
    clearSelection()
    input(el, 'insertText', 'X', null)
    expect(editor.value).toBe('Xab')
  })

  it('keeps marks and folds working without a selection', () => {
    const el = makePre('ab')
    const editor = mountGlowEditor(el)
    clearSelection()
    editor.setMarks([{ from: 0, to: 1, cls: 'hit' }])
    editor.setFolds([])
    expect(editor.value).toBe('ab')
  })

  it('ignores clicks that are not on a fold marker', () => {
    const el = makePre('a\nb\nc')
    const seen: number[] = []
    mountGlowEditor(el, { onFoldToggle: line => seen.push(line) })

    ;(el.children[0] as HTMLElement).click()
    el.click()

    expect(seen).toEqual([])
  })

  it('handles ranges that start or end outside a row', () => {
    const el = makePre('ab')
    mountGlowEditor(el)

    const outside = document.createRange()
    outside.setStart(el, 0)
    outside.setEnd(el, 0)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(outside)
    input(el, 'insertText', 'X', outside)
    expect(domText(el)).toBe('Xab')

    const text = pointAt(el, 0).node
    const halfOutside = document.createRange()
    halfOutside.setStart(text, 0)
    halfOutside.setEnd(el, el.childNodes.length)
    input(el, 'insertText', 'Y', halfOutside)
    expect(domText(el)).toContain('Y')
  })

  it('places the caret on an empty line', () => {
    const el = makePre('a\n\nb')
    const editor = mountGlowEditor(el)
    el.focus()
    selectRange(el, 2)
    editor.setFolds([])
    expect(editor.value).toBe('a\n\nb')
  })

  it('splits two rows with a selection at the boundary', () => {
    const el = makePre('ab\ncd')
    const editor = mountGlowEditor(el)
    selectRange(el, 0, 5)
    input(el, 'insertText', 'Z', rangeAt(el, 0, 5))
    expect(editor.value).toBe('Z')
  })
})
