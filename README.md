# Infipet

Draw anything on the 32 × 32 canvas, begin its life, and return to the same pet. Feeding, cleaning, medicine, sleep, discipline, games, training and battles affect its physiology immediately. Permanent anatomical development uses the drawing's physical material, fixed genetic potential, hidden seed, bounded nonlinear dynamics and actual chronological care.

**Play:** https://natanai.github.io/infipet/

Each life is one continuously identifiable organism. The scientific tree of life supplies reference constraints and possibilities; it does not assign a species to an arbitrary drawing or imply that an individual changes ancestry. There is no breeding, reproduction or population evolution. Reference sprites never enter runtime development or rendering.

## The daily anatomical clock

The canonical contract is [roadmap/plan.json](roadmap/plan.json), especially `anatomicalDevelopment`. The production `createSimulation` / `frameAt` path uses the daily material engine.

- Check `k` occurs at the saved `hatchAtMs + k × 86,400,000`, for integer `k = 1…365`. Check 0 is the actual original drawing. Incubation precedes the hatch anchor. These are elapsed durations, independent of midnight, time zone and DST.
- The authoritative graph is identical between checks. Animation, functional locomotion, expression and physiology can change continuously; their renderer cannot create anatomical cells or attachments.
- A check consumes actual recorded evidence on `[T(k−1), T(k))`. An event exactly at the endpoint belongs to the next window. Unknown data remains unknown, rejected commands remain rejected, and a receipt alone does not prove a physiological effect. Null development is legitimate.
- Missed checks run in chronological order. Cached and persisted states are bound to the exact source, genome and consumed history; invalid or incompatible caches reconstruct safely. At most four checkpoints plus the latest state are retained per timeline, and the shared living cache retains at most three timelines.
- After check 365, anatomy is permanently mature. The same graph is reused indefinitely. There is no artificial 30-day or 365-day death deadline; genuine untreated physiological conditions can still cause death.

The pure API and governing equations are documented in [daily-step.ts](src/development/daily-step.ts). Shared geometric primitives use dimensionless opportunity ticks inside that transaction; one tick is one daily opportunity, never 24 hidden hourly growth steps. Every creation, removal and relocation is committed with its check index and absolute timestamp. Creation archives permit independent identity-set reconstruction even after a descendant has been removed.

[daily-care.ts](src/environment/daily-care.ts) integrates actual post-event observations by zero-order hold over exact integer-millisecond durations. Observations are recorded at physiological timer boundaries, actual commands and presence transitions, rather than arbitrary render cutoffs. One-second updates and batched updates therefore produce identical evidence. Hourly compatibility samples remain available for physiological diagnostics; they do not schedule anatomy. Detailed developmental observations stop at maturity.

Absolute birth/event timestamps persist. Invalid times, backward chronology, duplicate opportunities and future evidence are rejected. Offline device time is deterministic but cannot provide server-authoritative protection against deliberate clock manipulation.

## Saves and earlier lives

Normal play saves automatically. **More → Export → Save pet file** provides a portable JSON copy; **More → Import → Open pet file** opens it without pasting a large history into a text field. Small saves use AsyncStorage. Large web saves use a single atomically replaced IndexedDB payload with a small storage pointer. Offline shell caching contains no pet data.

Earlier lives cannot have exact material continuity reconstructed from the former contour renderer. Their original document and timestamps remain unchanged and read-only. Before opening one, storage preserves its exact bytes under a content-addressed recovery key; **Download original saved pet** exposes that copy. The existing explicit **Begin life** replacement action starts a new daily life from the drawing with a new real birth timestamp and empty history. No historical daily checks or player care are fabricated. Unreadable saved files are also backed up before a load error; failure to preserve a backup prevents replacement. Optional malformed anatomical checkpoints do not invalidate the underlying saved life.

Web refresh and mounted-tab return process missed checks in short work slices before committing the completed state. Interrupted catch-up leaves the previous complete save usable. Export before clearing browser site data; clearing it removes both the local life and cached application shell.

## Player interface

Fresh sessions open an empty drawing pad with 15 one-tap part brushes, pencil, eraser, color, undo, redo, mirror and clear. **Begin life** commits the drawing; **Pet** returns to it. Replacing a living pet, including import, uses the existing confirmation.

