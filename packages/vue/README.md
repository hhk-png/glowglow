# @glowglow/vue

Vue components for [glowglow](https://github.com/hhk-png/glowglow): `<Glow>`
renders highlighted source, `<GlowEditor>` mounts the incremental code editor.

## Install

```bash
pnpm add @glowglow/vue vue @glowglow/core
```

Install `@glowglow/core` directly as well, so you can import its stylesheets.

## Static highlighting

```vue
<script setup lang="ts">
import { Glow } from '@glowglow/vue'
import '@glowglow/core/css/syntax.css'
</script>

<template>
  <Glow :code="'const answer = 42'" language="ts" numbered />
</template>
```

`<Glow>` is SSR-safe: it renders semantic HTML during server rendering and
hydration. Props are `code`, `language`, `numbered`, `as` (default `code`) and
the normal HTML attributes of the rendered element.

## Live editor

```vue
<script setup lang="ts">
import type { GlowEditorHandle } from '@glowglow/vue'
import { GlowEditor } from '@glowglow/vue'
import { ref } from 'vue'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const source = ref('const answer = 42')
const editor = ref<GlowEditorHandle | null>(null)
</script>

<template>
  <GlowEditor
    ref="editor"
    :value="source"
    numbered
    @change="source = $event"
    @ready="instance => instance.setFolds([{ from: 12, to: 30 }])"
  />
</template>
```

Editor props: `value`, `numbered`, `indent`. Events: `change`, `fold-toggle`,
`ready`. `numbered` and `indent` are initial-only; remount with a new `key` to
change them. A changed `value` syncs when it differs from the editor's current
text; echoing a user edit does not reset the caret or undo history.

The exposed instance is typed as `GlowEditorHandle`:

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

See the [full documentation](https://github.com/hhk-png/glowglow/blob/main/docs/vue.md).
