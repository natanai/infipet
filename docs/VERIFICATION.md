# life-v9 verification

Verified October 25, 2026. App 0.9.0, portable schema 8, procedural engine 7, grammar morphogenesis-v1, gameplay rules 2 and needs rules 2. Recipes pin animal lineage and needs catalog versions; the prototype revision clears only the app's infipet.* namespace.

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed |
| Full unified suite | **420 passed, 0 failed** |
| Gameplay engine | 22 tests, including nine genuine sleep disturbances through normal commands |
| Retro harness | 12 tests, including exact birth pixels/colors, no target inputs and browser/audit replay agreement |
| Editable source corpus | **36 drawings**: 14 V1 community references, 11 primary P1, 11 provisional P2 |
| Source extraction | 36 forms / 25 graph paths; 34 archived source hashes and 12 independent P1 sprite-piece comparisons verified |
| Final causal lifecycle run | **1,500 path comparisons / 180 distinct source-seed-care recipes**, 25 winning witnesses replay-verified |
| Gameplay route eligibility | All 10 V1 branch-slot paths earned; all 25 paths reach the required combined-game stages alive |
| Near-exact reference morphology | **Not established**: 19 failed paths, 6 edition-uncertain P2 paths unscored, 0 machine candidates / accepted matches |
| Raw animal extraction | All **1,717,413 nodes**, **1,717,412 edges**, **1,490,245 tips** and inherited profile assignments validated |
| Web export | Passed; 337 modules, approximately 1.8 MB JavaScript |
| iOS Hermes export | Passed; 906 modules, approximately 3 MB bytecode |
| iOS plain JavaScript export | Passed; 906 modules, approximately 2.5 MB JavaScript |
| Phone-width browser | Tested at **390 × 844**, document scroll width 390; no horizontal overflow or browser errors |
| Signed iOS / physical iPhone / WidgetKit | **Not tested** |
| Exact original hardware parity | **Not established**; see the reference ledger |

## Browser and image checks

The developer preview was exercised through its visible UI at [localhost:8081](http://localhost:8081/), without injecting application state.

- Opened the 36-form source gallery, filtered P1/P2 and searched for Mametchi. P2 sources visibly retain the edition-unverified label.
- Loaded a Botamon source onto the ordinary shared drawing canvas. Reload retained that drawing and left Begin life available; no later reference pose or care history was inserted.
- Opened the final 1,500-comparison litmus. Birth, 1-hour and 193-hour frames regenerated from actual command recipes matched their published checksums. The UI separately reports earned gameplay routes and failed appearance.
- Inspected complete V1 Greymon, P1 Mametchi and provisional P2 Mimitchi lifecycle sheets. Birth ink matches; later forms visibly fail, beginning with filled-to-outlined transitions. No near-exact image acceptance is recorded.

Screenshots: [lifecycle comparison](audits/life-v9/phone-lifecycle-litmus.jpg), [P1 gallery](audits/life-v9/phone-retro-p1.jpg), [P2 provenance labels](audits/life-v9/phone-retro-p2.jpg). These are developer browser checks, not physical-device evidence or independent human acceptance.

## Determinism and integrity

The final full suite includes exact birth-coordinate and pigment checks, arbitrary-seek and cache regressions, inherited-genome independence from care, source/face continuity, sheltered enclosure, grooming, stage commitments, minigame cancellation, CPU result idempotence, command ordering, offline aging, persistent death grace, revision-scoped storage and live/Lab separation.

[The final retro report](audits/life-v9/retro/REPORT.md) distinguishes the 180 independent source/seed/care combinations from their 1,500 repeated path comparisons. Its manifest pins 36 runtime/validation source files, including needs, source composition and portable validation. Verification replays 25 witnesses and recomputes image hashes and scores. Eighteen deduplicated winning recipes are published to the app. Reference targets never enter the normal renderer.

The [v9 gameplay proof](audits/life-v9/proof.json) separately executes 109 actual caretaker commands and saves/reloads its fixtures. Historical [v8 browser captures](audits/life-v8/) and its [90-frame lineage audit](audits/life-v8/lineage-render-audit.md) remain evidence for that earlier build; their manual rendering summaries are not new v9 gameplay witnesses.

## Limits

This iteration provides a usable preset library and repeatable causal lifecycle test. It does **not** show that the current algorithm can reproduce every inspired creature. Exact birth reconstruction and correct game branches are insufficient. The scored selected recipes' weakest-stage ink IoU is 14.13–27.65%, below the 90% gate. General surface/pigment differentiation and later anatomical detail remain missing. A bounded failure proves neither that every seed fails nor that a successful seed exists.

The path catalog covers roots through their last listed forms, not every mortality, animation or optional adult-retained ending. Original P1/P2 care variants and timing remain separately unresolved. The [reference ledger](reference-parity.md) also retains provisional physiology, mortality, P2 ties, refusal/discipline, training presentation, battle and final-evolution rules.

The animal data remains a complete represented subtree of a pinned synthesis, with unresolved relationships and coverage gaps preserved. Broad game affinities and 19 trait profiles are not scientific phenotype reconstructions. See [phylogeny documentation](phylogeny.md).

## Reproduce

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts tools/evolution-audit/*.test.ts tools/source-audit/*.test.ts
node --max-old-space-size=4096 node_modules/tsx/dist/cli.mjs tools/phylogeny/validate.ts
python tools/retro-reference/validate.py
node node_modules/tsx/dist/cli.mjs tools/retro-audit/run.ts verify --out docs/audits/life-v9/retro/cohort-002
node node_modules/expo/bin/cli export --platform web
node node_modules/expo/bin/cli export --platform ios --output-dir dist-ios
node node_modules/expo/bin/cli export --platform ios --no-bytecode --output-dir dist-ios-js
node node_modules/tsx/dist/cli.mjs tools/gameplay-proof.ts
```

Hermes ran outside the Windows filesystem restriction so its temporary compiler output could be written. Neither iOS export signs or installs an app. Physical iPhone performance and Home Screen widget scheduling require separate testing. The preview remains on port 8081.
