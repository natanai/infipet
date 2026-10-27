# Infipet

**Single-pet lifecycle:** Each creation yields one continuously identifiable creature. Its original drawing, once-assigned hidden seed and permanent developmental potential interact with care and chronological time to produce dramatic transformations of that *same* pet. The tree of life is a biological possibility map for these evolution-like stages, not a breeding system or a claim of literal species change. Infipet has no reproduction, offspring, parent-child inheritance or multi-generational gameplay.

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

## Player interface

Fresh sessions open to an empty drawing pad. All 15 part brushes are visible in a five-column palette; pencil, eraser, color, undo, redo, mirror and clear stay beside the canvas. **Begin life** commits a drawing. **Pet** returns to that same saved organism. Replacing a living pet, including by importing a file, requires confirmation.

**More** groups export/import/name, Development Tools, and About. Development Tools holds seed controls, growth timeline, care experiments/diagnostics, the experimental iOS widget, and exactly 12 original editable presets with fixed seeds. Presets load drafts only. They do not define species or future stages.

The web export caches its app shell after the first successful online visit. Once the cache is ready, a refresh without network access reopens the local saved pet; clearing browser site data clears both the shell and the local save. Export a pet file for a portable copy.

Executable browser flow tests run against the actual exported app:

```sh
pnpm build:web
pnpm exec playwright install chromium
pnpm test:ui
```

Set `INFIPET_BASE_URL=/infipet` for both build and test to exercise the GitHub Pages path. Optional `UI_EVIDENCE_DIR` captures one desktop and one narrow layout, solely as interface evidence. These images do not verify biological correctness.

## Seeded retro references (experimental)

The 36 historical reference drawings and their candidate seeds remain bundled as independent research fixtures. Their UI gallery has been removed from player creation. Numbers, letters and mixed-character seed strings are supported by the shared procedural genome; the program does **not** select a target historical sprite based on a retro reference name.

For a historically faithful evolution route to be **proven**, the same initial drawing and seed **plus the same chronological care history** must reproduce all milestones with demonstrated shape similarity, without importing any reference target into the growth engine. The independent [P1 benchmark](tests/retro-reference-score.test.ts) measures the actual generated sprite silhouettes against an original-ROM-derived route and prints scores; it is a diagnostic, **not a successful parity test**. The care vector presently exercised by that test is hypothetical rather than an authenticated hardware command trace. The original game's exact evolution paths have **not** been reproduced or verified; the reference seeds are not calibrated matches.

The currently bundled OpenTree lineage is **animal-only**, and the live simulation already responds to care and training using general biological priors. Provenance-backed plant ancestry, robust shape classification across all kingdoms, denser hereditary variation, and original-device care-gate parity remain substantial engine-development work. Reference sprites must remain independent evaluation fixtures, never a renderer lookup table.

## Current algorithm development plan

The **only active roadmap** is [roadmap/plan.json](roadmap/plan.json). It stores task dependencies, acceptance assertions, verification commands and independent algorithm owner scopes. List work with `node scripts/roadmap.mjs --list`, inspect one task with `--task=OBS-002`, run its dedicated test once implemented with `--task=OBS-002 --run`.

In the rapid prototyping phase we intentionally retired the accumulated broad test suite. Current CI performs a roadmap check, typecheck and four small numeric tests (roadmap, arbitrary-ink geometry, seed-cohort determinism and reference scoring). Full web export belongs to the publishing workflow rather than being duplicated in verification; iOS export remains a manual command. All retired checks remain in Git history but do not run on each change.
