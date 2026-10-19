# @glowglow/react

React components for [glowglow](https://github.com/hhk-png/glowglow): `<Glow>`
renders highlighted source, `<GlowEditor>` mounts the incremental code editor.

## Install

```bash
pnpm add @glowglow/react react @glowglow/core
```

Install `@glowglow/core` directly as well, so you can import its stylesheets.

## Static highlighting

```tsx
import { Glow } from '@glowglow/react'
import '@glowglow/core/css/syntax.css'

export function Example() {
  return <Glow code="const answer = 42" language="ts" numbered />
}
```

`<Glow>` is SSR-safe: it renders semantic HTML during server rendering and
hydration. Props are `code`, `language`, `numbered`, `as` (default `code`) and
the normal HTML attributes of the rendered element.

## Live editor

```tsx
import type { GlowEditorHandle } from '@glowglow/react'
import { GlowEditor } from '@glowglow/react'
import { useRef } from 'react'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

export function Example({ source, save }: { source: string, save: (value: string) => void }) {
  const editor = useRef<GlowEditorHandle>(null)

  return (
    <GlowEditor
      ref={editor}
      value={source}
      numbered
      onChange={save}
      onReady={instance => instance.setFolds([{ from: 12, to: 30 }])}
    />
  )
}
```

Editor props: `value`, `numbered`, `indent`, `onChange`, `onFoldToggle`,
`onReady`, plus the attributes of the rendered `<pre>`. `numbered` and `indent`
are initial-only; remount with a new `key` to change them. A controlled `value`
syncs when it differs from the editor's current text; echoing a user edit does
not reset the caret or undo history.

The ref exposes:

| Member | Description |
|---|---|
| `element` | The editor element |
| `document` | The underlying `GlowDocument` |
| `value` | Current text |
| `folds` | Folds in force |
| `setValue(text)` | Replace the text |
| `setMarks(marks)` | Replace caller ranges |
| `setFolds(folds)` | Collapse ranges |
| `focus()` | Focus the editor |

`<GlowEditor>` renders an empty `<pre>` on the server and mounts the editor on
the client, so it is safe inside an SSR tree.

See the [full documentation](https://github.com/hhk-png/glowglow/blob/main/docs/react.md).
