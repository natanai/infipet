# Infipet readable genetic seed — v1 draft

**Status:** Readable-seed-v1 is implemented in the current physical
prototype. The grammar is stable for current-format pets, but visually
convincing adult outcomes are still being developed and must not be inferred
from the gene script alone.

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

## Fixed seeds for playable starter drawings

All 12 editable gallery drawings use **exactly the same** readable-seed-v1
grammar and source-owned development engine as a player's own drawing.
Their stored strings are complete genetic scripts, not mascot identifiers,
species IDs, direct evolution targets or lookups. Selecting a starter copies
its original parts **and** its listed seed into the ordinary editor. Editing
the drawing or seed changes the normal simulation inputs; there is no special
starter-mode mutation logic or preset-specific developmental exception.

| Drawing ID | Fixed readable seed | Drawing ID | Fixed readable seed |
|---|---|---|---|
| pippo | `2W2F2TBGQZ` | brumby | `2H3W2AGKRZ` |
| glim | `2T3I2LBGYZ` | thimbleaf | `2C3H2FBGRZ` |
| vellune | `3L2I2FSGQZ` | craggle | `2W3T2MDKRZ` |
| nibblet | `3W2F2TBGRZ` | orbini | `2L3H2CUGQZ` |
| spoori | `3W2T2FGYZ` | tukkin | `2I2A3TBRQZ` |
| flinta | `3A2H2CBGZ` | vespri | `2L3T2IMGRZ` |

These scripts deliberately include diverse possible role and process genes
but are **not** selected by searching for a preferred adult appearance.
The phylogenetic reference, permanent ticket acceptances, limited growth
sites, available material, chronological care and physical rules determine
what actually forms. A `2W` instruction offers two wing tickets, not two
guaranteed new wings. An already selected Wing or Eye remains original
material regardless of whether any additional gene ticket is accepted.

Pippo's illustrated face is now stored as two explicit Eye parts, a Mouth
and separate decorative cheek pixels, rather than treating the whole face
as one unknown Decoration. This uses the same manual brush-kind contract as
all other edited drawings; **no image recognition is involved**.

The 36 historic retro-reference specimens are research material, not
selectable starter-gallery creatures or target evolutions. Their historical
reference seeds are intentionally retained as separate study data and are
not a hidden progression table for these 12 starter drawings.

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

### Player-selected tissue mechanics during early growth

The original drawing's brush labels provide real mechanical constraints, not
a semantic guess from color or silhouette. At birth, each explicitly authored
tissue receives the SAME inherited generic operators, but their relative
expression strength is adjusted by a fixed three-channel tissue mechanics
vector `(axial, surface, branch)`.

```text
operatorStrength = clamp(inheritedPotential * tissueKindWeight, 0, 1)
```

Body retains weights (1,1,1). Eyes use (0.06,1.6,0.05),
Mouth (0.16,1.6,0.1), Hands (0.3,1.4,0.2), Feet
(0.25,1.5,0.2), Wing (0.65,1.5,0.55), Arm (1,1,0.7),
Leg (1,1,0.6), Tail (1,0.8,0.8), Head (0.4,1.3,0.35).
The full mapping for all fifteen brush kinds lives in
`authoredTissueMechanics()`. Original named Eyes and Mouths therefore
favor coherent physical growth around their material over unsupported
long axial extensions. They remain eligible for geometric resizing,
chronological remodeling, rigid movement, relocation and care influence.

A player-authored typed tissue's scheduled **surface expansion** now begins
at daily check 12 (plus its deterministic minor slot offset), rather
than waiting until check 35. Body-only material continues to use its normal
development timeline. Generic branch operators are eligible for drawings
with any number of tissues, within the same finite physical and operator
budgets. Gene kind selection still depends on the inherited genetics, not
on a tissue weight. These adjustments make genuine initial markings more
likely to stay legible during early morphology, but do not constrain the
organism to any species or chosen adult silhouette.

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

### Whole-organism allometric development (experimental)

The earlier daily runtime held one regional orientation constant across an
organism's lifetime, which often produced undirected bulk. The physical
material growth field now supports **five successive orientations** of the
same source-owned body. These orientations do not assign a different species,
draw a target creature or replace the player's original pixels.

For daily physical opportunity `n = 0 ... 364`, tissue identity `r`,
fixed permanent individual identity `g`, and *recorded care values* rest
`R`, activity `A` in `[0,1]`:

```text
phase = floor(n / 73)                           // integer 0 ... 4
u = uint32Hash(g | "whole-body-phase" | r | phase | "axis") / 2^32
v = uint32Hash(g | "whole-body-phase" | r | phase | "aspect") / 2^32
theta = 2*pi*u
e = clamp(3*(gene.elongation-gene.expansion) +
          2*(v-0.5) + 1.5*(A-R), -3, 3)
regionAxis = (cos(theta), sin(theta))
aspectStretch = 2^e                            // in [1/8, 8]
```

