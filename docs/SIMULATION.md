# Deterministic development and care, version 5

Infipet uses one 32 × 32 drawing canvas and a 64 × 64 simulation world. A brush label gives painted pixels anatomical meaning. Hidden masks, material carriers, and joints are inferred without a player-visible rig. The inherited seed provides potential; an explicit care history changes its expression. No wall clock advances either system.

## Public contract

`createSimulation(parts, seed, mode = 'infant', { needTimeline = [] })` returns:

- `genome` and `program`, both version 5, plus fixed milestones, `hatchAt`, and `maxAge`.
- `stateAt(age)`: the immutable wellbeing state at a timeline age, with raw fulfillment, short-term averages, cumulative exposure, persistent memory, feelings, and shared developmental channels.
- `frameAt(age, { time = 0, action = 'idle', target })`: geometry, provenance, capabilities, interaction, and the same wellbeing contract in `frame.wellbeing`.

A care keyframe is `{ needId, tick, fulfillment }`. Ticks are whole developmental hours, fulfillment is 0–1, and unedited values default to 0.75. Egg incubation is excluded from developmental care time. Requested ages remain unrounded when evaluating care, so an event applies at exactly `hatchAt + tick / 24`, including a fractional incubation duration. Intermediate geometry is quantized only at the raster boundary.

This prototype intentionally increments its simulation/file revision when rules change. It does not run an older engine or silently promise old futures under new rules.

## Starting modes and controlled time

An **infant** starts exactly as drawn. At age zero, idle action, and animation time zero, its pixels equal `flattenAnatomy(parts)` translated by 16 world pixels. This includes unusual floating features, holes, overlapping paint, and tiny drawings. Care cannot rewrite those birth pixels. No missing face, limb, or wing is added to a drawn infant.

An **egg** treats the drawing as its shell. The complete source and seed compile a latent initial body plan from procedural masses and tapered capsule limbs. It can have different proportions, head placement, hair, faces, appendage counts, or a limbless body. It samples inherited drawing colors and patterns rather than selecting a finished adult sprite. This initial hatchling anatomy is inherited; it is distinct from rare post-birth novelty.

Incubation lasts a seeded 4–10 days. During its final 2.2 days, deterministic cracks, separating fragments, and emergence reveal the infant. The shell is gone at `hatchAt`. Empty infant and egg sources remain empty.

| Milestone | Developmental age |    Timeline age |
| --------- | ----------------: | --------------: |
| Infant    |                 0 |       `hatchAt` |
| Teen      |                30 |  `hatchAt + 30` |
| Adult     |                75 |  `hatchAt + 75` |
| Elderly   |               120 | `hatchAt + 120` |

The explorer continues to `maxAge = hatchAt + 240`. Inherited maturation curves plateau at developmental day 120. Adult and elderly care can still remodel the creature slowly through day 240. Milestones label a continuous state; crossing day 75 or 120 does not reset a developmental curve or care memory. Death is not implemented.

## Authored anatomy supplies the growth

Most change modifies existing tissue: differential elongation, spatial swelling, quadratic bend, taper, periodic waists, and late curl. The rasterizer maps each occupied source cell through a nonlinear field as a quadrilateral. It preserves the authored mask rather than filling its bounding box. Large outlined masks retain their empty interior. One- and two-cell bulk masks grow a seeded organic contour within the same tissue identity; even a single body dot can have a varied future.

Version 5 removes routine post-birth buds, branches, new limbs, automatic cleavage/fusion, and automatic authored-feature resorption. Existing parts retain IDs and material ownership. Authored eyes and mouths remain protected features. Seed variation changes coherent field parameters; it is not a stream of random neighboring pixels. `program.operators` records the inherited field windows and strengths.

Care changes those inherited fields. It does not reroll a genome or compile a different inherited blueprint. A bounded LRU shares compiled source/seed/mode blueprints across history edits. A repeated future under the same history is deterministic regardless of seek order.

## Care state and physical expression

