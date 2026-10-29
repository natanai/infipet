import { clamp, compareText, hash, type PartKind, type Point } from "../simulation/model";
import { compileReadableSeed, scheduleSeedOpportunities, type ReadableSeedProgram } from "../genetics/seed-language";
import {
  CHAOS_VERSION,
  seedChaos, chaoticProgress, chaoticTurn, validateMaterialChaos,
  type MaterialChaos,
} from "./chaos";
import { grownMaterialCells } from "../simulation/material-growth";
import type { Tissue } from "../simulation/material";
import type { SourceAtlas } from "../simulation/source-atlas";
import type { InheritedGenome } from "../simulation/genome";
import {
  adaptDevelopmentPrior, compileDevelopmentGeneticSignals, expressGenotype,
  type DevelopmentGeneticSignals,
} from "../genetics";
import type { DevelopmentPrior } from "../phylogeny";
import {
  createMaterialGraph, type MaterialCell, type MaterialEvent,
  type MaterialGraph, type MaterialSite, type MaterialTissue,
} from "./material-graph";

export type MaterialOperatorKind =
  | "elongate" | "expand" | "branch" | "bud"
  | "fuse" | "resorb" | "remodel" | "reinforce";
export type MaterialOperator = Readonly<{
  id: string;
  kind: MaterialOperatorKind;
  tissueId: string;
  /** Optional source-retained growth-site anchor. */
  siteId?: string;
  /** Only fusion requires a second existing tissue. */
  targetTissueId?: string;
  direction?: Readonly<Point>;
  atHour: number;
  durationHours: number;
  /** Unitless inherited-expression multiplier, clamped to [0,1]. */
  strength: number;
  /** Optional independently verifiable chaotic rhythm and source-tip steering. */
  chaos?: MaterialChaos;
  /** Optional authored-seed opportunity: only a real bud transaction creates
   * a new independently typed tissue from its own source-linked parent. */
  developedKind?: PartKind;
  geneticInstructionId?: string;
}>;
export type MaterialDevelopmentProgram = Readonly<{
  version: 1;
  source: MaterialGraph;
  genomeFingerprint: string;
  /** Original birth-program seed for iterative chaos when later speculative waypoints extend the schedule. Default: fingerprint. */
  iterativeSeedFingerprint?: string;
  signals: DevelopmentGeneticSignals;
  operators: readonly MaterialOperator[];
  /** Seed-character grammar is frozen at birth, before care, and has no
   * chaotic inputs or later rerolls. */
  seedLanguage?: ReadableSeedProgram;
  /** Hash contains only the actual drawing, seed genotype and operator schedule. */
  fingerprint: string;
}>;
export const MATERIAL_LIMITS = { world: 64, addedCells: 3072, operators: 64 } as const;
const key = (x: number, y: number) => x + "," + y;
const within = (x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 64 && y >= 0 && y < 64;
const sq = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const unit = (p: Point): Point => {
  const d = Math.hypot(p.x, p.y);
  return d > 0.0001 ? { x: p.x / d, y: p.y / d } : { x: 0, y: -1 };
};
const rotated = (p: Point, radians: number): Point => ({
  x: p.x * Math.cos(radians) - p.y * Math.sin(radians),
  y: p.x * Math.sin(radians) + p.y * Math.cos(radians),
});
const amounts: Record<MaterialOperatorKind, keyof DevelopmentGeneticSignals["operators"]> = {
  elongate: "tip-extension", expand: "surface-expansion",
  branch: "branch-axis", bud: "appendage-extension",
  fuse: "tissue-remodeling", resorb: "tissue-remodeling",
  remodel: "tissue-remodeling", reinforce: "wall-deposition",
};

/** Scientific reference hints are *weights*, never species or lifetime gates. */
export function materialOperatorPotential(kind: MaterialOperatorKind, signal: DevelopmentGeneticSignals): number {
  const operator = signal.operators[amounts[kind]];
  const hint = operator.evidence.status === "supported" ? 1.25 : 0.75;
  const c = signal.channels;
  const supplement = kind === "branch" ? c.branching.divergence :
    kind === "bud" ? c.appendages.initiation :
    kind === "reinforce" ? c.support.rigidity :
    kind === "resorb" ? c.maturation.plasticity :
    kind === "fuse" ? c.segmentation.boundaries :
    kind === "elongate" ? c.growth.rate : c.growth.expansion;
  return clamp((0.3 + 0.5 * operator.potential + 0.2 * supplement) * hint, 0.1, 1.5);
}

/**
 * A reproducibly accepted seed ticket is itself permanent developmental
 * competence, independent of the older random latent appendage channel.
 * This only raises the potential of an ALREADY AUTHORIZED gene operation:
 * no gene, no exception. It does NOT force any physical result without a
 * lawful source-grown transaction, positive care and available material.
 */
export function scheduledOperatorPotential(
  op: MaterialOperator, signal: DevelopmentGeneticSignals,
): number {
  const inherited = materialOperatorPotential(op.kind, signal);
  return op.geneticInstructionId &&
    (op.kind === "bud" || op.kind === "expand") &&
    op.developedKind ? Math.max(0.9, inherited) : inherited;
}

export function createOperatorMaterialCell(
  operation: MaterialOperator, tissueId: string, x: number, y: number,
  parents: readonly MaterialCell[],
): MaterialCell {
  const sources = [...new Set(parents.flatMap(p => p.sourceIds))].sort();
  return {
    id: "growth/" + encodeURIComponent(operation.id) + "/" +
      encodeURIComponent(tissueId) + "/" + x + "," + y,
    tissueId, x, y, color: parents[0].color,
    ...(parents[0].z === undefined ? {} : { z: parents[0].z }),
    provenance: "generated", sourceIds: sources,
    parentCellIds: parents.map(p => p.id).sort(), operationId: operation.id,
  };
}

/** Run exactly the provided operations in order; no mutation of the input graph. */
export function applyMaterialOperators(
  birth: MaterialGraph,
  operations: readonly MaterialOperator[],
  atHour: number,
  signals: DevelopmentGeneticSignals,
): MaterialGraph {
  if (!Number.isFinite(atHour) || atHour < 0)
    throw new RangeError("A material age must be finite and nonnegative");
  if (operations.length > MATERIAL_LIMITS.operators)
    throw new RangeError("Too many material operators");
  const ids = new Set<string>();
  for (const op of operations) {
    if (!op.id || ids.has(op.id) || !Number.isFinite(op.atHour) ||
        op.atHour < 0 || !Number.isFinite(op.durationHours) ||
        op.durationHours <= 0 || !Number.isFinite(op.strength) ||
        op.strength < 0 || op.strength > 1)
      throw new RangeError("Invalid or repeated material operator");
    if (op.chaos) validateMaterialChaos(op.chaos);
    ids.add(op.id);
  }
  const cells = [...birth.cells], tissues = [...birth.tissues], sites = [...birth.sites];
  const links = [...birth.links], events = [...birth.events];
  const protectedVoids = new Set(birth.protectedVoids);
  const occupied = new Map<string, MaterialCell[]>();
  const rebuild = () => {
    occupied.clear();
    for (const cell of cells) {
      const k = key(cell.x, cell.y), list = occupied.get(k) ?? [];
      list.push(cell); occupied.set(k, list);
    }
  };
  rebuild();
  const active = (id: string) => cells.filter(c => c.tissueId === id);
  const canPlace = (x: number, y: number, tissueId: string, allowedParentId?: string) => {
    const siblingPrefix = tissueId.includes("/growth/") ? tissueId.split("/growth/")[0] + "/growth/" : null;
    if (!within(x, y) || protectedVoids.has(key(x, y)) ||
        cells.length - birth.sourceCells.length >= MATERIAL_LIMITS.addedCells) return false;
    // Adjacent unconnected islands cannot merge except through an explicit fuse.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((occupied.get(key(x + dx, y + dy)) ?? []).some(c => c.tissueId !== tissueId && c.tissueId !== allowedParentId &&
        !(siblingPrefix && c.tissueId.startsWith(siblingPrefix))))
        return false;
    }
    return !occupied.has(key(x, y));
  };
  const add = (cell: MaterialCell, allowedParentId?: string) => {
    if (!canPlace(cell.x, cell.y, cell.tissueId, allowedParentId)) return false;
    cells.push(cell);
    occupied.set(key(cell.x, cell.y), [cell]);
    return true;
  };
  const remove = (cell: MaterialCell) => {
    const index = cells.findIndex(c => c.id === cell.id);
    if (index >= 0) { cells.splice(index, 1); rebuild(); }
  };
  const siteFor = (op: MaterialOperator) =>
    sites.find(s => s.id === op.siteId && s.tissueId === op.tissueId) ??
    sites.find(s => s.tissueId === op.tissueId);
  const tipFor = (tissueId: string, root: Point, direction: Point) =>
    [...active(tissueId)].sort((a, b) =>
      ((b.x - root.x) * direction.x + (b.y - root.y) * direction.y) -
      ((a.x - root.x) * direction.x + (a.y - root.y) * direction.y) ||
      compareText(a.id, b.id))[0];
  const line = (op: MaterialOperator, tissueId: string, root: MaterialCell,
    direction: Point, steps: number, allowedParentId?: string) => {
    let tip = root;
    let x = tip.x, y = tip.y;
    const axis = unit(direction);
    for (let i = 0; i < steps; i++) {
      const turn = op.chaos
        ? chaoticTurn(op.chaos, Math.floor(op.atHour) + i)
        : 0;
      const steered = rotated(axis, turn);
      x += steered.x; y += steered.y;
      const nx = Math.round(x), ny = Math.round(y);
      if (nx === tip.x && ny === tip.y) continue;
      const produced = createOperatorMaterialCell(op, tissueId, nx, ny, [tip]);
      if (!add(produced, allowedParentId)) break;
      tip = produced;
    }
    return tip;
  };
  for (const op of operations) {
    if (atHour <= op.atHour || op.strength === 0) continue;
    const tissue = tissues.find(t => t.id === op.tissueId);
    if (!tissue || !active(tissue.id).length) continue;
    const completion = clamp((atHour - op.atHour) / op.durationHours, 0, 1);
    const grownFraction = op.chaos
      ? chaoticProgress(op.chaos, op.atHour, op.durationHours, atHour)
      : completion;
    const effect = op.strength * grownFraction * scheduledOperatorPotential(op, signals);
    if (effect <= 0) continue;
    const before = new Set(cells.map(c => c.id));
    const removed: string[] = [];
    const removedAncestry: string[] = [];
    const site = siteFor(op);
    const anchor = birth.sourceCells.find(c => c.id === site?.rootCellId) ??
      active(tissue.id)[0];
    const axis = unit(op.direction ?? site?.direction ?? { x: 0, y: -1 });
    const root = tipFor(tissue.id, anchor, axis) ?? anchor;
    const extent = Math.min(9, Math.floor(effect * (op.kind === "branch" ? 5 : 7) + 0.001));
    if (op.kind === "elongate" && extent) {
      line(op, tissue.id, root, axis, extent);
    }
    if ((op.kind === "branch" || op.kind === "bud") && extent) {
      const count = op.kind === "branch" ? 2 : 1;
      for (let branch = 0; branch < count; branch++) {
        const childId = op.id + "/growth/" + branch;
        if (tissues.some(t => t.id === childId)) continue;
        const divergence = op.kind === "branch"
          ? (branch ? 1 : -1) * (0.25 + signals.channels.branching.divergence * 0.85)
          : (signals.channels.symmetry.chirality - 0.5) * 0.8;
        const childAxis = rotated(axis, divergence);
        const beforeBranch = cells.length;
        const tip = line(op, childId, root, childAxis, extent, tissue.id);
        if (cells.length === beforeBranch) continue;
        const rootSiteId = childId + "/site/0";
        tissues.push({
          id: childId, sourcePartId: tissue.sourcePartId, parentId: tissue.id,
          ...(op.developedKind ? { developedKind: op.developedKind,
            geneticInstructionId: op.geneticInstructionId } : {}),
          relationship: "joint", sourceCellIds: root.sourceIds,
          growthSiteIds: [rootSiteId], rigidity: 0,
        });
        sites.push({ id: rootSiteId, tissueId: childId,
          rootCellId: tip.id, direction: childAxis });
        links.push({ id: op.id + "/link/" + branch, kind: "attachment",
          fromTissueId: childId, toTissueId: tissue.id,
          fromCellId: cells[beforeBranch].id, toCellId: root.id });
      }
    }
    if ((op.kind === "expand" || op.kind === "reinforce") && extent) {
      const current = active(tissue.id), source = birth.sourceCells.filter(
        c => c.tissueId === tissue.id);
      const faux = { cells: current.map(c => ({
        x: c.x, y: c.y, color: c.color, ...(c.z === undefined ? {} : { z: c.z }),
      })) } as Tissue;
      const original = { cells: source.map(c => ({
        x: c.x, y: c.y, color: c.color,
      })) } as Tissue;
      const radius = Math.min(2, effect * (op.kind === "reinforce" ? 1.25 : 2));
      // Reuse the existing exterior distance band / watershed and void guard.
      for (const candidate of grownMaterialCells(faux, radius, 2, original)) {
        if (!canPlace(candidate.x, candidate.y, tissue.id)) continue;
        const nearest = [...current].sort((a, b) =>
          sq(a, candidate) - sq(b, candidate) || compareText(a.id, b.id))[0];
        if (!nearest) continue;
        add(createOperatorMaterialCell(op, tissue.id, candidate.x, candidate.y, [nearest]));
      }
      if (op.kind === "reinforce")
        tissues[tissues.indexOf(tissue)] = { ...tissue, rigidity: Math.max(tissue.rigidity, effect) };
    }
    if (op.kind === "fuse" && op.targetTissueId && op.targetTissueId !== tissue.id && extent) {
      const destination = active(op.targetTissueId);
      let pair: { a: MaterialCell; b: MaterialCell; score: number } | undefined;
      for (const a of active(tissue.id)) for (const b of destination) {
        const score = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (!pair || score < pair.score ||
            (score === pair.score && a.id + b.id < pair.a.id + pair.b.id))
          pair = { a, b, score };
      }
      if (pair && pair.score <= Math.min(12, extent + 2)) {
        const { a, b } = pair;
        let x = a.x, y = a.y;
        const corridor: Point[] = [];
        for (let i = 1; i < pair.score; i++) {
          if (x !== b.x) x += Math.sign(b.x - x);
          else y += Math.sign(b.y - y);
          corridor.push({ x, y });
        }
        // A fusion either builds a continuous physical bridge or does nothing.
        // It cannot skip over protected cavities or quietly join a third island.
        if (corridor.every(p => within(p.x, p.y) &&
            !occupied.has(key(p.x, p.y)) &&
            !protectedVoids.has(key(p.x, p.y))) &&
            cells.length - birth.sourceCells.length + corridor.length <= MATERIAL_LIMITS.addedCells) {
          let from = a;
          for (const p of corridor) {
            const bridge = createOperatorMaterialCell(op, tissue.id, p.x, p.y, [from, b]);
            cells.push(bridge); occupied.set(key(p.x, p.y), [bridge]); from = bridge;
          }
          links.push({ id: op.id + "/fusion", kind: "fusion",
            fromTissueId: tissue.id, toTissueId: op.targetTissueId,
            fromCellId: a.id, toCellId: b.id });
        }
      }
    }
    if ((op.kind === "resorb" || op.kind === "remodel") && extent) {
      const amount = Math.min(extent, Math.max(0, active(tissue.id).length - 1));
      const eligible = [...active(tissue.id)].sort((a, b) =>
        Number(b.provenance === "generated") - Number(a.provenance === "generated") ||
        sq(b, anchor) - sq(a, anchor) || compareText(a.id, b.id));
      let count = 0;
      for (const candidate of eligible) {
        if (count >= amount) break;
        // Never remove a cell serving as an active joint/fusion endpoint.
        if (links.some(link => link.fromCellId === candidate.id ||
            link.toCellId === candidate.id)) continue;
        const remaining = active(tissue.id).filter(c => c.id !== candidate.id);
        if (!remaining.length) continue;
        // Preserve tissue connectedness; a boundary reabsorption cannot sever it.
        const seen = new Set<string>([key(remaining[0].x, remaining[0].y)]);
        const queue = [remaining[0]];
        for (let i = 0; i < queue.length; i++) {
          for (const p of remaining) {
            const k = key(p.x, p.y);
            if (!seen.has(k) && Math.max(Math.abs(p.x - queue[i].x),
              Math.abs(p.y - queue[i].y)) <= 1) {
              seen.add(k); queue.push(p);
            }
          }
        }
        if (seen.size !== new Set(remaining.map(c => key(c.x, c.y))).size) continue;
        removedAncestry.push(...candidate.sourceIds);
        remove(candidate); removed.push(candidate.id); count++;
      }
      if (op.kind === "remodel" && count) {
        const base = tipFor(tissue.id, anchor, axis) ?? anchor;
        line(op, tissue.id, base, rotated(axis, 0.8), Math.min(5, count));
      }
    }
    const created = cells.filter(c => !before.has(c.id)).map(c => c.id);
    if (created.length || removed.length || op.kind === "reinforce") {
      const sources = [...new Set([
        ...created.flatMap(id => cells.find(c => c.id === id)?.sourceIds ?? []),
        ...removedAncestry,
      ])].sort();
      events.push({ id: op.id, kind: op.kind, atHour: op.atHour + op.durationHours * completion,
        createdCellIds: created, removedCellIds: removed, sourceCellIds: sources });
    }
  }
  return { ...birth, cells, tissues, sites, links, events };
}

