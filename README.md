# Infipet / life-v10

> **Repository status:** This is a playable prototype, not a validated solution to arbitrary-drawing growth. Active source, tests, tools, and recent v8–v10 evidence are preserved; older bulk experiment outputs are available on the [pre-cleanup archive branch](https://github.com/natanai/infipet/tree/archive/pre-cleanup-2026-10-25). See [repository maintenance](docs/REPO-MAINTENANCE.md).

The [official goal](docs/GOAL.md) is **in progress**. No complete near-exact retro lifecycle has been demonstrated. New shared surface/somatic growth and full-life verification are under development; published life-v9 results are historical, not scores for this engine. Current work is recorded under [life-v10](docs/audits/life-v10/).

Draw an infant or an egg, begin its life, and care for a real-time pocket companion. Infipet combines classic care, training, guessing games and CPU battles with the existing procedural anatomical renderer. Animal-affinity routes follow a pinned scientific phylogeny; developmental effects remain fictional game rules.

This is a **playable combined prototype**, not a verified complete hardware replica. Exact vintage timings, combat and several hidden rules remain provisional. The [reference ledger](docs/reference-parity.md) distinguishes evidence, implementation and adaptations. Earlier visual audits remain [historical](docs/audits/life-v7/INDEX.md).

## Run

Dependencies are installed. On Windows, run `./Start-Infipet.ps1`, then open [localhost:8081](http://localhost:8081). If the server listens only on IPv6, use [IPv6 loopback](http://[::1]:8081). `pnpm web` starts the browser preview; `pnpm start` serves Expo Go. For iPhone, use `./Start-Infipet.ps1 -Mode iphone` and a compatible Expo Go installation. See [iOS setup](docs/IOS.md).

## Play

Choose a starter or draw on the shared 32 × 32 canvas. Anatomy labels are optional brush hints. Paint, erase, mirror, colors and undo/redo remain. **Begin life** commits the drawing and seed. Creation is untimed.

Live supplies meals, protein, snacks, cleaning, medicine, lights and discipline. Food, happiness and strength have separate four-heart meters. Status shows weight, energy, care misses, training, battles and animal affinity. Care works for every drawing, regardless of anatomical labels.

Complete five-round direction guessing, chained higher/lower numbers, and high/low training. Training counts on entry, including cancellation; other unfinished games earn no reward. CPU battles unlock at juvenile. Battle results commit before presentation and survive reopening.

One physiology scheduler combines V1-style hunger, strength, weight, sleep and stages with Tamagotchi-style happiness, hygiene, discipline and games. Overlapping care requests share a missed-care episode. False calls may need discipline; unnecessary discipline upsets the pet. Medicine may require several doses. Sleep follows the clock offset captured at birth. Ordinary animation does not supply care.

The provisional schedule is a five-minute egg, with later boundaries at 1, 49, 121 and 193 hours after hatching: hatchling, infant, juvenile, adult, and advanced when earned. The prototype has a declared 30-day lifespan. These are explicitly documented Infipet values, not verified original-device calibration.

Age and neglect continue while closed. Offline lethal conditions provide **30 cumulative foreground minutes** for recovery. Reopening cannot replenish an unresolved episode. Old age provides goodbye time instead. Active neglect can cause death without return grace. Death returns to creation; no drawing or seed is automatically inherited.

## Lab and development

Draw, the growth timeline, seed experiments and Needs Lab edit an independent preview recipe. The living pet continues while those views are open. Its drawing and seed remain fixed. **Begin new life from drawing** explicitly replaces it.

Lab seed changes retain care history and playhead. Source edits reset the preview to birth while retaining history. Future need events survive past edits and scrubbing. Grooming remains available in Live and the Lab, with independent histories.

The renderer retains source material, protected faces, floating details, gait controls and seeded variation. Continuous growth remains visible between gameplay milestones. Stage summaries record care/training/battle metrics. Seeded animal routes follow actual descendant relationships and bias subsequent anatomical development.

The versioned `morphogenesis-v1` grammar adds source-rooted feet, hands, tails, terminal outgrowths, conservative body families and bounded facial growth. These are ordinary seed-driven operators for every drawing; reference character identities never enter the renderer.

Chronological care hours, anatomical maturation and explicit animation time are separate. Mapping game stages into renderer coordinates does not stretch six-hour fulfillment averages, seven-day memory or grooming timestamps. The versioned source, mode, seed, care/game recipe, age and explicit animation time reproduce results. Rendering consumes no mutable randomness; inherited genetics remain independent of care.

The AllNeeds snapshot retains 67 needs, 48 feelings, 56 faux-feeling interpretations and 540 canonical edges. Six needs have regional appearance effects. Live derives their hourly fulfillment from gameplay; manual Lab events stay independent. See the [pinned catalog](https://github.com/natanai/allneeds/tree/0c5b73e19f6963a0d38332aafbdfb72149fb0ce5).

## Retro drawings and lifecycle tests

Creation's **Retro reference drawings** opens an editable source library for the original Digital Monster V1 and English Tamagotchi P1/P2 roster. Each source is ordinary ink on the same canvas. Later-stage drawings can start a new life; they cannot stand in for a baby-to-adult result.

**More → Lifecycle litmus** compares entire reference paths against one starting baby, one shared neutral seed and concrete recorded care commands. Every displayed generated frame is replayed through the normal gameplay and rendering engines and checked against the measured capture. The weakest stage controls the result. Original timing and care evidence, gameplay eligibility and visual similarity remain separate.

The current corpus contains **36 reference forms and 25 root-to-last-listed paths**. Source provenance and edition confidence are explicit. No whole-path near-exact match has been demonstrated: filled babies becoming outlined adults already expose a missing surface-expression capability. The test records failures so future shared operators can be judged against the same evidence. See [the benchmark contract](docs/retro-benchmarks.md), [reference sources](docs/retro-reference-sources.md) and [measured runs](docs/audits/life-v9/retro/REPORT.md).

```powershell
pnpm retro:presets
pnpm retro:audit --seed-count 4 --policies all --out docs/audits/life-v9/retro/latest
pnpm retro:verify --out docs/audits/life-v9/retro/latest
```

## Animal data

[Dataset documentation](docs/phylogeny.md) and the [manifest](data/phylogeny/manifest.json) describe the complete represented Metazoa subtree from `opentree16.1`, OTT `3.7.3` (`3.7draft3` in embedded metadata): **1,717,413 nodes, 1,490,245 tips and 1,717,412 edges**.

Raw files preserve subtree Newick, upstream support/conflict annotations, `nodes.jsonl` and `edges.tsv`. Every raw node also identifies its nearest supported fictional game profile. The manifest pins source URLs, versions, extraction rules, counts and SHA-256 hashes. Missing species, polytomies, taxonomy-only relationships and conflicts remain explicit. No ancestral DNA, mutation rates or divergence dates are invented.

The mobile runtime imports only 57 ancestry nodes and 19 supported profiles. Arbitrary raw taxa resolve through the offline lookup tool. Crocodylia has no exact usable anchor in this synthesis; its broad MRCA includes other groups, so the game falls back to Tetrapoda. Initial drawing placement is deliberately broad (Metazoa/Bilateria). These affinities guide game development, not scientific identification or complete reconstructions of each species. See the [90-frame audit and limitations](docs/audits/life-v8/lineage-render-audit.md).

```powershell
powershell -File tools/phylogeny/fetch.ps1
pnpm phylogeny:build
pnpm phylogeny:validate
node node_modules/tsx/dist/cli.mjs tools/phylogeny/lookup.ts ott35864
```

Bulk derived data is approximately 671 MB (640 MiB) and stays outside the app bundle. Upstream download caches are ignored and disposable.

## Saves

Revision **life-v10** uses portable schema **8**, procedural engine **7**, grammar **morphogenesis-v1**, **surface-expression-v1**, **somatic-growth-v1**, gameplay rules **3**, needs rules **2**, and pinned lineage/catalog versions. Revision changes clear only `infipet.*`. Ordinary reloads retain the drawing and living pet. There are no migrations, backups or old-format support.

One validated snapshot contains the editable recipe and optional committed live source, game state, complete lifetime command history, activity results, stage summaries, care samples, clock and grace budget. Receipts do not expire. Random outcomes use persisted semantic event counters, never caller-supplied command IDs. Writes are serialized; care saves immediately, foreground progress checkpoints every five seconds, and background transitions save. Failed saves retain in-memory results and retry. Sharing/import includes both recipes and replaces the active snapshot. Pet files are limited to 16 MB to retain full command histories.

## Verify

```powershell
pnpm typecheck
pnpm test
pnpm phylogeny:validate
pnpm build:web
pnpm build:ios
```

See [verification](docs/VERIFICATION.md) for actual results and Node equivalents. Exports establish JavaScript bundling. Signed iOS, physical iPhone performance and WidgetKit scheduling require separate tests; widgets display precomputed snapshots.

Terminal typography follows [pre-programmed.art](https://pre-programmed.art/). DOS font by VileR, CC BY-SA 4.0: [credits](assets/fonts/FONT-LICENSE.md), [design references](docs/REFERENCE.md).
