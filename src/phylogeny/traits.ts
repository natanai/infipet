/**
 * Finite developmental priors, not a species predictor or a list of evolution
 * destinations. Empty dimensions mean unknown, NOT biologically impossible.
 * The allowed sets describe common developmental architectures, not universal
 * diagnostic characters of every member or life stage of a clade.
 */
export type TraitSchema = {
  organization: "unicellular" | "colonial" | "multicellular";
  wallMaterial: "unwalled" | "cellulose-rich" | "chitin-glucan" | "other";
  growthPattern: "distributed" | "tip-directed" | "meristem-directed" | "budding";
};
export type TraitDimension = keyof TraitSchema;
export type TraitRule = {
  [K in TraitDimension]: Readonly<{
    dimension: K;
    allowed: readonly TraitSchema[K][];
    evidenceUrl: string;
    interpretation: string;
  }>;
}[TraitDimension];
export type DevelopmentOperator =
  | "tip-extension"
  | "branch-axis"
  | "surface-expansion"
  | "tissue-remodeling"
  | "appendage-extension"
  | "wall-deposition";
export type OperatorPrior = Readonly<{
  operator: DevelopmentOperator;
  introducedBy: string;
  evidenceUrl: string;
  provenance: "scientific" | "fictional";
}>;
export type ResolvedTrait = Readonly<{
  allowed: readonly string[];
  introducedBy: string;
  refinedBy: readonly string[];
  evidenceUrls: readonly string[];
}>;
export type DevelopmentPrior = Readonly<{
  taxonId: string;
  fixedAncestry: readonly string[];
  constraints: Readonly<Partial<Record<TraitDimension, ResolvedTrait>>>;
  operatorHints: readonly OperatorPrior[];
  includesFiction: boolean;
  /** Ancestry and taxonId never change during an individual's lifetime. */
  version: string;
}>;

type EvidenceDefinition = Readonly<{
  rules?: readonly TraitRule[];
  operators?: readonly DevelopmentOperator[];
  operatorEvidence?: string;
}>;
const animal = "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=33208";
const plantWalls = "https://www.ncbi.nlm.nih.gov/books/NBK579936/";
const plantGrowth = "https://pmc.ncbi.nlm.nih.gov/articles/PMC3517227/";
const fungalWalls = "https://www.nature.com/articles/s41579-022-00796-9";
const fungalGrowth = "https://pmc.ncbi.nlm.nih.gov/articles/PMC11687463/";

const evidence: Readonly<Record<string, EvidenceDefinition>> = {
  "ott691846": {
    rules: [
      { dimension: "organization", allowed: ["multicellular"], evidenceUrl: animal,
        interpretation: "Common metazoan multicellular organization; not a species diagnosis." },
      { dimension: "wallMaterial", allowed: ["unwalled"], evidenceUrl: animal,
        interpretation: "Animal cell surfaces are not surrounded by rigid plant/fungal cell walls." },
    ],
    operators: ["tissue-remodeling", "appendage-extension", "surface-expansion"],
    operatorEvidence: animal,
  },
  "ncbi:33090": {
    rules: [
      { dimension: "wallMaterial", allowed: ["cellulose-rich", "other"], evidenceUrl: plantWalls,
        interpretation: "Green plant walls typically contain cellulose; variants remain possible." },
    ],
    operators: ["wall-deposition", "surface-expansion"],
    operatorEvidence: plantWalls,
  },
  "ncbi:3193": {
    rules: [
      { dimension: "wallMaterial", allowed: ["cellulose-rich"], evidenceUrl: plantWalls,
        interpretation: "Land-plant cell wall architecture used as a developmental prior." },
      { dimension: "growthPattern", allowed: ["meristem-directed"], evidenceUrl: plantGrowth,
        interpretation: "Meristematic growth prior; individual structures may develop differently." },
      { dimension: "organization", allowed: ["multicellular"], evidenceUrl: plantGrowth,
        interpretation: "Land plants develop multicellular bodies." },
    ],
    operators: ["tip-extension", "branch-axis"],
    operatorEvidence: plantGrowth,
  },
  "ncbi:4751": {
    rules: [
      { dimension: "wallMaterial", allowed: ["chitin-glucan", "other"], evidenceUrl: fungalWalls,
        interpretation: "Typical fungal wall material, allowing documented variation." },
      { dimension: "growthPattern", allowed: ["tip-directed", "budding", "distributed"], evidenceUrl: fungalGrowth,
        interpretation: "Broad fungal developmental possibilities, including nonfilamentous forms." },
    ],
    operators: ["wall-deposition"],
    operatorEvidence: fungalWalls,
  },
  "ncbi:451864": {
    rules: [
      { dimension: "wallMaterial", allowed: ["chitin-glucan"], evidenceUrl: fungalWalls,
        interpretation: "Common dikaryan wall prior, not a claim of absolute invariance." },
      { dimension: "growthPattern", allowed: ["tip-directed", "budding"], evidenceUrl: fungalGrowth,
        interpretation: "Hyphal and yeast-like dikaryan developmental possibilities." },
    ],
    operators: ["tip-extension", "branch-axis"],
    operatorEvidence: fungalGrowth,
  },
};

/** Compiles inherited and refined priors along a stable root-to-leaf lineage. */
export function compileAncestralTraits(
  selfId: string,
  selfToRoot: readonly string[],
  fictionalOperators: ReadonlyMap<string, readonly DevelopmentOperator[]> = new Map(),
): DevelopmentPrior {
  const constraints: Partial<Record<TraitDimension, ResolvedTrait>> = {};
  const operators: OperatorPrior[] = [];
  const seenOperators = new Set<DevelopmentOperator>();
  for (const id of [...selfToRoot].reverse()) {
    const definition = evidence[id];
    for (const rule of definition?.rules ?? []) {
      const inherited = constraints[rule.dimension];
      // Every refinement can only narrow existing permitted values. A new
      // evolutionary capability is an explicit operator, not a silent widening.
      if (inherited && rule.allowed.some(value => !inherited.allowed.includes(value))) {
        throw new Error(`Non-refining biological trait at ${id}: ${rule.dimension}`);
      }
      constraints[rule.dimension] = {
        allowed: [...rule.allowed],
        introducedBy: inherited?.introducedBy ?? id,
        refinedBy: [...(inherited?.refinedBy ?? []), ...(inherited ? [id] : [])],
        evidenceUrls: [...(inherited?.evidenceUrls ?? []), rule.evidenceUrl],
      };
    }
    for (const operator of definition?.operators ?? []) {
      if (seenOperators.has(operator)) continue;
      seenOperators.add(operator);
      operators.push({ operator, introducedBy: id,
        evidenceUrl: definition?.operatorEvidence ?? "", provenance: "scientific" });
    }
    for (const operator of fictionalOperators.get(id) ?? []) {
      // The same operator can have additional fictional provenance; no fictional
      // capability is quietly relabeled as scientific.
      operators.push({ operator, introducedBy: id, evidenceUrl: "", provenance: "fictional" });
    }
  }
  return {
    taxonId: selfId, fixedAncestry: [...selfToRoot],
    constraints, operatorHints: operators,
    includesFiction: selfToRoot.some(id => fictionalOperators.has(id)),
    version: "infipet-developmental-priors-v1",
  };
}
