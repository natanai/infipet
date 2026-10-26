# Source-driven evolution audit (life v7)

This runner does not modify or reinterpret prior archives. Current protocol: `source-development-v7-audit3`; metric/rubric version: `source-coherence-v7-metrics3`. V6 and audits1/2 are incomparable unless both runs are recomputed under matching definitions. Audit2's mandatory functional/enclosure change each interval was too restrictive; audit3 instead requires core organization plus a SECOND independent anatomical change. No numerical morphology result fills a visual score, and no historical run is rescored merely to obtain a pass.

For fast iteration before a source freeze, use the **disposable** preview (only after the engine author says ready):

```powershell
pnpm exec tsx tools/source-audit/preview.ts --name latest --source canine-cub
```

This overwrites `docs/audits/life-v7/previews/latest/` with sixteen actual endpoint images from the first four published raw seeds, matching core/region masks and a small HTML page. It is not a frozen audit, independent review or acceptance. Historical human failures remain explicit. Do not start large audits because a disposable preview looks promising.

From the project root:

```powershell
pnpm exec tsx tools/source-audit/run.ts --stage proof --run v7-audit3-proof-001
pnpm exec tsx tools/source-audit/run.ts --stage proof --probes source --run v7-audit3-source-001
pnpm exec tsx tools/source-audit/run.ts --stage proof --probes care --run v7-audit3-care-001
pnpm exec tsx tools/source-audit/run.ts --stage proof --probes all --care-seeds 4 --run v7-audit3-care-four-001
```

The default proof still has exactly16 milestones,60 intermediates and128 motion poses: **204 primary images**. Sixteen white core diagnostic images and sixteen colored regional mask variants are derived from those same endpoints and counted separately, never as independent genomes/conditions. White core occupancy uses actual body/head/enclosure pixels with appendages, ornaments and facial marks removed; no hull filling or smoothing. Regional masks show head blue, trunk white, enclosure purple and head/trunk overlap yellow. Their normalized projected occupancy is not physical mass and overlapping shares need not sum to1. The source drawing and source masks are shown alongside each lifecycle.

`--probes source` adds 48 separately counted images: four geometry interventions and two irrelevant-input controls, two seeds, four ages. Geometry interventions are body ratio, bend, tail length and eye spacing. Palette and source array order must not reroll inherited anatomy. Counterfactual pixel area is measured; nearest-pixel transformation does not claim exact material-area conservation.

`--probes care` adds 520 separately counted images: two seeds × four onset days (0, 7, 90, 150) × (six needs × two fulfillment levels + one matched neutral control) × five offsets (0, .25, 1, 7, 14 days). Need values are 0% or 100%; unchanged needs remain 75%. At onset, continuous development should have zero instantaneous response even though the current raw fulfillment has changed. Mediators, commitments, ancestry and rendered comparisons are retained; no meaningful visual effect is claimed before inspection.

`--care-seeds 4` uses the first four published raw seeds for that same focused panel: **208 care cases / 1,040 care views**. The default remains two seeds / 104 care cases / 520 views. The primary proof stays204 images and source counterfactuals stay48; `--probes all --care-seeds 4` therefore schedules224 total cases / 1,292 primary-and-probe images. This changes cohort size, not metric definitions. New manifests explicitly record `careSeedCount`, exact seed strings, all cases, and expected counts. Resume requires the same option and frozen hashes.

`--prepare` only freezes the plan; it does not evaluate the engine. Use a disposable preparation run name while engine/tool files are still changing. Normal capture rejects a public program version other than 7. `--stage three` uses Cub, Bean, Wisp across four seeds; 612 primary images. `--stage full` uses the six current starter sources, sixteen raw seeds, four histories, four ages; 1,536 endpoints. Expanded collection is a deliberate later action after the proof's independent visual gates, never an automatic continuation of a proof command.

## Resume, report and comparison

