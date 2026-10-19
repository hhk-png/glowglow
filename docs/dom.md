# The DOM layer

`@glowglow/core/dom` provides two mounts built on `GlowDocument`:

| Function | What it does | Input handling |
|---|---|---|
| `mountGlowLines(el, opts?)` | Renders rows and applies patches | none — you drive it |
| `mountGlowEditor(el, opts?)` | Adds a `contenteditable` editor on top | `beforeinput`, keys, clipboard, IME |

Both render the same row structure, so they look identical: load
`@glowglow/core/css/syntax.css` for the colours and `@glowglow/core/css/editor.css` for the
chrome. All colours come from CSS variables, so a theme can restyle either one.

## DOM structure

```html
<pre class="glow-lines">
  <div class="glow-row">
    <span class="glow-fold" data-line="12">▾</span>  <!-- only on a folded row -->
    <span class="glow-body">
      <span class="glow-line">…highlighted line…</span> <!-- only when numbered -->
    </span>
  </div>
  …
</pre>
```

One row is drawn per **visible** line. When a fold is collapsed, the rows after
its first line are not in the DOM; the first row carries a `.glow-fold` marker.

## `mountGlowLines`

Use this when you want the rendering and patch-application, but your own input
layer: a textarea overlay, a virtualised list, a framework component.

```ts
import { mountGlowLines } from '@glowglow/core/dom'

const view = mountGlowLines(document.querySelector('pre')!, {
  numbered: true,
})

// after your input layer computes an edit
view.apply(view.document.applyEdit(from, to, insert))
```

The returned object owns the document and the rows:

| Member | Description |
|---|---|
| `element` | The element passed in, now carrying `glow-lines` |
| `document` | The `GlowDocument` behind the rows |
| `foldMap` | The current row/line projection |
| `folds` | The folds in force, with line numbers as they are now |
| `render()` | Rebuild every row from the document |
| `apply(patch)` | Swap just the rows covered by a patch |
| `setMarks(marks)` | Replace caller ranges and redraw their lines |
| `setFolds(folds)` | Collapse the given line ranges |
| `setValue(text)` | Replace the whole text |
| `destroy()` | Clear the element and remove its class |

`mountGlowLines` owns no editing behaviour: no `contenteditable`, no keyboard
handling and no clipboard. That is deliberate — it is the render half only.

### A textarea overlay

The classic approach: a transparent `<textarea>` over the rendered `<pre>`, so
the caret lives in the textarea and rebuilding line elements never disturbs it.
`commonEdit()` turns the textarea's whole value into a range edit:

```ts
import { commonEdit, mountGlowLines } from '@glowglow/core/dom'

const view = mountGlowLines(pre)
textarea.addEventListener('input', () => {
  const { from, to, insert } = commonEdit(view.document.value, textarea.value)
  view.apply(view.document.applyEdit(from, to, insert))
  pre.scrollTop = textarea.scrollTop
})
```

## `mountGlowEditor`

Use this when the editor *is* the `<pre>` the user types into.

```ts
import { mountGlowEditor } from '@glowglow/core/dom'
import '@glowglow/core/css/syntax.css'
import '@glowglow/core/css/editor.css'

const editor = mountGlowEditor(document.querySelector('pre')!, {
  value: source,
  indent: '  ',
  onChange: text => save(text),
  onFoldToggle: line => toggleBlock(line),
})
```

The element becomes `contenteditable="plaintext-only"`. Every input is
intercepted on `beforeinput` and applied through `applyEdit`, so:

- only the rows an edit touches are replaced, and nodes under the caret survive;
- paste is plain text;
- IME composition is left to the browser and the document resyncs when it ends.

Because the browser's undo stack never sees these edits, the editor keeps its
own: **Ctrl+Z**, **Ctrl+Shift+Z** and **Ctrl+Y**. It also implements
**Ctrl+Backspace** / **Ctrl+Delete** word deletes, **Tab** / **Shift+Tab**
indentation of the selected lines, and **Esc** to release focus so Tab does not
trap the keyboard.

| Member | Description |
|---|---|
| `element` | The editor element, now carrying `glow-editor` |
| `document` | The document behind the editor, for sidecars such as a minimap |
| `value` | The current text |
| `folds` | The folds in force |
| `setMarks(marks)` | Replace caller ranges, keeping the caret |
| `setFolds(folds)` | Collapse ranges, keeping the caret out of them |
| `setValue(text)` | Replace the text and clear the undo history |
| `destroy()` | Remove listeners, attributes and classes |

## Folds

Folding is a view concern: the document is never changed. Decide the ranges
yourself — a brace matcher, an outline, a language server — and hand them over:

```ts
editor.setFolds([{ from: 12, to: 30 }])
editor.setFolds([])
```

Folds have these semantics:

- `from` stays visible and carries the marker; lines `from + 1 … to` are hidden.
- A click on the marker calls `onFoldToggle(line)` (editor only); the caller
  decides what the click means.
- Edits shift folds with the text, exactly as marks do.
- A caret on a hidden line parks on the marker's row instead.
- A `marks: true` patch does not move folds, because the text did not move.

For a virtualised renderer, `buildFoldMap()` is the whole contract:

```ts
import { buildFoldMap } from '@glowglow/core/incremental'

const map = buildFoldMap(folds, doc.lineCount)
for (let row = 0; row < map.visibleCount; row++)
  draw(map.lineIndexAt(row), map.hiddenCountAt(row))
```

`packages/glowglow/preview/virtual.html` renders 100,000 lines this way, keeping only about
thirty rows in the DOM.

## Marks

Marks lay your own ranges over the output — search hits, diagnostics,
breakpoints:

```ts
editor.setMarks([{ from: 40, to: 47, cls: 'hit' }])

// a custom wrapper instead of <mark>
editor.setMarks([{ from: 40, to: 47, tag: 'u', cls: 'diagnostic' }])
```

A mark splits whatever token it lands in, so the token's own colour survives
around it:

```html
<strong><mark class="hit">const</mark></strong>
```

Marks use absolute offsets, the same numbers as `Token.start` / `Token.end`, so
search results and language-server ranges can be passed through unchanged.

## Sidecars

`mountGlowEditor` hands you its `document`, so a minimap or an outline is a loop
over `lineCount` / `lineTokens(i)` / `lineTags(i)`. No internals and no parsing
of the rendered HTML are required.

`packages/glowglow/preview/minimap.html` and `packages/glowglow/preview/editor.html` are working examples. The
`pnpm test:browser` script drives the built editor in a real browser over the
DevTools Protocol, checking caret movement, node identity and real input events.
