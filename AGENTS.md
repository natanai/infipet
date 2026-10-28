# Infipet active game instructions

## Real-time anatomical clock — mandatory production contract

**Authoritative machine-readable definition:** `roadmap/plan.json#anatomicalDevelopment`. The production path is `createSimulation` → `createDailyMaterialTimeline` → `applyDailyMaterialStep`. Historical hourly tests cover shared numerical primitives, never the live anatomical schedule.

- For a hatched/born living pet, let `T₀ = game.clock.hatchAtMs` (persisted safe-integer epoch milliseconds), and `Δ = 86,400,000 ms`. Exactly **365 anatomical check opportunities**, at `Tₖ = T₀ + kΔ`, integer `1 ≤ k ≤ 365`. Check 0 is original ink, not growth. Egg incubation precedes the hatch anchor.
- Physical material graph **must be unchanged** on every open interval `[Tₖ, Tₖ₊₁)`; animations, expression, pose and physiological updates are not material transactions. Never change cells, tissues, source/provenance, attachments or geometry on an arbitrary frame, hourly resource tick or fractional care-command time.
- One check consumes the exact previously recorded care window `[Tₖ₋₁,Tₖ)`. Events precisely at `Tₖ` govern the next window. Integrate samples and fractional commands causally, including valid absence effects, without inventing player care or assuming a future sample.
- Each daily physical step is deterministic and source-conserving: immutable authored ink, once-fixed genome/seed, explicit permissible growth/remodeling/resorption operations, numerical bounds, and actual care determine zero or more accepted material transactions. Null growth is legitimate. No stage sprites or forced novelty.
- Catch up missed days with all due check indices in chronological order, at most 365 *lifetime* checks; loading, clock rewinding, app reloads, previews and repeated frame queries must never double-apply a check. Cached snapshots and fresh-from-birth replay must agree in full physical event and identity inventory.
- Independently reconstruct spatial state from birth topology and per-operation journals, including explicit cell IDs and before/after coordinates, tissue/site/attachment changes and exact check timestamps. Counts or a final silhouette cannot prove relocation conservation. The producer journal is not the auditor. Never allow unrecorded physical property changes.
- Physiological sampling continues after maturity through a bounded canonical sufficient state; only anatomical evidence ends at 365. First-year evidence stays intact, later physiological changes and command receipts use bounded tails. Current care must reach actual player-frame wellbeing. Preserve exact save/reopen and batched/incremental equivalence; label unknown legacy intervals rather than fabricate care.
- The 365th check is the **last** physical development opportunity. After it, the same physical anatomy persists indefinitely while alive; care, need states, gameplay, locomotion and non-anatomical visuals may continue.
- The former **30-day forced lifespan** and **8,192-hour hourly physical-growth horizon** have been retired. Natural or care-related death may still end a creature's remaining checks early; healthy saved lives must be able to span 365 days or longer. Do not merely increase an hourly loop from 8,192 to 8,760.
- Times are 24 elapsed hours, not a midnight reset; DST, time-zone changes, and local-only clocks are addressed explicitly. Local offline time cannot be fully protected from device-clock manipulation without trusted external time.
- Daily APIs and mathematical contracts live in `src/development/daily-step.ts` and `src/environment/daily-care.ts`. The integration timeline is the only player physical authority. Shared primitives interpret one dimensionless tick as one opportunity; do not multiply it into 24 physical steps.
- Preserve bounded, history-verified checkpoints, exact fresh replay and source-derived functional rendering. Catch up missed checks in short UI work slices before committing a completed state. Follow the typed interfaces in `anatomicalDevelopment.sharedContract`.

## Single-creature evolution semantics — mandatory for every agent

- **Infipet simulates ONE continuously identifiable pet from its drawn birth to all later stages.** No breeding, reproduction, mate selection, offspring, parent genomes, heredity between pets, evolutionary generations, species populations or genetic recombination. Do not implement any of these.
- The real tree of life is a **reference map of branching anatomical possibilities**. A pet can progress through forms inspired or constrained by different branches during *its own lifetime*. This is the game's evolution-like metamorphosis, **not** a scientific assertion that one organism literally changes taxonomic ancestry, nor a simulation of intergenerational natural selection.
- A pet's **hidden seed and latent genome are assigned ONCE at creation**. They represent that particular creature's potential, not information received from virtual parents or transmitted to virtual children. Do not mutate or replace this genome in response to care.
- The drawing is the individual's source anatomy. Every stage continues the **same organism and material identity**; care, training, environment and time modify expressed anatomy, physiology and developmental route rather than producing a replacement pet.
- Taxonomic words such as *ancestor, descendant, inherited* apply to the **static scientific reference graph** or a creature's **fixed individual potential**, never to an implemented reproduction system.
- Read the normative machine-readable `singleCreatureLifecycle` in `roadmap/plan.json` before planning algorithmic behavior. Do not mark biological trait inheritance tasks as requesting reproduction; they concern information inherited **between reference taxonomy nodes only**.


