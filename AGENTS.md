# Infipet active game instructions

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
- This is an experimental prototype; do not introduce migration/backups or support for previous save versions without a request. Archived full history: `archive/pre-minimal-2026-10-25`.

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
- Growth within a pet is ontogeny; the OpenTree animal ancestry graph constrains possible developmental specializations. Plant ancestry is not implemented: do not label a guessed shape as belonging to a plant clade without a real bundled provenance-backed plant subtree.

## Canonical implementation checklist (required for every agent)

- **Single source of truth:** [roadmap/plan.json](roadmap/plan.json). Do not create parallel Markdown roadmaps, issue-only completion trackers or generated progress reports.
- Read dependencies and feature-specific acceptance criteria before working on a task: `node scripts/roadmap.mjs --task=OBS-001` (replace task ID).
- After a change, add or update the named, focused test with all acceptance markers `[TASK-ID/A1]`, `[TASK-ID/A2]`, etc. Run **only that test** with `node scripts/roadmap.mjs --task=TASK-ID --run` while iterating. No screenshots or visual snapshots as automatic acceptance evidence.
- Set status to `done` only after all its acceptance claims are asserted, the focused test passes and prerequisites are complete. The roadmap validator rejects unevidenced completion and cyclic/missing dependencies. CI executes validation and all focused tests.
- Update the JSON task in the **same commit** as implementation and its tests; keep task IDs stable, and use `in_progress` or `blocked` when unfinished. Avoid accumulating large report assets.

## Algorithm ownership and prototype-phase verification reset

- The `algorithms` array in `roadmap/plan.json` defines agent-owned write scopes, interface contracts, task IDs and readiness gates. Assign one algorithm owner per agent. Do not edit another owner's files without arranging a handoff; `App.tsx`, `src/simulation/growth.ts`, and `src/lineage/index.ts` are integration-owned shared surfaces.
- Keep CI deliberately small: roadmap integrity, TypeScript typecheck, **four focused numeric test files**. The publication workflow builds the web site once. The previous broad prototype suite was deliberately retired on 2026-10-25 and remains available in git history; do not restore en masse.
- New development gets exactly one narrow contract test per task or coherent algorithm behavior. Name it `tests/alg-<algorithm-id>-<feature>.test.ts`, register it in the JSON plan, and only add it to the lightweight `pnpm test` baseline when the behavior becomes a stable invariant. Do not invent general scans or generate screenshots.

- CI discovers test files from all `done` tasks automatically, plus `roadmap/plan.json` `baselineTests`; no separate per-task test list. Preview the exact gate with `node scripts/roadmap.mjs --verify-done --dry-run`. Keep completion evidence narrow; do not mark a task `done` until its named test is green.
