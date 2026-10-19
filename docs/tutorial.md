# Tutorial: build a code editor with glowglow

**English** | [中文](tutorial.zh-CN.md)

This tutorial builds a small but real code editor: live syntax highlighting,
line numbers, folding, search highlights and a minimap — then takes the same
pieces apart to show how to build your own input layer and a virtualised viewer
for very large files.

Everything here uses public API only. The finished pieces are also available as
working demos in [`preview/`](../packages/glowglow/preview/).

## What you need

- Node.js ≥ 22.13 and pnpm (the repository's toolchain; the published package
  itself still runs on Node ≥ 18)
- a bundler that understands TypeScript and CSS imports (Vite is used below)
- about 15 minutes for the main editor

```bash
pnpm create vite glow-editor --template vanilla-ts
cd glow-editor
pnpm install
pnpm add @glowglow/core
```

Replace `src/main.ts` as the tutorial goes. Keep `index.html` with a single
`<pre id="editor"></pre>` (or the container shown in each step).

## Step 1 — the five-minute editor

`mountGlowEditor()` turns an element into a `contenteditable` code editor. It
owns the document, the input handling, the caret, the undo history and the patch
application.

```ts
import { mountGlowEditor } from '@glowglow/core/dom'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const source = `function greet(name: string) {
  return 'hello ' + name
}

console.log(greet('world'))`

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
  onChange: text => localStorage.setItem('glowglow:draft', text),
})

editor.element.focus()
```

That is already a usable editor:

- typing re-highlights only the lines it touches;
- the caret and selection survive patches because the nodes around them are not
  rebuilt;
- paste is plain text;
- **Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y** work through the editor's own history;
- **Tab / Shift+Tab** indent or outdent the selection;
- **Esc** releases focus so Tab does not trap the keyboard.

### Restore a draft

Read the saved text before mounting. `value` is the initial text; the document
does not normalise line endings, so what you store is exactly what you get back.

```ts
import { mountGlowEditor } from '@glowglow/core/dom'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const saved = localStorage.getItem('glowglow:draft')

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: saved ?? 'const answer = 42',
  numbered: true,
  onChange: text => localStorage.setItem('glowglow:draft', text),
})

editor.element.focus()
```

## Step 2 — folding with your own rule

Folding is a view concern. Glowglow does not decide what a fold is; you compute
the ranges and hand them over with `setFolds()`.

A simple, token-aware brace matcher:

```ts
import type { GlowDocument, GlowFold } from '@glowglow/core/incremental'
import { mountGlowEditor } from '@glowglow/core/dom'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
})

function braceFolds(doc: GlowDocument): GlowFold[] {
  const src = doc.value
  const stack: number[] = []
  const folds: GlowFold[] = []

  for (let line = 0; line < doc.lineCount; line++) {
    for (const token of doc.lineTokens(line)) {
      // only operators of length one, so braces inside strings or comments
      // (which are str/comment tokens) are ignored
      if (token.kind !== 'op' || token.end - token.start !== 1)
        continue
      const ch = src[token.start]
      if (ch === '{') {
        stack.push(line)
      }
      else if (ch === '}' && stack.length > 0) {
        const from = stack.pop()!
        if (line > from)
          folds.push({ from, to: line })
      }
    }
  }
  return folds
}

editor.setFolds(braceFolds(editor.document))
```

`from` stays visible and carries the marker; lines `from + 1 … to` are hidden.
The document itself is untouched, so search offsets, marks and edits keep
working.

A click on the marker calls `onFoldToggle(line)` if you provide it:

```ts
let folds: GlowFold[] = []

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
  onFoldToggle(line) {
    folds = folds.filter(f => f.from !== line)
    editor.setFolds(folds)
  },
})

folds = braceFolds(editor.document)
editor.setFolds(folds)
```

This works because the callback runs after `editor` is initialised. To unfold
everything at once, `editor.setFolds([])` is enough.

## Step 3 — search hits with marks

`setMarks()` lays your own ranges over the rendered output. Marks use absolute
text offsets, the same numbers as `Token.start` and `Token.end`, so search
results and language-server diagnostics pass straight through.

