# Stage-structured procedural ontogeny — implementation specification (PROPOSED)

**Status:** Phased implementation on the unmerged v12 draft. The canonical five-epoch clock, stage-indexed growth field, and boundary-centered regional opportunities have been implemented and their focused tests added. **Five distinct forms are NOT yet independently qualified or deployed.** This is a normative acceptance contract, not evidence that an entire stage-identity cohort passes. This specification supersedes the *age-stage intent* of the retired 0/30/75/365 milestone mapping, but does not replace the existing 365-day physical clock or override material conservation.

**Objective.** The SAME player-authored organism passes through five visibly distinguishable developmental body plans—**Egg, Infant, Teen, Adult, Elder**—in one lifetime. Each should have a recognizable, original, causally generated silhouette and feature emphasis. The player observes a gradual series of daily source-owned pixel changes between forms, not an abrupt sprite swap. Tamagotchi, Digimon and Pokémon motivate *developmental contrast*, not fixed species targets, sprite masks, or per-starter recipes.

## 1. Normative input, output and time

Inputs: authored 32×32 ink with explicitly selected part kind and persistent part IDs; immutable readable alphanumeric seed/genetic potential; static phylogeny/fantasy reference constraints with identified provenance; physical source-attributed graph at check `k-1`; complete chronological care for `[T_(k-1),T_k]`; exact algorithm version. **No future care** can affect the current step. Geometry can determine physics and developmental mechanical potential, **never infer an Eye, Leg, Head, plant, species, etc. from a Body-only shape**.

Outputs: one stage label for the completed daily check; genetically authorized stage-specific operator pressures; the unchanged-original-source, fully journaled new physical graph (possibly a legitimate null step); persistent derived stage metrics. All values are deterministic and bounded. There is NO alternate stage renderer, interpolated nonphysical sprite, duplicate timekeeper, second virtual creature, or repopulation/breeding step.

Let `T_k = hatchAtMs + k × 86,400,000` for integer `0 ≤ k ≤ 365`. `k=0` renders the **exact** initial drawing, unchanged. Only `k=1..365` can commit physical transactions. No intra-day changes; gameplay animation does not count as anatomical evolution. `k>365` must reproduce the check-365 graph exactly; normal pet care continues. The variable `hatchAtMs` is the EXISTING clock origin, not a license to add another hatching clock.

### Stage table (initially fixed and versioned)

| Stage | Inclusive checks | Representative checkpoint | Developmental pressure (examples, **not** mandated anatomy) |
|---|---:|---:|---|
| **Egg** | 0–20 | 10 | Integrate authored material, redistribute/bind regions, explore compactness and containment **only where physically and genetically possible**. A literal oval/shell is not imposed. |
| **Infant** | 21–80 | 60 | Establish coherent primary regions, reveal genetically allowed differentiation, distinctive proportions and early attached structures; preserve selected parts as accountable identities. |
| **Teen** | 81–170 | 140 | Highest exploratory potential for regional bend, displacement, source-derived functional specialization, anatomical migration and non-rigid reorganization. |
| **Adult** | 171–280 | 245 | Distinctive integrated tissue arrangement, source-owned consolidation or altered proportions/attachment, stabilized specialization; not "Teen + mass." |
| **Elder** | 281–365 | 345 | Another **distinct** material expression (e.g. source-supported curvature, asymmetry, changed support, changed functional use, weathered/ornate tissue). Never a universal "bigger adult" or automatic decay/senescence mask. |

Formally, `stage(k)` is the unique label whose inclusive range contains `min(max(k,0),365)`. Invalid negative/noninteger input must throw rather than silently invent an age. Stage-boundary checks are `B=(21,81,171,281)`. The `Egg` *developmental label* does not assert a player drew a literal egg or shell and does not authorize redrawing a user-authored character into one. Likewise an explicitly painted `egg` anatomical part retains its brush identity. Gameplay behavior during Egg remains a design choice that must not disrupt care, save, or drawing integrity. The user-facing label is **Elder**; legacy internal `elderly` is consolidated into one canonical stage contract when implementation is atomically integrated, rather than keeping two competing systems.

