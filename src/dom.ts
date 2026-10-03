/*
  The browser half of glowglow, in two pieces:

    mountGlowLines   renders a document into row elements and keeps them in step.
                     It owns no input handling, so it is the piece to build a
                     *different* editor on — a textarea overlay, a virtualised
                     list, a framework component.

    mountGlowEditor  a ready-made contenteditable editor on top of it: it drives
                     the document from `beforeinput` and applies the patches.

  The DOM holds one element per *visible* line. With folds collapsed, a row is a
  document line or the marker standing in for the ones hidden under it, so every
  mapping between a caret position and an offset goes through the fold map.

  Everything below this layer is DOM-free — see tsconfig.json, which does not
  even give the engine the DOM types.
*/

import type { GlowDocument, GlowPatch } from './document'
import type { GlowFold, GlowFoldMap } from './fold'
import type { GlowMark } from './render'
import { glowDocument } from './document'
import { foldMap, shiftFolds } from './fold'

export interface GlowLinesOptions {
  /** Initial text. Defaults to the element's current text. */
  value?: string
  /** Wrap each line in `<span class="glow-line">` inside its row, for css/syntax.css. */
  numbered?: boolean
}

export interface GlowLines {
  readonly element: HTMLElement
  /** The document behind the elements. Edit it and hand the patch to `apply`. */
  readonly document: GlowDocument
  /** Which lines are drawn, given the current folds. */
  readonly foldMap: GlowFoldMap
  /** Rebuild every row element from the document. */
  render: () => void
  /** Apply a patch from `document.update()` — swaps just the changed rows. */
  apply: (patch: GlowPatch) => void
  /** Replace the callers' ranges (search hits, diagnostics) and redraw them. */
  setMarks: (marks: readonly GlowMark[]) => void
  /**
   * Collapse the given line ranges. Decide them yourself — brace matching, an
   * outline, a language server — the document is never touched.
   */
  setFolds: (folds: readonly GlowFold[]) => void
  /** Replace the text wholesale. */
  setValue: (text: string) => void
  destroy: () => void
}

export interface GlowEditorOptions extends GlowLinesOptions {
  /** Inserted for Tab. Two spaces by default. */
  indent?: string
  /** Called after every edit with the new text. */
  onChange?: (value: string) => void
  /** Called when a collapsed marker is clicked, with the line it starts on. */
  onFoldToggle?: (line: number) => void
}

export interface GlowEditor {
  readonly element: HTMLElement
  /** The document behind the editor — for sidecars like a minimap or an outline. */
  readonly document: GlowDocument
  readonly value: string
  /** Replace the callers' ranges (search hits, diagnostics), keeping the caret. */
  setMarks: (marks: readonly GlowMark[]) => void
  /** Collapse the given line ranges, keeping the caret out of them. */
  setFolds: (folds: readonly GlowFold[]) => void
  setValue: (text: string) => void
  destroy: () => void
}

/** One replacement, `[from, to)` becoming `insert`. */
export interface GlowEdit {
  from: number
  to: number
  insert: string
}

/**
 * The row a visible line lives in. `glow-line` is on the span inside it when
 *  numbering, so the counter in syntax.css advances once per drawn line.
 */
const ROW = 'glow-row'
const BODY = 'glow-body'
const FOLD = 'glow-fold'
const HISTORY_LIMIT = 500
const WORD = /[\w$]/u

function childElements(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children) as HTMLElement[]
}

/** The element holding a row's line text; the fold marker sits before it. */
function bodyOf(row: HTMLElement): HTMLElement {
  const first = row.firstElementChild
  if (first && first.classList.contains(FOLD))
    return (row.lastElementChild as HTMLElement | null) ?? row
  return row
}

/** Index of the row `node` sits in, or -1. */
function rowIndexOf(el: HTMLElement, node: Node): number {
  let n: Node | null = node
  while (n && n.parentNode !== el) n = n.parentNode
  return n ? Array.prototype.indexOf.call(el.children, n) : -1
}

/** Character column of a DOM point within a row body. */
function columnOf(body: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange()
  r.selectNodeContents(body)
  r.setEnd(node, offset)
  return r.toString().length
}