```ts
import type { GlowMark } from '@glowglow/core'
import { mountGlowEditor } from '@glowglow/core/dom'
import { buildFoldMap } from '@glowglow/core/incremental'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
})

function search(query: string): void {
  if (!query) {
    editor.setMarks([])
    return
  }

  const haystack = editor.value.toLowerCase()
  const needle = query.toLowerCase()
  const marks: GlowMark[] = []

  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    marks.push({ from: at, to: at + needle.length, cls: 'hit' })
  }

  editor.setMarks(marks)

  // scroll the first hit into view through the fold projection
  const first = marks[0]
  if (first) {
    const doc = editor.document
    const row = buildFoldMap(editor.folds, doc.lineCount)
      .rowIndexAt(doc.lineIndexAt(first.from))
    if (row >= 0)
      editor.element.children[row]?.scrollIntoView({ block: 'center' })
  }
}

document.querySelector('#search')!.addEventListener('input', (event) => {
  search((event.target as HTMLInputElement).value)
})
```

Style the class you passed:

```css
.glow-editor mark.hit {
  background: #facc1533;
  border-radius: 2px;
}
```

A mark splits the token it lands in, so the token's own colour survives:

```html
<strong><mark class="hit">const</mark></strong>
```

`setMarks()` keeps the caret because the text does not move. Ranges are sorted
and clipped for you; overlapping marks keep the earlier one.

## Step 4 — a minimap from the document API

A minimap does not parse the rendered HTML. It asks the document for each
line's tokens and tags and draws rectangles on a canvas.

```ts
import type { GlowDocument, GlowFold } from '@glowglow/core/incremental'
import { mountGlowEditor } from '@glowglow/core/dom'
import { buildFoldMap } from '@glowglow/core/incremental'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const COLORS: Record<string, string> = {
  strong: '#419fff',
  b: '#7dd3fc',
  em: '#f472b6',
  i: '#64748b',
  label: '#fff',
  sup: '#6f7a7d',
}

const canvas = document.querySelector('canvas')!

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
})

function draw(doc: GlowDocument, folds: readonly GlowFold[]): void {
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const map = buildFoldMap(folds, doc.lineCount)
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)

  let longest = 1
  for (let line = 0; line < doc.lineCount; line++)
    longest = Math.max(longest, doc.lineText(line).length)

  const rowHeight = height / Math.max(1, map.visibleCount)

  for (let row = 0; row < map.visibleCount; row++) {
    const line = map.lineIndexAt(row)
    const base = doc.lineStart(line)
    const tokens = doc.lineTokens(line)
    const tags = doc.lineTags(line)

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!
      const tag = tags[i]
      if (!tag)
        continue
      const x = ((token.start - base) / longest) * width
      const w = Math.max(1, ((token.end - token.start) / longest) * width)
      ctx.fillStyle = COLORS[tag] ?? '#a2aab1'
      ctx.fillRect(x, row * rowHeight, w, Math.max(1, rowHeight - 0.5))
    }
  }
}

// redraw whenever the editor patches its rows
const observer = new MutationObserver(() => draw(editor.document, editor.folds))
observer.observe(editor.element, { childList: true, subtree: true, characterData: true })

draw(editor.document, editor.folds)
```

Give the canvas a CSS size, since the drawing code reads `clientWidth` and
`clientHeight`:

```html
<canvas id="minimap" style="display: block; width: 96px; height: 100vh"></canvas>
```

Notes:

- `lineTokens(line)` returns absolute offsets; subtract `lineStart(line)` to get
  the column used for the horizontal position.
- `lineTags(line)` is parallel to `lineTokens(line)`; `null` means plain text or
  whitespace, so skip it.
- `buildFoldMap()` keeps the minimap in step with collapsed blocks: `row` is a
  visible row, `lineIndexAt(row)` is the document line it shows.

For a minimap with a viewport box and click-to-scroll, see
[`preview/minimap.html`](../packages/glowglow/preview/minimap.html).

## Step 5 — build your own input layer

`mountGlowLines()` renders rows and applies patches, but owns no input. Use it
when you want a different editing surface: a textarea overlay, a framework
component or a mobile-specific input.

The textarea overlay keeps the caret in the `<textarea>` and renders the coloured
lines underneath, so rebuilding rows can never disturb the selection.

```html
<div class="shell">
  <pre id="view"></pre>
  <textarea id="input" spellcheck="false" autocapitalize="off" autocomplete="off">const answer = 42</textarea>
</div>
```

```css
.shell {
  position: relative;
  height: 100vh;
}

#view,
#input {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 1em 1.25em;
  font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}

#view {
  overflow: hidden;
  pointer-events: none;
}

#input {
  color: transparent;
  background: transparent;
  caret-color: #a2aab1;
  resize: none;
}
```

