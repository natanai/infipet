# Animal phylogeny and Infipet developmental profiles

The data snapshot is OpenTree **16.1**, built with **OTT 3.7.3 / 3.7draft3**. The animal root is the actual Metazoa node **ott691846**. The complete represented animal subtree is extracted without pruning, collapsing polytomies, or inventing branches. This is a synthesis of phylogenetic studies and taxonomy, not a complete catalogue of every living or extinct animal and not a mutation simulator.

The pinned source annotations give completion time **2025-12-20 00:55:58**; the pipeline index gives its final completion later that night. The release page has stale version/date prose. Source archives, extracted inputs, URLs, byte counts and SHA256 hashes are recorded in `data/phylogeny/manifest.json`.

## Data and coverage

The raw files contain **1,717,413 nodes**, **1,490,245 terminal tips**, **1,717,412 edges**, **1,652,722 named OTT taxa** and **64,691 unnamed synthetic nodes**. Internal named taxa and terminal species are different counts. Every descendant represented under the animal root is retained, including source flags, taxonomic ranks and external taxon references. No extinct taxa are added beyond those represented by this source.

- `animals.newick` preserves the exact source animal subtree.
- `nodes.jsonl` contains one record per represented node: source ID, synthetic parent, child count, OTT metadata and study support/conflict identifiers. Synthetic and taxonomic parentage remain separate fields. Every record also carries a derived `profileId` for its nearest supported source ancestor and `profileKind: "fictional-development-profile"`; these two fields are Infipet game data, not raw scientific traits.
- `edges.tsv` has one source parent/child edge per non-root node.
- `annotations.json` retains full original per-node animal annotations and study metadata, including conflicting inputs.
- `manifest.json` pins coverage, upstream identity, source hashes, unsupported profiles and limitations.

There are **73,551 nodes with explicit phylogenetic support annotations** and **14,401 with conflicting-input annotations**. Absence of a support annotation is not proof of a false relationship. Much of the tree is filled from taxonomy. Polytomies, disagreement and missing information are preserved; branch lengths, divergence dates, ancestral appearances and numerical mutation probabilities are not supplied by these sources and are not invented.

## Runtime contract

The application imports only `src/phylogeny/catalog-data.json`: the exact ancestry closure connecting supported developmental anchors, not the million-node bulk files. `src/phylogeny` exports `animalProfiles`, `nodes`, `getNode`, `childrenOf`, `ancestry`, `isDescendant` and `nearestSupportedProfile`, plus dataset/profile versions. `ancestry` is self-first; `isDescendant` includes the node itself. Unknown or unbundled IDs return no runtime node/profile. **All 1,717,413 raw nodes do resolve to an inherited profile offline**, including a neutral Metazoa fallback when no more specific supported ancestor exists. `tools/phylogeny/lookup.ts` exposes streaming `lookupRawNode` and a CLI for those unbundled taxon IDs without adding a large index to the app.

The 19 exact supported anchors are Metazoa, Porifera, Placozoa, Ctenophora, Cnidaria, Bilateria, Annelida, Nematoda, Mollusca, Arthropoda, Echinodermata, Chordata, Actinopterygii, Tetrapoda, Amphibia, Mammalia, Lepidosauria, Testudines and Aves. Their traits are **fictional game modifiers**, not claims that every member has that appearance or that drawings can establish evolutionary ancestry. Homonymous Ctenophora genera are excluded by the verified phylum OTT ID.

Crocodylia's taxonomic OTT anchor is absent from this synthetic tree. Its represented taxonomic descendants are examined to record their actual synthetic MRCA and whether that MRCA also contains other tips. This diagnostic never creates a replacement source edge or labels a broader group as exact Crocodylia. The profile stays unsupported; descendants use their nearest supported source ancestor. Resolution details and fallback are in the manifest.

A phylogeny describes inferred historical relationships. Individual aging, metamorphosis and care response are developmental processes; mutation and natural selection work across heritable variation and differential reproduction. Infipet uses this tree as a documented structural constraint for fictional within-life developmental routes. It does not claim that an individual biologically evolves into a different real species.

## Reproduce and verify

The original source cache is ignored under `data/phylogeny/upstream/`. The derived raw animal files and provenance manifest are retained independently of disposable pet saves. From the workspace root:

```powershell
./tools/phylogeny/fetch.ps1
node --max-old-space-size=4096 node_modules/tsx/dist/cli.mjs tools/phylogeny/build.ts
node --max-old-space-size=4096 node_modules/tsx/dist/cli.mjs tools/phylogeny/validate.ts
node node_modules/tsx/dist/cli.mjs tools/phylogeny/lookup.ts ott35864
node node_modules/tsx/dist/cli.mjs --test tests/phylogeny.test.ts
```

The full validator hashes every pinned input/output and compares **every** raw node and edge against the original animal subtree. It independently walks each node's actual source ancestry to verify its nearest supported profile, so full profile coverage is checked rather than sampled. `--derived-only` skips the optional upstream cache while still validating the retained output hashes and full derived graph. Unit tests cover catalog ancestry, unavailable anchors, false cross-clade links, offline species lookup and parser failures. Raw build/validation uses a larger Node heap; the app never loads these bulk files.

## Sources and rights

OpenTree data are [CC0 where not limited by pre-existing terms](https://tree.opentreeoflife.org/opentree/about/licenses); the downloaded OTT properties explicitly declare `cc0`. Source study identifiers and provenance remain present for attribution and interpretation. The game profile code and fictional developmental traits are authored within Infipet.

- [Official synthesis release 16.1](https://tree.opentreeoflife.org/about/synthesis-release/v16.1)
- [Pinned pipeline output and input policy](https://files.opentreeoflife.org/synthesis/opentree16.1/output/index.html)
- [Matching OTT archive](https://files.opentreeoflife.org/ott/ott3.7.3/ott3.7.3.tgz) and [properties](https://files.opentreeoflife.org/ott/ott3.7.3/properties.json)
- [OpenTree synthesis methods and source software](https://github.com/OpenTreeOfLife/propinquity)
