# Infipet active game instructions

- Primary goal: the player can draw **anything**, care for it, and see their particular drawing grow naturally. Arbitrary new shapes, retained source identity, coherent change, diverse outcomes and real care effects matter more than imitation of familiar retro sprites.
- All playable features belong to the current Expo application (`App.tsx`, `src/`). Do not add parallel prototype engines, character-specific morph templates, or hidden reference-target lookups.
- The only authoring surface is the shared 32 × 32 drawing canvas. No forced anatomy labels. Creation must be untimed and birth explicit.
- Separate independent preview/Lab state from a committed living pet. Preserve replay-deterministic time, seed, drawing, chronological care events, gameplay outcomes and ordinary reload saves.
- Do not add bulk generated audits, downloaded phylogeny files, retrospective screenshots, or run logs to `main`. Tests should cover current gameplay and growth behavior.
- Run typecheck, focused regressions and web export before publishing. Automated passes are not proof of visually convincing growth; review unfamiliar player drawings over complete lifetimes.
- This is an experimental prototype; do not introduce migration/backups or support for previous save versions without a request. Archived full history: `archive/pre-minimal-2026-10-25`.
