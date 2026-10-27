/**
 * DEV-005: fictional/scientific anatomical inspirations compile to exactly the
 * SAME physical MaterialOperator vocabulary and chronology as ordinary care.
 *
 * No fantasy growth engine, target species, sprite or independent material graph.
 * The single output program is accepted unchanged by createUnifiedMaterialTimeline
 * and by SimulationOptions.verifyMaterialProgram. Its source, genetic signals,
 * and original operators remain authoritative; generated cells/events are
 * produced by the existing operator-chronology transactions only.
 *
 * For waypoint w_i at t_i, operator hint h_j, source site s:
 *   opId = "speculative/" + encode(i,reference,hint,source)
 *   start = t_i + j/8 h, duration = 24 h
 *   strength = 3/4 + inheritedChannel(h)/4, in [3/4,1]
 *   chaoticRate = 0.12 + 0.20 * inheritedGrowthRate
 *   chaoticTurn = 0.10 + 0.30 * inheritedBranchDivergence.
 *
 * The inherited channels and materialOperatorPotential then bound each
 * earned unit: Q(t) = min(9, floor(multiplier * strength * potential *
 * cumulativeCareChaosExpression(t) + 1e-10)); multiplier is 5 for branch,
 * 7 otherwise. The existing transaction engine supplies exact threshold
 * chronology, physical collision/ancestry/void constraints and suppression.
 * No independently accumulated credits or second 3072-cell budget exist.
 *
 * Stable sorted (operator,provenance,introducedBy) hints are assigned to real
 * birth-derived material sites via a seed+source+hint hash modulo site count;
 * no interpretation of a drawn animal part or species name is involved.
 * The renderer/phylogeny can use a waypoint's scientific or fictional
 * provenance, but neither changes scientific parentage or latent genotype.
 */
import { compareText, hash } from "../simulation/model";
import type { InheritedGenome } from "../simulation/genome";
import type {
  PhylogenyView, LifetimeDevelopmentalTrajectory,
  LifetimeAnatomicalWaypoint, SourceProvenance,
} from "../phylogeny";
import { describeLifetimeDevelopmentalTrajectory } from "../phylogeny";
import type { DevelopmentOperator, OperatorPrior } from "../phylogeny/traits";
import type {
  MaterialDevelopmentProgram, MaterialOperator, MaterialOperatorKind,
} from "./operators";
import { MATERIAL_LIMITS } from "./operators";
import { CHAOS_VERSION, seedChaos } from "./chaos";
import type { MaterialGraph } from "./material-graph";
import type { MaterialOperatorDecision } from "./operator-chronology";

export const SPECULATIVE_LIMITS = {
  maxHour: 8192,
  durationHours: 24,
  slotHours: 1 / 8,
  maximumPhysicalOperators: MATERIAL_LIMITS.operators,
} as const;

/** Existing biological operations; no fantasy-specific physical kind. */
export const SPECULATIVE_OPERATOR_MAP = {
  "tip-extension": ["elongate"],
  "branch-axis": ["branch"],
  "surface-expansion": ["expand"],
  "tissue-remodeling": ["remodel", "resorb", "fuse"],
  "appendage-extension": ["bud"],
  "wall-deposition": ["reinforce"],
} as const satisfies Record<DevelopmentOperator, readonly MaterialOperatorKind[]>;

export type SpeculativeOperatorBinding = Readonly<{
  operatorId: string;
  materialKind: MaterialOperatorKind;
  referenceOperator: DevelopmentOperator;
  waypointIndex: number;
  waypointAtHour: number;
  referenceId: string;
  /** Fictional appearance is *not* a scientific ancestry change. */
  inspirationProvenance: SourceProvenance;
  /** Each hint can originate from an inherited scientific OR fictional node. */
  operatorHint: OperatorPrior;
  hintProvenance: SourceProvenance;
  tissueId: string;
  siteId: string | null;
  sourceCellIds: readonly string[];
  atHour: number;
  durationHours: number;
  geneticChannel: number;
}>;
export type SpeculativeCompileSuppression = Readonly<{
  waypointIndex: number;
  referenceOperator: DevelopmentOperator;
  referenceId: string;
  reason: "no-source-material" | "no-growth-site" |
    "material-operator-budget" | "outside-chronological-domain" |
    "operator-id-collision";
}>;
export type SpeculativeMaterialComposition = Readonly<{
  version: 1;
  program: MaterialDevelopmentProgram;
  bindings: readonly SpeculativeOperatorBinding[];
  suppressed: readonly SpeculativeCompileSuppression[];
  /** This is a verified reference trajectory, NOT a new creature lineage. */
  trajectory: LifetimeDevelopmentalTrajectory;
}>;
export type SpeculativePhysicalOutcome = Readonly<{
  binding: SpeculativeOperatorBinding;
  status: "accepted" | "deferred" | "suppressed" | "pending";
  /** One or more physical event witnesses; never merely a reference hint. */
  events: readonly MaterialGraph["events"][number][];
  /** Real material-operator ledger decisions, including reason. */
  decisions: readonly MaterialOperatorDecision[];
  activeCreatedCellIds: readonly string[];
}>;

