import animalData from "./catalog-data.json";
import { exploreDevelopmentalPossibilities, describeLifetimeDevelopmentalTrajectory } from "./possibilities";
export { exploreDevelopmentalPossibilities, describeLifetimeDevelopmentalTrajectory } from "./possibilities";
export type { AnatomicalPossibility, DevelopmentalPossibilityMap, LifetimeWaypointInput, LifetimeAnatomicalWaypoint, LifetimeDevelopmentalTrajectory } from "./possibilities";
import crossKingdomData from "./cross-kingdom-data.json";
import {
  compileAncestralTraits,
  type DevelopmentOperator,
  type DevelopmentPrior,
} from "./traits";

export type {
  TraitSchema, TraitDimension, TraitRule, DevelopmentOperator,
  OperatorPrior, ResolvedTrait, DevelopmentPrior,
} from "./traits";

export type PhylogenyNode = {
  id: string;
  parentId: string | null;
  name: string | null;
  ottId: number | null;
  rank: string | null;
  /** Only the compact represented closure, never all source descendants. */
  children: readonly string[];
  sourceChildCount: number;
  evidence: {
    supportedBy: readonly string[];
    conflictsWith: readonly string[];
    resolves: readonly string[];
  };
  /** All existing animal IDs and evidence remain valid. */
  origin?: "scientific" | "fictional";
};
export type AnimalProfile = {
  id: string;
  name: string;
  ottId: number;
  traits: readonly string[];
  kind: string;
  sourceAnchor: string;
};
export type ExternalTaxonId = Readonly<{
  database: "ott" | "ncbi";
  id: number;
}>;
export type SourceProvenance =
  | Readonly<{
      kind: "scientific";
      source: "Open Tree of Life" | "NCBI Taxonomy";
      sourceVersion: string;
      externalTaxonIds: readonly ExternalTaxonId[];
      /** Synthetic MRCA nodes have no external taxon number but do have source node IDs. */
      sourceNodeId: string;
      parentEdgeSourceUrl: string | null;
      evidence: PhylogenyNode["evidence"];
    }>
  | Readonly<{
      kind: "fictional";
      source: "infipet-speculative-v1";
      sourceVersion: "1";
      externalTaxonIds: readonly [];
      parentEdgeSourceUrl: null;
      rationale: string;
    }>;
export type ScientificNode = PhylogenyNode & Readonly<{
  origin: "scientific";
}>;
export type FictionalNode = PhylogenyNode & Readonly<{
  origin: "fictional";
  fiction: Readonly<{ rationale: string; operatorHints: readonly DevelopmentOperator[] }>;
}>;
export type TreeNode = ScientificNode | FictionalNode;
export type SpeculativeBranchInput = Readonly<{
  /** Requires the fiction: namespace: never masquerades as a taxon. */
  id: `fiction:${string}`;
  parentId: string;
  name: string;
  rationale: string;
  /** Shared developmental operator vocabulary, not a dedicated growth engine. */
  operatorHints: readonly DevelopmentOperator[];
}>;
export type PhylogenyView = Readonly<{
  nodes: readonly TreeNode[];
  getNode: (id: string) => TreeNode | undefined;
  parentOf: (id: string) => TreeNode | undefined;
  childrenOf: (id: string) => readonly TreeNode[];
  ancestry: (id: string) => readonly TreeNode[];
  commonAncestor: (left: string, right: string) => TreeNode | undefined;
  isDescendant: (id: string, ancestorId: string) => boolean;
  lineageMembership: (id: string, ancestorId: string) => boolean;
  getProvenance: (id: string) => SourceProvenance | undefined;
  resolveBiologicalConstraints: (id: string) => DevelopmentPrior | undefined;
  validate: () => readonly string[];
}>;

/** Backwards-compatible animal identifiers and profile API. */
export const datasetVersion = animalData.datasetVersion;
export const profileVersion = animalData.profileVersion;
export const rootId = animalData.rootId;
/** Eukaryota is a known taxon, but the ancestry *above* it is unrepresented. */
export const fullRootId = "ncbi:2759";
export const crossKingdomVersion = crossKingdomData.sourceVersion;
export const animalProfiles: readonly AnimalProfile[] = animalData.profiles;
export const unresolvedProfiles = animalData.unresolvedProfiles;

