# How incremental editing works

`GlowDocument` is the engine behind `mountGlowLines` and `mountGlowEditor`. Its
job is to answer one question cheaply: *given an edit, which lines' markup
changed?* It does that by re-lexing only until the parser's context is provably
back in sync with the old text, and by re-colouring only a window around the
edit.

This page explains the data model and the pipeline. The public functions are
listed in the [API reference](api.md).

## The data model

A document keeps five parallel, per-line structures:

| Field | Contents |
|---|---|
| `lines` | The text, one string per line, each including its trailing `\n` |
| `starts` | Absolute offset of each line start |
| `toks` | Each line's tokens, **with offsets relative to the line start** |
| `states` | The lexer's `LexFrame[]` checkpoint at each line start |
| `tags` | Each line's colour tag per token, parallel to `toks` |

Two choices carry most of the performance:

- **Text is stored per line, not as one string.** Concatenating a fresh string
  and then indexing it makes V8 flatten it, which copies the whole document.
  Storing line strings means an edit touches only the lines it overlaps.
- **Token offsets are line-relative.** Reusing the tail after an edit shifts
  `starts` but never rewrites token objects.

The document also maintains:

- `counts`: document-wide open/close counts per candidate tag name;
- `decided`: the tag regions that really are markup, sorted and disjoint;
- `angleCount`: the number of lone `<`/`>` operator tokens, used as a fast
  "this document contains no markup at all" test;
- `marks`: caller ranges (search hits, diagnostics) laid over the output.

## The edit pipeline

`applyEdit(from, to, insert)` proceeds in four stages.

### 1. Locate the affected lines

It finds `startLine` and `toLine` with a binary search over `starts`, counts the
newlines inserted and removed (`deltaLines`), and builds the new text of the
touched lines from the prefix before `from`, the insertion, and the suffix after
`to`. The rest of the document is never read.

### 2. Re-lex until the context converges

Lexing restarts at `startLine` from the old state at that line boundary. Each
line's tokens and entry state are written into temporary arrays. Once lexing has
passed the edit, the current state is compared with the old state of the
corresponding line using `sameLexState()`. If they agree, every following line
would lex exactly as it did before, so the loop stops and the old tail is
reused.

```text
old states:  … [S0] [S1] [S2] [S3] [S4] …
                        ^ edit
new states:  … [S0] [S1'] [S2'] [S3]  ← equals old S3: tail is reusable
```

`sameLexState()` compares the parts of a frame that affect the future (a string
delimiter, interpolation depth, block-comment closing sequence), not historical
details such as where a block started.

### 3. Write the lexed lines back

There are two paths:

- **No line was added or removed** (`deltaLines === 0`, the typing case): the
  dirty lines are swapped in place and only the `starts` of later lines are
  shifted by the edit's character delta. No array is reallocated.
- **Lines were added or removed**: the arrays are rebuilt from the preserved
  prefix plus the dirty lines, and the tail is copied across with its offsets
  shifted. The token and state objects themselves are reused.

### 4. Re-colour a window

Colouring is the subtle half, because whether `<Foo>` is markup depends on
whether a matching `</Foo>` exists **anywhere in the file**. The engine splits
the work into two coupled pieces:

- the lexer state at line boundaries;
- document-wide open/close counts of candidate tag names.

`recolor()` works like this:

1. **Capture the old side.** Before the arrays are rewritten, it records the
   old window's candidate regions and counts.
2. **Make the boundaries region-safe.** A `<` and its `>` can straddle the
   window. `safeLeft()` and `safeRight()` widen the window until no `<…>` region
   crosses it, so a local scan never sees half a tag.
3. **Update the counts.** Subtract the old window's candidates, add the new
   window's. If a name crosses zero on either side — it becomes paired or stops
   being paired — every region with that name anywhere in the file may change
   meaning, so the document falls back to a full rebuild.
4. **Pick the window.** The window starts just after one decided region and
   ends just before another, so the prose gaps it sees are whole. If there is no
   decided region nearby and both boundaries are region-safe, the re-lexed lines
   alone are enough. That is why editing plain code does not re-colour the file.
5. **Classify and write tags.** `classifyTokenWindow()` tags the window's
   tokens, `decided` is rebuilt as `head + fresh + tail`, and only the tokens
   inside the window get new tags. Boundary lines keep their old tags outside
   `[wLo, wHi)`.

A window larger than 400 lines is not worth the bookkeeping, so the engine
rebuilds the whole document instead.

## When it falls back to a full rebuild

Incremental correctness is more important than incremental speed. The document
rebuilds everything when:

- the edit consumes every line from `startLine` onward;
- a tag name crosses the "paired / unpaired" boundary in the document-wide
  counts;
- the re-colouring window would exceed 400 lines.

`rebuild()` recomputes candidates, counts, decided regions, tags and the angle
count from scratch, and `applyEdit()` returns a patch with `full: true`.

## The patch contract

```ts
interface GlowPatch {
  startLine: number
  removed: number
  lines: string[]
  full: boolean
  marks?: boolean
}
```

A renderer:

- replaces `removed` rows starting at `startLine` with `lines`;
- on `full`, redraws the whole document;
- on `marks: true`, redraws lines but does **not** move any line-numbered view
  state, because the text did not move.

Each entry in `lines` is the inner HTML of one line with no wrapper. Line markup
never contains a newline, so a whole document is simply its rendered lines joined
with `\n`.

## Guarantees and limits

- **Line granularity.** A patch always describes whole lines. A purely
  character-level renderer would have to map the patch itself.
- **No normalisation.** The document never touches CRLF or trims blank lines.
  What you put in is what comes out. This differs from `glow()` on purpose.
- **Marks move with the text.** An edit before a mark shifts it; an edit inside
  a mark grows it. `setMarks()` changes only the overlay and returns a
  `marks: true` patch.
- **Global pairing is a heuristic.** A file that contains both `Array<T>` and a
  literal `</T>` will treat `T` as a paired markup name. There is no language
  hint to disambiguate, by design.
- **Cost tracks the edit, not the file.** A keystroke re-lexes and re-colours
  the lines it can reach. The benchmark ladder in `bench/run.mjs` asserts that
  per-line cost stays roughly flat from 100 to 20,000 lines.

## Driving the engine without the DOM

`glowglow/incremental` exposes the same pieces the document is built from:

```ts
import {
  buildFoldMap,
  classifyTokenWindow,
  countTagNames,
  findTagCandidates,
  glowDocument,
  lexSegment,
} from 'glowglow/incremental'

// lex a file line by line, keeping a checkpoint per line
let state = []
const checkpoints = []
for (const line of lines) {
  checkpoints.push(state)
  state = lexSegment(line, 0, line.length, state, false).state
}

// build the incremental document
const doc = glowDocument(lines.join('\n'))
const patch = doc.applyEdit(from, to, insert)

// project document lines to visible rows for a virtualised renderer
const map = buildFoldMap([{ from: 12, to: 30 }], doc.lineCount)
```

The classifier can also be applied to a slice without a `GlowDocument`:

```ts
import { classifyTokenWindow, countTagNames, findTagCandidates, lex } from 'glowglow/incremental'

const toks = lex(source)
const counts = countTagNames(findTagCandidates(source, toks))
const tagged = classifyTokenWindow(source, toks, counts, false, false)
void tagged
```
