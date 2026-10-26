# Infipet active game instructions

- Primary goal: the player can draw **anything**, care for it, and see their particular drawing grow naturally. Arbitrary new shapes, retained source identity, coherent change, diverse outcomes and real care effects matter more than imitation of familiar retro sprites.
- All playable features belong to the current Expo application (`App.tsx`, `src/`). Do not add parallel prototype engines, character-specific morph templates, or hidden reference-target lookups.
- The only authoring surface is the shared 32 × 32 drawing canvas. No forced anatomy labels. Creation must be untimed and birth explicit.
- Separate independent preview/Lab state from a committed living pet. Preserve replay-deterministic time, seed, drawing, chronological care events, gameplay outcomes and ordinary reload saves.
- Do not add bulk generated audits, downloaded phylogeny files, retrospective screenshots, or run logs to `main`. Tests should cover current gameplay and growth behavior.
- Run typecheck, focused regressions and web export before publishing. Automated passes are not proof of visually convincing growth; review unfamiliar player drawings over complete lifetimes.
- This is an experimental prototype; do not introduce migration/backups or support for previous save versions without a request. Archived full history: `archive/pre-minimal-2026-10-25`.

## Seeded retro benchmark invariant

- Historical retro drawings are immutable **test references**, never runtime goals. Their bundled alphanumeric seeds are reproducible **unvalidated candidates**, not magic shortcuts to a named form.
- Gameplay morphology must be generated solely from authored ink, the seed-inherited genome, the phylogenetic prior, chronological care/training/battle, and clock. Never reference retro character names, IDs, target pixel masks, or stage sprite tables inside the morphology renderer or its gene compiler.
- Original-device evolution requires a **witness**: source drawing, particular seed, replayable player care commands or explicit history, stage timings, and independently measured resemblance at every checkpoint. No stage lookup or sprite interpolation counts as an algorithmic success. Treat ROM-derived P1 count predicates as constraints, not proof of live command replay.
- Growth within a pet is ontogeny; the OpenTree animal ancestry graph constrains possible developmental specializations. Plant ancestry is not implemented: do not label a guessed shape as belonging to a plant clade without a real bundled provenance-backed plant subtree.
