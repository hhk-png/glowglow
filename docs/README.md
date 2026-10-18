# Glowglow documentation

Glowglow is a language-agnostic syntax highlighter. It reads code structurally —
strings, comments, templates, numbers, keywords and real HTML/JSX tags — and
returns semantic HTML that *your* CSS styles. There is no grammar to load, no
language to declare and no runtime dependency.

The [README](../README.md) is the quick tour. These pages are the reference and
the deep dives.

## Start here

| Page | What it covers |
|---|---|
| [Tutorial](tutorial.md) | Build an editor step by step — [中文版](tutorial.zh-CN.md) |
| [API reference](api.md) | Every export of `glowglow`, `glowglow/incremental` and `glowglow/dom` |
| [Incremental editing](incremental.md) | How `GlowDocument` re-lexes and re-colours only what an edit touched |
| [The DOM layer](dom.md) | `mountGlowLines`, `mountGlowEditor`, folds, marks and virtualised lists |
| [Styling](styling.md) | The tag vocabulary, bundled stylesheets and CSS variables |
| [Development](development.md) | Local setup, scripts, tests, benchmarks, CI and release |

## The three entry points

| Import | Environment | Use it for |
|---|---|---|
| `glowglow` | anywhere | One-shot rendering (`glow`, `glowInner`, `glowSource`) and `glowDocument()` |
| `glowglow/incremental` | anywhere, DOM-free | Building a token-level renderer, a minimap, semantic search, or a different editor |
| `glowglow/dom` | browser | Ready-made line rendering and a contenteditable editor |

## At a glance

```ts
import { glow } from 'glowglow'

const html = glow(`const answer = 42
console.log(answer)`)
// '<code><strong>const</strong> answer <i>=</i> <em>42</em>\n…</code>'
```

```ts
import { glowDocument } from 'glowglow'

const doc = glowDocument(source)
const patch = doc.applyEdit(from, to, insert)
// patch.startLine / patch.removed / patch.lines: replace only those DOM rows
```

```ts
import { mountGlowEditor } from 'glowglow/dom'
import 'glowglow/css/syntax.css'
import 'glowglow/css/editor.css'

const editor = mountGlowEditor(document.querySelector('pre')!, { value: source })
```

The package ships ESM, CJS and TypeScript declarations, and works in Node ≥ 18
and every modern browser. The core entries never touch the DOM; only
`glowglow/dom` does.
