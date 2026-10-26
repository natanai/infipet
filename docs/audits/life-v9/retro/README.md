# Retro lifecycle litmus: current result

[Cohort 002](cohort-002/index.html) is the current replay-verified report for `life-v9`, gameplay 2 and `morphogenesis-v1`. Its immutable manifest lists all 36 hashed runtime/validation files, needs versions, a frozen reference catalog, concrete witness commands and frame hashes.

The bounded search compares four shared neutral seeds and 15 ordinary care routines across 25 root-to-last-listed reference paths. This is 1,500 path comparisons using **180 distinct source/seed/care recipes**, not 1,500 independent seeds. Eighteen winning recipes are shared by the app's 25 inspectable paths.

- All 10 Digital Monster V1 paths earn their matching current game branch slots through actual care, training, interrupted sleep and CPU battles.
- The nine P1 and six P2 paths reach every corresponding combined-game stage alive. This does not establish original Tamagotchi care predicates, branch choices or timing.
- Every winning path retains source/face identity; birth requires exact flattened pixels and colors at the fixed canvas-to-world translation.
- **No near-exact morphological path is established.** Nineteen scored paths fail; their weakest-stage ink IoU ranges from 14.13% to 27.65%, below the 90% gate. No path is a machine candidate or visually accepted.
- Eleven P2 targets have uncertain original-device edition provenance. Their six paths remain unscored even though the drawings and ordinary gameplay replays are available. There are 25 scored reference forms and 11 provisional forms across the 36 drawings.

The contact sheets expose the main current limits: filled starting bodies do not become the outlined intermediate forms, and generated appendages/body proportions do not reproduce the later detailed forms. Exact starting artwork and correct game counters therefore do not demonstrate an exact growth path. Missing care evidence and original-device timing remain separate unresolved gates.

The graph follows a root to its last listed form. It does not enumerate every mortality outcome or optional adult-retained ending. The report samples one neutral reference pose per available character, not complete reference animations. A bounded failure does not establish that every possible seed fails.

Recheck the frozen result without rerunning search:

```powershell
node node_modules/tsx/dist/cli.mjs tools/retro-audit/run.ts verify --out docs/audits/life-v9/retro/cohort-002 --publish-app
```

`cohort-001` is a historical preliminary report from before the enclosure correction and the expanded source-hash, needs-version and exact-birth gates. It is not the current verified build. Neither report claims hardware parity, signed iOS, physical-device or widget validation.

Hash definitions: `manifest.catalogHash` is SHA-256 of `JSON.stringify(parsedCatalog)`, preserving parsed property order while removing formatting whitespace. `manifest.files[].sha256` hashes exact file bytes, including the frozen snapshot's formatting. The current source catalog and frozen snapshot therefore have the same parsed-content hash and different byte hashes. The engine hash combines each listed relative source path and its exact bytes in sorted path order.
