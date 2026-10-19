# @glowglow/core

CSS-first, language-agnostic syntax highlighting for the web. Hand it code — any
code — and it returns semantic HTML (`<b>`, `<em>`, `<strong>`, `<i>`, `<sup>`,
`<label>`) that your CSS styles.

```ts
import { glow } from '@glowglow/core'

const html = glow(`const answer = 42
console.log(answer)`)
```

No language is required. The engine recognises comments, strings, templates,
numbers, keywords, identifiers, decorators and real HTML/JSX tags structurally.

## Entry points

| Import | Use it for |
|---|---|
| `@glowglow/core` | `glow`, `glowInner`, `glowSource`, `glowDocument`, `detectLanguage` |
| `@glowglow/core/incremental` | The lexer, classifier, document and fold/render helpers |
| `@glowglow/core/dom` | `mountGlowLines` and `mountGlowEditor` |
| `@glowglow/core/css/*` | Bundled stylesheets |

React and Vue components live in [`@glowglow/react`](https://www.npmjs.com/package/@glowglow/react)
and [`@glowglow/vue`](https://www.npmjs.com/package/@glowglow/vue).

## Documentation

Full guides, the API reference and a build-an-editor tutorial:

https://github.com/hhk-png/glowglow#documentation