function gene(g: MaterialDevelopmentProgram, k: DevelopmentOperator): number {
  const c = g.signals.channels;
  switch (k) {
    case "tip-extension": return c.growth.elongation;
    case "branch-axis": return c.branching.initiation;
    case "surface-expansion": return c.growth.expansion;
    case "tissue-remodeling": return c.maturation.plasticity;
    case "appendage-extension": return c.appendages.initiation;
    case "wall-deposition": return c.support.rigidity;
  }
}
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Accept a PHY-003 trajectory only if it exactly equals the authoritative
 * view's derivation. Callers cannot forge scientific evidence, operator hints
 * or fictional provenance by modifying a JSON waypoint.
 */
function verifiedTrajectory(view: PhylogenyView,
  input: LifetimeDevelopmentalTrajectory): LifetimeDevelopmentalTrajectory {
  if (input.version !== "infipet-lifetime-trajectory-contract-v1" ||
      input.execution !== "development-engine-not-implemented")
    throw new TypeError("Unknown speculative trajectory contract");
  const verified = describeLifetimeDevelopmentalTrajectory(
    view, input.birthReferenceId, input.waypoints.map(w => ({
      atHour: w.atHour,
      anatomicalReferenceId: w.inspiration.referenceId,
      influence: w.influence,
    })));
  if (JSON.stringify(verified) !== JSON.stringify(input))
    throw new TypeError("Anatomical references or provenance were altered");
  return verified;
}
function orderedHints(w: LifetimeAnatomicalWaypoint): OperatorPrior[] {
  // The union already incorporates the previous clade. Preserve distinct
  // evidence records (not one boolean "fantasy" switch).
  return [...w.availableOperatorHints].sort((a, b) =>
    compareText(a.operator, b.operator) ||
    compareText(a.provenance, b.provenance) ||
    compareText(a.introducedBy, b.introducedBy));
}

/**
 * Pure immutable compiler: caller must supply a reference VIEW containing any
 * explicitly declared fictional nodes. An ordinary unlabeled drawing requires
 * no reference and can simply use its unmodified base material program.
 */
