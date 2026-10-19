# Styling

Glowglow emits semantic HTML only. It never emits inline styles, class names for
colours, or `<span class="token keyword">`-style token classes. Your CSS decides
what everything looks like.

## The tag vocabulary

| Output | Meaning |
|---|---|
| `<strong>` | keywords, and markup tag names |
| `<b>` | identifiers, attribute names, quoted object keys |
| `<em>` | strings and numbers |
| `<sup>` | comments |
| `<label>` | decorators |
| `<i>` | operators and brackets |
| `<mark>` | caller ranges added through `GlowMark` (default wrapper) |
| *plain text* | whitespace and prose between real markup tags |

For example:

```ts
import { glowInner } from '@glowglow/core'

glowInner('const answer = 42')
// '<strong>const</strong> answer <i>=</i> <em>42</em>'
```

`glow()` escapes its input. It only ever emits the tags above, plus `u`, `ins`,
`del` and `dfn` rules when **you** inject those markers yourself.

## Bundled stylesheets

```css
/* token colours, line numbers and the default variables */
@import '@glowglow/core/css/syntax.css';

/* an example light theme (override the variables below) */
@import '@glowglow/core/css/light.css';

/* ins / del / dfn line decorations */
@import '@glowglow/core/css/markers.css';

/* chrome for mountGlowLines() and mountGlowEditor() */
@import '@glowglow/core/css/editor.css';
```

`editor.css` only supplies layout, focus and monospace chrome. Tokens still get
their colours from `syntax.css` and its variables.

## CSS variables

Override these on your own container (`pre`, `.glow-editor`, …). Everything has
a dark-theme fallback, so a single override is enough.

| Variable | Used for | Default |
|---|---|---|
| `--glow-bg-color` | Background | `#20293A` |
| `--glow-base-color` | Text and caret | `#a2aab1` |
| `--glow-padding` | Container padding | `1.5em` |
| `--glow-primary-color` | `<b>` identifiers and attribute names | `#7dd3fc` |
| `--glow-secondary-color` | `<em>` strings and numbers | `#f472b6` |
| `--glow-accent-color` | `<strong>` keywords and tag names | `#419fff` |
| `--glow-char-color` | `<i>` operators and brackets | `#64748b` |
| `--glow-comment-color` | `<sup>` comments | `#6f7a7d` |
| `--glow-special-color` | `<label>` decorators | `#fff` |
| `--glow-marked-color` | `<mark>` background | `#2dd4bf26` |
| `--glow-error-color` | Wavy `<u>` underline and highlighted line number | `red` |
| `--glow-counter-color` | Line-number counter | `#475569` |

Example light theme:

```css
pre {
  --glow-bg-color: #f9f9f9;
  --glow-base-color: #555;
  --glow-primary-color: #0068d6;
  --glow-secondary-color: #bd2864;
  --glow-accent-color: #456aff;
  --glow-special-color: #7820bc;
  --glow-comment-color: #9aa1a3;
  --glow-char-color: #8e989c;
  --glow-counter-color: #bbb;
  --glow-marked-color: #51c6fe29;
}
```

## Line numbers

Line numbers are opt-in:

```ts
glow(code, { numbered: true })
// or
mountGlowEditor(pre, { value: code, numbered: true })
```

With `numbered: true`, each rendered line is wrapped in
`<span class="glow-line">`, which increments the `line-counter` counter defined
by `syntax.css`. Without the option no wrapper span is emitted, so any spans of
your own inside the `<pre>` are never numbered and never double-count.

## Your own ranges

`GlowMark` wraps a range in an element of your choice:

```ts
interface GlowMark {
  from: number
  to: number
  tag?: string // defaults to 'mark'
  cls?: string // escaped; becomes class="…"
}
```

```ts
editor.setMarks([
  { from: 40, to: 47, cls: 'hit' },
  { from: 80, to: 83, tag: 'u', cls: 'diagnostic' },
])
```

A mark splits the token it lands in, so the token's colour survives around it:

```html
<strong><mark class="hit">const</mark></strong>
```

`markers.css` styles line decorations made with `ins`, `del` and `dfn`, using
`--glow-line-color`, `--glow-del-color`, `--glow-ins-color` and
`--glow-line-opacity`.

## Styling the editor chrome

`.glow-lines` and `.glow-editor` share the same row elements, so both get the
same look. The editor additionally sets `contenteditable` and adds a focus
outline. If you want a different shell, override `.glow-editor` / `.glow-lines`
and the `.glow-row` / `.glow-body` / `.glow-fold` classes.

The collapsed fold marker is `.glow-fold`; `editor.css` styles it and the editor
calls `onFoldToggle(line)` when it is clicked.
