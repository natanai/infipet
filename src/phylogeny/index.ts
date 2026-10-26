import data from "./catalog-data.json";

export type PhylogenyNode = {
  id: string;
  parentId: string | null;
  name: string | null;
  ottId: number | null;
  rank: string | null;
  /** Only ancestry paths to implemented profiles are bundled. */
  children: readonly string[];
  sourceChildCount: number;
  evidence: {
    supportedBy: readonly string[];
    conflictsWith: readonly string[];
    resolves: readonly string[];
  };
};
export type AnimalProfile = {
  id: string;
  name: string;
  ottId: number;
  traits: readonly string[];
  kind: string;
  sourceAnchor: string;
};

export const datasetVersion = data.datasetVersion;
export const profileVersion = data.profileVersion;
export const rootId = data.rootId;
export const nodes: readonly PhylogenyNode[] = data.nodes;
export const animalProfiles: readonly AnimalProfile[] = data.profiles;
export const unresolvedProfiles = data.unresolvedProfiles;
const byId = new Map(nodes.map((node) => [node.id, node]));
const profilesById = new Map(
  animalProfiles.map((profile) => [profile.id, profile]),
);

export function getNode(id: string): PhylogenyNode | undefined {
  return byId.get(id);
}
export function childrenOf(id: string): readonly PhylogenyNode[] {
  return (getNode(id)?.children ?? []).map((child) => byId.get(child)!);
}
/** Self first, then each exact source parent, ending at Metazoa. Unknown IDs return []. */
export function ancestry(id: string): readonly PhylogenyNode[] {
  const result: PhylogenyNode[] = [];
  let current = getNode(id);
  while (current) {
    result.push(current);
    current = current.parentId ? getNode(current.parentId) : undefined;
  }
  return result;
}
/** Inclusive: a represented node is a descendant of itself. */
export function isDescendant(id: string, ancestorId: string): boolean {
  return ancestry(id).some((node) => node.id === ancestorId);
}
/** IDs outside the compact supported closure intentionally have no runtime diagnosis. */
export function nearestSupportedProfile(id: string): AnimalProfile | undefined {
  for (const node of ancestry(id)) {
    const profile = profilesById.get(node.id);
    if (profile) return profile;
  }
  return undefined;
}
