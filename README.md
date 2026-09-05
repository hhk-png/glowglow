# Glowglow ✨

**CSS-first, language-agnostic syntax highlighting for the web.**

Glowglow is a maintained, TypeScript-native fork of [nue-glow](https://github.com/nuejs/nue) — the tiny highlighter from the Nue team. It turns code into semantic HTML (`<b>`, `<em>`, `<strong>`, `<i>`, `<sup>`, …) that **your** CSS styles — no grammar files, no theme bundles, no 14MB of language packages. One minuscule highlighter for virtually every language.

Built with [tsdown](https://tsdown.dev) and type-checked with [TypeScript 7.x](https://devblogs.microsoft.com/typescript/).

- 🔤 **Universal language support** — JS/TS, Python, HTML, CSS, YAML, JSON, Markdown, Bash, SQL and more. Pattern-based, so no grammar files per language.
- 🧱 **Semantic HTML** — keywords become `<b>`, strings `<em>`, comments `<sup>`, brackets `<i>`. Style with plain CSS or CSS custom properties.
- 🎨 **Design-system friendly** — ~15 HTML elements and a handful of CSS variables to style.
- 🪶 **Tiny** — the whole highlighter is a few KB (gzip ≈ 2.7 kB), zero runtime dependencies.
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

const html = glow(code, { language: 'js', numbered: true })

// → '<code language="js"><span>...</span>...</code>'
```

Drop the result into a page (e.g. inside a `<pre>`) and link the stylesheet:

```html
<pre>${html}</pre>
```

## Styling

Glowglow ships the stylesheets from the original project. Import one or more of:

```css
/* base token colors (syntax.css) */
@import 'glowglow/css/syntax.css';

/* +/- /> ins/del/dfn line markers */
@import 'glowglow/css/markers.css';

/* example light-mode theme */
@import 'glowglow/css/light.css';
```

All colors are driven by CSS custom properties you can override on your own `<pre>`:

```css
pre {
  --glow-bg-color: #f9f9f9;
  --glow-base-color: #555;
  --glow-primary-color: #0068d6;   /* <b> keywords        */
  --glow-secondary-color: #bd2864; /* <em> strings        */
  --glow-accent-color: #456aff;    /* <strong> keywords   */
  --glow-special-color: #7820bc;   /* <label> special     */
  --glow-comment-color: #9aa1a3;   /* <sup> comments      */
  --glow-char-color: #8e989c;      /* <i> brackets/char   */
  --glow-counter-color: #bbb;      /* line numbers        */
  --glow-marked-color: #51c6fe29;  /* <mark> highlight    */
}
```

## Options

```ts
glow(code, {
  language: 'js', // detect via first char when omitted ('<' → html)
  numbered: false, // wrap each line in a <span> and number it
  prefix: true, // interpret '+/-/>' line prefixes as ins/del/dfn
  mark: true, // interpret •…• and ••…•• as mark/underline
})
```

## Advanced API

Beyond `glow`, a few lower-level helpers are exported for tooling and tests:

```ts
import { parseRow, renderRow, parseSyntax } from 'glowglow'

parseRow('<div class="x">') // -> tokens [{ start, end, tag, … }, …]
renderRow('<div class="x">') // -> highlighted HTML for one row
parseSyntax(lines, 'js') // -> block list (lines vs. multi-line comments)
```

## Development

```bash
pnpm install
pnpm typecheck   # TypeScript 7
pnpm test        # vitest
pnpm build       # tsdown → dist/ (ESM, CJS, .d.ts)
```

## Credits & license

Forked from [nuejs/nue · nue-glow](https://github.com/nuejs/nue) (MIT, © 2025-present Tero Piirainen). Ported to TypeScript and maintained as **glowglow**. Released under the [MIT License](./LICENSE).