### Boundary and gradual transition model

For integer check `k` and stage boundary `b∈B`, define the **opportunity pulse**:

```
pulse_b(k) = max(0, 1 - abs(k - b)/12)
transitionPressure(k) = max_{b in B} pulse_b(k)   // [0,1]
```

A pulse redistributes *proposal priority* through a 24-check band around the boundary; it never directly moves a pixel and never guarantees a result. Proposed changes occur only at successive real daily checks after physical validation. There is no instant boundary morph and no final-stage jump. The named stage represents the current developmental epoch, not an assertion of completed target anatomy at its first check.

## 2. Immutable latent stage potentials, not adult sprites

At creation derive one versioned `StagePotentialV1` for each stage from original authored source matter `D`, immutable genome `S`, and allowable fixed phylogenetic possibility priors `P`. Only source-authored anatomical kinds may identify source part categories. Potential fields are **numeric operator priorities, source-region affinities, allowed functional succession and mechanical viability**, not coordinate targets, species labels, outlines, masks, or expected generated organs. Whole-body and Body-only variation must remain possible.

The profile below sets **relative opportunity weights**, not a hard whitelist. Every operator is still bounded by its immutable gene capacity, physical feasibility, available source material, and chronological care:

| Epoch | Shape reorganization | Joint/feature movement | Attachment succession | Material specialization | Structural consolidation |
|---|---:|---:|---:|---:|---:|
| Egg | 0.8 | 0.3 | 0.2 | 0.2 | 0.9 |
| Infant | 0.9 | 0.8 | 0.5 | 0.6 | 0.7 |
| Teen | 1.0 | 1.0 | 0.9 | 1.0 | 0.4 |
| Adult | 0.9 | 0.9 | 1.0 | 1.0 | 0.9 |
| Elder | 0.9 | 0.7 | 0.8 | 1.0 | 0.8 |

All entries are **proposed** nondimensional baselines in `[0,1]`, subject to tuning through mathematically reproducible diagnostics. They bias pressure but do not mandate a particular shape/feature. Asymmetric, stationary, spindly, ring-like, branched, fungal, animal, plant-like, and completely novel player drawings remain eligible without anatomy inference.

For existing physical operation family `o`, live stage `s`, and check `k`:

```
cap_o    = immutable seed/source/phylogeny capacity, in [0,1]
weight_s,o = stage profile above, in [0,1]
care_o(k) = deterministic normalized opportunity from the completed daily care window, in [0,1]
p(k) = transitionPressure(k)
pressure_o(k) = clamp01(cap_o * weight_s,o * (1 + 0.5*p(k)) * care_o(k))
accept_o(k) = proposed(pressure_o(k), permanent source-seeded phase)
              AND source-owned geometric and chronological admissibility
```

The mathematical multiplier `0.5` is a *starting proposal* and shall be tested against counterfactual care histories; do not assert an empirical biological coefficient. The seed may rank legal options but NEVER choose a predetermined resulting adult image. Use the existing bounded deterministic chaos/seed machinery; **do not introduce a second stochastic generator or unseen rerolls**.

The stage planner must budget the existing **at most 64 lifetime remodeling operations** before assignment, reserving physically expressive opportunities for **each** of the four stage boundaries and a real Elder period (not just all growth near birth). Stages are not separate pets or separately sampled genomes; later-stage potential must not depend on future care or a desired target outcome. Accepted operations still require actual physical cells, atomically committed journals, and independent replay.

## 3. Required form differentiation

At each representative checkpoint `A=(10,60,140,245,345)`, compute observable properties ONLY from physically reconstructed source-owned material. Do not test stage names or sprite snapshots as evidence of visual differentiation.

- **Occupied silhouette / proportions:** extents, occupied 4/8-neighborhood topology, centroid, aspect ratio, occupancy and negative space from the real material graph.
- **Source-body reorganization:** original surviving cell identities and provenance lineage, original-pair distance spectrum (invariant under rigid translation and rotation), material transport and nonuniform allometry. Exclude mere deposits from the source-identity motion count.
- **Anatomical topology and specialization:** exact changes to existing tissue-parent/attachment edges, original feature function, real physical joint and support relationships. **Newly budded branches alone do not count as reorganization**.
- **Tissue distribution:** source-lineage proportions across connected or functional regions; distinct supported novel tissue specialization without guessing from player ink.

