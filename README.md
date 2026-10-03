# Glowglow ✨

**CSS-first, language-agnostic syntax highlighting for the web.** You hand it code — *any* code — and it returns semantic HTML (`<b>`, `<em>`, `<strong>`, `<i>`, `<sup>`, `<label>`) that **your** CSS styles. No grammar files, no language packages, no 14 MB of language definitions. One minuscule highlighter for virtually every language.

Built with [tsdown](https://tsdown.dev) and type-checked with [TypeScript 6.x](https://devblogs.microsoft.com/typescript/).

- 🔤 **No language required** — `glow(code)` works for TypeScript, JavaScript, Python, Go, Rust, C/C++, C#, Java, SQL, CSS, HTML, JSX and more, all with the *same* single rule set. The engine never guesses the language and never needs one.
- 🧱 **Semantic HTML** — keywords `<strong>`, identifiers `<b>`, strings/numbers `<em>`, comments `<sup>`, decorators `<label>`, operators/brackets `<i>`. Style with plain CSS or a handful of CSS variables.
- 🪶 **Tiny** — the whole highlighter is a few KB, zero runtime dependencies.
- 🧩 **ESM + CJS + TypeScript types**, works in Node ≥ 18 and the browser.

## Install

```bash
pnpm add glowglow
# or
npm install glowglow
```

## Usage

```ts
import { glow } from 'glowglow'

const code = `const answer = 42
console.log(answer)`

const html = glow(code, { numbered: true })

// → '<code><span class="glow-line">…</span>\n<span class="glow-line">…</span></code>'
```

No `language` is needed. Drop the result into a page (e.g. inside a `<pre>`) and link a stylesheet:

```html
<pre>${html}</pre>
```

### Highlighting into an element you already own

`glow()` returns a whole `<code>` element. When you already have that element and
want to keep its own classes and attributes, take just the inside:

```ts
import { glowInner } from 'glowglow'

codeEl.innerHTML = glowInner(code, { numbered: true })
```

### Keeping your own positions aligned

`glow()` normalises CRLF and drops blank leading and trailing lines before it
renders, so an offset in your source is not an offset in the output.
`glowSource()` returns the text that is actually rendered, plus a mapper from
your offsets into it. Use it instead of re-deriving the transformation — which
is private, and may change — when you need to put your own markers back
(elements carrying an `id`, search hits, …):

```ts
import { glowInner, glowSource } from 'glowglow'

const { text, offset } = glowSource(code)
codeEl.innerHTML = glowInner(code)
// `text` is exactly what codeEl now contains, so offset(n) locates your marker
```

### Editing code live

`glow()` re-highlights everything it is given, which is far too much work to do
on every keystroke. `glowDocument()` keeps the state and re-colours only what an
edit can reach:

```ts
import { glowDocument } from 'glowglow'

const doc = glowDocument(code)

// after replacing [from, to) with `insert`, ask what changed
const patch = doc.update(from, to, insert)
// patch = { startLine, removed, lines: string[], full: boolean }

// patch.startLine in the new text replaces patch.removed old lines with
// patch.lines — each the inner HTML of one line, no wrapper. Patch only those
// line elements and everything else keeps its nodes, its caret and its undo.
```

`doc.render()` returns the whole document again, `doc.line(i)` one line, and
`doc.lineCount`/`doc.value` the obvious. A keystroke re-colours exactly one line,
and costs about the same whatever the file: ~32 µs at 1,000 lines, ~45 µs at
10,000 and ~64 µs at 20,000, against ~125 ms for a full `glow()` of the same
10,000 (see `pnpm bench`).

Unlike `glow()`, an editor must not silently rewrite its buffer: `glowDocument`
does **none** of the CRLF normalisation or leading/trailing blank-line trimming
that `prepare()` does for the one-shot API, so `doc.value` is character-for-
character what you fed it.

### A ready-made editor

For the common case — a `<pre>` the user types into — there is a mountable
editor that wires the patching to the DOM for you:

```ts
import { mountGlowEditor } from 'glowglow/dom'
import 'glowglow/css/syntax.css'
import 'glowglow/css/editor.css'

const editor = mountGlowEditor(document.querySelector('pre')!, {
  value: code,
  onChange: text => save(text),
})

editor.setValue(next) // replace everything
editor.destroy()
```

It is a `contenteditable` surface whose rows *are* the highlighted lines. Typing
is applied by hand on `beforeinput`, so the caret lands exactly where it should,
paste is plain text, and only the lines an edit touched are replaced — the nodes
under the caret are never rebuilt, so IME composition and the selection survive.

Because those edits never go through the browser's editing commands, its undo
stack cannot see them — so the editor keeps its own: **Ctrl+Z**, **Ctrl+Shift+Z**
(or **Ctrl+Y**). It also handles the shortcuts a code editor is expected to:
waiting on a selection (typing or Backspace/Delete replaces it), **Ctrl+Backspace
/ Ctrl+Delete** for word deletes, plain-text cut and paste, and **Tab /
Shift+Tab** to indent or outdent the selected lines (**Esc** releases the editor
so Tab never traps the keyboard). Composition itself is left to the browser, and
the document resyncs when it ends.

### Building your own editor

`mountGlowEditor` is *one* editor built on the document, not the only one
possible. The package ships in three pieces, and the split is meant to be used:

| entry | what it is | needs DOM |
|---|---|---|
| `glowglow` | `glow()` for static markup, `glowDocument()` for editing | no |
| `glowglow/incremental` | the lexer, classifier and renderer the document is built from, plus `foldMap()` — for a token-level renderer, a minimap, semantic search, a folded outline | no |
| `glowglow/dom` | `mountGlowLines()` renders and patches lines; `mountGlowEditor()` adds the input handling on top | yes |

The contract between the engine and any editor is one call:

```ts
const patch = doc.update(from, to, insert)
// { startLine, removed, lines: string[], full }
```

`patch.lines` replaces `patch.removed` lines starting at `patch.startLine`, each
entry being one line's inner HTML with no wrapper; `full: true` means "re-render
everything". That is all a renderer needs — the engine never touches the DOM.

Two things to design around:

- **Patches are line-granular**, so a renderer keeps one element per line. Every
  editor does; a purely character-level canvas would have to map them itself.
- **The engine does not normalise.** `glowDocument` never touches CRLF or blank
  lines — what you put in is what comes out. Line endings are the editor's call.

#### Folding

Hiding lines is a view concern, so the engine only supplies the projection —
`foldMap(folds, lineCount)` maps document lines to visible rows (and back). What
folds is yours to decide, whether that is a brace matcher, an outline or a
language server; the document itself never changes.

```ts
const map = foldMap([{ from: 12, to: 30 }], doc.lineCount)
map.visibleCount // 18 fewer rows
map.lineAt(row) // the line to draw at a row
map.hiddenAt(row) // how many lines the marker at this row stands for
map.rowOf(line) // -1 when a fold hides it
```

That pairs with rendering only a window of rows, which is how the 100,000-line
demo stays instant: `preview/virtual.html` collapses blocks, keeps ~30 rows in
the DOM, and never asks the document for a folded-away line.

The editor folds too:

```ts
editor.setFolds([{ from: 12, to: 30 }]) // decide them however you like
editor.setFolds([]) // unfold everything
```

A folded line leaves the DOM entirely, so the caret cannot reach it — ask for one
inside a hidden range and it parks on the fold's own row instead. Edits still
patch only the rows they touched, folds move with the text across edits the way
marks do, and a click on a collapsed marker calls back through `onFoldToggle` so
the caller decides what the click means. `preview/editor.html` folds its blocks
with a brace matcher written in the page.

#### Your own markup in the output

An editor usually has ranges of its own to show — search hits, a diagnostic
underline, a breakpoint. `setMarks` lays them over the output and returns a patch
for the lines whose markup changed, the same shape an edit returns:

```ts
const hits = findMatches(text) // [{ from, to, cls: 'hit' }, …]
view.apply(doc.setMarks(hits)) // or editor.setMarks(hits)

doc.line(i)
// '…<strong><mark class="hit">const</mark></strong> …'
```

A mark splits whatever token it lands in, so the token's own colour survives
around it, and marks move with the text across edits (an edit before a mark
shifts it; an edit inside one grows it). Ranges are plain offsets, exactly like
`Token.start`/`end` — so the same numbers you use for search or a language
server work here unchanged.

If you want the line elements maintained for you, `mountGlowLines` is the render
half on its own — no `contenteditable`, no key handling:

```ts
import { mountGlowLines } from 'glowglow/dom'

const view = mountGlowLines(el, { numbered: true })
// [your input layer]
view.apply(view.document.update(from, to, insert))
```

Because `mountGlowEditor` hands you its `document`, a sidecar like a minimap or
an outline is just a loop over `lineCount` / `lineTokens(i)` / `lineTags(i)` —
no reaching into internals, and no parsing the rendered HTML. `preview/minimap.html`
is a working one (a canvas strip, redrawn on `onChange`, with the scroll position
mirrored back onto it).

The other classic route is a textarea overlay: a transparent `<textarea>` over a
`<pre>`, where the caret lives in the textarea so rebuilding lines never disturbs
it. That is roughly this, with `commonEdit` turning whole-text input into a range:

```ts
import { commonEdit, mountGlowLines } from 'glowglow/dom'

const view = mountGlowLines(pre)
textarea.addEventListener('input', () => {
  const { from, to, insert } = commonEdit(view.document.value, textarea.value)
  view.apply(view.document.update(from, to, insert))
  pre.scrollTop = textarea.scrollTop
})
```

## Options

```ts
glow(code, {
  language: 'ts', // optional metadata only → <code language="ts">. Never affects output.
  numbered: false, // wrap each line in <span class="glow-line"> for css/syntax.css to number
})
```

`glow` and `glowInner` also accept an array of lines: `glow(['const a = 1', 'foo(a)'])`.

## What it understands (and what it won't)

Because there is no language hint, recognition is *structural* — strings, comments, templates, interpolation and markup are all matched from the text itself:

- Strings `'…'` / `"…"` with `\` escapes, triple-quoted `"""…"""`, and multiline backtick templates with nested `${…}`.
- Python `f"…"` and C# `$"…"` interpolating strings (`{…}`), plus `{{` escapes.
- Line comments `//`, `#` (only before a space — `#fff` and `#include` stay code), `#!` shebangs, and `--` when clearly standalone (SQL/Lua/Haskell). Block comments `/* … */`, `<!-- … -->` and Lua `--[[ … ]]` all span lines.
- Numbers in every base: `0xFF`, `0b101`, `0o17`, `1_000`, `.5`, `1e-3`, `1n`, `10u32`.
- `@decorators`, Unicode/CJK identifiers, `obj.type` property access.

Markup is only recognised when the structure really is markup: an HTML/XML tag name, a self-closing tag, or an element whose open and close tags both appear. So `<div>`, `<img/>`, `<MyComp>…</MyComp>` are tags — but TypeScript generics `foo<T>(x)` and comparisons `a < b` are never mis-coloured.

**Known trade-offs** (inherent to being language-free): a JS regular-expression literal `/…/` is read as a division operator; exotic block comments such as OCaml `(* *)` or Haskell `{- -}` are not specially treated (they would be ambiguous with C dereferences and object literals). The keyword table is a cross-language union, so a rare false positive (an identifier that happens to be a reserved word *somewhere*) is possible — and an identifier after a `.` is treated as a property, never a keyword, so `obj.type` stays clean.

## Styling

Glowglow ships the stylesheets from the original nue-glow project. Import one or more of:

```css
/* base token colors (syntax.css) */
@import 'glowglow/css/syntax.css';

/* +/- ins/del/dfn line markers (see the note below) */
@import 'glowglow/css/markers.css';

/* example light-mode theme */
@import 'glowglow/css/light.css';

/* chrome for mountGlowEditor() from glowglow/dom */
@import 'glowglow/css/editor.css';
```

`glow()` escapes its input and only emits `<strong>`, `<b>`, `<em>`, `<i>`, `<sup>`
and `<label>`, so the `ins`/`del`/`dfn`, `mark` and `u` rules only match markers
**you** inject into the output.

All colors are driven by CSS custom properties you can override on your own `<pre>`:

```css
pre {
  --glow-bg-color: #f9f9f9;
  --glow-base-color: #555;
  --glow-primary-color: #0068d6;   /* <b> identifiers, attr names  */
  --glow-secondary-color: #bd2864; /* <em> strings / numbers        */
  --glow-accent-color: #456aff;    /* <strong> keywords / tag names */
  --glow-special-color: #7820bc;   /* <label> decorators            */
  --glow-comment-color: #9aa1a3;   /* <sup> comments                */
  --glow-char-color: #8e989c;      /* <i> operators / brackets      */
  --glow-counter-color: #bbb;      /* line numbers                  */
  --glow-marked-color: #51c6fe29;  /* <mark> highlight              */
}
```

Line numbers are scoped to `.glow-line`, the class emitted for
`{ numbered: true }`. Without that option no `<span>` is emitted at all, so any
spans of your own inside a `<pre>` (page-break anchors, search hits) are never
numbered.

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm coverage    # vitest + v8 coverage (100% on every metric)
pnpm lint        # eslint (antfu config)
pnpm bench       # build, then time glow() and one glowDocument() keystroke
pnpm build       # tsdown → dist/ (ESM, CJS, .d.ts)

node preview/generate.mjs  # regenerate preview/preview.html from preview/samples/

# the live editor demo: `pnpm build` also emits preview/glowglow.preview.js,
# a self-contained classic script, so the pages work straight from file://
pnpm build && open preview/editor.html    # the editor, with a search box that
                                          # highlights hits via setMarks
open preview/minimap.html                 # an editor plus a minimap drawn from
                                          # the public document API
open preview/virtual.html                 # 100,000 lines, folded blocks, only the
                                          # visible rows in the DOM

# drive the built editor in a real browser over the DevTools Protocol: real
# insertText / Backspace / Enter, caret and node-identity assertions
pnpm test:browser
```
