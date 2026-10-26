/**
 * DEV-003 — discrete, source-derived iterative morphogenesis of ONE pet.
 *
 * No species classifier, canopy template, offspring, or free-floating sprite.
 * The grammar is deliberately small:
 *   active tip + one resource credit -> one adjacent material cell;
 *   sufficiently extended tip + one credit -> a lateral, growth-bearing tip;
 *   insufficient resources -> dormancy (never speculative growth).
 *
 * All rates, resource costs, and geometry are game-model assumptions, not
 * claims about a real plant's energy budget or measured photobiology.
 *
 * State at integer n is reconstructed from immutable birth graph and records.
 * Each interval [n,n+1) reads the last explicitly supplied sample at/before n.
 * Source material is retained at every age. Floating ages use floor(age).
 *
 * Resource conservation (exact integer credits):
 *   B_n = floor(4*r_n), 0 <= r_n <= 1.
 *   w_i = (0.5 + g.rate) * (0.8 + 0.4*q_i)
 *         * (1 + 0.75*L*max(0,d_i dot lightDirection))
 *         / (1 + 0.25*depth_i).
 *   quota_i = B_n * w_i / sum_j(w_j).
 *   a_i = floor(quota_i), then the remaining credits are assigned by
 *   descending fractional remainder, breaking ties by site ID.
 *   sum_i a_i + unassigned = B_n exactly; each created cell spends one credit.
 *   sum_i spent_i + unspent = B_n exactly, even at world/void boundaries.
 *
 * Chaos is the merged exact finite torus recurrence (stepChaos). Each site
 * owns a seed-initialized immutable *conceptual* orbit, re-evaluated from
 * birth on every query. A site advances its orbit once per elapsed hour.
 * q_i=x_i/(p-1). Steering uses y_i/(p-1), bounded to +/-0.12 radians.
 * Number arithmetic for cell positions is integer; continuous turns/weights
 * are bounded finite JS doubles and their rounding is explicit.
 */
import { compareText, type Point } from "../simulation/model";
import {
  CHAOS_MODULUS, seedChaos, stepChaos, type ChaosState,
} from "./chaos";
import {
  MATERIAL_LIMITS, type MaterialDevelopmentProgram, type MaterialOperatorKind,
} from "./operators";
import type {
  MaterialCell, MaterialEvent, MaterialGraph, MaterialLink,
  MaterialSite, MaterialTissue,
} from "./material-graph";

export const ITERATIVE_LIMITS = {
  hours: 512, creditsPerHour: 4, sites: 4096,
  depth: 5, forksPerSite: 3, world: MATERIAL_LIMITS.world,
  addedCells: MATERIAL_LIMITS.addedCells,
} as const;

export type LightExposure = Readonly<{
  /** A direction, not a measured coordinate or solar position. */
  x: number;
  y: number;
  intensity: number;
}>;
export type IterativeExposure = Readonly<{
  /** A recorded, nonnegative integer hour; sample governs [atHour,next). */
  atHour: number;
  /** Explicit normalized material opportunity [0,1], not inferred sunlight. */
  resources: number;
  /** Null means no light observation: no phototropic steering is inferred. */
  light: LightExposure | null;
}>;
export type WeightedGrowthSite = Readonly<{ id: string; weight: number }>;
export type GrowthCreditAllocation = Readonly<{
  siteId: string;
  weight: number;
  allocated: number;
}>;
export type GrowthAllocation = Readonly<{
  available: number;
  unassigned: number;
  bySite: readonly GrowthCreditAllocation[];
}>;
export type IterativeGrowthLedger = Readonly<{
  hour: number;
  available: number;
  unassigned: number;
  spent: number;
  unspent: number;
  bySite: readonly (GrowthCreditAllocation & { spent: number })[];
}>;
export type IterativeGrowthSite = Readonly<{
  id: string;
  tissueId: string;
  tipCellId: string;
  parentSiteId: string | null;
  activationHour: number;
  depth: number;
  extensions: number;
  forks: number;
  state: "active" | "dormant" | "blocked";
}>;
export type IterativeGrowthFrame = Readonly<{
  graph: MaterialGraph;
  sites: readonly IterativeGrowthSite[];
  ledger: readonly IterativeGrowthLedger[];
}>;
export type IterativeGrowthProgram = Readonly<{
  version: 1;
  birth: MaterialDevelopmentProgram;
  exposures: readonly IterativeExposure[];
  at: (hour: number) => IterativeGrowthFrame;
}>;