To reject scale-only enlargement, define a deterministic normalized silhouette representation `N(M)`: place the occupied material centroid at origin and normalize coordinates by the positive equivalent-area radius `sqrt(A/π)`. Rasterize on a fixed declared 32×32 canonical grid with deterministic tie breaking; compare `J_norm = 1 - IoU(N(M_a),N(M_b))`. Empty material is explicitly invalid; a one-cell drawing uses a defined singleton convention. This is NOT permission to change the real 64×64 lattice for rendering.

Define `R_source` as the fraction of persistent, originally sourced cell pairs whose pairwise distances differ by at least 10% *after* normalizing each cohort of source-owned pair distances by its median positive pairwise distance. A zero/degenerate median is an explicitly recorded unresolved case, not arbitrarily treated as success. Define `T_existing=1` only for an independently reconstructed change of parent/attachment/functional specialization among **previously existing** tissues, excluding new buds and semantic relabeling without a real developmental operation.

An adjacent stage pair is **substantively distinguishable** only when:

```
J_norm >= 0.18
AND (R_source >= 0.10 OR T_existing == 1)
AND full physical provenance/conservation verification passes.
```

These are **proposed preregistered qualification thresholds** for the experimental game, not empirical scientific constants. The normalized shape requirement excludes uniform enlargement. The source-pair requirement excludes a rigid pose/translation presented as whole-body evolution. Valid new tissue and source-supported body-plan specialization remain possible, but must be physically supported and stage-distinct rather than cosmetic. Do not lower thresholds to make a cohort pass after observing results without documenting a revised hypothesis and a held-out cohort.

Daily continuity: For every accepted stage transition, the same source cell IDs and drawn part IDs persist through reconstructible chronological ancestry; any physically large move must be decomposed into feasible auditable daily material transactions rather than rendering a future silhouette in one frame. The checks at `b-1` and `b` cannot be a sprite replacement or an undocumented identity reset.

### Cohort qualification (separate from narrow unit tests)

Predeclare a held-out set of **at least 24 unfamiliar player-like drawings** spanning Body-only solid, thin, disconnected, cavity-bearing, irregular, plant/fungal-like, fantasy-like and explicitly selected multi-part anatomy (do not treat geometry as automatic semantics). For each, use **≥3 independently assigned readable seeds** and **≥2 divergent chronological care histories**: at least 144 full 365-day trajectories. Each combination is evaluated at all five representative stages and all four adjacent-stage comparisons.

For cases with mathematically sufficient feasible source material, require **at least 75% of trajectories** to qualify in **all four** adjacent-stage pairs, and **at least 80% per stage transition**; report exact denominators and per-source, per-seed and per-care distributions. These percentages are product acceptance hypotheses and must be independently audited. Also report rejected opportunities and reasons, including isolation/collision, part integrity, insufficient original resources, low care, saturation, and unattainable geometry. **Do not delete “hard” drawings from denominators or silently exclude one-cell Body ink**: label proven genuinely impossible individual comparisons `unresolved`, keep and report their count separately, and test their invariants even if they cannot satisfy the same visual threshold.

A qualification pass is NOT equivalent to user approval of art direction; interactive Safari testing still follows once actual engine integration is stable.

## 4. Independent mathematical verification and counterexamples

Tests must demonstrate these properties without screenshots, fixed adult sprites, or approving arbitrary seed outcomes:

