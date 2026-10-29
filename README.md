# Infipet

Draw your own virtual pet and care for the **same organism** as it develops
over real time. No species sprites, predetermined evolution destinations,
breeding, or auto-recognition of what you drew.

**Player site:** https://natanai.github.io/infipet/

> **For development and agent work:** read [the current architecture](docs/ARCHITECTURE.md)
> and [AGENTS.md](AGENTS.md). [The canonical roadmap](roadmap/plan.json)
> tracks implementation and qualification; it is not a list of features
> already confirmed live. Open pull requests are **not deployed** until
> merged and the publishing workflow succeeds.

## Your drawing and the seed

The editor opens on a 32 × 32 drawing canvas with **Body** selected by default.
The player can deliberately select Eye, Arm, Leg, Wing and other anatomical
brushes. Those selected kinds, not the silhouette, color, holes, black spots,
symmetry or relative position, define the initial anatomical identity.

Drawing **only Body**, even a single pixel, produces undifferentiated,
pluripotent material with possibilities across the represented scientific
tree of life and the game's explicitly fictional extensions. No part or
ancestry is guessed. A part selected by the player remains independently
traceable through development; any new part must be physically formed out
of existing original material and a recorded growth operation.

The permanent seed is a reproducible genetic script, not an arbitrary
species identifier. Every A–Z letter has a defined meaning, and 0–9
numeric prefixes specify opportunities or dosage. For example, `2E3L`
proposes two possible Eye and three possible Leg development events,
**not a guarantee** that these will all physically form. The real/fantasy
tree influences their likelihoods. See the exact seed dictionary and
equations in [the readable seed specification](docs/genetics/readable-seed.md).

**Deterministic promise:** the same exact drawing and seed assign the same
permanent genetic potential. Given the same initial conditions and exact
chronological care, the organism develops exactly the same way in every
replay. Care can change what gets expressed but does not reroll the seed or
rewrite the past. **New chaotic equations are postponed** until the
deterministic system demonstrably supports varied, coherent transformations.
Historical chaotic primitives are not a compatibility obligation and may
be removed or replaced. They never supply the readable seed's hidden meanings.

## How time and care work

Each hatched pet has exactly **365 possible anatomical checks**, one every
24 elapsed real-time hours from the saved hatch timestamp. The original
drawing is day zero. Between completed checks, the authoritative material
graph does not change; care, needs, grooming and play animations can change
without secretly creating or deleting anatomy. Missed checks replay
chronologically on return. After check 365, the pet is fully grown and
anatomy stays fixed; care, gameplay and physiology can continue.

The physical graph and chronological journal must account for every
new, relocated, resorbed or fused cell, tissue, site and attachment.
Source material and explicit body-part identities must remain traceable.
A visually dramatic transformation without physical provenance is not
acceptable, but neither is a mathematically safe engine that only produces
thin tendrils or cosmetic thickness.

## Prototype developmental behavior

The currently drafted physical model introduces genetic specialization during
**early care**, rather than waiting approximately four months before trying
to produce an organ. The earliest accepted genetic bud can begin at daily
check 5; later opportunities are distributed across the year. Different
accepted letters can lead to different kinds of actual attached, connected
tissue. Generated eyes, mouths, wings and limbs can gain several cells in a
single lawful daily operation, instead of growing as one-pixel tendrils.
The whole organism remains source-owned; the player-authored part colors
are not overwritten, and only genuine new genetically developed tissue
receives an inheritable contrasting pigment.

For whole-body metamorphosis, the physical growth system now uses **five
seed-fixed, 73-day allometric phases** with care-sensitive regional width and
height preferences. Separate source-owned repatterning events can physically
move the creature's existing material at five points during its first year,
rather than merely paint a bigger silhouette. The original physical identity,
part labels and timing remain intact. Newly formed Eyes, Wings and other typed
tissues keep their own mechanical shape preferences through subsequent daily
growth, instead of becoming ordinary tendrils during a body-wide change.

These mechanics establish more forms of *possible* transformation, not an
already proven dramatic or attractive evolution path. Every physically blocked
operation may correctly do nothing; actual life results need player testing.

This is still an **experimental draft, not a demonstrated fun or visually
convincing virtual pet**. More coherent whole-body restructuring and
care-game feedback are priorities. Changes reach the player website only after main is published.
No automatic CI, browser or numerical qualification workflows
run while the prototype is being made playable.

## Player experience

Normal play includes drawing, **Begin life**, feeding, cleaning, sleep,
medicine, discipline, training, battles, and care-game feedback. The
small top-right control opens optional Development Tools for seeds,
chronological previews, physical morphology tuning, diagnostics and
test scenarios. Previews must not modify a saved living pet. Editable
starter drawings are *inputs for testing or creative starts*, never
species templates or adulthood targets.

**Current implementation caveat:** some UI controls, including the
starter-gallery placement, may differ from the intended compact
handheld-inspired design while the new architecture is qualified. A
description of an existing control is not a directive to preserve an
outdated layout. In particular, the intended startup is the drawing pad,
with developer fixtures kept secondary.

Saves are automatic. The app supports portable JSON export and import
through the player menu. This game is **unreleased** and supports only its current prototype save
format. Old prototype files are rejected, not migrated or kept read-only.
A current pet can still be exported and imported, and replacing the current
pet remains an explicit player action. Export before clearing browser storage.

## Early playable prototype workflow

**Current priority: make the pet worth playing.** Draw any creature, start
a life, care for it, and see compelling, anatomically meaningful changes
driven by the drawing and fixed seed. Do not spend iterations maintaining
verification infrastructure while core growth is still unsatisfying.

Requires Node.js 22+ and pnpm 10. Start locally:

```sh
pnpm install --frozen-lockfile
pnpm web
```

The development web app opens at http://localhost:8081; on Windows the
`Start-Infipet.ps1` helper is available.

**Continuous integration is intentionally off.** GitHub Actions no longer
runs automatic typechecks, test suites, scientific morphology benchmarks,
browser tests, memory budgets or documentation checks on pushes or PRs.
The only remaining workflow, `Publish Infipet`, builds the web app and
deploys it when a change reaches `main` (or via manual dispatch).
A successful export is only a deployable build, **not** proof that the
pet has good gameplay or visually coherent growth.

When a particular technical defect calls for it, developers may manually
run `pnpm typecheck`, a small `tsx --test` reproduction, `pnpm test`
or `pnpm test:ui`; **none is a mandatory development or publish gate**.
The historical benchmarks and numerical budgets remain reference material
for later optimization, not obstacles to the first genuinely enjoyable pet.
Player-visible behavior, especially on mobile Safari, has priority.

## References, historical research and what not to follow

- [Current architecture and authority](docs/ARCHITECTURE.md)
- [Permanent agent instructions](AGENTS.md)
- [Canonical development roadmap](roadmap/plan.json)
- [Readable seed code and mathematics](docs/genetics/readable-seed.md)
- [Historical morphology recovery](docs/morphology/README.md), **diagnostic only**
- [Player action and animation follow-up](docs/ux/animation-action-contract.md)

The older continuous silhouette compositor, 30/75/120-day stage timings,
8,192-hour growth horizon, automatic face/appendage geometry inference and
hourly operator-exposure examples **do not define the production rules**.
Some historical modules are still imported by current pose/render paths and
must be **refactored out**, not retained for backward compatibility. Removal
requires proving the current renderer and deterministic physical ledger work
without them; no unreleased save migration is required. Historical reference drawings and experiments
must never become fixed creature destinations or genetic lookup sprites.