/** The DOM point at `column` within a row body. */
function pointOfColumn(body: HTMLElement, column: number): { node: Node, offset: number } {
  const walker = document.createTreeWalker(body, 4 /* SHOW_TEXT */)
  let last: Text | null = null
  let n = walker.nextNode() as Text | null
  let remaining = column
  while (n) {
    if (remaining <= n.data.length)
      return { node: n, offset: remaining }
    remaining -= n.data.length
    last = n
    n = walker.nextNode() as Text | null
  }
  return last ? { node: last, offset: last.data.length } : { node: body, offset: 0 }
}

/** The smallest edit turning `a` into `b`, by a common prefix and suffix scan. */
export function commonEdit(a: string, b: string): GlowEdit {
  const max = Math.min(a.length, b.length)
  let p = 0
  while (p < max && a[p] === b[p]) p++
  let s = 0
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  return { from: p, to: a.length - s, insert: b.slice(p, b.length - s) }
}

const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r'

/** Where a word/line delete would start, for browsers without getTargetRanges. */
function boundary(text: string, at: number, type: string): { from: number, to: number } {
  const backward = type.endsWith('Backward')
  if (type.includes('Word')) {
    let i = at
    if (backward) {
      while (i > 0 && isSpace(text[i - 1]!)) i--
      while (i > 0 && WORD.test(text[i - 1]!)) i--
      return { from: i, to: at }
    }
    while (i < text.length && isSpace(text[i]!)) i++
    while (i < text.length && WORD.test(text[i]!)) i++
    return { from: at, to: i }
  }
  if (type.includes('Line')) {
    if (backward)
      return { from: text.lastIndexOf('\n', at - 1) + 1, to: at }
    const nl = text.indexOf('\n', at)
    return { from: at, to: nl === -1 ? text.length : nl }
  }
  if (backward)
    return { from: Math.max(0, at - 1), to: at }
  return { from: at, to: Math.min(text.length, at + 1) }
}

/**
 * Render a document into one element per visible line and keep them in step by
 * applying patches. It owns the text but none of the editing: no contenteditable,
 * no keyboard, no clipboard — that half is the caller's.
 */
export function mountGlowLines(el: HTMLElement, opts: GlowLinesOptions = {}): GlowLines {
  let doc = glowDocument(opts.value ?? el.textContent ?? '')
  let folds: GlowFold[] = []
  let map = foldMap(folds, doc.lineCount)

  el.classList.add('glow-lines')

  function makeRow(line: number, hidden: number): HTMLElement {
    const row = document.createElement('div')
    row.className = ROW
    if (folds.length) {
      const marker = document.createElement('span')
      marker.className = FOLD
      if (hidden > 0) {
        marker.dataset.line = String(line)
        marker.textContent = '▾'
        marker.title = hidden + (hidden === 1 ? ' line folded' : ' lines folded')
      }
      row.appendChild(marker)
    }
    const body = document.createElement('span')
    body.className = BODY
    const html = doc.line(line) || '<br>'
    // an empty line needs a <br> to keep its height
    body.innerHTML = opts.numbered ? `<span class="glow-line">${html}</span>` : html
    row.appendChild(body)
    return row
  }

  function render(): void {
    const frag = document.createDocumentFragment()
    for (let row = 0; row < map.visibleCount; row++)
      frag.appendChild(makeRow(map.lineAt(row), map.hiddenAt(row)))
    el.textContent = ''
    el.appendChild(frag)
  }

  /** The first row drawn for a document line in [a, b), or -1. */
  function firstRowIn(m: GlowFoldMap, a: number, b: number): number {
    for (let l = a; l < b; l++) {
      const r = m.rowOf(l)
      if (r >= 0)
        return r
    }
    return -1
  }

  /** The last row drawn for a document line in [a, b), or -1. */
  function lastRowIn(m: GlowFoldMap, a: number, b: number): number {
    for (let l = b - 1; l >= a; l--) {
      const r = m.rowOf(l)
      if (r >= 0)
        return r
    }
    return -1
  }

  function apply(patch: GlowPatch): void {
    if (patch.full) {
      render()
      return
    }
    if (!patch.lines.length && !patch.removed)
      return

    const before = map
    const startLine = patch.startLine
    // the document has already been updated, so the old line count is the new
    // one minus what came in plus what went out
    const oldEnd = Math.min(startLine + patch.removed, doc.lineCount - patch.lines.length + patch.removed)
    const oldFirst = firstRowIn(before, startLine, oldEnd)
    const oldLast = lastRowIn(before, startLine, oldEnd)

    // the folds belong to the text, so they move with it
    folds = shiftFolds(folds, startLine, patch.removed, patch.lines.length)
    map = foldMap(folds, doc.lineCount)

    // An edit inside a folded block changes how many lines that fold hides,
    // while no row on screen shows it. Rare, and a full redraw is the safe
    // answer; every other edit patches the rows it touched.
    if (map.hiddenCount !== before.hiddenCount) {
      render()
      return
    }

    const newEnd = startLine + patch.lines.length
    const newFirst = firstRowIn(map, startLine, newEnd)
    const newLast = lastRowIn(map, startLine, newEnd)

    if (oldFirst < 0 && newFirst < 0)
      return // the edit happened entirely inside a fold: nothing on screen moved
    if (oldFirst < 0 || newFirst < 0) {
      render() // a fold appeared or vanished with the edit
      return
    }

    const kids = childElements(el)
    const anchor = kids[oldLast + 1] ?? null
    for (let r = oldFirst; r <= oldLast; r++) kids[r]?.remove()
    const frag = document.createDocumentFragment()
    for (let r = newFirst; r <= newLast; r++)
      frag.appendChild(makeRow(map.lineAt(r), map.hiddenAt(r)))
    el.insertBefore(frag, anchor)
  }

  render()

  return {
    element: el,
    get document(): GlowDocument {
      return doc
    },
    get foldMap(): GlowFoldMap {
      return map
    },
    render,
    apply,
    setMarks(marks: readonly GlowMark[]): void {
      apply(doc.setMarks(marks))
    },
    setFolds(next: readonly GlowFold[]): void {
      folds = [...next]
      map = foldMap(folds, doc.lineCount)
      render()
    },
    setValue(value: string): void {
      doc = glowDocument(value)
      map = foldMap(folds, doc.lineCount)
      render()
    },
    destroy(): void {
      el.classList.remove('glow-lines')
      el.textContent = ''
    },
  }
}

