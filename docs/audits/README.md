# Reproducible pet audits

The current engine is **life-v6**. Start with [its report](life-v6/REPORT.md), [run index](life-v6/INDEX.md), and [runner instructions](life-v6/README.md). `pnpm audit:evolution` collects only the small proof by default. Larger stages require an explicit flag.

The household-v1 material below is a **provisional historical archive**. Its collection CLI is disabled in v6; stored-data inspection remains available. Do not resume its stopped analysis or treat its draft percentages as final. New v6 metric definitions are incomparable with v1 unless both cohorts are recomputed.

Open [the baseline report](household-v1/REPORT.md) or [the gallery](household-v1/index.html). The report distinguishes every generated/checkable frame from the smaller visually inspected sample. No human review is inferred from an agent receipt.

## Historical commands (algorithm 5)

```powershell
pnpm audit:pets:prepare -- --run household-v1
pnpm audit:pets -- --run household-v1
```

Without pnpm, use `node node_modules/tsx/dist/cli.mjs tools/audit/run.ts` with the same flags. Individual stages are `--prepare`, `--collect`, `--supplemental`, `--analyze`, `--sheets`, `--verify`, and `--present`. Completed primary batches, supplemental per-preset receipts, and unchanged analysis batches resume automatically. A failed/incomplete primary batch is regenerated and its errors remain accounted for until resolved. The full default command runs every stage; visual-review coverage stays zero until actual review receipts are supplied.

Before collection, inspect `sources.png`, then record `source-review.json` with reviewer, timestamp, reviewed preset IDs, ordered source hashes from the manifest, evidence filename, and concrete notes. This is an internal source-art review receipt, not a request for user approval. Once the manifest is frozen, changing its sources, seed list, histories, ages or engine hash requires a new run ID; no accepted baseline is silently replaced.

`review-schedule.json` maps opaque sheet/row IDs to exact source, seed, history and age. Inspect blind PNG pages in `sheets/` before consulting that reveal key. The rubric uses 0–3 row scores; adult overviews have no developmental-richness or continuity score. Store actual `VisualReview` receipts in `review-receipts/*.json`, then run `--present` to refresh the report, gallery, score fractions and review coverage. Do not populate receipts from numerical descriptors.

## Later comparisons

```powershell
pnpm audit:pets -- --run household-v2
pnpm audit:pets -- --run household-v2 --analyze --compare household-v1
pnpm audit:pets -- --run household-v2 --present
```

Use identical frozen source drawings, seeds, histories, ages and metric definitions when comparing engine revisions. `comparison.json` withholds percentage-point deltas when cohorts or metric versions differ. If a metric definition changes, recompute both runs with that definition or explicitly mark the comparison unavailable. Retain the old images, manifests, results and defects.

All shape percentages concern this finite within-preset cohort. Color, absolute size and pose are separate channels. Large numerical distances do not prove visual distinctiveness or interestingness. Whole-seed bootstrap intervals are conditional on this protocol; frame counts are not independent player samples. Node timings are contended desktop observations, not physical-iPhone or WidgetKit performance.

The runner checks all current engine source hashes before and after collection. Algorithm/schema 5 remain frozen for this baseline. Missing swimming, rigid-shell behavior and species-specific gaits are findings, not reasons to mislabel anatomy or tune the engine during the audit.
