# Contributing

Thanks for helping improve Glowglow.

## Setup

The repository is a pnpm workspace with three packages:

```
packages/glowglow   @glowglow/core
packages/react      @glowglow/react
packages/vue        @glowglow/vue
```

Development needs Node.js ≥ 22.13 and pnpm 11:

```bash
pnpm install
```

## Before opening a pull request

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
```

Commit messages follow Conventional Commits — the release notes are generated
from them.

## More detail

[docs/development.md](docs/development.md) covers the project layout, test
suites, benchmarks, browser check, CI and the release process.
