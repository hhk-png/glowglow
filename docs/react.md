# React

`@glowglow/react` provides two components:

| Component | Use it for |
|---|---|
| `<Glow>` | Static, SSR-safe syntax highlighting |
| `<GlowEditor>` | A `contenteditable` editor with incremental highlighting |

Requires React ≥ 18.

## Install

```bash
pnpm add @glowglow/react react glowglow
```

`glowglow` is installed directly because the stylesheets are imported from it;
pnpm does not expose a transitive dependency's CSS to your app.

```ts
import 'glowglow/css/syntax.css' // token colours and line numbers
import 'glowglow/css/editor.css' // chrome for the editor
```

## Static highlighting

```tsx
import { Glow } from '@glowglow/react'

export function Snippet({ source }: { source: string }) {
  return <Glow code={source} language="ts" numbered />
}
```

### `<Glow>` props

| Prop | Type | Description |
|---|---|---|
| `code` | `string \| readonly string[]` | Source to highlight |
| `language` | `string?` | Written as `language="…"`; metadata only |
| `numbered` | `boolean?` | Wrap each line in `<span class="glow-line">` |
| `as` | `string?` | Element to render; defaults to `code` |
| …rest | `HTMLAttributes<HTMLElement>` | Forwarded to the rendered element |

The component renders `glowInner(code)` through
`dangerouslySetInnerHTML`. Glowglow escapes the source itself and only emits
its own semantic tags, so the value is safe. Rendering is pure, which means SSR
and hydration produce identical markup.

`code` is memoised by identity: passing a freshly built array on every render
re-highlights the snippet. Pass a stable value or a string.

## Live editor

```tsx
import type { GlowEditorHandle } from '@glowglow/react'
import { GlowEditor } from '@glowglow/react'
import { useRef } from 'react'

export function Editor({ source, save }: { source: string, save: (value: string) => void }) {
  const editor = useRef<GlowEditorHandle>(null)

  return (
    <GlowEditor
      ref={editor}
      value={source}
      numbered
      onChange={save}
    />
  )
}
```

### `<GlowEditor>` props

| Prop | Type | Description |
|---|---|---|
| `value` | `string?` | Initial text; later changes sync into the editor |
| `numbered` | `boolean?` | Show line numbers |
| `indent` | `string?` | Inserted for Tab; two spaces by default |
| `onChange` | `(value: string) => void` | Called after every edit |
| `onFoldToggle` | `(line: number) => void` | Called when a collapsed marker is clicked |
| `onReady` | `(editor: GlowEditorHandle) => void` | Called once the editor mounts |
| …rest | `HTMLAttributes<HTMLPreElement>` | Forwarded to the `<pre>` |

`value` is controlled only when it differs from the editor's current text.
Echoing the value you just received through `onChange` is harmless: it does not
reset the caret or the editor's undo history.

`numbered` and `indent` are **initial-only**. Changing them later does not
reconfigure the mounted editor; give the component a new `key` to remount it.

### Imperative handle

```tsx
export interface GlowEditorHandle {
  readonly element: HTMLElement | null
  readonly document: GlowDocument | null
  readonly value: string
  readonly folds: readonly GlowFold[]
  setValue: (value: string) => void
  setMarks: (marks: readonly GlowMark[]) => void
  setFolds: (folds: readonly GlowFold[]) => void
  focus: () => void
}
```

Use it for sidecars and editor features that are not props:

```tsx
import type { GlowEditorHandle } from '@glowglow/react'
import type { GlowMark } from 'glowglow'
import { GlowEditor } from '@glowglow/react'
import { useEffect, useRef } from 'react'

function Editor({ source, hits }: { source: string, hits: GlowMark[] }) {
  const editor = useRef<GlowEditorHandle>(null)

  useEffect(() => {
    editor.current?.setMarks(hits)
  }, [hits])

  return <GlowEditor ref={editor} value={source} numbered />
}
```

- `document` is the underlying `GlowDocument`: `lineCount`, `lineText(i)`,
  `lineTokens(i)`, `lineTags(i)` and `applyEdit()` are all available for a
  minimap, an outline or semantic search.
- `setMarks()` takes absolute offsets and returns a patch internally; the
  component applies it and keeps the caret.
- `setFolds()` collapses line ranges. A click on a marker calls
  `onFoldToggle(line)`; you decide what the click means.

## SSR and hydration

`<Glow>` is safe to render on the server.

`<GlowEditor>` renders an empty `<pre>` on the server and mounts the editor in
`useEffect` on the client. The markup on both sides is the same empty element,
so hydration matches. Do not read `window` or `document` at module scope.

## StrictMode

React StrictMode mounts effects twice in development. `<GlowEditor>` destroys
the first instance and mounts a second one, so the final DOM is correct, but
`onReady` fires twice in development. Do not treat `onReady` as a
once-per-component-lifetime callback.

## Styling

The components emit no styles. Load `glowglow/css/syntax.css` and, for the
editor, `glowglow/css/editor.css`. All colours come from the `--glow-*` CSS
variables described in [Styling](styling.md).

`<Glow>` sets `language` only as metadata; the highlighter itself never reads it.