- Primary goal: the player can draw **anything**, care for it, and see their particular drawing grow naturally. Arbitrary new shapes, retained source identity, coherent change, diverse outcomes and real care effects matter more than imitation of familiar retro sprites.
- All playable features belong to the current Expo application (`App.tsx`, `src/`). Do not add parallel prototype engines, character-specific morph templates, or hidden reference-target lookups.
- The only authoring surface is the shared 32 × 32 drawing canvas. No forced anatomy labels. Creation must be untimed and birth explicit.
- Separate independent preview/Lab state from a committed living pet. Preserve replay-deterministic time, seed, drawing, chronological care events, gameplay outcomes and ordinary reload saves.
- Do not add bulk generated audits, downloaded phylogeny files, retrospective screenshots, or run logs to `main`. Tests should cover current gameplay and growth behavior.
- Run typecheck, focused regressions and web export before publishing. Automated passes are not proof of visually convincing growth; review unfamiliar player drawings over complete lifetimes.
- Earlier saved lives remain unchanged and read-only with exact-byte recoverable backups, as requested by the daily migration contract. Never fabricate their past daily transactions or silently restart their birth. A new daily life requires the existing explicit replacement action. Archived full history: `archive/pre-minimal-2026-10-25`.

## Permanent Morphological Expressiveness Principle — mandatory

**Infipet must support a broad, independently verifiable space of anatomical transformations. No implementation may preserve physical correctness by reducing development to predominantly linear extensions, branches, or cosmetic changes.**

Developmental variety must emerge from the player's authored material, permanent genetic potential, deterministic chaotic processes, anatomical constraints, and chronological care.

The system must demonstrate genuine variation in whole-body proportions, topology, tissue distribution, structural specialization, and developmental trajectories, without predetermined creature outcomes.

An individual organism may legitimately remain unchanged or favor one developmental strategy. System-wide capability must not collapse to a narrow family of outcomes.

**This is as authoritative as source continuity, exact authored-ink fidelity, physical material conservation, and the 365-check chronological contract.** A physically valid slender branch is not automatically an expressive organism generator.

- Never restore a historical visual warp as material until independent journals prove exactly which source-linked cells were created, removed, relocated, fused, reattached or changed tissue. Pose/pigment-only differences must never count as physical morphology.
- Never satisfy variety by inserting target species, sprites, fixed silhouettes, named outcome classes, or unexplained matter. Preserve the mathematical inventions where possible; re-express them as physically accountable operators.
- Evaluate system-wide capability over independently characterized unfamiliar drawings, several immutable seeds, recorded care counterfactuals and the complete available lifetime. Preserve legitimate null outcomes for individual organisms.
- Measure independent area, proportions, local thickness, regional tissue allocation, topology, cavity preservation/creation, branch prominence, whole-body remodeling, anatomical provenance, and seed/care causal differences. Use independent structural oracles and reproducible counterexamples, not visual approval.
- The historical benchmark in `docs/morphology/` is **diagnostic, not production authority**. The historical display engine and the daily material engine have different clocks. Never equate legacy morphological stage-days to the exact 365 elapsed 24-hour material checks.
- `roadmap/plan.json#morphologicalExpressiveness` is normative and machine-readable. Its MORPH-001, MORPH-002 and MORPH-003 tasks remain explicit until recovery, physical implementation, and independent verification each pass their own acceptance contracts.

## Mathematical verification and deterministic chaotic dynamics — mandatory

Infipet should obtain vast morphological diversity from a **small, inspectable collection of general mathematical laws**, not from creature-specific templates, repeated screenshot comparison, or manual approval of individual outcomes.