```ts
import { commonEdit, mountGlowLines } from '@glowglow/core/dom'
import '@glowglow/core/css/syntax.css'

const input = document.querySelector('textarea')!
const view = mountGlowLines(document.querySelector('#view')!, {
  value: input.value,
  // the textarea has no line-number gutter; use the ready-made editor if you
  // want numbers, or add matching left padding to both layers
  numbered: false,
})

input.addEventListener('input', () => {
  const { from, to, insert } = commonEdit(view.document.value, input.value)
  view.apply(view.document.applyEdit(from, to, insert))
})

input.addEventListener('scroll', () => {
  view.element.scrollTop = input.scrollTop
  view.element.scrollLeft = input.scrollLeft
})
```

`commonEdit()` finds the smallest replacement between the old and new text with
a common prefix/suffix scan. For most keystrokes the result is exactly the one
character the user typed, so the document re-lexes one line.

The light and dark themes, marks and token colours all work because the rendered
rows are the same ones `mountGlowEditor` uses.

## Step 6 — virtualise a very large file

A renderer does not need one DOM node per document line. `buildFoldMap()` gives
you the line/row projection; draw only the rows in the viewport.

```html
<div id="scroller" style="height: 100vh; overflow: auto">
  <div id="view" style="position: relative"></div>
</div>
```

```ts
import { buildFoldMap, glowDocument } from '@glowglow/core/incremental'

const doc = glowDocument(source)
const folds = [{ from: 12, to: 30 }]
const map = buildFoldMap(folds, doc.lineCount)

const scroller = document.querySelector('#scroller')!
const host = document.querySelector('#view')!
const rowHeight = 20
const overscan = 8

function drawVirtual(topRow: number, height: number): void {
  const first = Math.max(0, Math.floor(topRow) - overscan)
  const last = Math.min(
    map.visibleCount,
    first + Math.ceil(height / rowHeight) + overscan * 2,
  )

  host.textContent = ''
  host.style.height = `${map.visibleCount * rowHeight}px`

  for (let row = first; row < last; row++) {
    const el = document.createElement('div')
    el.className = 'glow-row'
    el.style.position = 'absolute'
    el.style.top = `${row * rowHeight}px`
    el.style.left = '0'
    el.style.right = '0'
    // lineHtml() is already escaped and tagged
    el.innerHTML = doc.lineHtml(map.lineIndexAt(row))
    host.append(el)
  }
}

scroller.addEventListener('scroll', () => {
  drawVirtual(scroller.scrollTop / rowHeight, scroller.clientHeight)
})

drawVirtual(0, scroller.clientHeight)
```

`visibleCount` is the number of rows to draw, not the number of document lines.
Folded lines never reach the DOM, and `lineIndexAt(row)` gives the line to draw.

`packages/glowglow/preview/virtual.html` uses this technique with 100,000 lines.

## Rules of thumb

These are the things that break integrations most often.

1. **A patch describes whole lines.** `patch.lines` replaces `patch.removed`
   lines starting at `patch.startLine`. Keep one element per visible line.
2. **Never feed rendered HTML back as source.** `lineHtml()` is output; the
   document's `value` is the source of truth.
3. **Offsets are absolute.** Edits, marks and tokens all use absolute text
   offsets. Convert to a column only when drawing.
4. **Respect `patch.marks`.** A `marks: true` patch means the text did not move;
   do not shift line-numbered view state such as folds.
5. **The document does not normalise.** CRLF and blank lines stay exactly as the
   caller provided them. `glow()` and `glowInner()` normalise; the document does
   not.
6. **Markup pairing is document-wide.** A name becomes markup when it has both
   an opening and a closing tag somewhere in the file, or is a known HTML tag, or
   is self-closing. Editing can therefore trigger a full rebuild when a name
   crosses that boundary.
7. **Only pass trusted element names to marks.** `GlowMark.cls` is escaped;
   `GlowMark.tag` is used as the wrapper element name and is not sanitised.
8. **Do not call `doc.value` in a hot loop.** It joins every line. Use
   `lineText()`, `lineTokens()` and `lineTags()` for per-line work.
9. **Compute folds from tokens, not raw text,** when strings and comments can
   contain your delimiters. `lineTokens()` already distinguishes `str`,
   `comment` and `op`.

## Where to go next

- [API reference](api.md) — every export and its exact signature
- [Incremental editing](incremental.md) — why the engine only re-colours a
  window, and when it falls back to a full rebuild
- [The DOM layer](dom.md) — mount options, folds, marks and sidecars in more
  detail
- [`preview/editor.html`](../packages/glowglow/preview/editor.html) — the editor plus a search box
- [`preview/minimap.html`](../packages/glowglow/preview/minimap.html) — a minimap and viewport
- [`preview/virtual.html`](../packages/glowglow/preview/virtual.html) — 100,000 lines, folded
