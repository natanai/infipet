# Procedural evolution v6-full-001

Protocol **evolution-v6-audit1**, metrics **morphology-v6-audit1**, stage **full**. Engine hash `5cf7f6edb7b00e6e60ccf22731b37d47281f266b0618037e37398e4ea9d4848c`.

## Accounting and visual gate

Collected 1536/1536 scheduled views: 1536/1536 endpoints, 0/0 intermediate views, 0/0 motion poses. Failures: 0/384 planned cases. Overlapping endpoint/pose selections remain separately scheduled views, not unique frames.

Visual coverage: **0.0% (0/1152)** of adjacent-stage comparisons. 0/1152 have two independent reviewer identities. Clear evolved forms (score≥2): 0/0 review records. Unreviewed comparisons remain unreviewed and do not pass the gate.

[Blind-first gallery and motion loops](index.html) · [Frozen manifest](manifest.json) · [Source drawings](sources.json) · [Metrics](metrics.json) · [CSV](frames.csv) · [Visual review records](visual-reviews.json)

## Reliability

| Measure | Result | Condition / age |
|---|---:|---|
| completion | 100.0% (384/384) | planned cases, failures retained; age all |
| validFrames | 100.0% (1536/1536) | all evaluated views; age all |
| birthFidelity | 100.0% (384/384) | raw seed/history cases; exact pixel coordinates and colors; age 0 |
| seekAgreement | 100.0% (384/384) | 17.375 before/after reverse seeks; age 17.375 |
| within16ms | 100.0% (1536/1536) | Node frame generation; excludes UI/native overhead; age all |
| within50ms | 100.0% (1536/1536) | Node frame generation; excludes UI/native overhead; age all |

Frame-generation timing (Node, excludes rendering): median 3.49ms; p95 5.74ms.

## Protected feature accounting

| Age | Retained identity pixels | Winning composite pixels |
|---|---:|---:|
| 0 | 100.0% (1920/1920) | 100.0% (1920/1920) |
| 30 | 100.0% (1920/1920) | 99.9% (1918/1920) |
| 75 | 100.0% (1920/1920) | 100.0% (1920/1920) |
| 120 | 100.0% (1920/1920) | 100.0% (1920/1920) |

These are automated identity/compositing checks across selected histories, not proof that a player can recognize the face or markings. Floating source identities are included.

## Genetic separation within each starter

| Starter | Age | Shape≥5% | Shape≥10% | Shape≥20% | ≥2 semantic proportions differ20% | Seeds with a near-twin |
|---|---:|---:|---:|---:|---:|---:|
| bean | 30 | 87.5% (105/120) | 75.0% (90/120) | 35.8% (43/120) | 98.3% (118/120) | 100.0% (16/16) |
| bean | 75 | 89.2% (107/120) | 65.0% (78/120) | 26.7% (32/120) | 100.0% (120/120) | 100.0% (16/16) |
| bean | 120 | 90.8% (109/120) | 80.0% (96/120) | 43.3% (52/120) | 99.2% (119/120) | 100.0% (16/16) |
| sprout | 30 | 95.0% (114/120) | 85.8% (103/120) | 51.7% (62/120) | 100.0% (120/120) | 87.5% (14/16) |
| sprout | 75 | 95.8% (115/120) | 86.7% (104/120) | 45.8% (55/120) | 99.2% (119/120) | 87.5% (14/16) |
| sprout | 120 | 91.7% (110/120) | 85.0% (102/120) | 46.7% (56/120) | 100.0% (120/120) | 81.3% (13/16) |
| canine-cub | 30 | 95.0% (114/120) | 87.5% (105/120) | 55.8% (67/120) | 99.2% (119/120) | 87.5% (14/16) |
| canine-cub | 75 | 94.2% (113/120) | 81.7% (98/120) | 41.7% (50/120) | 100.0% (120/120) | 100.0% (16/16) |
| canine-cub | 120 | 89.2% (107/120) | 75.0% (90/120) | 46.7% (56/120) | 99.2% (119/120) | 100.0% (16/16) |
| ribbon | 30 | 93.3% (112/120) | 78.3% (94/120) | 26.7% (32/120) | 99.2% (119/120) | 100.0% (16/16) |
| ribbon | 75 | 96.7% (116/120) | 85.8% (103/120) | 36.7% (44/120) | 99.2% (119/120) | 87.5% (14/16) |
| ribbon | 120 | 98.3% (118/120) | 88.3% (106/120) | 44.2% (53/120) | 100.0% (120/120) | 87.5% (14/16) |
| beetle | 30 | 95.8% (115/120) | 86.7% (104/120) | 35.0% (42/120) | 99.2% (119/120) | 93.8% (15/16) |
| beetle | 75 | 90.8% (109/120) | 76.7% (92/120) | 47.5% (57/120) | 99.2% (119/120) | 81.3% (13/16) |
| beetle | 120 | 88.3% (106/120) | 80.0% (96/120) | 47.5% (57/120) | 99.2% (119/120) | 81.3% (13/16) |
| wisp | 30 | 97.5% (117/120) | 83.3% (100/120) | 35.8% (43/120) | 100.0% (120/120) | 93.8% (15/16) |
| wisp | 75 | 96.7% (116/120) | 82.5% (99/120) | 18.3% (22/120) | 99.2% (119/120) | 81.3% (13/16) |
| wisp | 120 | 95.0% (114/120) | 82.5% (99/120) | 11.7% (14/120) | 99.2% (119/120) | 87.5% (14/16) |