The offline catalog contains all 67 needs and its linked feelings. Each need retains its own raw value, fast fulfillment average, accumulated deficit-days, and slow deficit memory. Their implementation and pinned source data live in `src/needs`. The current appearance profiles cover exactly six needs: Safety, Security, Trust, Rest, Relaxation, and Physical Fitness. The other needs still participate in wellbeing and feelings; they do not yet have an appearance profile.

| Shared channel    | Current structural/behavioral use                                                    |
| ----------------- | ------------------------------------------------------------------------------------ |
| Protection        | Broader, fuller existing tissue; pressure for a rare protective covering             |
| Recovery          | Expression of swelling/bend and available remodeling resources                       |
| Vigor             | Elongation, contour/taper expression, movement pace and amplitude                    |
| Vigilance         | A small immediate alertness increase in movement pace                                |
| Guarding          | Existing tissue curls/leans into a guarded posture with gentler motion               |
| Defensive display | Retained in wellbeing as a shared developmental signal; no separate visual field yet |
| Novelty drive     | Sustained positive-resource pressure for a rare ornament                             |

Safety, Security, and Trust each contribute independently to protection/guarding; one low Safety slider is not averaged away across all 67 needs. Rest/Relaxation influence recovery, while Physical Fitness and Rest influence vigor. Positive fulfillment also changes the expression of seeded contours and movement. It is not only shortage that produces variation.

Raw care events and feelings apply immediately. Morphology follows a separate low-pass context with a four-day infant half-life, gradually about twelve days in adulthood and twenty days in later life. The context uses causal daily samples and continuous exponential interpolation within each day. It does not read a future event to interpolate a past shape. This keeps adult edits from instantly replacing the body. Safety vigilance can respond immediately as behavior while protective structure changes slowly.

Memory can soften after fulfillment improves. The same current slider values can therefore produce different creatures after different past experiences. Physical recovery/vigor requirements are resource costs of remodeling; they do not mean that human needs conflict or that a creature's need is wrong.

## Rare, bounded new features

A stable genetic hash makes 15% of source/seed combinations eligible for post-birth novelty. Eligibility alone adds nothing. A sufficiently large existing bulk host is required; its protected eye/mouth cells are excluded. A candidate uses at most 12% of that host's source-cell count.

Sustained protective pressure plus recovery/vigor can commit a **protective covering**. Sustained high novelty drive plus high recovery/vigor can commit a **surface ornament**. Runs must persist, day 30 must have been reached, and expression then unfolds over 24 days. Falling below the pressure/resource thresholds reduces accumulated runs rather than instantly toggling a part. The first commitment fixes the feature identity for life; subsequent histories cannot append a second feature. Source tissue remains responsive and softenable even when a feature has committed.

The engine never invents new limbs, wings, eyes, or mouths after birth. Two latent candidate strategies can exist in a compiled blueprint, but at most one is ever active. The program's one-tissue novelty budget excludes initial generated hatchling anatomy. Empty and tiny art do not receive a fabricated host just to enable novelty.

## Material features and floating anatomy

The fifteen brush kinds are body, head, arm, hand, leg, foot, eye, mouth, ear, tail, wing, horn, egg, hair, and details (`decoration` internally).

Surface eyes, mouths, and details pass through the host's entire nonlinear material map. Their footprints inherit stretch and curvature, not just a translated center. An outlined head's enclosed interior counts as its surface domain. Containing heads take priority over a body behind them. Hair, ears, and horns retain material roots on their host.

Adjacent parts share joints, keeping joint positions coincident through growth and pose. Distant anatomy is valid: a floating hand or eye keeps a logical carrier and authored gap. Its carrier point follows deformation while the gap remains a coherent offset. Armless floating hands and legless floating feet can bind logically to a nearby core. Feature-only drawings use a shared movement frame.

Each part reports its stable ID, optional `sourcePartId`, `provenance: 'authored' | 'grown' | 'shell'`, and `relationship: 'surface' | 'joint' | 'floating' | 'root'`. Tiny eyes visibly blink without multiplying eyes or losing their structural sight capability.

## Actions and aging

