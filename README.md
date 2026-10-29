# Infipet

Draw your own virtual pet and care for the **same organism** as it develops
over real time. No species sprites, predetermined evolution destinations,
breeding, or auto-recognition of what you drew.

**Player site:** https://natanai.github.io/infipet/

> **For development and agent work:** read [the current architecture](docs/ARCHITECTURE.md)
> and [AGENTS.md](AGENTS.md). [The canonical roadmap](roadmap/plan.json)
> tracks implementation and qualification; it is not a list of features
> already confirmed live. Work in open PRs, including draft PR #55, is **not
> deployed** until it merges and the publishing workflow succeeds.

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
Older chaotic numerical primitives remain for compatibility, not as the
new seed language.

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
through the player menu. Older-format lives and their original timestamps
are preserved read-only with recovery backups rather than being assigned
fabricated past development; a new life starts only after explicit
replacement. Do not clear website storage without first exporting a pet.

## Local development

Requires Node.js 22+ and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm web
pnpm typecheck
pnpm test
pnpm build:web
```

The development web app opens at http://localhost:8081; on Windows the
`Start-Infipet.ps1` helper is available. Hosted builds use
`INFIPET_BASE_URL=/infipet`.

For browser qualification:

```sh
INFIPET_BASE_URL=/infipet pnpm build:web
pnpm exec playwright install chromium
INFIPET_BASE_URL=/infipet pnpm test:ui
```

For independent full-life and performance qualification, consult
`tests/development-budget.test.ts`, `tests/development-cohort.test.ts`,
`tests/development-quality.test.ts` and the canonical roadmap. The
release gate includes typecheck, mathematical and property-based
conservation checks, replay parity, save/reopen, the complete 365-check
trajectory, browser flows and **real iPhone Safari** legibility. An
individual's legitimate null growth is not a system-wide variety pass.

Reference Linux/Node **budgets**, not published passing measurements:

| Scenario | Limit |
|---|---:|
| Ordinary update p95 | 33.33 ms |
| First daily check | 150 ms |
| Cold replay of 365 checks | 8,000 ms |
| Saved mature checkpoint reopening | 1,500 ms |
| Serialized canonical state | 8 MiB |
| Isolated process RSS | 768 MiB |

Passing tests is necessary but does not prove that user-drawn anatomy
is visually coherent. The current draft work is not ready to deploy until
its remaining qualification checks succeed.

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
Some legacy modules are still imported for derived pose and compatibility.
Removing them requires proof that neither live imports nor saved-pet
reconstruction need them. Historical reference drawings and experiments
must never become fixed creature destinations or genetic lookup sprites.