All genetic comparisons use neutral care and the same published, unfiltered raw seeds. Each cell includes its numerator/denominator. Near-twins use shape distance<10%.

| Starter | Distinct lifecycle: ≥10% separation at two grown ages |
|---|---:|
| bean | 83.3% (100/120) |
| sprout | 95.0% (114/120) |
| canine-cub | 90.8% (109/120) |
| ribbon | 92.5% (111/120) |
| beetle | 87.5% (105/120) |
| wisp | 92.5% (111/120) |

## Adjacent milestones

| Comparison | Shape≥20% alert | ≥2 changed semantic proportions | Visual status |
|---|---:|---:|---|
| bean: 0→30 | 53.1% (34/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| bean: 30→75 | 35.9% (23/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| bean: 75→120 | 28.1% (18/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| sprout: 0→30 | 32.8% (21/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| sprout: 30→75 | 60.9% (39/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| sprout: 75→120 | 54.7% (35/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| canine-cub: 0→30 | 31.3% (20/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| canine-cub: 30→75 | 37.5% (24/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| canine-cub: 75→120 | 40.6% (26/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| ribbon: 0→30 | 23.4% (15/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| ribbon: 30→75 | 17.2% (11/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| ribbon: 75→120 | 28.1% (18/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| beetle: 0→30 | 51.6% (33/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| beetle: 30→75 | 50.0% (32/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| beetle: 75→120 | 64.1% (41/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| wisp: 0→30 | 100.0% (64/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| wisp: 30→75 | 23.4% (15/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |
| wisp: 75→120 | 7.8% (5/64) | 100.0% (64/64) | See recorded reviews; numerical alerts do not pass gate |

## Care influence

| Starter / history | Age | Shape response≥5% vs matching neutral seed | Genetics unchanged |
|---|---:|---:|---:|
| bean / safety-unmet | 30 | 0.0% (0/16) | 100.0% (16/16) |
| bean / safety-unmet | 75 | 37.5% (6/16) | 100.0% (16/16) |
| bean / safety-unmet | 120 | 31.3% (5/16) | 100.0% (16/16) |
| bean / safety-recovery | 30 | 0.0% (0/16) | 100.0% (16/16) |
| bean / safety-recovery | 75 | 37.5% (6/16) | 100.0% (16/16) |
| bean / safety-recovery | 120 | 25.0% (4/16) | 100.0% (16/16) |
| bean / rest-fitness-tended | 30 | 0.0% (0/16) | 100.0% (16/16) |
| bean / rest-fitness-tended | 75 | 0.0% (0/16) | 100.0% (16/16) |
| bean / rest-fitness-tended | 120 | 0.0% (0/16) | 100.0% (16/16) |
| sprout / safety-unmet | 30 | 0.0% (0/16) | 100.0% (16/16) |
| sprout / safety-unmet | 75 | 50.0% (8/16) | 100.0% (16/16) |
| sprout / safety-unmet | 120 | 37.5% (6/16) | 100.0% (16/16) |
| sprout / safety-recovery | 30 | 0.0% (0/16) | 100.0% (16/16) |
| sprout / safety-recovery | 75 | 50.0% (8/16) | 100.0% (16/16) |
| sprout / safety-recovery | 120 | 31.3% (5/16) | 100.0% (16/16) |
| sprout / rest-fitness-tended | 30 | 0.0% (0/16) | 100.0% (16/16) |
| sprout / rest-fitness-tended | 75 | 0.0% (0/16) | 100.0% (16/16) |
| sprout / rest-fitness-tended | 120 | 0.0% (0/16) | 100.0% (16/16) |
| canine-cub / safety-unmet | 30 | 0.0% (0/16) | 100.0% (16/16) |
| canine-cub / safety-unmet | 75 | 50.0% (8/16) | 100.0% (16/16) |
| canine-cub / safety-unmet | 120 | 43.8% (7/16) | 100.0% (16/16) |
| canine-cub / safety-recovery | 30 | 0.0% (0/16) | 100.0% (16/16) |
| canine-cub / safety-recovery | 75 | 50.0% (8/16) | 100.0% (16/16) |
| canine-cub / safety-recovery | 120 | 37.5% (6/16) | 100.0% (16/16) |
| canine-cub / rest-fitness-tended | 30 | 0.0% (0/16) | 100.0% (16/16) |
| canine-cub / rest-fitness-tended | 75 | 0.0% (0/16) | 100.0% (16/16) |
| canine-cub / rest-fitness-tended | 120 | 0.0% (0/16) | 100.0% (16/16) |
| ribbon / safety-unmet | 30 | 0.0% (0/16) | 100.0% (16/16) |
| ribbon / safety-unmet | 75 | 31.3% (5/16) | 100.0% (16/16) |
| ribbon / safety-unmet | 120 | 37.5% (6/16) | 100.0% (16/16) |
| ribbon / safety-recovery | 30 | 0.0% (0/16) | 100.0% (16/16) |
| ribbon / safety-recovery | 75 | 31.3% (5/16) | 100.0% (16/16) |
| ribbon / safety-recovery | 120 | 18.8% (3/16) | 100.0% (16/16) |
| ribbon / rest-fitness-tended | 30 | 0.0% (0/16) | 100.0% (16/16) |
| ribbon / rest-fitness-tended | 75 | 0.0% (0/16) | 100.0% (16/16) |
| ribbon / rest-fitness-tended | 120 | 0.0% (0/16) | 100.0% (16/16) |
| beetle / safety-unmet | 30 | 0.0% (0/16) | 100.0% (16/16) |
| beetle / safety-unmet | 75 | 43.8% (7/16) | 100.0% (16/16) |
| beetle / safety-unmet | 120 | 12.5% (2/16) | 100.0% (16/16) |
| beetle / safety-recovery | 30 | 0.0% (0/16) | 100.0% (16/16) |
| beetle / safety-recovery | 75 | 43.8% (7/16) | 100.0% (16/16) |
| beetle / safety-recovery | 120 | 12.5% (2/16) | 100.0% (16/16) |
| beetle / rest-fitness-tended | 30 | 0.0% (0/16) | 100.0% (16/16) |
| beetle / rest-fitness-tended | 75 | 0.0% (0/16) | 100.0% (16/16) |
| beetle / rest-fitness-tended | 120 | 0.0% (0/16) | 100.0% (16/16) |
| wisp / safety-unmet | 30 | 12.5% (2/16) | 100.0% (16/16) |
| wisp / safety-unmet | 75 | 18.8% (3/16) | 100.0% (16/16) |
| wisp / safety-unmet | 120 | 62.5% (10/16) | 100.0% (16/16) |
| wisp / safety-recovery | 30 | 12.5% (2/16) | 100.0% (16/16) |
| wisp / safety-recovery | 75 | 18.8% (3/16) | 100.0% (16/16) |
| wisp / safety-recovery | 120 | 31.3% (5/16) | 100.0% (16/16) |
| wisp / rest-fitness-tended | 30 | 0.0% (0/16) | 100.0% (16/16) |
| wisp / rest-fitness-tended | 75 | 0.0% (0/16) | 100.0% (16/16) |
| wisp / rest-fitness-tended | 120 | 0.0% (0/16) | 100.0% (16/16) |

## Movement selection

| Starter | Age | Mode frequency, neutral seeds | Pace range |
|---|---:|---|---:|
| bean | 0 | drift: 93.8% (15/16); slither: 6.3% (1/16) | 0.645–1.258 |
| bean | 30 | hop: 6.3% (1/16); walk: 37.5% (6/16); drift: 18.8% (3/16); flutter: 18.8% (3/16); undulate: 12.5% (2/16); slither: 6.3% (1/16) | 0.645–1.258 |
| bean | 75 | walk: 31.3% (5/16); hop: 25.0% (4/16); undulate: 25.0% (4/16); drift: 12.5% (2/16); slither: 6.3% (1/16) | 0.645–1.258 |
| bean | 120 | walk: 37.5% (6/16); drift: 25.0% (4/16); slither: 18.8% (3/16); hop: 6.3% (1/16); flutter: 12.5% (2/16) | 0.645–1.258 |
| sprout | 0 | walk: 100.0% (16/16) | 0.633–1.266 |
| sprout | 30 | walk: 25.0% (4/16); slither: 12.5% (2/16); hop: 12.5% (2/16); drift: 31.3% (5/16); undulate: 12.5% (2/16); flutter: 6.3% (1/16) | 0.633–1.266 |
| sprout | 75 | slither: 12.5% (2/16); hop: 18.8% (3/16); undulate: 12.5% (2/16); drift: 25.0% (4/16); flutter: 6.3% (1/16); walk: 25.0% (4/16) | 0.633–1.266 |
| sprout | 120 | walk: 56.3% (9/16); slither: 25.0% (4/16); drift: 6.3% (1/16); undulate: 6.3% (1/16); hop: 6.3% (1/16) | 0.633–1.266 |
| canine-cub | 0 | walk: 100.0% (16/16) | 0.633–1.262 |
| canine-cub | 30 | walk: 37.5% (6/16); slither: 18.8% (3/16); drift: 12.5% (2/16); hop: 12.5% (2/16); flutter: 18.8% (3/16) | 0.633–1.262 |
| canine-cub | 75 | walk: 37.5% (6/16); drift: 12.5% (2/16); undulate: 12.5% (2/16); flutter: 18.8% (3/16); hop: 6.3% (1/16); slither: 12.5% (2/16) | 0.633–1.262 |
| canine-cub | 120 | hop: 37.5% (6/16); drift: 6.3% (1/16); walk: 25.0% (4/16); undulate: 25.0% (4/16); slither: 6.3% (1/16) | 0.633–1.262 |
| ribbon | 0 | drift: 93.8% (15/16); slither: 6.3% (1/16) | 0.672–1.211 |
| ribbon | 30 | flutter: 12.5% (2/16); walk: 43.8% (7/16); drift: 18.8% (3/16); undulate: 12.5% (2/16); hop: 12.5% (2/16) | 0.672–1.211 |
| ribbon | 75 | walk: 31.3% (5/16); hop: 18.8% (3/16); undulate: 18.8% (3/16); flutter: 12.5% (2/16); slither: 6.3% (1/16); drift: 12.5% (2/16) | 0.672–1.211 |
| ribbon | 120 | slither: 12.5% (2/16); drift: 18.8% (3/16); walk: 25.0% (4/16); undulate: 25.0% (4/16); hop: 12.5% (2/16); flutter: 6.3% (1/16) | 0.672–1.211 |
| beetle | 0 | walk: 100.0% (16/16) | 0.699–1.250 |
| beetle | 30 | walk: 50.0% (8/16); slither: 18.8% (3/16); undulate: 12.5% (2/16); hop: 6.3% (1/16); flutter: 12.5% (2/16) | 0.699–1.250 |
| beetle | 75 | drift: 37.5% (6/16); walk: 43.8% (7/16); undulate: 12.5% (2/16); slither: 6.3% (1/16) | 0.699–1.250 |
| beetle | 120 | walk: 68.8% (11/16); hop: 12.5% (2/16); drift: 6.3% (1/16); slither: 6.3% (1/16); flutter: 6.3% (1/16) | 0.699–1.250 |
| wisp | 0 | drift: 68.8% (11/16); slither: 31.3% (5/16) | 0.648–1.262 |
| wisp | 30 | undulate: 12.5% (2/16); walk: 50.0% (8/16); slither: 18.8% (3/16); flutter: 12.5% (2/16); hop: 6.3% (1/16) | 0.648–1.262 |
| wisp | 75 | drift: 12.5% (2/16); walk: 25.0% (4/16); flutter: 18.8% (3/16); hop: 31.3% (5/16); undulate: 12.5% (2/16) | 0.648–1.262 |
| wisp | 120 | drift: 12.5% (2/16); walk: 56.3% (9/16); flutter: 18.8% (3/16); undulate: 6.3% (1/16); hop: 6.3% (1/16) | 0.648–1.262 |

Mode selection and pace variation are separate from visually correct gait. Inspect full saved motion sequences. Independent visual score disagreements: 0/0 comparisons with two reviewer identities. [Coverage details](review-coverage.json).

Complete actual controller-phase cycles: not available (0/0). Exact phase sets and explicit times are in [metrics](metrics.json) and compressed case records. Earlier captures without diagnostics remain unavailable.

## Limitations and next decisions

- Numerical separation is not perceived distinctiveness.
- Raster topology counts do not prove anatomical transformation.
- Protected raster contribution is not visually confirmed feature readability.
- Current frame part identity must be reviewed through deformation and ownership transitions.
- Four-history variance panel includes severe care and is not comparable to a moderate-care population estimate.
- Physical iPhone, signed widget and human review are separate checks.
- Metric definitions differ from the provisional household baseline; percentage-point comparisons are not valid.
- Expansion requires inspection of actual stage and intermediate images. Scaling, recoloring, posture and appendage count alone are insufficient.
- Record defects with case ID and ages. Keep the first16 endpoint views and all12 stage comparisons independently reviewed before expanding.

## Recorded visual findings

These are agent/human assessments of actual images, distinct from automated metrics. Scores use0 unchanged/broken,1 minor/weak,2 clear/adequate,3 major/strong.

| Case / ages | Reviewer | Distinctiveness / coherence / richness / continuity | Observation |
|---|---|---|---|

## Failures

No case evaluation failures.
