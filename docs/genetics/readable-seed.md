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
tree including all explicit fictional overlays. The nearest initial reference
uses only declared brush counts and a seed-derived tie break: the drawing's
position, symmetry, color, shape, holes or apparent facial features never
contribute semantic evidence.

Expression: the first **six** accepted gene opportunities on sufficiently
small source architectures are translated into ordinary, capped, source-owned
`bud` and `expand` operators, chronologically located within the first
365 daily checks. They use **no new chaotic equations**. These are physically
audited and may do nothing if care/resources/contacts do not permit them.
The rest of the genetic potential remains latent rather than producing fake
particles, violating the finite operator limit or forcing a shape.

The existing physics system may still use historical deterministic chaotic
fields for old growth operators. Those are retained only for compatibility and
audited separately; chaos is not part of the new seed-word decisions.
Do not add more chaos until independently demonstrated whole-body expressive
morphology and legibility are achieved without it.

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
