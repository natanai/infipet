# Infipet readable genetic seed — v1 draft

**Status:** Implementation in draft PR #55. The genetic grammar and initial physical
expression are not yet a qualified substitute for the complete morphology engine.

## Experience contract

- **Exactly the same player-selected original drawing + exactly the same seed**
  produces the same permanent inherited gene instructions and potential.
- **Exactly the same drawing + seed + complete chronological care record** produces
  the same day-by-day anatomy, the same operation history and the same final state.
  No runtime rerolls or unrecorded device random numbers.
- **Different care** can change the extent, stage, success and physical manifestation
  of an already fixed gene, but cannot change the genome or the gene roll.
- A drawing made only with the default **Body** brush is **undifferentiated
  pluripotent source material** (even a single painted pixel). It is not
  auto-recognized as an eye, bird, plant, or species. No represented real or
  fantasy reference or anatomical part is prohibited by absent specialization.
- The tree reference is the primary **organizing influence**, never a permission
  gate or an imposed adult sprite. Fictional branches carry explicit fictional
  provenance; scientific ones preserve their evidence. This is one pet's
  ontogeny, not taxonomic ancestry changing over a lifetime.

## The alphabet

| Symbol | Meaning | Symbol | Meaning |
|---|---|---|---|
| A | Arm opportunities | N | Head opportunities |
| B | Body breadth | O | Egg/envelope opportunities |
| C | Coat/hair opportunities | P | Pigment/decoration opportunities |
| D | Division | Q | Symmetry |
| E | Eye opportunities | R | Whole-body remodeling |
| F | Foot opportunities | S | Segmentation |
| G | Surface growth | T | Tail opportunities |
| H | Horn opportunities | U | Material resorption |
| I | Ear opportunities | V | Vestigialization |
| J | Hand/grasper opportunities | W | Wing opportunities |
| K | Skeletal support | X | Material fusion |
| L | Leg opportunities | Y | Tissue repurposing |
| M | Mouth opportunities | Z | Developmental timing |

The implementation is **the actual authoritative dictionary**:
[`src/genetics/seed-language.ts`](../../src/genetics/seed-language.ts).

A digit sequence directly before a letter sets its ticket count (clamped to
0..12). Thus **`2E3L`** asks for *up to* two eye-development and three leg-
development opportunities. **`0E`** expressly suppresses new eye
opportunities, **not** an existing drawn eye. `EEE` adds three opportunities.
`10W` proposes ten wing opportunities but does not promise ten wings.
Unprefixed letters have one ticket; punctuation separates tokens, cannot
secretly identify any material or anatomical kind, and remains accepted in
old alphanumeric seed strings. Digits also have a reproducible phase effect
bounded to the 365-day domain. See `parseSeedInstructions` for the exact
parser, integer behavior and precedence.

No player-selected anatomical parts are inferred from pixels. Two separately
selected Eye parts remain two authored Eyes; a shape resembling two eyes
painted entirely using Body is still exclusively Body.

## Mathematical rules (initial implementation)

Inputs:
- immutable authored SourceAtlas of exact selected part kinds, part identities
  and cells;
- original Unicode seed string (A-Z letters interpreted case-insensitively);
- a verified reference ID in the full scientific + explicit fictional tree;
- actual permanent developmental genotype and later recorded care.

For the selected reference `r`, the set of role hints `H(r)` is the union
of represented ancestors' declared anatomical role priors. A role hint is
evidence, **not a required anatomy, adult lookup or exclusion**.

For each selectable kind `k`:
- `a_k` = number of explicitly authored parts of kind k.
- `d_k` = sum of numeric tickets in seed letters referring to kind k.
- `t_k = min(12, d_k + 1)` when source is all-Body and k has **no explicit
  seed letter**; otherwise `t_k = min(12, d_k)`. (A direct `0E` overrides
  the default latent eye ticket.)
- `p_k = min(0.82, (k in H(r) ? 0.58 : 0.12) +
  (d_k > 0 ? 0.12 : 0) + (appendage capability and appendage kind ?
  0.04 : 0))`.
- For `i = 0 .. t_k-1`, `u_i = uint32Hash(seed | r | k | i) / 2^32`.
  `accepted_i = (u_i < p_k)`. The exact seeded roll is calculated **once
  from the fixed inputs**, never from a daily random generator.
- `potentialCount_k = a_k + sum(accepted_i)`. This is **not** an observed
  body-part count. Existing authored material stays independently traceable;
  new material exists only if a legal growth operation actually commits.