Both hash values are stable per individual source tissue and chronological
phase, and do not look at the creature's drawing to invent part names.
Changing care changes the **expressed anisotropy** of the actual accepted
material frontier, not the permanent genomic roll. Exact history prefixes
still reproduce identical physical material events. Future care cannot
rewrite earlier checks.

When an authorized regional surface operation has growth credit, the
candidate field evaluates only the already live physical tissue and its
bounded 8-connected adjacent lattice frontier. For `u,v` measured along
the current regionAxis, original extent `L=width+height`, local support
neighbors `N`, and mode-specific axial component `z`:

```text
pressure = (u/(L*sqrt(aspectStretch)))^2 +
           (v/(L/sqrt(aspectStretch)))^2
score = (N-1)/4 - pressure*(1,2,or 3 depending on field mode)
        + (width/height mode ? 2.4*abs(z)/(L+1) : 0)
        + bounded seed-coherence
        - (existing source-owned repatterning potential if expressed)
```

The directional term previously weighed just `0.25` and commonly lost
to the same local thickening process. It now contributes enough to produce
region-scale redistribution of new growth rather than only puffing out
existing pixels. The physical placement auditor still forbids collisions,
unsupported patches, impossible transfers, source-identity loss and new
material between daily checks.

**Existing source material can physically deform too:** five scheduled
coordinated repatterning windows, rather than three late and sparse waves,
start at checks 12, 79, 148, 219, and 289, with durations 55, 55, 55,
55, and 66 respectively and at most 10 earned opportunities each. These
are source-cell relocations with explicit replacement seam daughters, not
renderer warps. **The physical strain band's coordinates are derived from
all currently live material cells at that check**, including source-owned
growth, not only the original tiny birth drawing. This allows later phases
to deform the actual mature-size body rather than repeatedly straining a
birth-size patch. The independent verifier separately re-derives the same
axis, cut, band and mode from the PRE-transaction live inventory; it does
not trust the producer or its claimed operation. They can correctly do
nothing if physical geometry, protected voids, links, care or resource limits
reject the proposal. Source identities never transform into species targets
or disappear silently.

**Continuing specialist morphology:** Once new tissue has genuinely been
born, subsequent daily regional growth does not discard its permanent
developmental identity. The real source brush kind (or a physically created
`developedKind`) adds a bounded `-0.28 * specializationRank` term to the
shared 8-neighbor frontier candidate score. This operates on actual current
tissue geometry and its registered growth-site direction, and favors compact
Eyes, broad Wings/Feet and longitudinal Legs/Tails. General allometric body
phases and specialist mechanics can compete; none authorizes a cell by
itself. All original Body pixels retain the Body identity indefinitely.
Physical branching of a genetically specialized parent also carries the
same fixed `developedKind` and `geneticInstructionId` into its new
source-linked child tissue. This is inherited specialization of the SAME
living organ, not another gene decision or an invented new body-part label.
Any later differentiated kind still requires a separate explicitly authorized
operator. Source-selected brush parts similarly retain their source part kind
through any generated physical branches.

The combined rule is an experimental prior and still needs genuine visual
evaluation rather than just metadata counting.

This mechanism is implemented but **not yet manually confirmed as dramatic
or legible on mobile Safari**. Even an accepted physical strain does not
prove the player would find the resulting creature appealing. No automatic
CI/verification checks were restored.

### Pigment expression of newly generated tissue

A genuine genetically developed child may have a reproducible, visually
distinct tissue pigment from the very first accepted bud cell. **No original
player-drawn pixel is recolored.** The rule applies only when an authorized
`geneticInstructionId` and `developedKind` create a child from a cell of
a different parent tissue. Subsequent bud and expansion cells inherit that
child pigment directly, so repeated operations cannot reapply the tint.

For six-digit hex source channels `R,G,B`, luminance
`Y=(0.2126 R+0.7152 G+0.0722 B)/255`, contrast target
`T=232` if `Y<0.46`, else `T=24`, and specialization coefficient
`a(kind) ∈ {0.16, 0.28, 0.38, 0.82}`, each generated channel is

```text
C_child = round((1-a)*C_parent + a*T_kind)
```

Eyes and mouths use strong high/low luminance contrast, broad membranes a
gentler shade, and other organs smaller color differences. Unsupported
color strings are inherited unchanged. This is a **physical tissue
specialization adjunct**, not a simulated eye painted on the surface, a
species target, or qualifying evidence of morphological variety by itself.
Source ancestry, attachment and coherent material growth remain required.

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
