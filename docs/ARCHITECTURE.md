# Infipet architecture — current contract

This is the short technical entrypoint for the **current single-pet game**.
[roadmap/plan.json](../roadmap/plan.json) is the machine-readable task register;
[AGENTS.md](../AGENTS.md) supplies agent-specific invariants. Read these **before**
historical research or retired engine modules. A passing historical benchmark,
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
     are historical numerical code slated for removal when no longer imported; their existence does not
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

## Experimental whole-body changes (not yet visually qualified)

Production physical material growth now uses five seed-derived 73-opportunity
regional allometry phases. Chronological care can influence the expressed
aspect-ratio pressure without rerolling permanent genes. Existing physical
source material can also participate in five scheduled coordinated
repatterning windows, which must journal actual cell relocation and source
seam replacements. A typed organ still uses its original brush identity or
a physically generated `developedKind` for mechanical shape preferences
during every later region-growth opportunity, not merely its first bud.
All material boundaries remain governed by existing spatial and ancestry
auditors; no image/silhouette transformation is substituted.

On the unmerged v10 development branch, source-owned material has
three further physically committed remodeling choices:

- A selected, attached organ may execute a seeded 90-degree rotation about
  its live joint, with every moved cell checked against the pre-event joint.
- An independently authored Body-only or typed tissue can undergo a
  conservative median-band slip: one side shifts by a lattice unit while
  the opposite side stays in place, with no created or removed material.
- A sufficiently broad tissue can undergo opposing-band bending: the two
  perimeter thirds shift in opposite directions and the intervening bridge
  stays put. This changes internal relative source-cell distances, without
  fabricating new organs or adding bulk.

These are distinct, explicitly genetically scheduled, care-gated physical
transactions, with pre-event independent audit reconstructing the exact
affected cell IDs and coordinates.

**Finite genetic scheduling budget:** The lifetime registry permits 64
remodeling operations. The six largest qualifying source tissues previously
spent 48 slots on local growth/remodeling, leaving only 11 after five
organism-wide repatterning waves. Functional succession could exhaust those
slots before a single multi-stage physical organ turn was scheduled.
For up to four qualifying tissues, retain the full eight local operation
families per region. For five or six, retain four non-additive regional
developmental stages and resorption for every selected tissue, while only
the largest also gets local extension and reinforcement (ordinary daily
growth already offers those). This changes the pre-topology worst-case
operation count to `8n+29` for `1≤n≤4`, or `5n+31` for `5≤n≤6`,
counting all five whole-body waves, twelve functional operation slots
and twelve rotating-joint stage slots. Both expressions are at most 61.
An independently executed 48-trajectory, 365-day cohort revealed a
specific late-stage failure: only **5/48** trajectories showed non-additive
structural transformation from day 330 to 365, below the declared 25% gate.
The v10 compiler now reserves **one** additional primary-tissue slip ticket
across days 330..364 (12 care-gated opportunities) before optional topology
tickets. The operation must vacate actual source-owned material coordinates,
and may still reject on collision, feature continuity or insufficient care.
This adds no pixels, species templates, or fabricated organs.

The genome compiler then assigns **up to three** additional bounded
reattachment opportunities to originally attached tissues with an existing
alternative mechanically plausible host, subject to the remaining slots. A legal reattachment must
establish a *new* physically touching parent joint, may not create cycles,
must preserve every existing source cell, and is independently reconstructed
from prior contact geometry. Thus even the maximal program remains ≤64.
No physical outcome is guaranteed: genetic, care, collision and anatomical
continuity constraints still independently determine which proposals commit. The five original repatterning wave
organizers also now choose shearing more often than outward expansion.
This is a source-general implementation experiment, not evidence of visually
complete stage evolution. Focused tests have been added but have not yet been
executed in a production-capable runner, and this branch is not published.

### Attachment-coupled physical movement (implemented on v10 draft; unqualified)

A local tissue transformation can pass a small endpoint tolerance while
leaving its separately authored, attached descendants behind. That is not
adequate to transform a head with independently drawn eyes or to rearrange a
multi-limbed body. The v10 experimental operator carries the complete
attachment subtree atomically, **without inferring new anatomy or rewriting
source part identities**:

- For a live parent attachment cell `a`, let `d(a)=a_after-a_before`.
  During a regional slip or counterbend, every cell of a child tissue whose
  attachment endpoint is `a` follows `p_after=p_before+d(a)`. The
  dependent rigid translation recurses through downstream attachments. A
  stationary attachment anchor produces no dependent translation.
- For a 90-degree rotation about the original joint `q`, the parent and all
  connected subordinate cells must use the SAME rigid transform
  `(x',y')=(q_x-s(y-q_y),q_y+s(x-q_x))`, `s∈{-1,+1}`. That
  preserves the authored arrangement of eyes and subordinate appendages
  relative to their head/host.
- All affected permanent cell IDs are reported in one transaction; the
  independent daily auditor must independently derive the complete
  transitive attachment closure from the **pre-event graph**. Do not permit
  arbitrary foreign-tissue relocation or silently detach attachments.
- Validate unchanged source ancestry, paint, tissue ownership and cell count,
  distinct declared feature identities, physical attachment contact,
  protected cavities, world bounds, lattice tissue connectivity, and illegal
  overlaps or newly unauthorized foreign-tissue contacts. Any failure is
  an atomic null, never a partial or merely visual morph.

