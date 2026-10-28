# Historical morphological expressiveness: preserved concepts and reproducible recovery

**Status:** source investigation and regression contract established. Actual three-engine full-lifetime comparative measurements are **not yet executed**, so `MORPH-001` remains `in_progress`. This document is an evidence inventory, not a claim that historical visual geometry was physically valid, or that current growth is already qualified.

## Pinned evidence, not retrospective aesthetics

Reference revisions:

| Role | SHA | Actual production model at that revision |
| --- | --- | --- |
| Expressive composited renderer, earlier source | `1469fc4d8f8f98be21a7c13ac602ce69ed9a67a7` (PR #3) | `resolveDevelopment` plus region, somatic and centerline body warps; `capsulePixels`, generated surfaces, ordinary raster compositing |
| Hybrid reference | `3111b1666317d491e7c09c3087c41a5ef3b59685` | Expressive visual region composition *and* emerging `materialAt` chronology; not all rendered pixels trace to the actual physical graph |
| Physical daily reference | `9e00248518b6bc857454038405967562a25df263` (starting main) | `frameAt` paints only `graph.cells` through `rasterCellQuads` with visible per-cell material/provenance IDs; daily physics has exactly 365 check opportunities |

Relevant merged PRs establish incremental discoveries rather than one monolithic old engine: [#7](https://github.com/natanai/infipet/pull/7) cross-kingdom phylogeny, [#8](https://github.com/natanai/infipet/pull/8) permanent genetics, [#10](https://github.com/natanai/infipet/pull/10) source material operators, [#12](https://github.com/natanai/infipet/pull/12) deterministic chaotic growth, [#13](https://github.com/natanai/infipet/pull/13) source-preserving remodeling, [#14](https://github.com/natanai/infipet/pull/14) iterative growth, [#15](https://github.com/natanai/infipet/pull/15) functional locomotion, [#17](https://github.com/natanai/infipet/pull/17) chronological remodeling, [#18](https://github.com/natanai/infipet/pull/18) iterative chronology, [#19](https://github.com/natanai/infipet/pull/19) unified chronological material, [#23](https://github.com/natanai/infipet/pull/23) incremental material operator transactions, [#24](https://github.com/natanai/infipet/pull/24) fictional physical composition, [#31](https://github.com/natanai/infipet/pull/31) source/birth diversity audit, and [#35](https://github.com/natanai/infipet/pull/35) the 365-check runtime. The reference and current tree SHA comparison establishes that `src/simulation/{morphogenesis,development,somatic-growth,regional-layout,metamorphosis,surface-expression}.ts`, `src/development/{operators,iterative-growth,speculative-material}.ts`, most genetics and phylogeny modules are byte-identical between `3111b166` and `9e002485`. The structurally decisive changed file is `src/simulation/growth.ts`, with a later revision of `lifetime-remodeling.ts`. **Retained code is not retained effective behavior.**

The full 16-mechanism machine-readable inventory in [capability-inventory.json](capability-inventory.json) describes purpose, governing formulas, inputs, consequences, historic physical accountability, current code status, current renderer connection, physically legitimate adaptation, and permanent concepts.

## Mechanistic explanation of the regression

The expressive renderer at `1469fc4` took a source patch and transported/rasterized it using `resolveDevelopment`, `mapSourcePoint`, `somaticTransport`, nonaffine centerline warps, generated skins, capsule rasterization and a composited part list. This made it mathematically possible to alter area, curvature, limb/region proportion and whole-body distribution at virtually any queried development age. The source remained the *conceptual* host, but generated silhouettes, interpolated surface contours and capsule pixels were often not the output of recorded material-cell creation, removal or relocation. Rendering alone did **not** establish the required conservation proof.

The present `src/simulation/growth.ts` has a different anatomical authority. It obtains `physical=unified.at(physicalHour(age))`, groups `graph.cells` by `tissueId`, applies pose transport to existing cell quadrilaterals and paints through `rasterCellQuads(material)`. It no longer paints the old region's nonmaterial procedural silhouettes. This closes an important provenance hole. However, the actual graph often receives material through a narrow operator vocabulary biased toward discrete adjacent growth-site extension. `src/development/iterative-growth.ts` explicitly defines the primitive **one resource credit → one neighboring cell** and branch initiation at extended tips, with occupancy/protected-void checks. `src/development/daily-step.ts` runs material chronology, remodeling proposals and `stepIterativeChronology` once per accepted daily window. Its proportional resource force is `nutrition * (0.5 + 0.5*rest) * (0.5 + 0.5*security)`; competing operations may be deferred by resource, geometry or time.

**Inference:** The switch removed the broad, visually simulated deformation field from physical painting, and physical tip operators became the most reliable way to add visible cells. A system can therefore pass source/transaction invariants while mostly extending a few thin strands. This is a source-level explanation, not a measured claim that a specific percentage of current cohort outcomes are tendrils. The optional benchmark must establish the observed magnitude.

The restoration must do **both**: preserve physical ownership and expand the range of physically realizable nonlinearly shaped growth, including multi-cell transport, volumetric deposition, localized resorption, fusion and attachment changes. Do not simply reinstate old raster warps.

## Mathematics that must not be lost

1. **Source geometry:** connectivity, source-derived axes, ports, radial profiles and protected empty regions are initial conditions, not creature-specific recipes.
2. **Fixed genotype:** stable seed hashes select permanent growth, plasticity, material, segmentation and support channel potentials; chronological care changes their expression, not the genome.
3. **Somatic shape fields:** deterministic seeded stage goals such as `size=0.85+1.55u`, `aspect=0.68+0.88u`, and superellipse/radial maps provide *candidate physically constrained transformation fields*. They do not directly mint cells.
4. **Regional anatomy:** split source axes by material-derived intervals, compute local mass frames and allow differentiated growth/transport. A regional frame becomes physical only through individually conserved cell positions and coherent tissue/attachment operations.
5. **Metamorphosis:** stage-guided centerline length/width/curvature with trigonometric deformation and care sensitivity can steer source-conserving remodeling. Never treat the historical stage milestones `30/75/120` as today's daily check indices.
6. **Iterative growth:** deterministic largest-remainder resource allocation with `B_n=floor(4r_n)` and a finite-state chaos recurrence remains valuable for real branching, even if it cannot be the only morphology grammar.
7. **Physical remodeling:** indexed resorption, relocation, reinforcement and reattachment transactions can embody bulk and topological changes. The authoritative journal must include exact before/after coordinates and source parents, not only final cell counts.
8. **Functional anatomy and care:** locomotion and pose derive from support/joints; only accepted physical journal operations at the 365 daily boundaries are anatomy. Care inputs and force must be causally earlier than the check whose outcome they influence.

### Historical physical legitimacy classification

- **Legitimate physical foundations:** immutable source cell graph, authored source IDs, growth-site parentage, discrete material operator outcomes, integer-budget iterative additions, accepted resorption and relocation events, explicit cell-to-tissue links and generated source ancestry. Their historical implementations still require the modern independent daily-spatial audit before production use.
- **Physically incomplete historical visuals:** continuous `mapSourcePoint` and `somaticTransport` deformations, generated neck/limb capsules, interpolated skins and facial/feature warps. They can inform desired *geometric laws*, but not directly establish new matter, valid adhesion, or event chronology.
- **Non-anatomical visuals:** animation pose, gesture, locomotion camera, blink, pigment/contrast. They matter to quality, but do not satisfy structural growth acceptance.
- **Physically possible but underexpressed:** widening/expansion, resorb and remodel, region redistribution, organ budding/attachment, fusion, hollow/body cavity remodeling, whole-body relative proportions. Restore as bounded source-rooted operations with independent displacement and material audits.

## Numerical experiment and clocks

Reproduction (developer environment with Git and current dependencies installed):

```sh
pnpm install --frozen-lockfile
pnpm exec tsx --test tests/alg-evaluation-morphology-history.test.ts
node scripts/morphology-compare.mjs --out=/tmp/infipet-morphology.json
# Optional faster exploratory pass, still all 30 independent drawings:
node scripts/morphology-compare.mjs --quick --out=/tmp/infipet-morphology-quick.json
```

The opt-in wrapper verifies three immutable revisions, fetches each if absent, makes isolated temporary worktrees, reuses the current pinned `tsx` dependencies via a symlink, copies **only the exact same test harness** into each worktree, executes that checkout's `createSimulation`, and cleans up. Nothing in production `src/` is replaced; no historical runtime is imported by ordinary CI.

The worker samples **30 independent authored drawings**, **3 reproducible seeds** and **3 care conditions** per source (ambient, supported, deprived), at birth and four subsequent normalized-progress milestones; this is 450 frame observations per revision and 1,350 for three revisions with full mode, before repetitions for deterministic assertions. `--quick` uses 2 seeds. Early expressive output has no recorded `careGame` channel: its care contrast is an actual need-timeline manipulation, *not* an assertion of recorded in-game feeding. In hybrid/current modes the worker supplies actual replayable game commands where accepted and records the available care-game boundary. If the model dies or refuses further commands, the worker preserves the legitimate shorter command history and must not fabricate continued feedings. Do not infer a causal effect from nominally different profile names without verifying actual evidence.

**Native age:** the early composited renderer uses historical morphological age and milestone logic with historic `30/75/120` stage values. The hybrid uses its then-current lifetime/material clock. The present engine only commits physical anatomy at the 365 real 24-hour check boundaries; the benchmark samples native days `0/91/182/274/365`, and historical days `0/60/120/180/240`. Both are recorded in elapsed days **and** the actual normalized fraction `age / nativeHorizon`. The daily samples approximate 25%, 50% and 75% because 365 discrete checks cannot be divided into four equal integers. These five native ages are deliberately **not** claimed equivalent. The early `30/75/120` values are separately recorded as legacy stage landmarks (and can be sampled manually); they are **not** quarter-life equivalents. Do not compare historical `age=120` to `daily check=120` as though identical.

Measured dimensions include occupied area, width, height, aspect, local thickness distribution, region proportions, perimeter, compactness, 4-connected material components, 8-connected background cavities, branch/end and junction proxies, whole-body centroid movement, visual material-ID coverage, physical generated counts, cell-ID relocation, source root survival, live tissue/link counts, event receipts, seed and care counterfactual differences, and visually unbacked output. A `null` physical measurement is explicitly **unknown**, not a pass. The historical renderer cannot borrow the current physical proof.

**Independent geometry definitions:** occupancy is the cardinality of unique integer coordinates; perimeter is count of exposed 4-neighbor faces; compactness `4πA/P²`; connectedness is 4-neighbor flood-fill; cavities are enclosed 8-neighbor background components on a padded bounding domain; local thickness is `2*d4(pixel, background)-1`; normalized region distribution is the nine-sector occupied fraction; branch prominence is a thin-band endpoint/junction proxy (not a full skeletal branch length). The baseline tests assert exact small numerical counterexamples: 2×2 square `A=4,P=8,C=1,h=0,Q=π/4`; 3×3 ring `A=8,P=16,h=1`; two diagonal cells `C=2`; rigid +3 translation `centroid shift=3`. Physical proof is separately based on explicit source/active cell IDs and journals. A generated cell without an authored root is a failure.

### Honest current baseline status

The baseline stored in the canonical `roadmap/plan.json#morphologicalExpressiveness.baseline` remains `historical-run-pending` until an actual full pinned run succeeds, its compact numerical digest is recorded under `docs/morphology/`, and a focused test checks its metric schema and replay consistency. Source-code equivalence and mathematical toy oracles do **not** substitute for historical runtime measurements. The recovery task is therefore not yet `done`; the more ambitious MORPH-002 and MORPH-003 remain `todo`.

## Regression qualification requirements for downstream agents

**MORPH-002 (physical development)** must implement broader physically realized operators. A new centerline proposal is insufficient if only pose changes. The renderer must not need to fabricate cells. Every accepted nonlocal move, fusion, resorption, tissue allocation and attachment must have an actual source-linked transaction. All material changes remain at `T_k=T_0+k*86400000`, `k=1..365`; later physiology is unaffected.

**MORPH-003 (independent verification/integration)** must test diverse cohort-level outcome families rather than the visually appealing output of a few curated seeds. Retain null growth as legitimate for an individual; fail a whole system if the only reproducible structural family is thin extension, even when the material auditor passes. Demonstrate independent bulk area/thickness reallocation, proportion, spatial specialization and topology deltas, along with causal seed/care response and persistent source identity, at their actual engine ages. No named creature outcomes or target silhouettes are allowed in qualification.

**The central non-regression rule:** conservation is necessary, not sufficient. Broad physically causal morphology is independently required.
