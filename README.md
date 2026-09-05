# Glowglow ✨

**CSS-first, language-agnostic syntax highlighting for the web.** You hand it code — *any* code — and it returns semantic HTML (`<b>`, `<em>`, `<strong>`, `<i>`, `<sup>`, `<label>`) that **your** CSS styles. No grammar files, no language packages, no 14 MB of language definitions. One minuscule highlighter for virtually every language.

Built with [tsdown](https://tsdown.dev) and type-checked with [TypeScript 7.x](https://devblogs.microsoft.com/typescript/).

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

// → '<code><span>...</span>\n<span>...</span></code>'
```

No `language` is needed. Drop the result into a page (e.g. inside a `<pre>`) and link a stylesheet:

```html
<pre>${html}</pre>
```

## Options

```ts
glow(code, {
  language: 'ts',  // optional metadata only → <code language="ts">. Never affects output.
  numbered: false, // wrap each line in a <span> so you can number lines yourself
})
```

`glow` also accepts an array of lines: `glow(['const a = 1', 'foo(a)'])`.

## What it understands (and what it won't)

Because there is no language hint, recognition is *structural* — strings, comments, templates, interpolation and markup are all matched from the text itself:

- Strings `'…'` / `"…"` with `\` escapes, triple-quoted `"""…"""`, and multiline backtick templates with nested `${…}`.
- Python `f"…"` and C# `$"…"` interpolating strings (`{…}`), plus `{{` escapes.
- Line comments `//`, `#` (only before a space — `#fff` and `#include` stay code), `#!` shebangs, and `--` when clearly standalone (SQL/Lua/Haskell). Block comments `/* … */` and `<!-- … -->` span lines.
- Numbers in every base: `0xFF`, `0b101`, `0o17`, `1_000`, `.5`, `1e-3`, `1n`, `10u32`.
- `@decorators`, Unicode/CJK identifiers, `obj.type` property access.

Markup is only recognised when the structure really is markup: an HTML/XML tag name, a self-closing tag, or an element whose open and close tags both appear. So `<div>`, `<img/>`, `<MyComp>…</MyComp>` are tags — but TypeScript generics `foo<T>(x)` and comparisons `a < b` are never mis-coloured.

**Known trade-offs** (inherent to being language-free): a JS regular-expression literal `/…/` is read as a division operator; exotic block comments such as `(* *)` or `{- -}` are not specially treated. The keyword table is a cross-language union, so a rare false positive (an identifier that happens to be a reserved word *somewhere*) is possible — and an identifier after a `.` is treated as a property, never a keyword, so `obj.type` stays clean.

## Styling

Glowglow ships the stylesheets from the original project. Import one or more of:

```css
/* base token colors (syntax.css) */
@import 'glowglow/css/syntax.css';

/* +/- ins/del/dfn line markers (kept for backwards compatibility) */
@import 'glowglow/css/markers.css';

/* example light-mode theme */
@import 'glowglow/css/light.css';
```

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

## Development

```bash
pnpm install
pnpm typecheck   # TypeScript 7
pnpm test        # vitest
pnpm build       # tsdown → dist/ (ESM, CJS, .d.ts)

node preview/generate.mjs  # regenerate preview/preview.html from preview/samples/
```

## Credits & license

Forked from [nuejs/nue · nue-glow](https://github.com/nuejs/nue) (MIT, © 2025-present Tero Piirainen). Ported to TypeScript, re-engineered with a language-free tokenizer, and maintained as **glowglow**. Released under the [MIT License](./LICENSE).