const EMPTY_EVIDENCE = { supportedBy: [], conflictsWith: [], resolves: [] } as const;
const animal: ScientificNode[] = animalData.nodes.map(node => ({
  ...node,
  // A provenance-backed crosswalk extends the old animal root, rather than
  // reassigning any of its 57 historical identifiers.
  parentId: node.id === rootId ? "ncbi:33154" : node.parentId,
  origin: "scientific",
}));
const anchors: ScientificNode[] = crossKingdomData.nodes.map(record => ({
  id: record.id,
  parentId: record.parentId,
  name: record.name,
  rank: record.rank,
  ottId: null,
  sourceChildCount: 0, // Not a complete taxonomic descendant count.
  children: [],
  evidence: EMPTY_EVIDENCE,
  origin: "scientific",
}));

/** No invented intermediary nodes, parent edges or anonymous root above Eukaryota. */
export function createPhylogenyView(
  fictionalBranches: readonly SpeculativeBranchInput[] = [],
): PhylogenyView {
  const sourceNodes: TreeNode[] = [...animal, ...anchors];
  const ids = new Set(sourceNodes.map(node => node.id));
  const fictionalOperators = new Map<string, readonly DevelopmentOperator[]>();
  const validOperators = new Set<DevelopmentOperator>([
    "tip-extension", "branch-axis", "surface-expansion", "tissue-remodeling",
    "appendage-extension", "wall-deposition",
  ]);
  for (const input of fictionalBranches) {
    if (!input.id.startsWith("fiction:") || input.id.length <= 8 ||
        !input.name.trim() || !input.rationale.trim() || ids.has(input.id)) {
      throw new Error("Invalid or colliding explicitly fictional ancestry node");
    }
    if (input.operatorHints.some(op => !validOperators.has(op))) {
      throw new Error("Unknown developmental operator in fictional branch");
    }
    ids.add(input.id);
    fictionalOperators.set(input.id, [...input.operatorHints]);
    sourceNodes.push({
      id: input.id, parentId: input.parentId, name: input.name,
      ottId: null, rank: null, sourceChildCount: 0, children: [],
      evidence: EMPTY_EVIDENCE, origin: "fictional",
      fiction: { rationale: input.rationale, operatorHints: [...input.operatorHints] },
    });
  }
  const linked = new Map<string, string[]>();
  for (const node of sourceNodes) linked.set(node.id, [...node.children]);
  for (const node of sourceNodes) {
    if (!node.parentId) continue;
    // Preserve the source animal catalog's original sibling ordering.
    const siblings = linked.get(node.parentId);
    if (siblings && !siblings.includes(node.id)) siblings.push(node.id);
  }
  const viewNodes = sourceNodes.map(node => ({
    ...node, children: linked.get(node.id) ?? [],
  })) as TreeNode[];
  const byId = new Map(viewNodes.map(node => [node.id, node]));
  const getNode = (id: string) => byId.get(id);
  const parentOf = (id: string) => {
    const parentId = getNode(id)?.parentId;
    return parentId ? getNode(parentId) : undefined;
  };
  const ancestry = (id: string): readonly TreeNode[] => {
    const result: TreeNode[] = [];
    const visited = new Set<string>();
    let current = getNode(id);
    while (current) {
      if (visited.has(current.id)) throw new Error("Cyclic phylogenetic ancestry");
      visited.add(current.id);
      result.push(current);
      current = current.parentId ? getNode(current.parentId) : undefined;
    }
    return result;
  };
  const isDescendant = (id: string, ancestorId: string) =>
    ancestry(id).some(node => node.id === ancestorId);
  const commonAncestor = (left: string, right: string) => {
    if (!getNode(left) || !getNode(right)) return undefined;
    const rightAncestors = new Set(ancestry(right).map(node => node.id));
    return ancestry(left).find(node => rightAncestors.has(node.id));
  };
  const getProvenance = (id: string): SourceProvenance | undefined => {
    const node = getNode(id);
    if (!node) return undefined;
    if (node.origin === "fictional") {
      return {
        kind: "fictional", source: "infipet-speculative-v1", sourceVersion: "1",
        externalTaxonIds: [], parentEdgeSourceUrl: null,
        rationale: node.fiction.rationale,
      };
    }
    const anchor = crossKingdomData.nodes.find(taxon => taxon.id === id);
    if (anchor) return {
      kind: "scientific", source: "NCBI Taxonomy",
      sourceVersion: crossKingdomVersion,
      externalTaxonIds: [{ database: "ncbi", id: anchor.ncbiId }],
      sourceNodeId: id, parentEdgeSourceUrl: anchor.parentEdgeSourceUrl,
      evidence: node.evidence,
    };
    const refs: ExternalTaxonId[] = node.ottId === null
      ? [] : [{ database: "ott", id: node.ottId }];
    if (id === rootId) refs.push({
      database: "ncbi", id: crossKingdomData.animalCrosswalk.ncbiId,
    });
    return {
      kind: "scientific", source: "Open Tree of Life",
      sourceVersion: datasetVersion,
      externalTaxonIds: refs,
      sourceNodeId: id,
      parentEdgeSourceUrl: id === rootId
        ? crossKingdomData.animalCrosswalk.sourceUrl
        : "https://tree.opentreeoflife.org/",
      evidence: node.evidence,
    };
  };
  const validate = (): readonly string[] => {
    const errors: string[] = [];
    for (const node of viewNodes) {
      if (node.parentId && !byId.has(node.parentId))
        errors.push(`Unknown parent ${node.parentId} of ${node.id}`);
      if (node.id !== fullRootId && !node.parentId)
        errors.push(`Unexpected disconnected root ${node.id}`);
      if (node.origin === "scientific" && node.parentId &&
          !getProvenance(node.id)?.parentEdgeSourceUrl)
        errors.push(`Missing scientific parent-edge source ${node.id}`);
      for (const child of node.children)
        if (getNode(child)?.parentId !== node.id)
          errors.push(`Inconsistent child link ${node.id} / ${child}`);
      try { ancestry(node.id); }
      catch { errors.push(`Cyclic ancestry at ${node.id}`); }
    }
    return errors;
  };
  const errors = validate();
  if (errors.length) throw new Error(errors.join("; "));
  return {
    nodes: viewNodes, getNode, parentOf,
    childrenOf: id => (getNode(id)?.children ?? []).map(child => byId.get(child)!),
    ancestry, commonAncestor, isDescendant, lineageMembership: isDescendant,
    getProvenance,
    resolveBiologicalConstraints: id => getNode(id)
      ? compileAncestralTraits(id, ancestry(id).map(node => node.id), fictionalOperators)
      : undefined,
    validate,
  };
}
const base = createPhylogenyView();
export const nodes: readonly PhylogenyNode[] = base.nodes;
export const getNode = base.getNode;
export const parentOf = base.parentOf;
export const childrenOf = base.childrenOf;
export const ancestry = base.ancestry;
export const commonAncestor = base.commonAncestor;
export const isDescendant = base.isDescendant;
export const lineageMembership = base.lineageMembership;
export const getProvenance = base.getProvenance;
export const resolveBiologicalConstraints = base.resolveBiologicalConstraints;
export const validatePhylogeny = base.validate;
/** Science graph is immutable; anatomical inspirations may vary during one lifetime. */
export const developmentalPossibilities = (birthReferenceId: string, candidateIds?: readonly string[]) =>
  exploreDevelopmentalPossibilities(base, birthReferenceId, candidateIds);
export const lifetimeDevelopmentalTrajectory = (birthReferenceId: string, waypoints: readonly import("./possibilities").LifetimeWaypointInput[]) =>
  describeLifetimeDevelopmentalTrajectory(base, birthReferenceId, waypoints);
const profilesById = new Map(animalProfiles.map(profile => [profile.id, profile]));
/** IDs outside the compact supported animal closure have no animal profile. */
export function nearestSupportedProfile(id: string): AnimalProfile | undefined {
  for (const node of ancestry(id)) {
    const profile = profilesById.get(node.id);
    if (profile) return profile;
  }
  return undefined;
}
