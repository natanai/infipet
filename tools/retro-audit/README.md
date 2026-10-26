# Causal retro lifecycle litmus

The benchmark asks whether the ordinary Infipet algorithm can generate a complete observed retro path from its starting drawing, one ordinary seed and real care commands. Future sprites, character identities, paths and target metrics never enter the simulation recipe. A benchmark is allowed to fail.

`data/retro-reference/catalog.json` supplies separately sourced targets and reference edges. `src/retro` supplies editable starting drawings. A full lifecycle starts only at a device's root drawing; selecting an adult as a drawing does not prove that the root can evolve into it.

```powershell
node node_modules/tsx/dist/cli.mjs tools/retro-audit/run.ts list
node node_modules/tsx/dist/cli.mjs tools/retro-audit/run.ts search --seed-count 4 --policies all --out docs/audits/life-v9/retro/cohort-002 --publish-app
node node_modules/tsx/dist/cli.mjs tools/retro-audit/run.ts verify --out docs/audits/life-v9/retro/cohort-002 --publish-app
```

The neutral SHA-256 seed cohort is shared across every device/path. `--seed-start`, `--seed-count` (1–1024), `--path` and `--limit` make the budget explicit. Default search uses four seeds and three timely-care policies; the longer command includes delayed care, overfeeding, interrupted sleep and low-training battle care. Each policy reads ordinary meters and flags, generates concrete `GameCommand` records, and never reads hidden minigame answers or target artwork. Training entries are real starts followed by cancellations, matching the current gameplay rule. Battles use their ordinary seeded outcomes.

The core replay consumes only source parts/mode, seed, explicit clock and concrete commands. The app's browser-safe replay helper is tested against that same ordinary game state. Cached game traces can be shared between drawings because gameplay is currently independent of anatomy; each source is independently rendered. Changing target artwork cannot change a generated frame.

## Scoring

Each root-to-terminal path is evaluated coherently with one recipe. Every checkpoint records its actual reached stage, alive/dead state, V1 branch slot where applicable, source identities, final-composite facial visibility, explicit animation time and image hash.

Monochrome comparison centers the actual and reference ink and applies uniform scale. A one-pixel translation corrects sampling quantization. There is no rotation, reflection, independent axis scaling, per-part alignment or stage-specific drawing replacement. Internal holes remain significant. Candidate gates require at least 90% ink IoU, 94% filled-body IoU, 94% aspect similarity, 90% density similarity, and matching connected-component/hole counts. These are declared benchmark thresholds, not validated perceptual equivalence.

The worst stage governs whole-path resemblance; a close adult cannot hide an unrelated intermediate. Birth identity compares the exact flattened pixels and colors after the fixed 16-cell canvas-to-world translation; that check permits no scaling or extra translation. Source/face checks must pass, and the real game must reach each stage alive. Digital Monster paths must also earn the matching existing V1 branch slots. Scores describe only the sampled recipes; a failed bounded search does not prove that no seed exists.

Missing targets remain unavailable. Undocumented care is not certified by an image match. The tool can retain visual distance for diagnosis while marking care parity unscored. Current checkpoints use the combined game's 0/1/49/121/193-hour schedule; original Tamagotchi timing remains a separate comparison. No report asserts hardware parity.

The highest automatic status is `candidate-needs-visual-review`. No machine score grants human acceptance. Reports show failures and unavailable paths as well as the closest sampled candidate.

The current path definition follows a root to its last listed form in the reference graph. It does not enumerate every mortality outcome or every optional adult-retained ending. Adults are compared as intermediate stages, but an adult prefix is not presented as proof of an entire life. `gameEligible` separately records whether the current combined game reached every checkpoint alive, preserving source/face identity and matching V1 branch slots when available; it does not certify original Tamagotchi care or timing.

## Artifacts

- `manifest.json`: complete current runtime/validation source-file coverage and composite SHA-256, engine and needs versions, thresholds, cohort budget, input/output hashes and limits.
- `reference-catalog.json`: frozen source provenance, reference targets and graph snapshot for this run.
- `cases.json`: audit-only target/checkpoint definitions, separate from renderer recipes.
- `witnesses/`: source, seed, clock and concrete care commands only.
- `summary.json`: path/checkpoint outcomes, including the weakest stage.
- `sheets/` and `index.html`: reference versus generated normalized ink, plus the actual unscaled 64-cell world.
- With `--publish-app`, summary and deduplicated recipes are written to `src/retro/audit-summary.json` and `src/retro/witness-data.json` for inspection. Separate per-checkpoint pixel checksums let the app detect a stale display without putting target data inside a recipe.

`verify` checks pinned code and artifact hashes, replays every saved witness, and recomputes scores. With `--publish-app`, it republishes these verified captures without repeating seed search or modifying the frozen archive. A failed or unscored path stays failed or unscored after successful reproducibility verification. Sprite provenance and uncertain care rules remain in the separate reference catalog.
