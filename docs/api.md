# API reference

This page documents the public surface of the three JavaScript entry points and
the CSS assets. Anything not listed here is internal.

- [`@glowglow/core`](#glowglowcore) — one-shot rendering and the incremental document
- [`@glowglow/core/incremental`](#glowglowcoreincremental) — the engine taken apart
- [`@glowglow/core/dom`](#glowglowcoredom) — browser adapters
- [CSS assets](#css-assets)

The framework packages are documented separately: [React](react.md) and
[Vue](vue.md).

## `@glowglow/core`

```ts
import type {
  GlowMark,
  GlowOptions,
  GlowPatch,
  GlowSource,
  LanguageGuess,
  LanguageId,
} from '@glowglow/core'
import {
  detectLanguage,
  glow,
  glowDocument,
  glowInner,
  glowSource,
} from '@glowglow/core'
```

### `glow(input, opts?)`

Renders a complete `<code>` element.

```ts
function glow(
  input: string | readonly string[],
  opts?: GlowOptions,
): string
```

- `input` is a string or an array of lines (joined with `\n`).
- CRLF is normalised to LF, and blank leading/trailing lines are dropped.
- Returns `''` when the prepared text is empty.
- `opts.language` is written to the output as `<code language="…">` but never
  affects highlighting.

```ts
glow('const a = 1', { language: 'ts', numbered: true })
// '<code language="ts"><span class="glow-line">…</span></code>'
```

### `glowInner(input, opts?)`

The same work as `glow()`, but returns only the markup that belongs inside a
`<code>` element. Use it when you already own the element and want to keep its
attributes.

```ts
codeEl.innerHTML = glowInner(code, { numbered: true })
```

### `glowSource(input)`

Returns the text that `glow()` would render plus a mapper from offsets in the
original input into that text.

```ts
interface GlowSource {
  text: string
  offset: (inputOffset: number) => number
}
```

Because `glow()` normalises CRLF and trims blank lines, an offset in your source
is not an offset in the output. Use this mapper when you need to place your own
markers (search hits, anchors) back into the rendered text.

```ts
const { text, offset } = glowSource(code)
const at = offset(searchIndex)
```

### `detectLanguage(input)`

Guesses the language of a snippet from its structure. This is optional
metadata: `glow()`, the document and the framework components never call it, and
highlighting behaves identically with or without the guess.

```ts
function detectLanguage(input: string | readonly string[]): LanguageGuess | null

interface LanguageGuess {
  language: LanguageId
  /** Fraction of the winning language's evidence that matched, 0–1. */
  confidence: number
}
```

```ts
import { detectLanguage } from '@glowglow/core'

detectLanguage('package main\n\nfunc main() {}')
// { language: 'go', confidence: … }

detectLanguage('hello there')
// null
```

Recognised ids:

```ts
type LanguageId
  = | 'bash' | 'c' | 'cpp' | 'csharp' | 'css' | 'go' | 'haskell' | 'html'
    | 'java' | 'javascript' | 'jsx' | 'json' | 'kotlin' | 'lua' | 'perl'
    | 'php' | 'python' | 'ruby' | 'rust' | 'sql' | 'swift' | 'toml'
    | 'typescript' | 'yaml'
```

How it works:

- A quick pass checks decisive signals — shebangs, `<?php`, `<!doctype html>`,
  `package main`, `fn main`, `import Foundation`, `import kotlin.`,
  `using System;`, `module … where` and `--[[`. A match returns that language
  with confidence 1 without running the weighted table.
- Otherwise, each language's weighted list of structural signals is tested:
  keywords, type syntax, imports, markup, declaration forms. The highest total
  weight wins; the first rule wins a tie, so specific formats come before
  general ones.
- A complete JSON object or array is recognised by `JSON.parse` first.
- A language needs at least two points of evidence, so plain prose, tiny
  snippets and one-off keywords return `null`.
- `confidence` is the fraction of that language's evidence that matched. It is
  useful for ranking or for a "likely" label, but it is not a calibrated
  probability.
- JSX wins when component markup is the strongest signal; `.tsx` files are
  reported as `jsx` or `typescript` depending on which evidence dominates.
- The detector never affects the highlighter. It exists for labels, icons,
  editor modes and analytics.

### `glowDocument(text)`

Creates an incremental document for live editing. The core entry re-exports the
factory and the patch type; the document class itself is available from
`@glowglow/core/incremental`.

```ts
import type { GlowPatch } from '@glowglow/core'
import { glowDocument } from '@glowglow/core'

const doc = glowDocument(code)
const patch: GlowPatch = doc.applyEdit(from, to, insert)
```

Unlike `glow()`, the document performs **no normalisation**: `doc.value` is
character-for-character what you passed in, line endings included.

### `GlowDocument`

`glowDocument()` returns a `GlowDocument`:

| Member | Description |
|---|---|
| `value: string` | The document text |
| `lineCount: number` | Number of lines |
| `lineStart(i: number): number` | Absolute offset where line `i` starts |
| `lineIndexAt(offset: number): number` | Index of the line containing `offset`, clamped to the document |
| `lineText(i: number): string` | Text of line `i`, without its trailing newline |
| `lineTokens(i: number): Token[]` | Tokens of line `i`, with absolute offsets |
| `lineTags(i: number): (string \| null)[]` | Colour tag per token, parallel to `lineTokens(i)` |
| `lineHtml(i: number): string` | Inner HTML of line `i` — no `.glow-line` wrapper |
| `render(opts?: GlowOptions): string` | Every line's inner HTML, joined with `\n`; `numbered` wraps each line |
| `applyEdit(from, to, insert): GlowPatch` | Replace `[from, to)` with `insert` |
| `setMarks(marks: readonly GlowMark[]): GlowPatch` | Replace caller ranges without changing the text |
| `markRanges: readonly GlowMark[]` | The ranges currently laid over the output |

### `GlowOptions`

```ts
interface GlowOptions {
  /** Metadata only — written to <code language="…">, never read by the engine. */
  language?: string
  /** Wrap each line in <span class="glow-line"> for css/syntax.css numbering. */
  numbered?: boolean
}
```

### `GlowPatch`

```ts
interface GlowPatch {
  /** Index in the new document where the changed lines begin. */
  startLine: number
  /** How many of the old document's lines these replace. */
  removed: number
  /** Rendered inner HTML of each new line, in order — no `.glow-line` wrapper. */
  lines: string[]
  /** True when the whole document was re-rendered. */
  full: boolean
  /**
   * True when only caller marks changed. The text did not move, so a renderer
   * that keeps state tied to line numbers (folds, for one) must not shift it.
   */
  marks?: boolean
}
```

A renderer replaces `removed` rows starting at `startLine` with `lines`. When
`full` is true, the patch covers the whole document and `startLine`/`removed`
should be treated as describing that whole range.

### `GlowMark`

```ts
interface GlowMark {
  from: number
  to: number
  /** Element name for the wrapper. Defaults to 'mark'. */
  tag?: string
  /** Class for the wrapper, escaped. */
  cls?: string
}
```

## `@glowglow/core/incremental`

This entry is the implementation, deliberately exposed: the lexer, the
classifier, the document and the fold/render helpers can be composed differently
than `glowDocument()` composes them. Its shapes are more coupled to the
implementation than the public entry points and may change in a minor release.

```ts
import {
  buildFoldMap,
  classifyTokens,
  classifyTokenWindow,
  countTagNames,
  escapeHtml,
  findTagCandidates,
  GlowDocument,
  glowDocument,
  lex,
  lexSegment,
  renderLine,
  sameLexState,
  selectMarkupRegions,
  shiftFolds,
  tokenText,
} from '@glowglow/core/incremental'
```

### Lexing

#### `lex(src)`

```ts
function lex(src: string): Token[]
```

Tokenises the whole input. Tokens are contiguous, non-overlapping and fully
cover the input.

#### `lexSegment(src, from, to, state, eof?)`

```ts
function lexSegment(
  src: string,
  from: number,
  to: number,
  state: readonly LexFrame[],
  eof?: boolean,
): LexSegmentResult
```

Tokenises the half-open range `[from, to)`, resumed from the state an earlier
segment returned. Every line boundary is a safe resume point. `eof` defaults to
`to >= src.length` and tells the lexer whether an open literal ends here.

```ts
const head = lexSegment(src, 0, 6, [])
const tail = lexSegment(src, 6, src.length, head.state)
```

#### `tokenText(src, tok)`

```ts
function tokenText(src: string, tok: Token): string
```

Returns `src.slice(tok.start, tok.end)`.

#### Types

```ts
type TokenKind = 'comment' | 'str' | 'word' | 'num' | 'op' | 'decor' | 'ws'

interface Token {
  kind: TokenKind
  start: number
  end: number
}

type LexFrame = StrFrame | InterpFrame | BlockFrame

type LexState = readonly LexFrame[]

interface LexSegmentResult {
  tokens: Token[]
  state: LexFrame[]
}
```

`LexFrame` is an opaque checkpoint: pass it back to `lexSegment` verbatim. A
frame records a construct that crosses a segment boundary — a string (delimiter,
interpolation marker, multiline flag), an interpolation (brace depth) or a block
comment (closing sequence and start).

### Classification

Classification turns tokens into semantic colour tags:

| Token | Tag |
|---|---|
| keywords | `strong` |
| identifiers | `b` |
| strings and numbers | `em` |
| comments | `sup` |
| decorators | `label` |
| operators and brackets | `i` |
| markup attribute names | `b` |
| markup tag names | `strong` |
| prose between real tags | `null` (unwrapped) |

#### `findTagCandidates(src, toks)`

```ts
function findTagCandidates(src: SourceText, toks: Token[]): TagRegion[]
```

Finds every `<…>` that is *structurally* a tag opening, closing or self-closing
tag. These are candidates only: at this stage `Array<T>` looks exactly like
`<T>`, so the result is not yet known to be markup.

#### `countTagNames(regions)`

```ts
function countTagNames(regions: readonly TagRegion[]): TagNameCounts
```

Counts how often each name occurs as an opening tag and as a closing tag over
the given regions.

#### `selectMarkupRegions(regions, counts)`

```ts
function selectMarkupRegions(
  regions: readonly TagRegion[],
  counts: TagNameCounts,
): TagRegion[]
```

Keeps a candidate when any of these holds:

1. the name is a known HTML tag;
2. the name occurs both as an opening and as a closing tag document-wide;
3. it is an opening, self-closing tag (`<Spinner />`).

This is what rejects `Array<T>` and comparisons such as `a < b` while keeping
`<Card>…</Card>`, `<div>` and `<Spinner />`.

#### `classifyTokens(src, toks)`

```ts
function classifyTokens(src: SourceText, toks: Token[]): TaggedToken[]
```

The whole-input classifier. It counts names and decides regions over `toks`,
then assigns a tag to every token.

#### `classifyTokenWindow(src, toks, counts, leftBounded, rightBounded)`

```ts
function classifyTokenWindow(
  src: SourceText,
  toks: Token[],
  counts: TagNameCounts,
  leftBounded: boolean,
  rightBounded: boolean,
): TaggedToken[]
```

Classifies a slice of the token stream. `counts` must be document-wide, so
pairing still sees markup outside the slice. `leftBounded` says the slice begins
just after a decided region; `rightBounded` says it ends just before one. Those
flags let prose at the slice edges be recognised as text.

#### Types

```ts
type SourceText = string | {
  at: (offset: number) => string
  of: (tok: Token) => string
}

interface TagRegion {
  /** Token index of the '<'. */
  from: number
  /** Token index of the tag-name word. */
  nameIdx: number
  /** Token index of the closing '>' (or '/>'). */
  to: number
  /** Absolute offset of '<'. */
  start: number
  /** Absolute offset just past '>'. */
  end: number
  /** Lower-cased tag name. */
  name: string
  open: boolean
  closer: boolean
  selfClose: boolean
}

interface TagNameCounts {
  open: Map<string, number>
  close: Map<string, number>
}

interface TaggedToken {
  kind: TokenKind
  start: number
  end: number
  tag: string | null
}
```

The object form of `SourceText` is how the incremental document classifies
without ever materialising the whole text as one string.

### The document

```ts
export { GlowDocument, glowDocument, sameLexState } from '@glowglow/core/incremental'
```

`GlowDocument` and `glowDocument()` are documented under
[`@glowglow/core`](#glowdocument). `sameLexState(a, b)` compares two lexer states by
the future they imply, ignoring historical details such as where a block frame
started. It is the convergence test the incremental lexer uses.

### Folding

#### `GlowFold`

```ts
interface GlowFold {
  /** First line of the fold. It stays visible and carries the marker. */
  from: number
  /** Last line of the fold, inclusive. */
  to: number
  /** Text for the collapsed marker. Defaults to the hidden line count. */
  label?: string
}
```

#### `buildFoldMap(folds, lineCount)`

```ts
function buildFoldMap(folds: readonly GlowFold[], lineCount: number): GlowFoldMap
```

Normalises the folds (clips them to the document, drops folds that hide nothing,
lets an earlier fold win on overlap) and returns a row/line projection:

| Member | Description |
|---|---|
| `visibleCount` | Rows drawn with these folds collapsed |
| `hiddenCount` | Total hidden lines |
| `hiddenCountAt(row)` | Lines the fold drawn at `row` hides, or `0` |
| `lineIndexAt(row)` | Document line drawn at `row` |
| `rowIndexAt(line)` | Row for a document line, or `-1` when hidden |
| `foldRowIndexAt(line)` | Row of the fold that hides `line`, or `-1` |

#### `shiftFolds(folds, startLine, removed, added)`

```ts
function shiftFolds(
  folds: readonly GlowFold[],
  startLine: number,
  removed: number,
  added: number,
): GlowFold[]
```

Moves folds with an edit. Folds wholly after the edit shift; a fold the edit
lands inside keeps its first line and grows or shrinks with the inserted lines.

### Rendering

#### `renderLine(src, toks, from, ls, le, marks?)`

```ts
function renderLine(
  src: string,
  toks: readonly RenderToken[],
  from: number,
  ls: number,
  le: number,
  marks?: readonly GlowMark[],
): string
```

Renders the `[ls, le)` portion of one line. `from` is the index of the first
token that can overlap the line, so earlier tokens are never rescanned. `marks`
are matched by offset; marks that overlap are truncated rather than nested, and
the earlier one wins.

#### `escapeHtml(str)`

Escapes `&`, `<` and `>`.

#### Types

```ts
interface RenderToken {
  start: number
  end: number
  tag: string | null
}

interface GlowMark {
  from: number
  to: number
  tag?: string
  cls?: string
}
```

## `@glowglow/core/dom`

```ts
import type {
  GlowEdit,
  GlowEditor,
  GlowEditorOptions,
  GlowLines,
  GlowLinesOptions,
} from '@glowglow/core/dom'
import {
  commonEdit,
  mountGlowEditor,
  mountGlowLines,
} from '@glowglow/core/dom'
```

### `mountGlowLines(el, opts?)`

```ts
function mountGlowLines(
  el: HTMLElement,
  opts?: GlowLinesOptions,
): GlowLines
```

Renders a document into one element per visible line and keeps those elements
in sync by applying patches. It owns no input handling — no `contenteditable`,
no keyboard, no clipboard — so it is the piece to build a different editor on.
The element gains the class `glow-lines`.

```ts
interface GlowLinesOptions {
  /** Initial text. Defaults to the element's current text. */
  value?: string
  /** Wrap each line in <span class="glow-line"> inside its row. */
  numbered?: boolean
}

interface GlowLines {
  readonly element: HTMLElement
  readonly document: GlowDocument
  readonly foldMap: GlowFoldMap
  readonly folds: readonly GlowFold[]
  render: () => void
  apply: (patch: GlowPatch) => void
  setMarks: (marks: readonly GlowMark[]) => void
  setFolds: (folds: readonly GlowFold[]) => void
  setValue: (text: string) => void
  destroy: () => void
}
```

### `mountGlowEditor(el, opts?)`

```ts
function mountGlowEditor(
  el: HTMLElement,
  opts?: GlowEditorOptions,
): GlowEditor
```

A ready-made `contenteditable` editor on top of `mountGlowLines`. Input is
intercepted on `beforeinput` and applied by hand, which keeps paste plain text
and restores the caret exactly. Because the browser's undo stack never sees
these edits, the editor keeps its own history (**Ctrl+Z**, **Ctrl+Shift+Z**,
**Ctrl+Y**). It also handles word/line deletes, plain-text cut/copy/paste,
**Tab**/**Shift+Tab** indentation and **Esc** to release focus.

```ts
interface GlowEditorOptions extends GlowLinesOptions {
  /** Inserted for Tab. Two spaces by default. */
  indent?: string
  /** Called after every edit with the new text. */
  onChange?: (value: string) => void
  /** Called when a collapsed marker is clicked, with its line. */
  onFoldToggle?: (line: number) => void
}

interface GlowEditor {
  readonly element: HTMLElement
  readonly document: GlowDocument
  readonly value: string
  readonly folds: readonly GlowFold[]
  setMarks: (marks: readonly GlowMark[]) => void
  setFolds: (folds: readonly GlowFold[]) => void
  setValue: (text: string) => void
  destroy: () => void
}
```

### `commonEdit(a, b)`

```ts
function commonEdit(a: string, b: string): GlowEdit
```

Returns the smallest replacement that turns `a` into `b`, found with a common
prefix and suffix scan.

```ts
interface GlowEdit {
  from: number
  to: number
  insert: string
}
```

## CSS assets

These are plain files, importable with any bundler:

```
@glowglow/core/css/syntax.css    token colours, line numbers, CSS variables
@glowglow/core/css/light.css     an example light theme
@glowglow/core/css/markers.css   ins / del / dfn line decorations
@glowglow/core/css/editor.css    chrome for mountGlowLines() / mountGlowEditor()
```

See [Styling](styling.md) for the vocabulary and variables.
