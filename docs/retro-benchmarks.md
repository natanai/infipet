# Retro lifecycle litmus

This is a coverage test for the shared procedural engine. A copied starting drawing is permitted. Every later form must come from that drawing, an ordinary seed and recorded gameplay care. A preset that looks like its own birth image demonstrates only source reconstruction.

The initial corpus records 36 forms from the international 1997 Digital Monster V1 and original English Tamagotchi P1/P2. Source availability and edition confidence are separate from roster coverage. See [reference provenance](retro-reference-sources.md) and the [raw catalog](../data/retro-reference/catalog.json).

## Use it in Infipet

**New pet → Retro reference drawings** opens the searchable source library. Every available form becomes editable ink on the existing shared canvas. Choosing an adult reference as a new drawing starts a new Infipet life; it does not prove that an earlier baby can generate that adult.

**More → Lifecycle litmus** shows the latest measured whole-path search. Choose a path and then a stage to compare the original reference with a freshly replayed generated frame. The viewer reconstructs the game from the witness's drawing, seed, explicit clock and concrete care commands. It does not display a stored generated sprite as the simulation.

The starting-drawing button copies only the drawing and seed into the Lab. Recorded care remains visible in the witness recipe; it is not silently applied to the living pet. The living pet's source and earned history remain independent.

## Evidence contract

- Full-path cases start at the device's earliest baby. A late-stage source preset cannot substitute for that beginning.
- The same source, seed and chronological command history must pass every checkpoint. A collection of unrelated successful adults is not a lifecycle witness.
- Care is executed through normal `createGame`, `advanceGame` and `commandGame` calls. Training, wins, care mistakes and stage commitments are earned; no counter or stage override is accepted.
- Seeds come from one shared neutral enumeration across devices and paths. There are no target names, target pixels or encoded pose programs in seed construction.
- The normal renderer accepts only source anatomy, seed, derived needs, reached-stage context, age and explicit animation time. It cannot import the reference catalog or identify a desired character.
- Reference masks enter only the scorer and comparison UI. Future-stage source drawings in the gallery are available only when explicitly selected as a new starting drawing.
- Witness validation rejects endpoint masks, supplied stage summaries, extra controls, out-of-order events and unknown rule versions. The browser-safe replay is tested against the audit replay.

The source presets have generic part identifiers. Small enclosed-hole eye/mouth brush hints are inferred from the starting drawing alone. They add no later anatomy, invisible appendages or hidden future layers.

## What is measured

The score reports each stage's foreground overlap, filled silhouette, proportions, density, connected components and holes. Alignment permits translation and uniform scale, not rotation, nonuniform warping or replacement of material. The near-exact machine gate requires at least 90% ink overlap, 94% filled-silhouette overlap, 94% aspect similarity, 90% density similarity, and compatible topology. The weakest stage controls the path gate; the mean is diagnostic.

Birth artwork, source lineage, visible facial material, survival and the reached game stage are independent gates. For V1 paths, the actual earned branch slot is also compared. A gameplay route can therefore be earned while its anatomy fails badly. P1/P2's original care predicates and clocks remain separately qualified; reaching the combined Infipet stage schedule is not original-firmware parity.

Missing or edition-uncertain targets remain unscored. Unknown care requirements cannot be converted into evidence by averaging other stages. Even a machine candidate still needs image review; the tool never invents human acceptance.

Cases currently enumerate root-to-last-listed-form paths. They do not enumerate every death or optional adult-retained outcome. An adult failing to reach a secret/advanced form is not silently counted as having earned it. Animation and original-device timing are additional coverage dimensions, not established by a selected neutral pose.

## Search and replay

```powershell
pnpm retro:presets
pnpm retro:list
pnpm retro:audit --seed-count 4 --policies all --out docs/audits/life-v9/retro/latest
pnpm retro:verify --out docs/audits/life-v9/retro/latest
```

Search routines include timely care, training, battles, delayed recovery, overfeeding, interrupted sleep and elapsed-time changes of routine. They inspect ordinary meters and flags, never a desired later character. Rejected actions and losses are retained as real gameplay consequences.

A run records the exact shared seeds, care policy specifications, candidate budget, source/catalog hashes, engine-byte hash, metrics version, per-stage scores, contact sheets and portable command witnesses. Repeated paths can share the same underlying source/seed/care trace; the comparison count is not a count of independent genomes. A limited search failing to find a match does not prove that no seed exists.

Verification replays the best concrete witness for every path and checks its hashes and scores. `verify --publish-app` publishes only verified recipes to the app. App-side generated frames are checked against separately stored capture checksums before their measured score is displayed. SHA-256 archive verification remains the authoritative artifact-integrity check.

## Current capability boundary

The new general grammar provides seeded conservative bodies, rooted supports and manipulators, hands, tails, terminal outgrowths, and bounded source-ink facial spacing/scaling. These operators apply to ordinary player drawings; they contain no reference-specific futures.

The initial measured runs **do not establish near-exact full lifecycle coverage**. A filled baby becoming a thin outlined body with a contrasting face is already a major mismatch. General pigment expression, material redistribution and feature-contrast semantics remain missing; inserting a stored outline or cutting a target mask into the body would invalidate the test. [The grammar limits](audits/life-v9/grammar-limits.md) document that concrete bottleneck.

Use the corpus to decide which shared operators to improve and then rerun the same witnesses and source counterfactuals. Keep failed paths visible. Do not label a preset as reproducing its later reference forms until an actual whole-path witness supports that statement.