The small top-right square toggles Development Tools. All experiments remain in one independently scrolling left dock: seeds, timeline, care previews, diagnostics, widget experiments and 12 editable presets. On narrow screens the dock overlays the player area; the toggle stays available. Brushing can pose existing source-derived hair through the bounded relaxation model; it cannot lengthen hair or change material inventory between checks. Developer previews have independent synthetic care and never alter the saved life. Reloads start with tools off. Presets are drafts, not species templates.

## Development and verification

Requires Node.js 22+ and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm web
pnpm typecheck
pnpm test
pnpm build:web
```

Open http://localhost:8081 or use `./Start-Infipet.ps1` on Windows. GitHub Pages builds and browser tests both use `INFIPET_BASE_URL=/infipet`. Publishing follows successful verification of the same main commit and qualifies the exported player flows before deployment.

The only roadmap is [roadmap/plan.json](roadmap/plan.json). Inspect a task with `node scripts/roadmap.mjs --task=INT-002`; run its focused test with `--run`. Completed tasks automatically register their acceptance tests. The performance test runs separately after functional tests to avoid worker contention.

```sh
INFIPET_BASE_URL=/infipet pnpm build:web
pnpm exec playwright install chromium
INFIPET_BASE_URL=/infipet pnpm test:ui
node --expose-gc --import tsx scripts/daily-benchmark.ts
INFIPET_BASE_URL=/infipet node scripts/benchmark-browser-runtime.mjs
```

Independent acceptance covers exact cell identities, archived creations/removals, physical parents and source ancestry, attachments, protected voids, daily timestamps, care causality, numerical reference metrics, rendered ownership and fresh/cached replay equality. Negative cases falsify early, duplicate, fabricated and postmaturity checks, invalid boundary timestamps, future care, false ancestry, missing ownership and cache divergence. A correct-looking silhouette is insufficient. Cohorts include single pixels, disconnected marks, holes, thin/asymmetric structures, dense 1024-cell drawings, plant-like and speculative forms. Screenshots are interface evidence only.

## Performance contract

The measured reference environment is Linux x64 Node 22+; headless Chromium browser measurements are separately labeled. Native-phone hardware has **not** been measured. The gates below apply to isolated Node runs, not to a phone performance claim.

| Scenario | Reference budget |
| --- | ---: |
| Ordinary one-second update, including same-day accepted/rejected care, p95 | 33.33 ms |
| First daily boundary | 150 ms |
| Full cold reconstruction of all 365 opportunities | 8,000 ms |
| Valid saved mature checkpoint reopening | 1,500 ms |
| Serialized checkpoint state | 8 MiB |
| Isolated process RSS safety ceiling | 768 MiB |

The cohort includes sparse, unusual, solid 32 × 32 and 15-brush maximum-complexity drawings, with an actual cared-for 366-day history. Tests measure birth, the first boundary, seven-day/months-long returns, days 364/365/366, full replay, corrupted-cache recovery and memory. Each warm result is compared with a separately reconstructed cold physical state. Ordinary frames execute zero physical checks; mature saved reopening executes zero historical checks. Browser qualification measures actual saved-life reopening, event-loop frame gaps, long tasks and care interaction in the exported app. CPU throttling and narrow viewports are emulations, not real-device results.

The previous hourly/8,192-hour performance contract has been retired. Old profiler entry points forward to the daily benchmark; useful low-level numeric tests are explicitly labeled legacy primitive coverage. They do not authorize fractional/hourly anatomical transactions in play.

## Scientific references and limits

Provenance-backed animal, plant and fungal reference possibilities are bundled; drawing affinities remain uncertain heuristics, not established ancestry. The 36 historical retro drawings and candidate seeds are independent research fixtures. Historical 1/49/121-hour trajectories remain research references, not proof of the daily anatomical clock. Original-device sprite parity and authenticated hardware care traces have not been established. Witness evaluation distinguishes structural execution, numerical comparison failure, honest constrained null effects and unresolved evidence.

Large generated reports, datasets and screenshots are excluded from main. Prior implementation evidence remains in git history and the [pre-minimal archive](https://github.com/natanai/infipet/tree/archive/pre-minimal-2026-10-25).
