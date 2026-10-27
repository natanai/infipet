# Infipet

**Single-pet lifecycle:** Each creation yields one continuously identifiable creature. Its original drawing, once-assigned hidden seed and permanent developmental potential interact with care and chronological time to produce dramatic transformations of that *same* pet. The tree of life is a biological possibility map for these evolution-like stages, not a breeding system or a claim of literal species change. Infipet has no reproduction, offspring, parent-child inheritance or multi-generational gameplay.

Draw **anything** on the 32 × 32 pixel canvas, begin its life, and care for your own evolving virtual pet. This is an experimental Tamagotchi-style game: feeding, cleaning, sleeping, illness, games, training, battles, aging, and persistent saves are implemented. Convincing natural growth from arbitrary drawings is still being developed.

**Play:** https://natanai.github.io/infipet/ (published by GitHub Actions)

## Anatomical development: one check every 24 real hours (approved target)

**The canonical product contract is [`roadmap/plan.json`](roadmap/plan.json), field `anatomicalDevelopment`. This specification is approved but its implementation is still in progress. The live application and existing historical tests may still exercise the previous hourly implementation until the daily migration tasks pass and merge.**

- One physical-development opportunity occurs at each elapsed **24-hour anniversary of the saved hatch/birth timestamp**, not at midnight: check `k` is at `hatchAtMs + k × 86,400,000`, for `k = 1…365`. Egg incubation does not consume a growth check. The first possible physical change is after 24 hours.
- **No physical anatomy may change between checks.** Every check uses the prior material graph, unchanged original drawing and permanent genome, seeded chaos, mechanically valid operators, and *actually recorded* care in the immediately preceding half-open 24-hour window. A check can legitimately produce no physical change.
- After **check 365**, physical anatomy is permanently mature; no new cells, branches, resorption, physical relocation or attachment changes. Care, physiology, animation, movement, sleeping, play, health, and non-anatomical appearance remain active.
- Returning after time away replays every due day in chronological order, without inventing care actions while the app was closed or allowing a future intervention to rewrite the past. Reloads and developer previews do not award extra checks.
- A **30-day forced lifespan is incompatible** with 365 possible checks. The existing `GAME_RULES.lifespanMs = 30 × DAY` is a *legacy implementation limit to remove*; natural/care-driven death can still end an individual's opportunities early, but a healthy pet must be capable of living at least 365 elapsed days and beyond anatomical maturity.
- Saved elapsed time uses 24-hour durations rather than local calendar days (so daylight-saving transitions do not create extra or missing checks). The birth clock, history, and physical states must be exactly replayable. An offline-only clock cannot guarantee anti-cheat security without an external trusted time source.

**Old 512-, 720-, and 8,192-hour continuous-growth benchmarks are historical evidence only, not the new design requirement.** The old hourly source algorithms and retro checkpoints at 1/49/121 hours must be migrated or explicitly treated as historical research, not asserted as expected daily anatomical changes. The roadmap tracks independent DEV-007, CARE-004 and GAME-002 work followed by integrated cutover and new qualification. It is incorrect to claim the 365-check model is already live.

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

**More** groups export/import/name and About. The small square at the top right toggles Development Tools, matching pre-programmed's author mode. When checked, every developer control lives in one independently scrolling left dock: seed controls, timeline, preview actions, care experiments/diagnostics, the experimental iOS widget, and exactly 12 fixed-seed editable presets. The dock uses a full-height overlay on narrow screens, with the corner toggle always available. Unchecking it hides all experiments and returns to the same saved pet, or the drawing pad if no pet has begun. Reloads start with developer tools off. Presets load drafts only; they do not define species or future stages.

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

For a historically faithful evolution route to be **proven**, the same initial drawing and seed **plus the same chronological care history** must reproduce all milestones with demonstrated shape similarity, without importing any reference target into the growth engine. The **historical, pre-daily-migration** independent [P1 benchmark](tests/retro-reference-score.test.ts) measures the actual generated sprite silhouettes against an original-ROM-derived route and prints scores; it is a diagnostic, **not a successful parity test**. The care vector presently exercised by that test is hypothetical rather than an authenticated hardware command trace. The original game's exact evolution paths have **not** been reproduced or verified; the reference seeds are not calibrated matches.

The currently bundled OpenTree lineage is **animal-only**, and the live simulation already responds to care and training using general biological priors. Provenance-backed plant ancestry, robust shape classification across all kingdoms, denser hereditary variation, and original-device care-gate parity remain substantial engine-development work. Reference sprites must remain independent evaluation fixtures, never a renderer lookup table.

## Current algorithm development plan

The **only active roadmap** is [roadmap/plan.json](roadmap/plan.json). It stores task dependencies, acceptance assertions, verification commands and independent algorithm owner scopes. List work with `node scripts/roadmap.mjs --list`, inspect one task with `--task=OBS-002`, run its dedicated test once implemented with `--task=OBS-002 --run`.

CI validates the canonical roadmap and TypeScript types and runs the registered focused numeric/regression tests for completed tasks. Web export and browser/player-flow qualification run in their corresponding workflows; see `.github/workflows/`. Historical hourly chronology and long-horizon performance test outcomes remain valid **as evidence about the prior implementation**, not acceptance criteria for the new daily anatomy contract. Do not claim a prior passing test proves daily checks until its oracle has been updated.
