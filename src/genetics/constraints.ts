import {
  DEVELOPMENTAL_CHANNELS,
  type DevelopmentalChannels,
  type DevelopmentalGenotype,
  type GeneticGroup,
} from "./channels";

/** Proposed PHY-002 handoff; only provenance-backed ancestry can supply verified bounds. */
export type BiologicalTraitRange = Readonly<{ min: number; max: number }>;
export type BiologicalTraitBounds = {
  readonly [G in GeneticGroup]?: Partial<
    Record<keyof (typeof DEVELOPMENTAL_CHANNELS)[G], BiologicalTraitRange>
  >;
};
export type AncestralTraitConstraints = Readonly<{
  schemaVersion: 1;
  lineageNodeId: string;
  provenance: "scientific" | "fictional" | "unresolved";
  bounds: BiologicalTraitBounds;
}>;
export type ConstraintAdjustment = Readonly<{
  channel: string;
  inherited: number;
  expressed: number;
}>;
export type GeneticExpression = Readonly<{
  channels: DevelopmentalChannels;
  lineage: Readonly<{
    nodeId: string;
    provenance: AncestralTraitConstraints["provenance"];
  }> | null;
  adjustments: readonly ConstraintAdjustment[];
}>;

/** Reject malformed constraints rather than inventing or silently relaxing ancestry. */
function check(constraints: AncestralTraitConstraints): void {
  if (constraints.schemaVersion !== 1 || !constraints.lineageNodeId.trim())
    throw new TypeError("Ancestral constraints require a version and lineage node ID");
  if (!["scientific", "fictional", "unresolved"].includes(constraints.provenance))
    throw new TypeError("Unknown ancestry provenance");
  if (constraints.provenance === "unresolved" && Object.keys(constraints.bounds).length)
    throw new TypeError("Unresolved ancestry cannot impose biological bounds");
  for (const [group, traits] of Object.entries(constraints.bounds)) {
    if (!(group in DEVELOPMENTAL_CHANNELS) || !traits || typeof traits !== "object")
      throw new TypeError("Unknown constrained genetic group: " + group);
    const schema = DEVELOPMENTAL_CHANNELS[group as GeneticGroup];
    for (const [name, range] of Object.entries(traits)) {
      if (!(name in schema) || !range ||
          !Number.isFinite(range.min) || !Number.isFinite(range.max) ||
          range.min < 0 || range.max > 1 || range.min > range.max)
        throw new RangeError("Invalid ancestral trait bounds: " + group + "." + name);
    }
  }
}

/** Ancestry constrains *expression*, never the underlying inherited alleles. */
export function expressGenotype(
  inherited: DevelopmentalGenotype,
  constraints?: AncestralTraitConstraints,
): GeneticExpression {
  if (constraints) check(constraints);
  const groups = {} as Record<GeneticGroup, Record<string, number>>;
  const adjustments: ConstraintAdjustment[] = [];
  for (const group of Object.keys(DEVELOPMENTAL_CHANNELS) as GeneticGroup[]) {
    groups[group] = {};
    const bounds = constraints?.bounds[group] as
      Record<string, BiologicalTraitRange> | undefined;
    const genes = inherited.channels[group] as Record<string, number>;
    for (const trait of Object.keys(DEVELOPMENTAL_CHANNELS[group])) {
      const raw = genes[trait];
      const range = bounds?.[trait];
      const expressed = range ? Math.max(range.min, Math.min(range.max, raw)) : raw;
      groups[group][trait] = expressed;
      if (expressed !== raw)
        adjustments.push({ channel: group + "." + trait, inherited: raw, expressed });
    }
  }
  return {
    channels: groups as DevelopmentalChannels,
    lineage: constraints
      ? { nodeId: constraints.lineageNodeId, provenance: constraints.provenance }
      : null,
    adjustments,
  };
}