/**
 * Generic single-pet schedule derived from geometry, actual seed channels
 * and generic, sourced phylogenetic operator hints. No species destinations.
 */
export function compileMaterialDevelopment(
  atlas: SourceAtlas, genome: InheritedGenome, prior?: DevelopmentPrior,
): MaterialDevelopmentProgram {
  const source = createMaterialGraph(atlas);
  // The seed compiler is pure. It receives exactly source-authored brush
  // labels + immutable seed + initial game tree reference, NEVER care.
  const seedLanguage = prior
    ? compileReadableSeed(genome.seed, prior.taxonId, atlas) : undefined;
  const expression = expressGenotype(genome.genotype,
    prior ? adaptDevelopmentPrior(prior) : undefined);
  const signals = compileDevelopmentGeneticSignals(expression);
  const operations: MaterialOperator[] = [];
  const ordered = [...source.tissues]
    .filter(t => t.sourceCellIds.length >= 1)
    .sort((a, b) => b.sourceCellIds.length - a.sourceCellIds.length ||
      compareText(a.id, b.id)).slice(0, 8);
  for (const [index, tissue] of ordered.entries()) {
    const siteId = tissue.growthSiteIds[0];
    const slot = index * 0.25;
    const chaosFor = (id: string): MaterialChaos => ({
      version: CHAOS_VERSION,
      initial: seedChaos([
        // The original seed determines the chaotic orbit. Lab-only changes
        // to environmental sensitivity MUST NOT silently replace that orbit;
        // independent inherited trait channels still set rate/turn amplitudes.
        genome.seed, genome.mode, source.sourceFingerprint, tissue.id,
        siteId ?? "", id,
      ].join("|")),
      rateAmplitude: 0.12 + 0.28 * signals.channels.growth.rate,
      turnAmplitude: 0.15 + 0.45 * signals.channels.branching.divergence,
    });
    const elongateId = "life/" + index + "/elongate";
    operations.push({ id: elongateId, tissueId: tissue.id,
      kind: "elongate", siteId, atHour: 10 + slot, durationHours: 25,
      strength: clamp(signals.channels.growth.elongation, 0, 1),
      chaos: chaosFor(elongateId) });
    const expandId = "life/" + index + "/expand";
    operations.push({ id: expandId, tissueId: tissue.id,
      kind: "expand", atHour: 35 + slot, durationHours: 35,
      strength: clamp(signals.channels.growth.expansion, 0, 1),
      chaos: chaosFor(expandId) });
    if (source.tissues.length <= 12 && tissue.sourceCellIds.length >= 3) {
      const ready = Math.max(signals.channels.branching.initiation,
        signals.channels.appendages.initiation);
      if (ready > 0.35) {
        const branchId = "life/" + index + "/branch";
        operations.push({
          id: branchId, tissueId: tissue.id, siteId,
          kind: ready === signals.channels.branching.initiation ? "branch" : "bud",
          atHour: 70 + slot, durationHours: 45, strength: ready,
          chaos: chaosFor(branchId),
        });
      }
    }
    const reinforceId = "life/" + index + "/reinforce";
    operations.push({ id: reinforceId, tissueId: tissue.id,
      kind: "reinforce", atHour: 110 + slot, durationHours: 80,
      strength: signals.channels.support.rigidity,
      chaos: chaosFor(reinforceId) });
  }
  if (seedLanguage) {
    // Every valid drawing, including multi-part creatures, retains seeded
    // differentiation. Do not arbitrarily disable genes when the user drew
    // more than twelve source tissues. Finite operator and physical budgets
    // still bound expression; morphology must remain source-owned.
    const bodyTissues=source.tissues.filter(t=>
      source.sourceCells.some(c=>c.tissueId===t.id&&c.sourceKind==="body"))
      .sort((a,b)=>b.sourceCellIds.length-a.sourceCellIds.length||
        compareText(a.id,b.id));
    const carrier=bodyTissues[0]??ordered[0];
    const site = carrier?.growthSiteIds[0];
    if (carrier && site) {
      const budget=Math.min(6,Math.floor((MATERIAL_LIMITS.operators-operations.length)/2));
      for (const [slot, opportunity] of scheduleSeedOpportunities(seedLanguage,budget).entries()) {
        const encoded = encodeURIComponent(opportunity.kind);
        const instructionId = "genetic/" + encoded + "/" + opportunity.ticket;
        const budId = "life/" + instructionId + "/differentiate";
        const childId = budId + "/growth/0";
        // First organ opportunity arrives during early care, not four
        // months into a life. Other deterministic gene opportunities are
        // spaced through its lifetime; empty care can still suppress them.
        // Final expand closes by day 308, before maturation check 365.
        const start = 5 + (seedLanguage.phase % 12) + 45 * slot;
        // Select a fixed orientation from the seed without chaotic turning.
        // The original growth-site orientation has already been used by
        // generic elongation; other exposed directions allow genuinely new
        // material compartments rather than forcing every feature into one
        // overlapping tendril. This is mechanical placement, not inference
        // of user-drawn anatomy.
        const directions: readonly Point[] = [
          {x:1,y:0}, {x:0,y:1}, {x:-1,y:0}, {x:0,y:-1},
        ];
        const rootDirection = source.sites.find(s=>s.id===site)?.direction ??
          {x:0,y:-1};
        const available = directions.filter(d=>
          d.x*rootDirection.x+d.y*rootDirection.y<0.5);
        const direction = available[
          hash(genome.seed+"|gene-direction|"+instructionId) % available.length
        ];
        // No chaotic rhythms in the new typed genetic instructions. Linear
        // chronology + causally recorded care decide the expression.
        operations.push({
          id: budId, kind: "bud", tissueId: carrier.id,
          siteId: site, direction, atHour: start, durationHours: 30,
          strength: 0.95, developedKind: opportunity.kind,
          geneticInstructionId: instructionId,
        });
        operations.push({
          id: "life/" + instructionId + "/specialize",
          kind: "expand", tissueId: childId,
          atHour: start + 28, durationHours: 50,
          strength: clamp(0.55 + 0.03 *
            (seedLanguage.processes["surface-growth"] ?? 0), 0, 1),
          developedKind: opportunity.kind,
          geneticInstructionId: instructionId,
        });
      }
    }
  }
  const fingerprint = hash(JSON.stringify([source.sourceFingerprint,
    genome.genotype.fingerprint, prior?.version ?? null, prior?.taxonId ?? null,
    seedLanguage?.version ?? null, seedLanguage?.referenceId ?? null,
    seedLanguage?.opportunities.filter(x=>x.accepted).map(x=>[x.kind,x.ticket]) ?? [],
    operations])).toString(16);
  return { version: 1, source, genomeFingerprint: genome.genotype.fingerprint,
    signals, operators: operations, ...(seedLanguage?{seedLanguage}:{}), fingerprint };
}

/** Evaluate from immutable birth material each time: save/load and call-order invariant. */
export function materialDevelopmentAt(
  program: MaterialDevelopmentProgram, atHour: number,
): MaterialGraph {
  return applyMaterialOperators(program.source, program.operators,
    atHour, program.signals);
}
