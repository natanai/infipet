# Life-v10 automated verification

Verified on **October 25, 2026** against the life-v10 code at commit `1469fc4d8f8f98be21a7c13ac602ce69ed9a67a7` ([successful GitHub Actions run](https://github.com/natanai/infipet/actions/runs/40254555810)). The two regression-test corrections were subsequently merged into `main` as `f9162ce29faf81ef03e8827158a4913f2572774d`; neither changed runtime code.

| Check | Outcome |
| --- | --- |
| Locked dependency installation | Passed |
| Repository file-count, bulk-audit and GitHub size guard | Passed: 1,077 tracked files, including 207 audit files (~11.41 MB) |
| TypeScript (`pnpm typecheck`) | Passed |
| Complete automated regression suite (`pnpm test`) | **458 tests: 457 passed, 0 failed, 1 skipped** |
| Web JavaScript export (`pnpm build:web`) | Passed; bundling only |
| iOS JavaScript export (`pnpm build:ios`) | Passed; bundling only |

## What this establishes

The cleaned repository retains the current app's compilation path and its automated regression coverage. The suites include ordinary drawing-to-frame simulation, persisted live game state, gameplay commands, deterministic growth, source and face continuity, and retro reference comparison. The previous two failures were caused by assertions against historical behavior: face pigment is allowed to adapt for local contrast, and audit training now uses ordinary fixed-choice rounds rather than canceling immediately. The new tests check the visible composite at the feature's actual coordinates and prohibit target-aware training choices.

## What this does **not** establish

- **Convincing growth from arbitrary drawings has not been visually accepted.** Formal checks cannot establish recognizable, surprising full-life morphologies across many unfamiliar player drawings.
- **No complete near-exact vintage lifecycle has been demonstrated.** Passing code tests does not mean the original reference forms or branches are reproduced visually.
- The **raw phylogeny validator was not run** in this workflow. `data/phylogeny/nodes.jsonl` is intentionally absent from GitHub; the runtime imports the compact catalog. Full offline checks require rebuilding the complete raw dataset.
- **No signed iOS app, physical iPhone test, WidgetKit scheduling test, or hands-on browser interaction** is covered by this CI run.
- GitHub's archive branch retains old generated output. Removing output from the working tree does not remove it from the historical Git object database.

## Next acceptance work

For the game's central promise, retain a fixed, diverse set of non-reference player drawings (solid/hollow, sparse, asymmetrical, multi-part, disconnected, and feature-only). Capture deterministic frames across complete lifetimes with the same seed and multiple ordinary care histories. Verify source continuity, local facial visibility, morphological variation, gameplay survival and save/replay accuracy independently. Review the frames themselves; preserve negative examples, not only pass counts.

The [official goal](GOAL.md), [repository maintenance record](REPO-MAINTENANCE.md), and [historical life-v9 report](VERIFICATION.md) remain separate sources of context. This report covers **automated life-v10 verification only**.
