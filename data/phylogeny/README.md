# Pinned represented animal data

Raw OpenTree16.1/OTT3.7.3 descendants of Metazoa ott691846. See [the dataset documentation](../../docs/phylogeny.md) for coverage, limitations, source rights and reproducible commands. `manifest.json` supplies source/download hashes and counts. `upstream/` is a disposable ignored download cache; the raw animal extraction is retained here and stays outside the application bundle.

This snapshot preserves source uncertainty and taxonomy-only branches. It supplies neither all animal species nor divergence dates, mutation probabilities or inferred ancestral appearances. Runtime developmental modifiers are separately authored game data.

Every raw node includes its nearest supported ancestral `profileId` and `profileKind: "fictional-development-profile"`. Those fields are derived Infipet annotations, separately identifiable from source science. The complete inherited assignment is validated against actual source ancestry. Offline taxon queries are available through `tools/phylogeny/lookup.ts`; the app keeps its compact catalog.