Repeat the exact command to resume per-case compressed checkpoints. Manifest/tool/engine hashes must match; choose a new run name after source changes. Failures are retained with planned IDs and partial view counts, never silently replaced by prettier seeds. Memory retains one case's pixel arrays; the population holds descriptors and diagnostics. Contact sheets are paged in batches of 64. End-of-capture source verification detects concurrent changes and marks the candidate invalid rather than claiming a frozen final capture.

```powershell
pnpm exec tsx tools/source-audit/run.ts --run v7-proof-001 --report-only
pnpm exec tsx tools/source-audit/run.ts --run v7-proof-002 --report-only --compare v7-proof-001
pnpm exec tsx tools/source-audit/run.ts --index-only
pnpm exec tsx --test tools/source-audit/*.test.ts
```

Report-only never replays simulation. It reads frozen compressed cases and rejects changed metric source. It does not persist images/diagnostics, regenerate source drawings or atlases, rewrite view-index/review/template files, or update capture checkpoints/verification. Existing image assets and their view index must be present; a missing case produces an error rather than a new evaluation. Only derived reports, metrics, coverage/accounting, gallery HTML and audit index are refreshed. Comparisons require identical protocol/metric versions, sources, seeds, conditions, ages and case plans. Visual percentage-point claims additionally require exact complete primary comparison/reviewer sets; matching partial panels or duplicated comparisons cannot qualify.

Progress metadata can be reconciled separately with `repair-checkpoint.ts --run <run> --expect-sha <current-checkpoint-sha256>`. This explicitly validates all planned compressed case files, plan identities, successful-case view counts, unique IDs, rendered pixel hashes and verified unchanged capture provenance. It writes a separate receipt with before/after hashes/counts and protected file hashes, then changes only `checkpoint.json`. It performs no engine evaluation and does not change frozen case, image, manifest or review evidence. Stale checkpoint SHA or changed inputs abort the repair.

## Actual-image review

Open `index.html` or inspect actual PNG/SVG contact sheets at sufficient detail. Judge blind labels first, reveal seed/history for diagnosis. Source/lifecycle, source-counterfactual, matched care/control, explicit poses and held-phase loops are available offline. Detailed per-frame JSON is under `diagnostics/`. The JSON compressed case includes raw pixels, complete genome/program and wellbeing state.

`visual-reviews.json` starts with only unreviewed/null-score records. `review-template.json` preserves expected comparison IDs and required image IDs. A reviewer copies the relevant record, assigns their identity/kind (`agent` or `human`) and role (`primary` or `secondary`), records actual `inspectedViewIds` and their pixel hashes from diagnostics, then assigns the applicable 0–3 scores. A second reviewer adds separate records with the same comparison ID and their own identity. Never overwrite another reviewer's records. Review coverage counts exact distinct images and comparisons. It does not count source authorship, assertions about metadata, or uninspected images as visual review.

Use the append-only receipt command instead of replacing the review file. Receipts contain a `records` array of reviewed records (or are that array). Obtain the current SHA with `Get-FileHash`; first use `--dry-run`, then repeat without it:

```powershell
pnpm exec tsx tools/source-audit/merge-reviews.ts --run <run> --expect-sha <current-sha256> --receipt primary-root-review.json --receipt secondary-audit-agent.json --dry-run
```

The command verifies frozen comparison/image hashes, retains every original template and prior review, and rejects duplicate reviewer/comparison pairs, conflicting primary records, or a stale review-file SHA. An exclusive lock and a second pre-commit SHA check protect the append. `review-merge-log.jsonl` retains receipt hashes, before/after hashes and preservation counts. Original receipts remain untouched. Regenerate the report afterward with the matching frozen metric sources; report formatting may normalize JSON whitespace but retains all appended records.

Transition scores are independent: evolution, descent, continuity and feature coherence. Both reviewers must inspect actual full images AND the endpoint core/regional masks. Evolution≥2 requires a visible core-organization change plus a second independent anatomical change: regional occupied-area distribution, head/trunk organization, topology, function, or enclosure. New limbs/functions are optional, not a per-stage quota. `changeInventory` records actual evidence, region names and independence; normalized occupancy claims must match the captured mask statistics. Rewording the same curve/scale change twice does not qualify. Scaling, long appendages, rotation or posture alone score≤1.