Numerical bounds: `0 <= t_k <= 12`, `0 <= u_i < 1`,
`0 <= p_k <= 0.82`; candidate references are the entire finite supported
tree including all explicit fictional overlays.

**Reference selection is deterministic, not taxonomic recognition.**
For specialized user-selected parts, rank supported reference nodes using
only the selected role counts (`+2` for matching a role hint, `-1` for a
nonmatching hint, multiplied by up to three authored instances), then break
ties by `hash(seed | "authored-neighbor" | nodeId)`. For Body-only drawings,
**never rank by the apparent shape or randomly pick among raw catalog nodes**:
first choose uniformly among the five nonempty represented reference domains
(animal, plant, fungus, explicitly fictional, other scientific) via
`hash(seed | "uncommitted-domain") mod 5`, then choose a node in the selected
domain via `hash(seed | "uncommitted-node" | domain) mod nodeCount`.
These are game-defined prior odds, **not empirical probabilities of biological
ancestry**. They avoid giving animal outcomes more chance merely because our
bundled animal catalog contains more scientific IDs. Every node remains
eligible and no domain forbids later anatomical potential. The drawing's
position, symmetry, color, shape, holes or apparent facial features never
contribute semantic evidence.

Expression: the first **six** accepted gene opportunities on sufficiently
small source architectures are translated into ordinary, capped, source-owned
`bud` and `expand` operators, chronologically located within the first
365 daily checks. They use **no new chaotic equations**. These are physically
audited and may do nothing if care/resources/contacts do not permit them.
The rest of the genetic potential remains latent rather than producing fake
particles, violating the finite operator limit or forcing a shape.

**Finite-slot fairness is deterministic.** Gene tickets accepted by the
immutable seed are ranked for up to six source-owned physical slots:
(1) explicit letter tickets before latent Body possibilities; (2) first
accepted ticket of every represented kind before any second ticket of
that kind; (3) second before third, and so on; (4) equal-rank ties broken
by `hash(seed | "gene-allocation" | PartKind)`. No alphabetic PartKind
order, artwork shape, call order, elapsed time, care, or chaotic variable
participates. Thus `12E12L` cannot consume all six slots with eyes before
considering an eligible leg solely because Eye precedes Leg in a table.
Unscheduled accepted genetic opportunities remain *latent*, not failures
or counterfeit created cells.

The existing physics system may still use historical deterministic chaotic
fields for older growth operators, but **there are no released pet saves to
preserve** and no backward-compatibility obligation. Retire those operators
when deterministic physical alternatives are independently qualified.
Chaos is not part of the new seed-word decisions. Do not add more chaos until
independently demonstrated whole-body expressive morphology and legibility
are achieved without it.

**Visibility rule:** the initial renderer must never relabel authored Body
ink. A specialized kind is presented only when the physically authorized
child tissue containing live material cells is present. The specialist's
rendered pixels must each cite their actual material cell and original
source-owner lineage. A merely accepted seed ticket is not a visible organ.

## Experimental kind-specific *physical* growth (playable prototype)

The incremental growth engine now uses a shared, mathematical
`createSpecializationRank` when a tissue is **already** typed by the player's
brush or by a successfully generated, genetically authorized child. This
does not use geometry to infer a kind and does not spawn a predefined organ.

Inputs: current finite source-owned tissue cell positions, an explicit kind,
an operator's actual directed growth axis, and a proposed legal adjacent
lattice location. The output is a finite **ranking score only**. The existing
chronological, collision, attachment, original-source and material-conservation
journal remains solely responsible for permitting a new physical cell.

For direction-aligned longitudinal and lateral spans `L,W`, candidate
spans `L',W'`, kind-dependent breadth preference `b_k`, existing
neighbor count `N8`, and tissue-centroid distance `d`:

```text
score = 8 * abs(ln((W' / L') / b_k)) + 0.04 * d - 0.18 * N8
```

Wings favor broader source-supported sheets, legs and tails narrower
longitudinal tissues, eyes approximately compact patches, and feet wider
supports. These are *operator preferences*, not sprite shapes or species
destinations. They can be obstructed by actual material, physical boundaries,
care or other organs. Body-only ink still has no inferred anatomical label.
The new scoring algorithm does **not** claim finished or proven visual
legibility; the next gameplay work is to make its whole-body and specialist
development recognizable and appealing over a complete life.