**Implementation only, not verified.** The producer implementation and the
independent chronological replay reconstruct attachment-closure positions from
different code. A nested Body -> Head -> Eyes -> Pupil regression checks actual
carried geometry, distinct authored identities and rejection of a missing child
relocation. This test has been committed but has **not been executed** in a
project-capable TypeScript runner; broader stage coverage is still unqualified.
The draft source is not the published player experience.

These are **real implementation changes on the draft**, not evidence that
the live or deployed game is visually satisfying. The prototype currently
has no automatic CI verification or browser checks by explicit user choice;
keep mathematical contracts and targeted debugging available without
treating their presence as a requirement to delay the core game.

## Code owners: distinguish live from retained

| Purpose | Current owner |
|---|---|
| Drawing and explicit selected parts | `App.tsx`, `src/drawing.ts`, `src/simulation/source-atlas.ts` |
| Readable genes | `src/genetics/seed-language.ts` |
| Scientific + fictional reference graph | `src/phylogeny/`, `src/lineage/authored-neighbor.ts` |
| Birth material + lawful growth operations | `src/development/material-graph.ts`, `src/development/operators.ts`, `src/development/operator-chronology.ts` |
| Seed-fixed and care-expressed physical allometry | `src/development/regional-regulation.ts`, `src/development/morphological-fields.ts`, `src/development/iterative-chronology.ts` |
| Whole-body journaled strain / physical remodeling | `src/development/lifetime-remodeling.ts`, `src/development/developmental-strain.ts` |
| Actual typed-tissue growth preferences | `src/development/specialization-front.ts` |
| Daily production physiology / anatomy | `src/environment/daily-care.ts`, `src/development/daily-step.ts`, `src/integration/daily-runtime.ts` |
| Current material source and replay audit | `src/development/anatomical-audit.ts`, `src/development/spatial-inventory.ts`, `src/development/material-journal.ts` |
| Player UI, pose and display | `App.tsx`, `src/simulation/growth.ts`; pose cannot author physical cells |

**Refactoring target, not a backward-compatibility contract:** `src/simulation/development.ts`,
`src/simulation/metamorphosis.ts`, `src/simulation/regional-layout.ts`,
`src/simulation/morphogenesis.ts` and related modules currently contribute some old pose/metadata mathematics
and **are still imported by the active renderer**. This is technical debt,
NOT an excuse to preserve the old engine or accommodate nonexistent old saves.
Refactor their current responsibilities into the deterministic material and
presentation system and delete the unused remainder after live-import and
focused-test verification. Historic continuous warps, stage days and
image-space silhouettes are NOT authorized to create physical anatomy.

The 36 retro drawings and historical morphology investigations are
**research fixtures only**, never runtime targets. The original sprites,
historical stage measurements and approved snapshots must not select creature
destinations. See [morphology/README.md](morphology/README.md) for historical
recovery only.

## No unreleased compatibility requirement

Infipet has not released. **There are no existing player pets to migrate.**
Do not implement legacy pet recovery, read-only older-life screens, old growth
clocks, old identity bridges or hypothetical save-version migrations. Only the
current `life-v11` prototype file format is supported. A corrupt or obsolete
import is rejected clearly rather than reinterpreted; successful current-format saves
still require exact replay, checksum validation and reliable export/import.
Old source files may be deleted once current usages are removed and the
mathematical contracts are independently verified. Git history preserves
research without shipping it as a parallel engine.

## Pre-release priority: real playability, not automated gates

The current game is not yet satisfying enough to justify mandatory CI,
performance qualification or full numerical suites on every commit.
The user explicitly requested removing those checks. **Do not reintroduce
a CI or test gate until the user asks for one.**

- Implement the player-visible core: draw, hatch, feed, clean, play, return,
  and see an original creature **actually** change in coherent ways.
- Make generated eyes, limbs, wings and other specialized parts recognizable
  and grounded in the physical ledger, not merely labeled in metadata.
- Preserve the **mathematical design invariants**: same source + seed + care
  means same organism; 365 daily changes maximum; source-owned operations;
  no geometry-based semantic inference, fixed species destinations or unseen
  spontaneous material. Test an individual defect manually when necessary.
- Prioritize real phone usability and visible growth breadth before performance
  tuning or large unknown-drawing cohorts.
- `.github/workflows/deploy.yml` is the **sole** remaining workflow:
  push/merge to `main` or manual dispatch builds and publishes the web app.
  No typecheck, test, browser or memory benchmark runs automatically.
- A branch or open PR is not live; verify the deployed revision after
  publication. A successful build is not a quality certificate.
- Retain manually runnable tests and benchmark sources for later independent
  mathematical qualification. They are tools, not a queue of blockers.

## Superseded guidance and historical evidence

Do not follow retired recipes for automatic anatomy recognition, mandatory
chaos-based species selection, forced adult silhouettes, 30/75/120-day
progression, 30-day lifespans, continuous/hourly anatomical mutations,
inferred limbs from protrusions, or legacy operator delta loops as the
player's development clock. Such recipes are not active instructions. Retained source is subject to
refactoring or deletion; git history can preserve research without keeping
obsolete runtime paths. No backward-compatibility requirement exists for
the unreleased prototype.

The task register records any current implementation gaps. **Do not convert a
documented design requirement into a claim that the game already satisfies
it**. A single pixel may have any *potential*; its realized future still
requires genuinely source-owned, physically coherent operations.
