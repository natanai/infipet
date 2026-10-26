# Retro reference catalog

`data/retro-reference/catalog.json` is an offline evaluation catalog, version
`retro-reference-v2`. It records the English international 1997 Digital Monster
Version 1 roster (14 forms), original Tamagotchi P1 (11 forms, including Bill), and
original English P2 (11 forms, including Pochitchi and Zatchi). Japanese secret
forms and later rerelease additions are outside this baseline.

The catalog can provide a source drawing when a player explicitly chooses that
form as a new beginning. A reference ID, target bitmap, desired later character,
or future sprite must never enter the ordinary simulation or renderer. A source
preset matching its own initial drawing proves only source reconstruction. It
does not prove that an earlier drawing can grow into that form.

## Evidence and reproduction

- [Humulos's original Digital Monster charts](https://humulos.com/digimon/dm/)
  supply the V1 roster, depicted relationships, and original monochrome chart
  glyphs. The archived GIFs are exactly 36×36. Removing a two-pixel border gives
  a 32×32 image in which every 2×2 block is constant, yielding a lossless 16×16
  glyph. The chart is community evidence; these glyphs have not been checked
  against a device ROM or independent LCD traces.
- [Rhubarbtart's original P1 reverse-engineering log](https://rhubarbtart.neocities.org/p1hackinglog),
  its [memory and evolution notes](https://rhubarbtart.neocities.org/file/tama_notes.txt),
  [character statistics](https://rhubarbtart.neocities.org/file/stats.txt),
  [published sprite extractor](https://rhubarbtart.neocities.org/file/rip.py), and
  [extracted sprite pieces](https://rhubarbtart.neocities.org/file/sprites.zip)
  provide primary reverse-engineering evidence. The researcher explicitly
  distinguishes the vintage P1 firmware from the rerelease.
- [agg23's annotated P1 disassembly](https://github.com/agg23/tamagotchi-disassembled/blob/master/tama.asm)
  makes complete P1 poses reproducible without executing a ROM. Character index
  0x05D selects a base in the upper and lower animation tables at 0xC00 and
  0xD00. Matching offsets select each half. The render routine at 0x928–0x97E
  removes the horizontal-mirror bit and adds 3 to the asset index; the asset
  dispatcher selects 16-byte column blocks beginning at 0x1000. `RetD` supplies
  the final byte, and the least significant bit is the upper pixel of a column.
  These details are captured per character as source addresses and mirror flags.
  Babytchi uses a complete 16×8 glyph; other selected poses combine coherent
  16×8 upper and lower parts into 16×16 glyphs. Shared parts are intentional.
  Comments naming a part alone are insufficient to select its paired pose.
- [Mimitchi's firsthand vintage-device FAQ](https://www.mimitchi.com/html/q2.htm)
  corroborates the English P1/P2 roster. Observation is distinguished from a
  primary firmware predicate.
- [The Spriters Resource's Original P1/P2 atlas](https://www.spriters-resource.com/lcd_handhelds/tamagotchioriginalp1p2/page-1/)
  provides public community sprite sheets. The game page also contains later
  additions such as Charitchi, so a game-page label alone does not certify the
  firmware edition of an individual sheet. Any P2 sheet without a pinned
  original-device extraction is provisional for original-P2 morphology scoring.
  Direct HTTP requests were rejected; where the same public page rendered
  normally, only its observed image was downloaded with the browser asset API.
  No challenge, authentication, or access restriction was bypassed.

`source-manifest.json` records retrieval date, original URLs, byte counts and
SHA-256 hashes. `build_catalog.py` reads archived files and performs no network
access. `fetch_sources.py` refreshes public sources and records failed requests;
refreshing a source requires reviewing the resulting hashes and catalog version.

Run with Python plus Pillow:

```text
python tools/retro-reference/build_catalog.py
python tools/retro-reference/validate.py
```

## Lifecycle limits

V1 edges are the original-device community chart's depicted relationships.
Numerical eligibility thresholds and advanced-stage random checks require
separate certification in the gameplay parity ledger.

P1 includes the reverse engineer's type-1/type-2 teen variants and cross-care
Tamatchi routes, rather than assuming that a good-care teen can only produce
good-care adults. `routeEligibility` preserves reported care/discipline
predicates and their provenance. The researcher reports no evidence that the
pre-adult counters reset, and explicitly labels some secret-form conclusions
as theories. Type-1 Maskutchi is not eligible for Bill; the reported Bill route
requires Maskutchi reached from type-2 Tamatchi. A character-only graph cannot
express this whole history constraint, so a graph path alone is not a certified
device route.

P2 edges currently describe canonical pictured routes. Its firmware-complete
variant and cross-care predicates remain unresolved. Missing predicates remain
visible instead of being inferred from P1. Infipet's combined lifecycle stage
times differ from the original P1/P2 timing and must be scored separately.

A selected pose cannot establish animation, timing, refusal behavior, care
consequences, or whole-lifecycle fidelity. An unavailable or provisional target
cannot certify original-device morphology. Search results are candidates;
passing requires the normal engine, a birth drawing, a stable seed, accepted
care commands, and persistent stage decisions, with all checkpoints evaluated.

## Rights and distribution

Bandai/WiZ characters and original graphical data remain their owners' material.
No asset license is inferred from public accessibility or from the catalog's
extraction code. In particular, the annotated disassembly's README states that
the Tamagotchi ROM and source are Bandai property and are outside that
repository's license. The primary researcher's notes and extracted images do
not state an asset redistribution license. Humulos and the sprite atlas are
community reference hosts, not grants of rights to the underlying graphics.

The raw pages, published educational disassembly, sprite pieces and future-stage
targets are reference/evaluation data outside the mobile runtime. Editable
source presets are an explicit product use and retain source provenance; this
document does not claim a license for publishing copied character artwork.