### Source-owned organ emergence and lifetime schedule (experimental)

Earlier attempts lost gene opportunities because every organ budded from the same
single birth growth-tip cell. The production incremental scheduler now chooses
an actual exposed, live parent-tissue cell for **each accepted genetic bud**.
Candidates must already have a source lineage, remain adjacent to their
proposed first child cell, satisfy lattice occupancy and load-bearing distance,
and be authorized by the permanent seed direction. Among valid candidates,
choose a deterministic score from projection along that direction and
separation from previously specialized tissue, then stable material ID. This
changes **attachment location**, never what kind the player originally drew.

An accepted specialist `expand` quantum now forms **up to five** real,
8-connected physical cells, rather than always exactly one:
- Undifferentiated Body: at most one cell per earned quantum.
- Explicitly authored typed tissue: at most three cells.
- Genetically created Eye/Arm/Leg/Head/Horn/Hand/Tail/Hair/Egg tissue: at most
  four cells.
- Genetically created Wing/Foot/Ear/Mouth tissue: at most five cells.

The numerical candidate set is the 8-neighbor lattice frontier of the
CURRENT physical tissue, including provisionally accepted cells within the
atomic operation. Each candidate is evaluated against the same
direction-aware shape score, coordinate bounds, occupied material, protected
negative spaces, valid source parentage and existing attachments.
Every emitted cell receives its **own** immutable ID, parent-cell IDs and
original source ancestor IDs. No batch may contain disconnected or unsupported
cells; the existing post-transaction structural audit still applies to the
whole patch. Partial completion is permitted if legitimate collisions prevent
the remaining cells. These budgets are ceilings, not guaranteed morphology.

The genetic `bud` operator has a second anatomical bound: an Eye may extend
only one axial quantum, a Mouth/Ear/Foot/Hand two, Head three, Horn four,
Wing/Hair five, Arm/Leg six and Tail seven; the existing available-care,
mechanical-support and capacity constraints can stop an organ earlier.
Specialization can still grow laterally through its own `expand` operations.
These are general tissue-mechanics biases, **not** predefined creature images.

The permanent scheduling law for the first six accepted seed opportunities is

```text
start_day(slot) = 5 + (seed_phase mod 12) + 45 * slot
bud_window = [start_day, start_day + 30]
specialized_expansion_window = [start_day + 28, start_day + 78]
slot ∈ {0, 1, 2, 3, 4, 5}
```

The earliest permitted gene growth is day 5; the last generated window closes
by day 319, before anatomy freezes at check 365. No physical cell changes
between actual daily checks. Previously the first specialist was scheduled
after approximately 118 days, making the initial experience misleadingly
static. This change brings expression into normal early-life pet care while
retaining later surprise. Every **valid** source drawing is eligible, even if
it contains more than 12 separate physical tissues. Physical budgets still
govern what genuinely materializes.

**Known remaining gaps:** a child physically differentiating and producing
connected volume is not by itself proof of a recognizable eye, limb or wing.
Whole-body deformation, membrane biomechanics, movement, care balance and
other interactive play need actual phone evaluation and continued development.
There are no automatic test or CI release gates during this prototype phase.

**Pre-release development policy:** GitHub's automatic check workflows were
removed at user request. Narrow mathematical tests remain available for
manual debugging, but there is no CI-based merge or publication gate.
Playability and a convincing evolving creature take priority now.

## Verification gates

1. Direct alphabet and integer-dose examples with independently derived rolls.
2. Identical gene potential for the same brush kinds and seed across translations,
   repaints and rotations of the drawing.
3. The whole supported phylogeny remains eligible for a one-cell Body source,
   and repeated seeds choose reproducible references.
4. Every generated kind is a real child tissue created by an authorized physical
   operation and anchored to an authored source owner; no semantic kind is
   assigned to existing undifferentiated pixels.
5. Same drawing + seed + same chronological care yields exact event-by-event
   replay; different care never rerolls the seed or alters previous days.
6. Physical conservation and independent anatomical audit, save/reopen and
   365 opportunities remain unchanged.
7. Dramatic whole-body morphogenesis **and visible legibility** of typed
   features must be qualified independently. Gene counts and material
   ancestry alone **do not certify** a creature looks good.

**Known unfinished work:** tree-derived biological anatomy distribution and
whole-body specialization still need much richer structural rules than simple
buds; whole-year readability and high-complexity memory performance are
release-blocking until verified. Preserve the draft status.
