# Active repository map and cleanup baseline

Updated October 25, 2026. The live program is **Infipet life-v10**, a playable prototype. Its central promise is a Tamagotchi-style pet **drawn freely by the player** and developed through source-relative procedural growth, seed variation and care. Familiar retro lifecycles are useful rigorous tests, not pre-authored outcome templates. Current experiments have **not demonstrated** the required variety or whole-life accuracy.

## Active code and dependencies

| Path | Role | Keep? |
| --- | --- | --- |
| `App.tsx`, `index.ts`, `src/components/` | Interactive app, shared drawing canvas, live pet and preview | Yes |
| `src/simulation/` | Deterministic source-relative morphology, surface/somatic expression and animation | Yes |
| `src/gameplay/`, `src/needs/`, `src/lineage/` | Care, time, health, games, development context | Yes |
| `src/storage.ts`, `src/pet-format.ts` | Current-revision pet saves and portability | Yes |
| `src/phylogeny/`, `data/phylogeny/` | Small runtime ancestry catalog and scientific upstream evidence | Yes, with caveat below |
| `tests/`, `tools/`, `package.json`, `pnpm-lock.yaml` | Tests, auditing, builders, dependency lock | Yes |
| `docs/GOAL.md`, `docs/VERIFICATION.md`, `docs/audits/**/*.md` | Current objective and version-specific evidence | Yes |
| Older generated `docs/audits/**` images, frame captures, metrics, HTML and compressed traces | Historical output, not active imports | Archived |

This map is based on code inspection and tracked paths, not on executing the app. Keep the functional module boundaries intact; do not treat a large historical path count as duplicate running implementations.

## Recoverable cleanup

Archive branch: [`archive/pre-cleanup-2026-10-25`](https://github.com/natanai/infipet/tree/archive/pre-cleanup-2026-10-25). Cleanup branch: [`cleanup/active-engine-2026-10-25`](https://github.com/natanai/infipet/tree/cleanup/active-engine-2026-10-25).

The original tree had 51,949 tracked files (~1,362 MB by blob size), including 51,082 files in `docs/audits/` (~1,255 MB). The cleaned tree has **1,077 tracked files (~119 MB)**, including 207 retained audit files (~11 MB), including five frozen household-source fixtures. All 71 application source files, 50 test files and 90 tool files survive unchanged in the first pruning commit. All life-v8, life-v9 and life-v10 audit files are kept, as are all historical Markdown reports.

The initial history and archive branch still reference the removed output. This cleanup reduces current working-tree contents, **not the size of Git history or historical clones**. Do **not** force-push, delete the archive branch, prune Git objects, or rewrite history without a separate recovery and synchronization plan. Old report links may point to artifacts only on the archive branch.

## Raw phylogeny caveat

`data/phylogeny/nodes.jsonl` (more than 560 MB) was excluded before the first successful GitHub push. It is not in the archive branch or active clone. The application imports only `src/phylogeny/catalog-data.json` and does not require that raw file for normal gameplay. Some **offline full-dataset validators and lookup tools require** `nodes.jsonl` and/or the upstream cache and cannot run on a fresh clone until those data have been rebuilt using `tools/phylogeny/fetch.ps1` and `pnpm phylogeny:build`. Do not claim full raw dataset verification from tests that use only the compact catalog.

## Verification and acceptance gates

The GitHub workflow `.github/workflows/verify.yml` is intended to run:
1. Repository size/structure guard (`node tools/repo-hygiene.mjs --check`).
2. Typecheck (`pnpm typecheck`).
3. Existing automated regression tests (`pnpm test`).
4. Web and iOS JavaScript exports (`pnpm build:web`, `pnpm build:ios`).

A passing export is not a signed or physical iPhone test. These checks are **necessary but not sufficient** for the central growth goal. Before describing growth as convincing, visually review full trajectories across unusual, sparse, hollow, fragmented, asymmetrical and feature-only drawings, with fixed seeds and contrasted care histories. Preserve failures, cite engine/revision and compare against the exact same input recipes. Do not reuse life-v9 verification as life-v10 evidence.

## Local Windows synchronization

The GitHub repository does not delete, reorganize or free space inside `C:\Games\infipet` by itself. Keep the local project and `data/phylogeny/nodes.jsonl` until the cleanup has passed validation and you have checked that a clean checkout runs. To inspect this proposal: `git fetch origin`, then `git diff --stat origin/main..origin/cleanup/active-engine-2026-10-25`. Switching branches will remove old tracked audit files from the local working tree, so back up any uncommitted changes and locally valuable generated output beforehand.

There is no automatic old-format pet migration; revision-scoped prototype saves remain disposable per `AGENTS.md`.