export function compileSpeculativeMaterialComposition(
  base: MaterialDevelopmentProgram,
  genome: InheritedGenome,
  view: PhylogenyView,
  input: LifetimeDevelopmentalTrajectory,
): SpeculativeMaterialComposition {
  if (base.version !== 1 ||
      base.genomeFingerprint !== genome.genotype.fingerprint ||
      !base.source.sourceFingerprint ||
      base.operators.length > MATERIAL_LIMITS.operators)
    throw new TypeError("Speculation cannot replace an organism or genotype");
  const trajectory = verifiedTrajectory(view, input);
  const validTissues = new Set(base.source.tissues.map(t => t.id));
  const sourceCells = new Map(base.source.sourceCells.map(c => [c.id, c]));
  const sources = [...base.source.sites].filter(s =>
    validTissues.has(s.tissueId) &&
    base.source.cells.some(c => c.id === s.rootCellId &&
      c.tissueId === s.tissueId) &&
    base.source.tissues.some(t => t.id === s.tissueId &&
      t.sourceCellIds.some(id => sourceCells.has(id))))
    .sort((a, b) => compareText(a.id, b.id));
  const ops: MaterialOperator[] = [...base.operators];
  const seen = new Set(ops.map(op => op.id));
  if (seen.size !== ops.length) throw new TypeError("Duplicate source operator");
  const bindings: SpeculativeOperatorBinding[] = [];
  const suppressed: SpeculativeCompileSuppression[] = [];
  const report = (waypointIndex: number, hint: OperatorPrior,
    ref: string, reason: SpeculativeCompileSuppression["reason"]) =>
    suppressed.push({waypointIndex, referenceOperator: hint.operator,
      referenceId: ref, reason});

  for (const [i, w] of trajectory.waypoints.entries()) {
    for (const [j, hint] of orderedHints(w).entries()) {
      const referenceId = w.inspiration.referenceId;
      const start = w.atHour + j * SPECULATIVE_LIMITS.slotHours;
      if (start + SPECULATIVE_LIMITS.durationHours > SPECULATIVE_LIMITS.maxHour) {
        report(i, hint, referenceId, "outside-chronological-domain");
        continue;
      }
      if (!base.source.sourceCells.length || !base.source.cells.length) {
        report(i, hint, referenceId, "no-source-material");
        continue;
      }
      if (!sources.length) {
        report(i, hint, referenceId, "no-growth-site");
        continue;
      }
      if (ops.length >= MATERIAL_LIMITS.operators) {
        report(i, hint, referenceId, "material-operator-budget");
        continue;
      }
      // A stable source-derived site. Later waypoints NEVER reseed earlier
      // ones; permanent birth genotype changes only if the organism changes.
      const key = JSON.stringify([genome.seed, genome.mode,
        genome.genotype.fingerprint, base.source.sourceFingerprint,
        i, referenceId, hint.operator, hint.introducedBy]);
      const site = sources[hash(key) % sources.length];
      const compatible = SPECULATIVE_OPERATOR_MAP[hint.operator];
      const kind = compatible.length === 1 ? compatible[0] :
        compatible[hash(key + "|material-kind") % compatible.length];
      const targetTissueId = kind === "fuse"
        ? base.source.tissues
            .filter(t => t.id !== site.tissueId &&
              t.sourceCellIds.length > 0)
            .sort((a,b)=>compareText(a.id,b.id))[0]?.id
        : undefined;
      // Without a second real tissue, select the existing cellular
      // remodeling operator rather than fabricating material to fuse.
      const actualKind: MaterialOperatorKind =
        kind === "fuse" && !targetTissueId ? "remodel" : kind;
      const opId = "speculative/" + i + "/" +
        encodeURIComponent(referenceId) + "/" +
        encodeURIComponent(hint.operator) + "/" +
        encodeURIComponent(hint.introducedBy);
      if (seen.has(opId)) {
        report(i, hint, referenceId, "operator-id-collision");
        continue;
      }
      const inherited = clamp01(gene(base, hint.operator));
      const operator: MaterialOperator = {
        id: opId,
        kind: actualKind,
        tissueId: site.tissueId,
        siteId: site.id,
        ...(actualKind === "fuse" ? { targetTissueId } : {}),
        atHour: start,
        durationHours: SPECULATIVE_LIMITS.durationHours,
        strength: 0.75 + inherited * 0.25,
        chaos: {
          version: CHAOS_VERSION,
          initial: seedChaos([genome.seed, genome.mode,
            base.source.sourceFingerprint, opId, site.id].join("|")),
          rateAmplitude: 0.12 + 0.20 * base.signals.channels.growth.rate,
          turnAmplitude: 0.10 + 0.30 * base.signals.channels.branching.divergence,
        },
      };
      const hintProvenance = view.getProvenance(hint.introducedBy);
      if (!hintProvenance ||
          hintProvenance.kind !== hint.provenance)
        throw new TypeError("Operator hint provenance is not authentic");
      ops.push(operator);
      seen.add(opId);
      bindings.push({
        operatorId: opId,
        materialKind: actualKind,
        referenceOperator: hint.operator,
        waypointIndex: i,
        waypointAtHour: w.atHour,
        referenceId,
        inspirationProvenance: w.inspiration.provenance,
        operatorHint: hint,
        hintProvenance,
        tissueId: site.tissueId,
        siteId: site.id,
        sourceCellIds: [...(base.source.tissues.find(t =>
          t.id === site.tissueId)?.sourceCellIds ?? [])],
        atHour: start,
        durationHours: SPECULATIVE_LIMITS.durationHours,
        geneticChannel: inherited,
      });
    }
  }
  // The full permanent schedule affects cache identity. This does NOT alter
  // sourceFingerprint, genomeFingerprint, original operators or birth cells.
  const program: MaterialDevelopmentProgram = {
    ...base,
    operators: ops,
    fingerprint: hash(JSON.stringify([
      "speculative-material-v1", base.fingerprint,
      base.source.sourceFingerprint, genome.genotype.fingerprint, ops,
    ])).toString(16),
  };
  return {version: 1, program, bindings, suppressed, trajectory};
}

/** Join the REAL operator ledger to verified hint provenance, not metadata-only fiction. */
export function speculativePhysicalOutcomes(
  composition: SpeculativeMaterialComposition,
  graph: MaterialGraph,
  decisions: readonly MaterialOperatorDecision[],
): readonly SpeculativePhysicalOutcome[] {
  if (graph.sourceFingerprint !== composition.program.source.sourceFingerprint ||
      JSON.stringify(graph.sourceCells) !==
      JSON.stringify(composition.program.source.sourceCells))
    throw new TypeError("Speculative outcomes require the original organism");
  const active = new Set(graph.cells.map(c => c.id));
  return composition.bindings.map(binding => {
    const events = graph.events.filter(e =>
      e.id.startsWith("operator/" +
        encodeURIComponent(binding.operatorId) + "/unit/"));
    const ledger = decisions.filter(d => d.operatorId === binding.operatorId);
    const final = ledger.at(-1);
    const status = final?.status === "suppressed" ? "suppressed" :
      final?.status === "deferred" ? "deferred" :
      events.length ? "accepted" : "pending";
    return {
      binding, status, events, decisions: ledger,
      activeCreatedCellIds: events.flatMap(e => e.createdCellIds)
        .filter(id => active.has(id)),
    };
  });
}