- **Mathematical verification principle:** Every biological and developmental algorithm must specify inputs, outputs, equations/recurrences, invariants, numerical domain and limits, time-step semantics, and determinism assumptions. Each physical feature must be causally traceable to authored source material, immutable genetic potential, an explicit operator, and recorded conditions at or before the frame time.
- Prefer **deterministic nonlinear and chaotic dynamical systems** where they produce meaningful, bounded variation in development: branching orientations, growth rhythms, spatial patterning, oscillations, asymmetric remodeling, and sensitivity to prior care. Use shared generic operators and source-derived growth sites. Chaos controls expression **inside** anatomical/provenance constraints; it never independently invents new source cells, breaks attachments, changes the genome, chooses a species, or allows future care to rewrite the past.
- A chaotic system must declare its state vector, birth-seed initialization, recurrence/integrator, forcing by care, exact tick schedule, calculation order, numeric representation/rounding, state bounds, and overflow/non-finite handling. Real-number chaos and finite-precision implementations are **not identical**; digital orbits may cycle, collapse, or differ across numerical implementations. Do not promise limitless unique outcomes or cross-platform bitwise replay without proving the specific arithmetic contract.
- Evaluate any queried age deterministically from immutable birth state and the chronological input prefix, independent of call order, cache state, rendering order, or earlier age queries. Quantize only at specified boundaries. A change to a later event must leave all earlier frames mathematically unchanged.
- Verification must use **independently derived mathematical expectations**, small tractable reference implementations, invariants asserted across generated valid inputs, metamorphic transformations, and reproducible counterexamples. Seeded property-based tests help discover failures but are not a substitute for proving conserved source ancestry, valid attachments, bounded material/cost, and causal replay.
- Tests of structural behavior must compare source-traceable geometry and material topology, not merely colors, confidence scores, metadata, snapshot hashes, or visual appearance. Use manual play only for subjective feel and model refinement; never make manual screenshots the acceptance oracle.

## Seeded retro benchmark invariant

- Historical retro drawings are immutable **test references**, never runtime goals. Their bundled alphanumeric seeds are reproducible **unvalidated candidates**, not magic shortcuts to a named form.
- Gameplay morphology must be generated solely from authored ink, the seed-inherited genome, the phylogenetic prior, chronological care/training/battle, and clock. Never reference retro character names, IDs, target pixel masks, or stage sprite tables inside the morphology renderer or its gene compiler.
- Original-device evolution requires a **witness**: source drawing, particular seed, replayable player care commands or explicit history, stage timings, and independently measured resemblance at every checkpoint. No stage lookup or sprite interpolation counts as an algorithmic success. Treat ROM-derived P1 count predicates as constraints, not proof of live command replay.
- Growth within a pet is ontogeny. Bundled provenance-backed animal, plant and fungal reference graphs constrain possibilities. A guessed drawing affinity never establishes scientific ancestry.

## Canonical implementation checklist (required for every agent)

- **Single source of truth:** [roadmap/plan.json](roadmap/plan.json). Do not create parallel Markdown roadmaps, issue-only completion trackers or generated progress reports.
- Read dependencies and feature-specific acceptance criteria before working on a task: `node scripts/roadmap.mjs --task=OBS-001` (replace task ID).
- After a change, add or update the named, focused test with all acceptance markers `[TASK-ID/A1]`, `[TASK-ID/A2]`, etc. Run **only that test** with `node scripts/roadmap.mjs --task=TASK-ID --run` while iterating. No screenshots or visual snapshots as automatic acceptance evidence.
- Set status to `done` only after all its acceptance claims are asserted, the focused test passes and prerequisites are complete. The roadmap validator rejects unevidenced completion and cyclic/missing dependencies. CI executes validation and all focused tests.
- Update the JSON task in the **same commit** as implementation and its tests; keep task IDs stable, and use `in_progress` or `blocked` when unfinished. Avoid accumulating large report assets.

## Algorithm ownership and verification

- The `algorithms` array in `roadmap/plan.json` defines agent-owned write scopes, interface contracts, task IDs and readiness gates. If delegating, assign one write owner per agent and arrange handoffs; `App.tsx`, `src/simulation/growth.ts`, and `src/lineage/index.ts` are integration-owned shared surfaces.
- Keep CI focused: roadmap integrity, TypeScript typecheck and the currently registered algorithm acceptance tests. Web publishing and browser qualification are separate. Previously retired prototype tests remain available in history; do not treat old hourly benchmarks as proof of the new 365-check runtime.
- New development gets exactly one narrow contract test per task or coherent algorithm behavior. Name it `tests/alg-<algorithm-id>-<feature>.test.ts`, register it in the JSON plan, and only add it to the lightweight `pnpm test` baseline when the behavior becomes a stable invariant. Do not invent general scans or generate screenshots.

- CI discovers test files from all `done` tasks automatically, plus `roadmap/plan.json` `baselineTests`; no separate per-task test list. Preview the exact gate with `node scripts/roadmap.mjs --verify-done --dry-run`. Keep completion evidence narrow; do not mark a task `done` until its named test is green.
