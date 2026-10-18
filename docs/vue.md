# Vue

`@glowglow/vue` provides two components:

| Component | Use it for |
|---|---|
| `<Glow>` | Static, SSR-safe syntax highlighting |
| `<GlowEditor>` | A `contenteditable` editor with incremental highlighting |

Requires Vue ≥ 3.3.

## Install

```bash
pnpm add @glowglow/vue vue glowglow
```

`glowglow` is installed directly because the stylesheets are imported from it;
pnpm does not expose a transitive dependency's CSS to your app.

```ts
import 'glowglow/css/syntax.css' // token colours and line numbers
import 'glowglow/css/editor.css' // chrome for the editor
```

## Static highlighting

```vue
<script setup lang="ts">
import { Glow } from '@glowglow/vue'
import 'glowglow/css/syntax.css'
</script>

<template>
  <Glow :code="source" language="ts" numbered />
</template>
```

### `<Glow>` props

| Prop | Type | Description |
|---|---|---|
| `code` | `string \| readonly string[]` | Source to highlight |
| `language` | `string?` | Written as `language="…"`; metadata only |
| `numbered` | `boolean?` | Wrap each line in `<span class="glow-line">` |
| `as` | `string?` | Element to render; defaults to `code` |
| …attrs | HTML attributes | Forwarded to the rendered element |

The component renders `glowInner(code)` through `innerHTML`. Glowglow escapes
the source itself and only emits its own semantic tags, so the value is safe.
Both server rendering and client rendering produce the same markup.

`code` is recomputed when the prop changes; a freshly built array is a new
value, which is fine but re-highlights.

## Live editor

```vue
<script setup lang="ts">
import type { GlowEditorHandle } from '@glowglow/vue'
import { GlowEditor } from '@glowglow/vue'
import { ref } from 'vue'
import 'glowglow/css/editor.css'
import 'glowglow/css/syntax.css'

const source = ref('const answer = 42')
const editor = ref<GlowEditorHandle | null>(null)
</script>

<template>
  <GlowEditor
    ref="editor"
    :value="source"
    numbered
    @change="source = $event"
  />
</template>
```

### `<GlowEditor>` props

| Prop | Type | Description |
|---|---|---|
| `value` | `string?` | Initial text; later changes sync into the editor |
| `numbered` | `boolean?` | Show line numbers |
| `indent` | `string?` | Inserted for Tab; two spaces by default |
| …attrs | HTML attributes | Forwarded to the `<pre>` |

### Events

| Event | Payload | Description |
|---|---|---|
| `change` | `string` | The new text after every edit |
| `fold-toggle` | `number` | The line of a clicked collapsed marker |
| `ready` | `GlowEditorHandle` | The mounted editor instance |

`value` is controlled only when it differs from the editor's current text.
Echoing the value you just received through `change` is harmless: it does not
reset the caret or the editor's undo history.

`numbered` and `indent` are **initial-only**. Changing them later does not
reconfigure the mounted editor; give the component a new `key` to remount it.

### Exposed instance

```ts
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

The instance is available through a template ref:

```vue
<script setup lang="ts">
import type { GlowEditorHandle } from '@glowglow/vue'
import { GlowEditor } from '@glowglow/vue'
import { ref, watchEffect } from 'vue'

const editor = ref<GlowEditorHandle | null>(null)
const hits = ref<GlowMark[]>([])

watchEffect(() => editor.value?.setMarks(hits.value))
</script>

<template>
  <GlowEditor ref="editor" :value="source" numbered />
</template>
```

In templates the ref works as written. In render functions, Vue types a
component ref as the component's public instance, so cast it to
`GlowEditorHandle` when you need the exposed API:

```ts
const instance = ref<InstanceType<typeof GlowEditor> | null>(null)
const handle = instance.value as unknown as GlowEditorHandle | null
```

- `document` is the underlying `GlowDocument`: `lineCount`, `lineText(i)`,
  `lineTokens(i)`, `lineTags(i)` and `applyEdit()` are available for a minimap,
  an outline or semantic search.
- `setMarks()` takes absolute offsets and keeps the caret.
- `setFolds()` collapses line ranges. A click on a marker emits
  `fold-toggle(line)`; you decide what the click means.

## SSR and hydration

`<Glow>` is safe to render on the server.

`<GlowEditor>` renders an empty `<pre>` on the server and mounts the editor in
`onMounted` on the client. The markup on both sides is the same empty element,
so hydration matches. Do not read `window` or `document` at module scope.

## Styling

The components emit no styles. Load `glowglow/css/syntax.css` and, for the
editor, `glowglow/css/editor.css`. All colours come from the `--glow-*` CSS
variables described in [Styling](styling.md).

`<Glow>` sets `language` only as metadata; the highlighter itself never reads it.