Disconnected islands, unusable hair-thin joins/supports and an unreadable protected face fail coherence even if silhouette distance is high. A cocoon disk alone is a lifecycle event: inspect underlying and emerged material organization. Metadata labels are not proof. Records need the current `protocolVersion`, exact required full/core/regional image IDs and hashes. Core and regional inspected-coverage counts remain separate from primary204 coverage. No previous12/12 metadata passes the new criteria automatically.

The global `human-feedback.json` is automatically ingested by report, gallery, acceptance JSON and index generation. Old rejected runs remain failed. Later candidates remain **human-benchmark-pending**, not automatically human accepted. Verbal feedback never creates frame-level human scores or coverage.

Source comparisons require descent/coherence scores; focused care comparisons require causal-care/coherence scores; motion records require continuity/coherence and all eight actual phases. Nonapplicable scores remain null. Missing image hashes and duplicate primaries are rejected.

The full endpoint-only panel can assess form/identity continuity between milestones; it cannot prove tween or gait continuity. Ordinary lineage tracking and contributor/ownership counts remain automated alerts, not visual feature-integrity scores. The four-history full panel includes severe Safety and is not a moderate-care genetic-dominance estimate. Population bootstrap intervals and broad uniqueness claims require a later adequately sampled protocol. No physical-iPhone, signed-widget or human-review claim is made by this runner.

## Separate sheltered branch coverage

`lifecycle-proof.ts --run <new-name>` scans the published16 genotypes before any frame rendering and selects the first explicit `lifeProgram.kind=sheltered`. The four raw primary seeds remain unchanged. It records eleven actual ages0/12/18/24/30/36/45/60/70/75/120, separately counted core/no-hood mask variants and non-sheltered structural checks. This is white-box branch coverage, explicitly excluded from population/diversity summaries. Face visibility and emerged form require actual inspection; no visual score is generated automatically. Run only after an explicit stable-engine signal.

## Separate moderate-care variance panel

```powershell
pnpm exec tsx tools/source-audit/variance.ts --run v7-variance-001
```

This machine-only command has a separate manifest, checkpoints and report under `docs/audits/life-v7/variance/<run>/`. It evaluates six sources × four fixed raw seeds × sixteen unique histories × days75/120: 384 cases and 768 structural frames. The **moderate** panel contains neutral75% plus each of six needs individually50% and100% (13 histories, 624 observations). The **severe** panel contains the four published neutral/Safety0/Safety-recovery/Rest-Fitness100 histories (192 observations). Its48 neutral frames are shared with the moderate panel and counted only once in unique-frame accounting.

Variance is decomposed within source/age, then component fractions are equally weighted across sources; species differences cannot inflate seed effects. Raw SS and SS/total fractions are retained. Report both whether seed is the largest individual component and whether it exceeds history+interaction combined. Incomplete balanced grids receive no dominance classification; a constant/zero-variance panel cannot pass. Four seeds remain exploratory: no population confidence or perceived-uniqueness claim follows. This script renders no PNGs and grants no visual gate. Do not launch it as an automatic expansion of the default proof.

## Expanded independent review schedule

```powershell
pnpm exec tsx tools/source-audit/review-panel.ts --run v7-baseline
```

This reads already captured full-cohort images; it never evaluates the engine. It exports six secondary PNG/SVG contact sheets, exact pixel-hash mappings, and null-score templates under `secondary/`. The fixed seed slots1/5/9/13 across all sources, four histories and four ages schedule384/1536 endpoint images (25%) and288 adjacent-stage comparisons. It also creates `primary-review-schedule.json` linking all24 primary sheets. These are **planned coverage**, not completed review. Missing or duplicate selected conditions cause an error instead of inflating coverage. Actual reviewer identities, image inspections, source-author familiarity and independent scores must still be recorded and merged.