`idle`, `move`, `play`, and `greet` use explicit animation seconds, independent of age. All nonempty hatched creatures can perform them through their available anatomy. Movement includes walking/crawling, slithering, undulation, hopping, rolling, fluttering, or drifting. Limbless bodies have a traveling deformation wave; direct leg/foot chains have alternating footfalls and an ankle solver. This is a stationary behavior demonstration, without terrain or navigation.

Play prioritizes hands, mouth, tail, body, then other tissue. Floating hands reach within a bounded distance, arm-mounted hands aim their arm, and a body can nudge. Reported contact comes from an occupied rendered effector pixel rather than a potentially transparent centroid. Near contact returns `caught` for hand/mouth/tail or `nudged` for body. Other outcomes include `reaching`, `out-of-reach`, and `unavailable`. Unhatched eggs have no action affordances. Consumers should look up the first ordered `capabilities.effectorIds` entry instead of searching parts in rendering order.

Between days 96 and 120, hair gradually grays toward a seeded silver tone. Eye and mouth pigments stay unchanged. Neutral movement pace/amplitude smoothly decrease by 25–35%; care modulates the available energy and guarding around that curve. The pose uses these actual pace/amplitude values while neutral geometry and shared joints remain unchanged. Play retains its reach amplitude.

## Paint, replay, and bounds

`Pixel` includes optional `z`; `PetPart` includes optional fallback `layer`. Effective depth is `pixel.z ?? part.layer ?? semanticLayer * 1000`, bounded to integer 0–1,000,000,000. Highest depth wins, then stable semantic priority and locale-independent ID order. Painting one body pixel over an eye raises just that pixel. Covered anatomical pixels remain intact underneath. Source masks and occupied placement coordinates fit the 32 × 32 canvas.

`normalizeAnatomy`, `flattenAnatomy`, `pixelPaintDepth`, `compareAnatomyLayer`, and `anatomyPaintOrder` share these rules. Source/cell order and display names do not reroll genetics. The canonical fingerprint includes complete normalized geometry, colors, paint metadata, source mode, and seed, and explicitly excludes care history. Random decisions use keyed integer hashes/streams during compilation or fixed eligibility decisions; seeking does not consume random state.

The final whole-creature fit keeps all active geometry inside 64 × 64. Output coordinates are unique integers. Every valid source cell survives normalization; the drawing layer can group fragments and supports up to 1,024 regions and fifteen full-canvas typed masks. Fully overlapping masks use occupancy lookups for anchors instead of pairwise source-cell searches.

Caches are bounded: eight inherited blueprints, twelve structural states, twenty exact frames, and a 120,000 cached-pixel budget counting composite and per-tissue pixels. One current large frame may exceed the pixel budget; older frames are evicted first. Morphology/commitment samples cover at most the 241 integer lifecycle days. The needs replay owns its separately bounded checkpoint cache. Frames and diagnostics are defensive copies; wellbeing is recursively frozen and can be safely shared. Caller mutations cannot change future replay.

## Evidence and practical limits

`tests/simulation.test.ts` covers exact infant pixels, overlapping depth, egg emergence, fixed milestones and240-day horizon, non-affine authored growth, preserved holes, no automatic organ addition, tiny growth, full material surface binding, floating carriers, shared joints, true occupied-pixel play contact, blinking, hair aging, limb-free behavior, bounded rasterization, source fragments, immutable replay, all six care profiles, positive care, equal-current/different-history outcomes, softening, future-event causality, arbitrary seek order, exact hourly events, blueprint reuse, adult continuity, and rare/resourced/one-feature novelty.

The generated gallery and benchmark tools provide visual/timing evidence on the Windows development machine. Typical pets are cheaper than extreme overlapping masks; those results are not iPhone frame-rate guarantees. JavaScript trigonometric functions remain in the implementation, so physical iOS fixture validation is still needed for cross-runtime bit-for-bit claims.

This is a bounded deterministic toy simulation with an editable care-history lab, not a clinical model. Feelings are clues, not a correct-answer quiz. Full care activities, needs profiles beyond the initial six, social visits, terrain, physical grasping, world navigation, wall-clock aging, and widget scheduling remain outside this engine. The finite grid/rules/seed space provides many futures, not literal infinity.