1. **Boundary partition:** for all 366 integer checks, exactly one stage; checkpoints 0 and 365 are legal; stage transitions occur at exactly 21,81,171,281; after 365 the anatomy is byte-for-byte unchanged. Negative/fractional days reject.
2. **Source invariants:** day 0 equals drawing; original pigment, source IDs, explicit part identities, protected holes and provenance are never silently rewritten; no new semantic kind inferred from Body-only ink.
3. **Deterministic and causal:** same drawing/seed/version/care prefixes yield identical stage/potential/physical journals regardless of query ordering or reload; altering care after check `k` cannot alter anything at or before `k`. Seed influences *potential*, care influences *expression*.
4. **Actual physical gradient:** stage boundary cannot cause unexplained new cells or image swaps; each non-null step produces authorized, spatially coherent, finite transactions verified by the independent chronological auditor; no structural changes between daily checks.
5. **Five distinct forms:** under held-out cohort criteria above, compare all **four adjacent** stage anchor pairs. No single final-adult checkpoint, self-comparison or mere stage labels count.
6. **Anti-bulk counterexample:** add arbitrarily many source-derived boundary pixels or a newly branched tissue without relocating/rearranging original material. The new stage test MUST fail despite a large raw silhouette IoU change.
7. **Anti-pose counterexample:** rigidly translate or rotate the whole original creature with all internal source pairwise distances constant. Unless a real, audited existing attachment/function change also occurs, this MUST fail the developmental-form gate.
8. **Anatomy anti-erasure:** separately authored Eyes/Legs remain causally distinguishable under real repurposing, resorption, attachment-coupled movement and specialization; no duplicate cell IDs, topology cycles, illicit overlap, false ancestry or unaccounted pigment.
9. **Diverse trajectories:** different fixed seeds/care produce real variation in whole-body relative proportions, topology, tissue distribution, specialization and four-stage developmental routes. A test may not pass merely by hardcoding five generic silhouettes across seeds.

## 5. Implementation sequence and code ownership

**Phase S1 — Canonical stage clock, no morphology change.** New pure `src/development/stage-contract.ts` exports inclusive stage map, representative checkpoints, boundary pulses and `StagePotentialV1` type. Integrate in `src/simulation/model.ts` (`elderly` → canonical `elder`), `src/simulation/growth.ts` (remove current `infant/teen/adult/elderly` age shortcuts and optional-only Egg milestone), care/status display and saves with deliberate current-format version handling. Stage semantics **must** reuse `daily-contract.ts` and `hatchAtMs`.

**Phase S2 — Seed-derived stage pressures.** In `src/development/lifetime-remodeling.ts`, `src/development/regional-regulation.ts` and genetic signal adapters, replace five mechanical 73-check allometry buckets and unrelated fixed stage opportunity dates with the stage-appropriate fixed potential/pressure field. Preserve 64-operation budget, non-bypassable care, existing seed/chaotic determinism and physically viable null proposals.

**Phase S3 — Physical stage expression.** Reuse/extend `src/development/remodel-transactions.ts`, `src/development/coordinated-metamorphosis.ts`, `src/development/developmental-strain.ts`, `src/development/tissue-reflow.ts` for actual non-additive body mass redistribution, curvature, source-supported region topology and attached feature movement. Do NOT make stage labels themselves paint any pixels. No single-op restriction to appendage tips, no forced stage shape or feature deletion.

**Phase S4 — Independent verification before a release.** Update `src/development/spatial-inventory.ts`, `src/development/anatomical-audit.ts`, `src/evaluation/morphology.ts` and `tests/alg-evaluation-stage-trajectory.test.ts` for five-anchor normalized shape, originally sourced distance/topology tests and separate old/new material accounting. Add focused `tests/alg-development-stage-contract.test.ts` and 24+ held-out unfamiliar inputs. Prior 0/40/100/175/250/330/365 numeric gate is a **diagnostic**, not this five-stage qualification. First typecheck and execute the independent tests, then merge and publish; only then request user-facing Safari validation.

### Acceptance and stop conditions

- Stage label/potential code without physically distinct forms is **not** completion.
- Four meaningful changes produced by four fixed sprites, species IDs or five generic stage masks is **not** completion.
- Adding bulk/one-cell tendrils, changing pigment, fake pose, or shifting to a new phylogenetic ancestry is **not** completion.
- Correct biology that never expresses its anatomically allowed capacity in a real 365-day lifetime is **not** completion.
- Any accepted result must be causally traceable to player source → immutable genetic potential → explicit operation → chronological care → independently reconstructed material state.
- Keep PR #58 and issue #59 explicitly unresolved until new S1–S4 qualification is executed. **This document is a specification, not a release or proof.**

