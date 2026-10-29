# Infipet architecture — current contract

This is the short technical entrypoint for the **current single-pet game**.
[roadmap/plan.json](../roadmap/plan.json) is the machine-readable task register;
[AGENTS.md](../AGENTS.md) supplies agent-specific invariants. Read these **before**
historical research or compatibility modules. A passing historical benchmark,
a dated integration note, an old pull request, or a legacy API is not evidence
that a retired behavior is active or approved.

## One drawing, one organism, one permanent genome

1. The player draws on the shared 32 × 32 canvas. The first/default anatomy
   selector is **Body**. Every stroke is exactly its explicitly selected
   `PartKind`; without a different selection it is simply Body.
   **No semantic anatomy, ancestry or species is recognized from geometry**,
   holes, pigment, symmetry, orientation, proximity or presumed facial features.
   Geometry is permitted for physical contact, attachment, conservation,
   mechanical viability and rendering, not for naming body parts.
2. A drawing composed solely of Body material (even one cell) is
   **undifferentiated, pluripotent starting material**. It is NOT assumed
   animal, plant, fungal or fantastical. Every represented real and fictional
   tree node is eligible as a game developmental reference. Physical space,
   source matter and recorded care still constrain what can be realized.
3. Explicitly authored multiple parts remain distinct accountable identities:
   two Eyes are independently sourced eyes, not a pigment-based guess.
   They may deform, move, change specialization or become supported vestiges.
   A child cannot disappear simply to satisfy an area heuristic. New generated
   parts must cite original source cell IDs and a genetic operation.
4. The original **seed is alphanumeric and never rerolled**. Its currently
   published, readable A–Z letters and digit dosages live in
   [genetics/readable-seed.md](genetics/readable-seed.md) and
   [src/genetics/seed-language.ts](../src/genetics/seed-language.ts).
   The seed selects fixed potential counts and operations, not images or
   predetermined species. Tree evidence influences probabilities; it is a
   reference, not a claim that a pet changes scientific ancestry.
5. **Determinism**:
   - Exactly the same authored drawing, seed, algorithm version and starting
     conditions produce the same permanent gene program.
   - Exactly the same drawing, seed, starting conditions and chronological
     care history produce the exact same physical life, event-by-event.
   - Different care can change **expression**, not reinterpret letters,
     reroll opportunities, change original material or rewrite earlier days.
   - Gene targets are *potential*, not a license to paint fake anatomy.
   - No new chaos should be introduced until the deterministic, legible engine
     is functioning and independently qualified. Retained chaotic primitives
     are historical compatibility/numerical code; their existence does not
     override this design direction.
6. A pet's lifetime development is *ontogeny*, not breeding, offspring,
   species replacement, generational selection or literal phylogenetic ancestry
   migration. Fantasy overlays have explicit fictional provenance.

## Single production anatomy clock

The **only** player-authoritative physical material timeline is:

`createSimulation → createDailyMaterialTimeline → applyDailyMaterialStep`

Exactly one chance at `hatchAtMs + k × 86,400,000` for `k=1…365`.
Check zero is the original drawn material. Intervening care and physiology
are observed, but **never** generate cells between checks; gameplay animation
may pose source-owned material only. The 365th opportunity is final, after
which anatomy freezes but care and gameplay continue. No old hour-named API,
30-day lifespan, 30/75/120 stage marker or older 8,192-hour limit defines
live anatomy.

Physical operations must be source-conserving and independently auditable:
each accepted created/removed/moved cell, tissue, anatomical kind, link and
growth site needs chronological evidence, material provenance, valid spatial
bounds and a deterministic order. Null operations are allowed. Drawings,
permanent genes, and earlier care may never be silently replaced.

## Code owners: distinguish live from retained

| Purpose | Current owner |
|---|---|
| Drawing and explicit selected parts | `App.tsx`, `src/drawing.ts`, `src/simulation/source-atlas.ts` |
| Readable genes | `src/genetics/seed-language.ts` |
| Scientific + fictional reference graph | `src/phylogeny/`, `src/lineage/authored-neighbor.ts` |
| Birth material + lawful growth operations | `src/development/material-graph.ts`, `src/development/operators.ts`, `src/development/operator-chronology.ts` |
| Daily production physiology / anatomy | `src/environment/daily-care.ts`, `src/development/daily-step.ts`, `src/integration/daily-runtime.ts` |
| Current material source and replay audit | `src/development/anatomical-audit.ts`, `src/development/spatial-inventory.ts`, `src/development/material-journal.ts` |
| Player UI, pose and display | `App.tsx`, `src/simulation/growth.ts`; pose cannot author physical cells |

**Compatibility warning:** `src/simulation/development.ts`,
`src/simulation/metamorphosis.ts`, `src/simulation/regional-layout.ts`,
`src/simulation/morphogenesis.ts` and related modules retain some old
mathematical/pose/metadata responsibilities **and are currently imported**.
Their historic continuous warps, stage days and image-space silhouettes are
NOT independently authorized to create physical anatomy. Do not delete
imported compatibility modules without call-graph and test proof; do not
use them as a competing production growth engine.

The 36 retro drawings and historical morphology investigations are
**research fixtures only**, never runtime targets. The original sprites,
historical stage measurements and approved snapshots must not select creature
destinations. See [morphology/README.md](morphology/README.md) for historical
recovery only.

## Release gate and honest qualification

- The 365-opportunity result must replay exactly from saved ink + seed + care.
  Independently reconstructed cell events and negative conservation cases
  are mandatory. Never accept only a pretty screenshot or a metadata label.
- Demonstrate actual changes in whole-body proportion, topology, tissue
  allocation, structural specialization and life trajectories over
  independently generated unfamiliar drawings and multiple seed/care histories.
  Prevent a regression to mere thin tips, branches or cosmetic bulk.
- Show generated eyes, limbs and other specialist parts are **recognizable**
  and mechanically coherent, not merely carrying a `developedKind` string.
- Preserve original saved pets, handle corrupt checkpoints without inventing
  a history, and meet the independent memory/time budgets and browser tests.
  Manual real iPhone Safari usability remains a separate, necessary review.
- A draft PR or passing focused suite is **not live**. Merge and deployment
  require the full gates; check live deployed SHA rather than assuming it.

## Superseded guidance and historical evidence

Do not follow retired recipes for automatic anatomy recognition, mandatory
chaos-based species selection, forced adult silhouettes, 30/75/120-day
progression, 30-day lifespans, continuous/hourly anatomical mutations,
inferred limbs from protrusions, or legacy operator delta loops as the
player's development clock. Such references were intentionally removed from
active documents and tests but may remain in git history and low-level
compatibility code for independent mathematical replay.

The task register records any current implementation gaps. **Do not convert a
documented design requirement into a claim that the game already satisfies
it**. A single pixel may have any *potential*; its realized future still
requires genuinely source-owned, physically coherent operations.
