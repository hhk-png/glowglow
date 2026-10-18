# Development

## Requirements

- Node.js ≥ 22.13 for development. (The published package itself runs on Node
  ≥ 18; pnpm 11 is what requires ≥ 22.13.)
- pnpm 11
- the browser check needs Node ≥ 22 for its built-in `WebSocket`

## Setup

```bash
pnpm install
```

The `prepare` script installs the Git hooks used by `lint-staged`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` twice: core (no DOM lib) and the DOM adapter |
| `pnpm test` | Vitest, with `happy-dom` for DOM tests |
| `pnpm coverage` | Vitest with v8 coverage |
| `pnpm lint` | ESLint (antfu config) |
| `pnpm fix` | ESLint with `--fix` |
| `pnpm build` | tsdown → `dist/` (ESM, CJS, `.d.ts`) and the preview bundle |
| `pnpm bench` | Build, then time `glow()` and one `glowDocument().applyEdit()` across a size ladder |
| `pnpm test:browser` | Build, then drive the editor in a real browser over the DevTools Protocol |
| `pnpm release` | `bumpp --push`; the pushed tag triggers the release workflow |

## Project layout

```text
src/
  index.ts        public entry: glow, glowInner, glowSource, glowDocument
  glow.ts         one-shot rendering and input normalisation
  lexer.ts        language-free tokenizer; whole-input and resumable segments
  classify.ts     tokens -> semantic colour tags, including tag-candidate logic
  document.ts     GlowDocument: incremental lexing and re-colouring
  fold.ts         fold ranges -> visible-row projection
  render.ts       tokens -> line HTML, escaping and caller marks
  dom.ts          mountGlowLines / mountGlowEditor
  keywords.ts     cross-language keyword table and HTML tag set (internal)
  incremental.ts  the low-level entry point
css/              published stylesheets
preview/          browser demos and their offline IIFE bundle
test/             Vitest suites plus the DevTools browser check
bench/            the size-ladder benchmark
docs/             these pages
```

The core is DOM-free: `tsconfig.json` does not even include the DOM lib. Only
`src/dom.ts` is type-checked by `tsconfig.dom.json` with DOM types, which keeps
accidental DOM access out of the engine.

## Tests

`pnpm test` runs the Vitest suites:

| Suite | Focus |
|---|---|
| `lexer.test.ts` | Token boundaries and content |
| `seam.test.ts` | Splitting the input at any newline produces the same tokens as whole-input lexing |
| `classify.test.ts` | Tags, candidate rejection, prose detection |
| `keywords.test.ts` | The keyword table |
| `document.test.ts` | Line storage and edit patches |
| `document-classify.test.ts` | Incremental colouring matches a full re-classify across random edits |
| `fold.test.ts` | `buildFoldMap` / `shiftFolds` |
| `dom.test.ts` | Mounts, patches, marks and folds under happy-dom |
| `invariants.test.ts` | General engine invariants |
| `glow.test.ts` | One-shot rendering, options and source mapping |
| `incremental.test.ts` | The `glowglow/incremental` entry composes |

The property-style tests are the important ones: they compare the incremental
result against a full recompute after many random edits, which is how the
re-colouring window and the lexer convergence rules are kept honest.

### Browser check

`pnpm test:browser` requires a Chrome/Edge installation. It looks at
`CHROME_PATH` first, then common installation paths on Windows, macOS and Linux.
It launches headless Chrome, loads the built `dist/dom.js`, and sends real input
events through the DevTools Protocol, asserting caret movement, node identity
and text after each edit. happy-dom cannot honestly stand in for `Selection`,
`Range`, `beforeinput` or IME, which is why this check exists separately.

## Benchmarks

```bash
pnpm bench
```

The benchmark renders 100, 1,000, 10,000 and 20,000 lines and reports per-line
cost. Per-line time should stay roughly flat across the ladder. It also times a
single `applyEdit()` keystroke and compares it with a full `glow()` of the same
file.

## Preview pages

```bash
pnpm build
# then open any of these straight from disk
preview/preview.html   # generated samples, no language hints
preview/editor.html    # the editor, with search hits via setMarks
preview/minimap.html   # editor + minimap drawn from the public document API
preview/virtual.html   # 100,000 lines, folded, only visible rows in the DOM
```

`pnpm build` emits `preview/glowglow.preview.js`, a self-contained classic
script, because browsers refuse to load ES modules over `file://`.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- **checks** — lint, both typechecks, a production build on Node 24, and an
  upload of `dist/` for the runtime job;
- **test** — the Vitest suite on Node 22 and 24 (Vitest 5 requires Node ≥ 22.12);
- **runtime** — a smoke test of the built ESM and CJS entries on Node 18 and 20.
  The development toolchain cannot run there, but the published package can;
- **browser** — the real-browser editor check on Node 24 with Chrome.

All jobs install with `pnpm install --frozen-lockfile`, so a lockfile out of
sync with `package.json` fails CI.

## Release

Releases are tag-driven:

```bash
pnpm release   # bumpp: bump version, commit, tag, push
```

Pushing a `v*` tag starts `.github/workflows/release.yml`, which:

1. checks that the tag matches `package.json`;
2. runs typecheck and tests;
3. creates a GitHub release from conventional commits;
4. publishes to npm with provenance (`prepublishOnly` builds first).

Version bumps and publishes are release actions — do not change the version as
part of an ordinary change.