## 6. Executed v12 baseline: five forms do NOT qualify yet

This section records actual mathematical results; it does not replace the
predeclared Stage-004 final held-out standard. Stage clock and stage-boundary
mechanisms are source-implemented and have passed focused numerical tests.
The *separate* 48-trajectory five-form diagnostic **FAILED** on the
declared thresholds.

- [GitHub Actions five-form run 41162352534](https://github.com/natanai/infipet/actions/runs/41162352534), commit `647b726926b69d26c2b842148caeee7e9762d8bc`.
- Exact stage anchors: 10, 60, 140, 245, 345; 12 birth sources × 2
  readable seeds × 2 divergent chronological care histories = 48 lives.

| Actual adjacent pair | Qualified | Fraction |
|---|---:|---:|
| Egg → Infant | 43/48 | 89.6% |
| Infant → Teen | 41/48 | 85.4% |
| Teen → Adult | 31/48 | 64.6% |
| Adult → Elder | 19/48 | 39.6% |
| All four pairs in SAME lifetime | 14/48 | 29.2% |

The rule requires 80% for each pair and 75% complete-five-form lifetimes.
Do NOT weaken these acceptance thresholds retroactively. There were zero
`unresolved` cases in this 48-life sample; the complete 24×3×2 held-out
qualification remains outstanding.

The mature-care counterfactual is particularly revealing: Adult→Elder
passed in **4/24 higher-care** lives (`nutrition=0.92`) but **15/24
lower-care** lives (`nutrition=0.28`). Despite more matter, high-care lives
became less morphologically expressive. At day 281, the high-care cohort
contained 501.3 live physical cells per pet on average, versus 196.4
lower-care cells, from the same sampled original ink (mean 25.8 source cells).

A **separate exact physical opportunity diagnostic** tried four cardinal
directions for each of two operators on the REAL day 281, 330 and 345 graphs,
without changing or committing any pixels.

- [GitHub Actions reachability run 41162579351](https://github.com/natanai/infipet/actions/runs/41162579351), commit `5be3e95e60f0da3f5a005f0f8041e5627378e9b6`.
- High-care day 281: 14/24 had at least one admissible source-owned slip,
  12/24 at least one bend, **7/24 had neither** in any tested cardinal
  direction.
- Lower-care day 281: 24/24 had a legal slip, 21/24 had a legal bend, and
  **0/24** had neither.
- At day 345, high-care had 13/24 with any slip, 11/24 with any bend,
  and the same 7/24 blocked from both. Lower-care had 23/24 with any
  slip, 20/24 with any bend, 0/24 blocked from both.

**Important follow-up correction:** The physically admissible operator
space is broader than slip and bend. [Reflow diagnostic 41163862335](https://github.com/natanai/infipet/actions/runs/41163862335)
tested the EXISTING routed tissue-reflow operator on the same mature cohort:
**all 7/7** dense high-care specimens blocked from every slip/bend direction
had admissible reflow at day 281. In the full high-care group, **22/24**
could reflow. Thus those seven are NOT physically frozen; their reorganization
is poorly expressed by the prior default stage schedule and by limited
single-cell reflow scale. This replaces the earlier assumption that a wholly
new operator is required merely to make any movement possible.

A new v13 `intercalate` operator now offers a different conservative
transport geometry: an 8-connected vacancy chain in which EVERY moved
preexisting source-owned cell advances exactly one lattice step; the first
site empties and the final site fills. The independent chronological auditor
reconstructs the complete simple movement chain from original material
coordinates and rejects omitted, duplicated, illegally distant, intersecting,
unlinked or unsupported shifts. No new pixels, anatomy names or target adult
silhouette are created. The focused numerical producer and forged-journal
test passed in [run 41164230099](https://github.com/natanai/infipet/actions/runs/41164230099).

[Real mature physical reachability run 41164343711](https://github.com/natanai/infipet/actions/runs/41164343711)
found an admissible intercalation on **24/24** high-care and **24/24**
low-care original material graphs at each of days **281, 330 and 345**.
The best valid high-care day-281 chain moved a mean **23.96 living cell IDs**
(including mean **2.25 originally authored** cell IDs) one site each, without
creating or erasing a cell. This is physical *opportunity*, not proof that
the chronological engine selects an accepted operation at the right stage.

The v13 compiler now reserves limited actual Adult and Elder intercalation
opportunities, while keeping the 64-operator cap, at least one alternate
topological host ticket, and original source/seed/care gates. It reassigns
two redundant additive local tickets in crowded multi-part drawings to
preserve expressive remodelling capacity. The strict five-form stage cohort
MUST be rerun; this document does not claim that its thresholds now pass.

**Engineering consequence:** simply scheduling more attempts of the same
one-direction slip or bend is insufficient. The next Stage-003 physical
model must address both (a) which genetically fixed, materially lawful
direction can express under chronological care and (b) source-owned
whole-body reorganization in the seven dense examples where neither current
family is viable at day 281. A future physically valid candidate family must
support changing proportional mass distribution, topology, and/or internal
material organization without hardcoded silhouettes or weakened collision,
void, link, continuity or ancestry checks. An alternative design may
allocate adequate material plasticity throughout stages rather than spending
most growth credit as early bulk; that must be quantitatively tested against
both care histories. No one-seed starter patch qualifies.

**All STAGE-001..004 work remains unmerged and unpublished.** The old
six-window source-rearrangement gate can pass despite this stricter named
five-form gate failing. Keep both as independent diagnostics, with Stage-004
remaining the actual product acceptance target.

### Executed stage response to physically conservative contour transport

The v13 **single-corridor** life-stage run
[41164591561](https://github.com/natanai/infipet/actions/runs/41164591561)
improved Adult→Elder from 19/48 to 28/48 and complete five-form lives
from 14/48 to 20/48. Its real physical local transport was mathematically
verified, but strict five-form acceptance still FAILED.

A subsequent three-corridor internal transport run
[41164985246](https://github.com/natanai/infipet/actions/runs/41164985246)
actually regressed Adult→Elder to 26/48 while increasing internal
source-pair movement. **This proves that more interior rearrangement is not
equivalent to silhouette metamorphosis.** No threshold was altered.

An expanded, still physically conservative **eight-corridor** geometry
[41165302110](https://github.com/natanai/infipet/actions/runs/41165302110)
recovered meaningful physical outer-body changes. Compared with the
initial five-form baseline:

| Actual adjacent stage pair | Baseline | Source-owned eight-corridor v14 |
|---|---:|---:|
| Egg → Infant | 43/48 | 43/48 |
| Infant → Teen | 41/48 | 41/48 |
| Teen → Adult | 31/48 | 41/48 |
| Adult → Elder | 19/48 | 35/48 |
| All four adjacent pairs in the SAME life | 14/48 | 28/48 |

High-care Adult→Elder qualification increased from **4/24 to 11/24**
while the cohort retained all source DNA, provenance, original cell IDs,
protected cavities, care chronology and independently audited movements.
This v14 run still **FAILED** the preregistered ≥80% per-stage and ≥75%
complete-lifetime standards. The high-care mean normalized Adult→Elder
silhouette difference was ~0.155 versus the required 0.18.

A subsequent v15 experiment added an extra late-Elder material
opportunity from day 317 to 364 using otherwise unspent genetic slots.
Its independent [run 41165576898](https://github.com/natanai/infipet/actions/runs/41165576898)
**REGRESSED** Adult→Elder to **31/48** and full five-form lives to
**24/48**, despite passing the source-conservation, type and physical
scheduling tests. It also increased runtime. The extra window was
**reverted**, restoring the better-performing v14 eight-corridor schedule.
This is important evidence that *additional movement is not sufficient
and may disturb coherent developmental organization*. The stage identity
gate remains FAILED (Adult→Elder 35/48; complete five-form 28/48).

The eight-corridor operator moves existing identities by exactly one
8-neighbor lattice site each. A daily transaction contains at most eight
vertex-disjoint corridors and 256 total cell moves; all conservation,
attachment, material support, boundary contact, protection and
chronological care constraints remain independently audited. The finite
relocation budget is distinct from the 64 lifetime operator-slot budget.
