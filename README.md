# Infipet

Draw **anything** on the 32 × 32 pixel canvas, begin its life, and care for your own evolving virtual pet. This is an experimental Tamagotchi-style game: feeding, cleaning, sleeping, illness, games, training, battles, aging, and persistent saves are implemented. Convincing natural growth from arbitrary drawings is still being developed.

**Play:** https://natanai.github.io/infipet/ (published by GitHub Actions)

## Run locally

Requires Node.js 22 and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm web
```

Open http://localhost:8081, or run `./Start-Infipet.ps1` in Windows PowerShell.

```sh
pnpm typecheck
pnpm test
pnpm build:web
pnpm build:ios
```

The web deployment runs automatically from `main`. For local web exports, assets use the root path. GitHub Pages builds use `INFIPET_BASE_URL=/infipet`.

## What is preserved

The current application, all production `src/` modules and bundled runtime catalogs, fonts, native configuration, lockfile, and a focused set of regression tests. Large research datasets, generated audits, obsolete test logs, legacy reports, and developer-only analysis tools have been removed from `main`. Previous versions remain recoverable from [the pre-minimal archive](https://github.com/natanai/infipet/tree/archive/pre-minimal-2026-10-25); the original large import also remains on [the pre-cleanup archive](https://github.com/natanai/infipet/tree/archive/pre-cleanup-2026-10-25).

The drawing-to-growth promise is the central goal; historically faithful virtual-pet characters are only a secondary research benchmark.