/**
 * A contenteditable code editor built on `mountGlowLines`.
 *
 * Every text change is intercepted on `beforeinput` and applied by hand, which
 * keeps paste plain-text and lets the caret be restored exactly. That also means
 * the browser's own undo stack never sees the edits, so the editor keeps its own
 * (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y).
 */
export function mountGlowEditor(el: HTMLElement, opts: GlowEditorOptions = {}): GlowEditor {
  const lines = mountGlowLines(el, { value: opts.value, numbered: opts.numbered })
  let composing = false
  const indent = opts.indent ?? '  '

  /** Undo steps, newest last. Each step is the list of edits that reverses one. */
  const past: GlowEdit[][] = []
  const future: GlowEdit[][] = []

  const text = (): string => lines.document.value

  el.classList.add('glow-editor')
  el.setAttribute('contenteditable', 'plaintext-only')
  el.setAttribute('spellcheck', 'false')
  el.setAttribute('autocapitalize', 'off')
  el.setAttribute('autocorrect', 'off')

  function setCaret(offset: number): void {
    const doc = lines.document
    const line = doc.lineAt(offset)
    let row = lines.foldMap.rowOf(line)
    let column = offset - doc.lineStart(line)
    if (row < 0) {
      // the line is folded away: park on the fold's own row, at the end of it
      row = lines.foldMap.foldRowOf(line)
      column = doc.lineText(doc.lineAt(row)).length
    }
    const rowEl = childElements(el)[row]
    const sel = window.getSelection()
    if (!rowEl || !sel)
      return
    const { node, offset: at } = pointOfColumn(bodyOf(rowEl), column)
    const r = document.createRange()
    r.setStart(node, at)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  /** Caret position as an offset into the text. */
  function caretOffset(): number {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0)
      return 0
    const r = sel.getRangeAt(0)
    const row = rowIndexOf(el, r.startContainer)
    const rows = childElements(el)
    if (row < 0 || !rows[row])
      return 0
    const line = lines.foldMap.lineAt(row)
    return lines.document.lineStart(line) + columnOf(bodyOf(rows[row]!), r.startContainer, r.startOffset)
  }

  /** Character range a DOM Range covers, as text offsets. */
  function rangeOffsets(r: Range): { from: number, to: number } {
    const rows = childElements(el)
    const a = rowIndexOf(el, r.startContainer)
    const b = rowIndexOf(el, r.endContainer)
    const lineOf = (row: number): number => lines.foldMap.lineAt(row)
    const from = a < 0 ? caretOffset() : lines.document.lineStart(lineOf(a)) + columnOf(bodyOf(rows[a]!), r.startContainer, r.startOffset)
    const to = b < 0 ? from : lines.document.lineStart(lineOf(b)) + columnOf(bodyOf(rows[b]!), r.endContainer, r.endOffset)
    return { from, to }
  }

  /** The editor's text, read back from the DOM (used to resync after IME). */
  function readText(): string {
    const doc = lines.document
    const out: string[] = []
    for (let row = 0; row < lines.foldMap.visibleCount; row++)
      out.push(doc.lineText(lines.foldMap.lineAt(row)))
    return out.join('\n')
  }

  /** Apply `step` (edits in ascending, non-overlapping order) and return its inverse. */
  function applyStep(step: GlowEdit[]): GlowEdit[] {
    const value = text()
    const inverse: GlowEdit[] = []
    for (const e of step)
      inverse.push({ from: e.from, to: e.from + e.insert.length, insert: value.slice(e.from, e.to) })
    // back to front, so the earlier offsets are still valid as we go
    for (let i = step.length - 1; i >= 0; i--) {
      const e = step[i]!
      lines.apply(lines.document.update(e.from, e.to, e.insert))
    }
    return inverse
  }

  /** Apply edits as one undoable step and leave the caret at `caret`. */
  function commitStep(step: GlowEdit[], caret: number): void {
    if (!step.length)
      return
    past.push(applyStep(step))
    if (past.length > HISTORY_LIMIT)
      past.shift()
    future.length = 0
    setCaret(caret)
    opts.onChange?.(text())
  }

  function commit(from: number, to: number, insert: string): void {
    commitStep([{ from, to, insert }], from + insert.length)
  }

  function undo(): void {
    const step = past.pop()
    if (!step)
      return
    future.push(applyStep(step))
    setCaret(step[0]!.from)
    opts.onChange?.(text())
  }

  function redo(): void {
    const step = future.pop()
    if (!step)
      return
    past.push(applyStep(step))
    setCaret(step[0]!.from)
    opts.onChange?.(text())
  }

  function onBeforeInput(e: Event): void {
    if (composing || !e.cancelable)
      return
    const ev = e as InputEvent
    const type = ev.inputType
    const ranges = ev.getTargetRanges?.()
    const range = ranges && ranges.length ? ranges[0] as Range : null
    // Chrome reports a *collapsed* target range for `insertText` even when a
    // selection is about to be replaced, so the live selection wins when there
    // is one — it is what the user sees highlighted.
    const sel = window.getSelection()
    const selected = sel && sel.rangeCount > 0 && !sel.isCollapsed ? rangeOffsets(sel.getRangeAt(0)) : null
    const target = selected ?? (range ? rangeOffsets(range) : { from: caretOffset(), to: caretOffset() })

    let insert = ev.data ?? ''
    if (type === 'insertLineBreak' || type === 'insertParagraph') {
      insert = '\n'
    }
    else if (type.startsWith('delete')) {
      insert = ''
      // Without a target range we have to work out the span ourselves — a word
      // delete or a line delete covers far more than the one character next to
      // the caret, and a selection is replaced wholesale.
      if (!range) {
        const collapsed = target.from === target.to
        const span = collapsed ? boundary(text(), target.from, type) : target
        target.from = span.from
        target.to = span.to
      }
    }
    else if (type === 'insertFromPaste' || type === 'insertFromDrop') {
      insert = ev.dataTransfer?.getData('text/plain') ?? ''
    }
    else if (type !== 'insertText' && type !== 'insertCompositionText' && type !== 'insertReplacementText') {
      return // let the browser handle anything we do not understand
    }

    e.preventDefault()
    commit(target.from, target.to, insert)
  }

  /** Keep the clipboard plain, and do the cutting ourselves (see onBeforeInput). */
  function onCopyCut(e: ClipboardEvent): void {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed)
      return
    const { from, to } = rangeOffsets(sel.getRangeAt(0))
    if (from === to)
      return
    e.clipboardData?.setData('text/plain', text().slice(from, to))
    e.preventDefault()
    if (e.type === 'cut')
      commit(from, to, '')
  }

  /** The document lines the current selection touches, or null. */
  function selectionLines(): { first: number, last: number } | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0)
      return null
    const r = sel.getRangeAt(0)
    const a = rowIndexOf(el, r.startContainer)
    const b = rowIndexOf(el, r.endContainer)
    if (a < 0 || b < 0)
      return null
    return { first: lines.foldMap.lineAt(a), last: lines.foldMap.lineAt(b) }
  }

  function shiftLines(out: boolean): void {
    const ls = selectionLines()
    if (!ls)
      return
    const at = caretOffset()
    const edits: GlowEdit[] = []
    let delta = 0
    for (let i = ls.first; i <= ls.last; i++) {
      const start = lines.document.lineStart(i)
      if (out) {
        const m = /^[ \t]{1,2}/.exec(lines.document.lineText(i))
        if (!m)
          continue
        edits.push({ from: start, to: start + m[0].length, insert: '' })
        if (start < at)
          delta -= Math.min(m[0].length, at - start)
      }
      else {
        if (lines.document.lineText(i) === '')
          continue // never pad a blank line
        edits.push({ from: start, to: start, insert: indent })
        if (start <= at)
          delta += indent.length
      }
    }
    if (edits.length)
      commitStep(edits, Math.max(0, at + delta))
  }

  function onKeyDown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey)
          redo()
        else undo()
        return
      }
      if (k === 'y') {
        e.preventDefault()
        redo()
        return
      }
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault()
      shiftLines(e.shiftKey)
      return
    }
    // Esc releases the editor, so Tab can indent without trapping the keyboard
    if (e.key === 'Escape')
      el.blur()
  }

  /** Clicking a collapsed marker asks the caller what to do about it. */
  function onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null
    if (!target || !target.classList?.contains(FOLD) || target.dataset.line === undefined)
      return
    opts.onFoldToggle?.(Number(target.dataset.line))
  }

  /** Keep the document in step while the IME owns the DOM. */
  function onCompositionEnd(): void {
    composing = false
    const next = readText()
    if (next === text())
      return
    const { from, to, insert } = commonEdit(text(), next)
    commit(from, to, insert)
  }

  function onCompositionStart(): void {
    composing = true
  }

  el.addEventListener('beforeinput', onBeforeInput)
  el.addEventListener('copy', onCopyCut)
  el.addEventListener('cut', onCopyCut)
  el.addEventListener('keydown', onKeyDown)
  el.addEventListener('click', onClick)
  el.addEventListener('compositionstart', onCompositionStart)
  el.addEventListener('compositionend', onCompositionEnd)

  return {
    element: el,
    get document(): GlowDocument {
      return lines.document
    },
    get value(): string {
      return text()
    },
    setMarks(marks: readonly GlowMark[]): void {
      // the text does not move, so the caret keeps its offset
      const sel = window.getSelection()
      const had = !!sel && sel.rangeCount > 0
      const caret = had ? caretOffset() : 0
      lines.setMarks(marks)
      if (had)
        setCaret(caret)
    },
    setFolds(folds: readonly GlowFold[]): void {
      const sel = window.getSelection()
      const had = !!sel && sel.rangeCount > 0
      const caret = had ? caretOffset() : 0
      lines.setFolds(folds)
      if (had)
        setCaret(caret)
    },
    setValue(value: string): void {
      lines.setValue(value)
      past.length = 0
      future.length = 0
    },
    destroy(): void {
      el.removeEventListener('beforeinput', onBeforeInput)
      el.removeEventListener('copy', onCopyCut)
      el.removeEventListener('cut', onCopyCut)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('click', onClick)
      el.removeEventListener('compositionstart', onCompositionStart)
      el.removeEventListener('compositionend', onCompositionEnd)
      el.removeAttribute('contenteditable')
      el.classList.remove('glow-editor')
      lines.destroy()
    },
  }
}