type LiveSite = {
  id: string;
  tissueId: string;
  tipCellId: string;
  parentSiteId: string | null;
  activationHour: number;
  direction: Point;
  depth: number;
  extensions: number;
  forks: number;
  orbit: ChaosState;
  state: IterativeGrowthSite["state"];
};
const coords = (x: number, y: number) => x + "," + y;
const norm = (p: Point): Point => {
  const d = Math.hypot(p.x, p.y);
  return d > 1e-9 ? { x: p.x / d, y: p.y / d } : { x: 0, y: -1 };
};
const rotate = (p: Point, a: number): Point => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

/**
 * Pure Hamilton/largest-remainder allocation over integer material credits.
 * Passing the same sites in another order cannot change any site's award.
 * Zero weights do not compete. Ties use compareText, not iteration order.
 */
export function allocateGrowthCredits(
  budget: number, eligible: readonly WeightedGrowthSite[],
): GrowthAllocation {
  if (!Number.isSafeInteger(budget) || budget < 0 ||
      budget > ITERATIVE_LIMITS.creditsPerHour)
    throw new RangeError("Growth budget must be bounded integer credits");
  const ids = new Set<string>();
  for (const site of eligible) {
    if (!site.id || ids.has(site.id) || !Number.isFinite(site.weight) ||
        site.weight < 0 || site.weight > 1e6)
      throw new RangeError("Growth site weights must be finite, bounded, unique");
    ids.add(site.id);
  }
  const ordered = [...eligible].sort((a, b) => compareText(a.id, b.id));
  const sum = ordered.reduce((s, site) => s + site.weight, 0);
  if (sum === 0) return {
    available: budget, unassigned: budget,
    bySite: ordered.map(site => ({
      siteId: site.id, weight: site.weight, allocated: 0,
    })),
  };
  const entries = ordered.map(site => {
    const quota = budget * (site.weight / sum);
    const whole = Math.floor(quota);
    return { siteId: site.id, weight: site.weight, allocated: whole,
      fraction: quota - whole };
  });
  const remaining = budget - entries.reduce((s, entry) => s + entry.allocated, 0);
  if (remaining < 0 || remaining > entries.length)
    throw new RangeError("Numerically unstable growth allocation");
  const ranks = [...entries].sort((a, b) =>
    b.fraction - a.fraction || compareText(a.siteId, b.siteId));
  for (let i = 0; i < remaining; i++) ranks[i].allocated++;
  return {
    available: budget, unassigned: 0,
    bySite: entries.map(({ siteId, weight, allocated }) =>
      ({ siteId, weight, allocated })),
  };
}

function validateHistory(samples: readonly IterativeExposure[]): void {
  if (!samples.length || samples[0].atHour !== 0)
    throw new RangeError("Iterative exposure history must begin at hour zero");
  let previous = -1;
  for (const s of samples) {
    if (!Number.isSafeInteger(s.atHour) || s.atHour <= previous ||
        s.atHour > ITERATIVE_LIMITS.hours ||
        !Number.isFinite(s.resources) || s.resources < 0 || s.resources > 1)
      throw new RangeError("Iterative samples must be sorted bounded chronology");
    if (s.light !== null) {
      if (!s.light || ![s.light.x, s.light.y, s.light.intensity].every(Number.isFinite) ||
          Math.abs(s.light.x) > 1 || Math.abs(s.light.y) > 1 ||
          s.light.intensity < 0 || s.light.intensity > 1 ||
          (s.light.intensity > 0 && Math.hypot(s.light.x, s.light.y) < 1e-9))
        throw new RangeError("Invalid explicit directional light exposure");
    }
    previous = s.atHour;
  }
}

/** No temporal cache is retained by the program. Queries may seek arbitrarily. */
export function createIterativeGrowth(
  birth: MaterialDevelopmentProgram,
  exposureHistory: readonly IterativeExposure[],
): IterativeGrowthProgram {
  validateHistory(exposureHistory);
  if (birth.source.version !== 1 || !birth.genomeFingerprint || !birth.fingerprint)
    throw new TypeError("Iterative growth requires a real material birth program");
  const exposures = exposureHistory.map(s => Object.freeze({
    atHour: s.atHour, resources: s.resources,
    light: s.light === null ? null : Object.freeze({ ...s.light }),
  }));
  return Object.freeze({
    version: 1 as const, birth,
    exposures: Object.freeze(exposures),
    at: (hour: number) => iterativeGrowthAt(birth, exposures, hour),
  });
}

/**
 * Evaluate all completed hour steps from birth, regardless of rendering and
 * prior queries. At age n, a sample at n influences only the NEXT interval.
 */
export function iterativeGrowthAt(
  birth: MaterialDevelopmentProgram,
  exposures: readonly IterativeExposure[],
  hour: number,
): IterativeGrowthFrame {
  if (!Number.isFinite(hour) || hour < 0 || hour > ITERATIVE_LIMITS.hours)
    throw new RangeError("Iterative age outside bounded chronological domain");
  validateHistory(exposures);
  const original = birth.source;
  const cells: MaterialCell[] = [...original.cells];
  const tissues: MaterialTissue[] = [...original.tissues];
  const materialSites: MaterialSite[] = [...original.sites];
  const links: MaterialLink[] = [...original.links];
  const events: MaterialEvent[] = [...original.events];
  const occupied = new Map(cells.map(c => [coords(c.x, c.y), c]));
  const byId = new Map(cells.map(c => [c.id, c]));
  const voids = new Set(original.protectedVoids);
  const outputLedger: IterativeGrowthLedger[] = [];
  const live: LiveSite[] = original.sites.map(s => ({
    id: s.id, tissueId: s.tissueId, tipCellId: s.rootCellId,
    parentSiteId: null, activationHour: 0, depth: 0, extensions: 0,
    forks: 0, direction: norm(s.direction),
    orbit: seedChaos(birth.fingerprint + "|" + s.id), state: "dormant",
  })).filter(site => byId.has(site.tipCellId))
    .sort((a, b) => compareText(a.id, b.id));

  const compatible = (a: MaterialCell, b: MaterialCell) =>
    a.sourceIds.some(id => b.sourceIds.includes(id));
  function place(
    tip: MaterialCell, tissueId: string, axis: Point,
    hourStep: number, siteId: string, kind: MaterialOperatorKind,
  ): MaterialCell | null {
    const dx = Math.round(norm(axis).x), dy = Math.round(norm(axis).y);
    const x = tip.x + dx, y = tip.y + dy, location = coords(x, y);
    if ((!dx && !dy) || x < 0 || y < 0 ||
        x >= ITERATIVE_LIMITS.world || y >= ITERATIVE_LIMITS.world ||
        occupied.has(location) || voids.has(location) ||
        cells.length - original.sourceCells.length >= ITERATIVE_LIMITS.addedCells)
      return null;
    // Different disconnected authored islands must never be accidentally joined.
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const neighbor = occupied.get(coords(x + ox, y + oy));
      if (neighbor && !compatible(tip, neighbor)) return null;
    }
    const operationId = "iterative/" + (hourStep + 1) + "/" +
      encodeURIComponent(siteId) + "/" + kind + "/" + cells.length;
    const id = "growth/" + encodeURIComponent(operationId) + "/" + x + "," + y;
    const cell: MaterialCell = {
      id, tissueId, x, y, color: tip.color,
      ...(tip.z === undefined ? {} : { z: tip.z }),
      provenance: "generated", sourceIds: [...tip.sourceIds],
      parentCellIds: [tip.id], operationId,
    };
    cells.push(cell); byId.set(id, cell); occupied.set(location, cell);
    events.push({
      id: operationId, kind, atHour: hourStep + 1,
      createdCellIds: [id], removedCellIds: [],
      sourceCellIds: [...cell.sourceIds],
    });
    return cell;
  }
  function steered(site: LiveSite, sample: IterativeExposure): Point {
    const light = sample.light;
    const turn = 0.12 * (2 * site.orbit.y / (CHAOS_MODULUS - 1) - 1);
    const base = rotate(site.direction, turn);
    if (!light || light.intensity === 0) return norm(base);
    const response = (0.65 + 0.55 * (1 - birth.signals.channels.support.rigidity)) *
      light.intensity;
    const directed = norm(light);
    return norm({ x: base.x + response * directed.x,
      y: base.y + response * directed.y });
  }
  let sampleIndex = 0;
  for (let n = 0; n < Math.floor(hour); n++) {
    while (sampleIndex + 1 < exposures.length &&
      exposures[sampleIndex + 1].atHour <= n) sampleIndex++;
    const sample = exposures[sampleIndex];
    const available = Math.floor(ITERATIVE_LIMITS.creditsPerHour * sample.resources);
    const active = live.filter(site => site.activationHour <= n &&
      byId.has(site.tipCellId)).sort((a, b) => compareText(a.id, b.id));
    const candidates: WeightedGrowthSite[] = active.map(site => {
      const axis = norm(site.direction), light = sample.light;
      const bright = light && light.intensity > 0
        ? Math.max(0, dot(axis, norm(light))) * light.intensity : 0;
      const q = site.orbit.x / (CHAOS_MODULUS - 1);
      return {
        id: site.id,
        weight: (0.5 + birth.signals.channels.growth.rate) *
          (0.8 + 0.4 * q) * (1 + 0.75 * bright) /
          (1 + 0.25 * site.depth),
      };
    });
    const allocation = allocateGrowthCredits(available, candidates);
    const creditMap = new Map(allocation.bySite.map(a => [a.siteId, a.allocated]));
    const spendMap = new Map<string, number>();
    for (const site of active) {
      const amount = creditMap.get(site.id) ?? 0;
      let spent = 0;
      site.state = amount === 0 ? "dormant" : "active";
      for (let k = 0; k < amount; k++) {
        const tip = byId.get(site.tipCellId);
        if (!tip) { site.state = "blocked"; break; }
        const axis = steered(site, sample);
        const canFork = site.depth < ITERATIVE_LIMITS.depth &&
          site.forks < ITERATIVE_LIMITS.forksPerSite &&
          site.extensions >= 2 + site.forks * 3 &&
          birth.signals.channels.branching.initiation >= 0.2 &&
          live.length < ITERATIVE_LIMITS.sites;
        let created: MaterialCell | null = null;
        if (canFork) {
          const sign = site.orbit.y % 2 === 0 ? 1 : -1;
          const angle = 0.6 + 0.6 * birth.signals.channels.branching.divergence;
          const variants = [sign * angle, -sign * angle,
            sign * (angle + 0.5), -sign * (angle + 0.5)];
          const childId = site.id + "/iterative/" + site.forks;
          for (const turn of variants) {
            const direction = norm(rotate(axis, turn));
            created = place(tip, childId, direction, n, site.id,
              site.forks % 2 === 0 ? "branch" : "bud");
            if (!created) continue;
            const anchorId = childId + "/site/0";
            const parentTissue = tissues.find(t => t.id === site.tissueId)!;
            tissues.push({
              id: childId, sourcePartId: parentTissue.sourcePartId,
              parentId: site.tissueId, relationship: "joint",
              sourceCellIds: [...tip.sourceIds], growthSiteIds: [anchorId],
              rigidity: Math.min(1, birth.signals.channels.support.rigidity *
                (0.5 + 0.1 * site.depth)),
            });
            materialSites.push({
              id: anchorId, tissueId: childId, rootCellId: created.id,
              direction,
            });
            links.push({
              id: created.operationId + "/attachment", kind: "attachment",
              fromTissueId: childId, toTissueId: site.tissueId,
              fromCellId: created.id, toCellId: tip.id,
            });
            live.push({
              id: anchorId, tissueId: childId, tipCellId: created.id,
              parentSiteId: site.id, activationHour: n + 1,
              direction, depth: site.depth + 1, extensions: 0, forks: 0,
              orbit: seedChaos(birth.fingerprint + "|" + anchorId),
              state: "dormant",
            });
            site.forks++;
            break;
          }
        }
        if (!created) {
          created = place(tip, site.tissueId, axis, n, site.id, "elongate");
          if (created) {
            site.tipCellId = created.id;
            site.direction = axis;
            site.extensions++;
          }
        }
        if (!created) { site.state = "blocked"; break; }
        spent++;
      }
      spendMap.set(site.id, spent);
    }
    const spent = [...spendMap.values()].reduce((a, b) => a + b, 0);
    outputLedger.push({
      hour: n, available, unassigned: allocation.unassigned,
      spent, unspent: available - spent,
      bySite: allocation.bySite.map(a =>
        ({ ...a, spent: spendMap.get(a.siteId) ?? 0 })),
    });
    // Advance even dormant sites: the exact torus orbit belongs to age, not
    // the amount of earlier resource awarded.
    for (const site of live) if (site.activationHour <= n)
      site.orbit = stepChaos(site.orbit);
  }
  const graph: MaterialGraph = {
    ...original, cells, tissues, sites: materialSites, links, events,
  };
  return {
    graph,
    sites: live.map(({ orbit, direction, ...site }) => ({ ...site })),
    ledger: outputLedger,
  };
}
