/**
 * Coordinated lattice intercalation, MORPH-007. A source-derived organizer
 * selects an axial cut and transverse band. In that band, material outside
 * the cut moves ONE lattice cell outward, together across every brush/tissue.
 * Only stretched same-tissue neighbor bonds receive parent-linked daughters
 * at vacated positions. Interior material is transported, not copied.
 *
 * This changes regional proportions instead of independently dissolving
 * colored regions. No target mask, inferred species or renderer transform.
 * Per opportunity: <=4096 one-cell moves, <=64 deposited seam cells, existing
 * global <=3072 generated-cell cap. Real daily care bounds seam expenditure;
 * zero budget is null. W=daughters+ceil(one-cell moves/64) must fit that
 * budget. Whole transaction fails if any constraint is blocked.
 */
import type {
  MaterialCell,
  MaterialGraph,
  MaterialLink,
} from "./material-graph";
import type { DevelopmentalChannels } from "../genetics";
import { seedChaos, stepChaos, CHAOS_MODULUS } from "./chaos";
import { isLatticeConnected } from "./lattice-connectivity";
import {
  anatomicalContinuityFailure,
  sourceOverlay,
} from "./anatomical-continuity";
export type DevelopmentalStrain = Readonly<{
  axis: "x" | "y";
  cut: number;
  side: -1 | 1;
  low: number;
  high: number;
  mode: "expand" | "shear";
}>;
type Point = Readonly<{ x: number; y: number }>;
const key = (p: Point) => p.x + "," + p.y;
const near = (a: Point, b: Point) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < 64 && p.y < 64;
const offsets = Array.from({ length: 9 }, (_, i) => ({
  x: (i % 3) - 1,
  y: Math.floor(i / 3) - 1,
})).filter((d) => d.x || d.y);
export function strainPoint(p: Point, s: DevelopmentalStrain): Point {
  const cross = s.axis === "x" ? "y" : "x";
  return p[cross] >= s.low &&
    p[cross] <= s.high &&
    (s.mode === "shear" || (p[s.axis] - s.cut) * s.side > 0)
    ? { ...p, [s.axis]: p[s.axis] + s.side }
    : { ...p };
}
export function strainVoids(
  voids: readonly string[],
  s: DevelopmentalStrain,
): readonly string[] {
  const own = new Set(voids),
    next = new Set<string>();
  for (const k of voids) {
    const [x, y] = k.split(",").map(Number),
      p = { x, y },
      mapped = strainPoint(p, s);
    next.add(key(mapped));
    if (key(mapped) !== k) {
      if (
        [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ].some((d) => {
          const n = { x: x + d.x, y: y + d.y },
            q = strainPoint(n, s);
          return (
            own.has(key(n)) &&
            Math.abs(q.x - mapped.x) + Math.abs(q.y - mapped.y) > 1
          );
        })
      )
        next.add(k);
    }
  }
  return [...next].sort();
}
export function sourceStrain(
  graph: MaterialGraph,
  c: DevelopmentalChannels,
  seed: string,
  wave: string,
  unit: number,
): DevelopmentalStrain {
  // The wave organizer is permanent. Unit parity develops both sides of the
  // same region rather than rerolling a new direction for every piece.
  const orbit = stepChaos(
    seedChaos(
      [seed, graph.sourceFingerprint, wave, "coherent-strain"].join("|"),
    ),
  );
  const qx = orbit.x / (CHAOS_MODULUS - 1),
    qy = orbit.y / (CHAOS_MODULUS - 1);
  // The deformation organizer must follow the organism that actually
  // exists NOW. Restricting its axis/band to birth ink caused later
  // differentiating material to outgrow the region ever being remodeled.
  // Each moved cell still retains its immutable original source ancestry.
  const material = graph.cells;
  const axis: "x" | "y" =
    qx <
    (c.growth.expansion + 0.1) /
      (c.growth.expansion + c.growth.elongation + 0.2)
      ? "x"
      : "y";
  const cross = axis === "x" ? "y" : "x",
    values = material.map((p) => p[cross]).sort((a, b) => a - b);
  const center =
    values[
      Math.min(values.length - 1, Math.floor((0.15 + 0.7 * qy) * values.length))
    ];
  const extent = Math.max(...values) - Math.min(...values) + 1;
  const radius = Math.max(
    2,
    Math.ceil(extent * (0.15 + 0.2 * c.support.membrane)),
  );
  const mode = unit % 3 === 0 ? "shear" : "expand";
  const along = material.map((p) => p[axis]).sort((a, b) => a - b),
    side = mode === "shear" ? (qy < 0.5 ? -1 : 1) : unit % 2 ? 1 : -1;
  const cut =
    along[
      Math.min(
        along.length - 1,
        Math.floor(
          (side > 0 ? 0.5 + 0.2 * qy : 0.5 - 0.2 * qy) * (along.length - 1),
        ),
      )
    ];
  return {
    axis,
    cut,
    side,
    low: Math.max(0, center - radius),
    high: Math.min(63, center + radius),
    mode,
  };
}
export type StrainProposal = Readonly<{
  cells: readonly MaterialCell[];
  createdCells: readonly MaterialCell[];
  links: readonly MaterialLink[];
  protectedVoids: readonly string[];
  strain: DevelopmentalStrain;
}>;
export function proposeDevelopmentalStrain(
  graph: MaterialGraph,
  s: DevelopmentalStrain,
  operationId: string,
  budget: number,
): StrainProposal | null {
  if (
    !["x", "y"].includes(s.axis) ||
    !["expand", "shear"].includes(s.mode) ||
    ![-1, 1].includes(s.side) ||
    ![s.cut, s.low, s.high, budget].every(Number.isSafeInteger) ||
    s.cut < 0 ||
    s.cut > 63 ||
    s.low < 0 ||
    s.high > 63 ||
    s.low > s.high ||
    budget < 0 ||
    budget > 64 ||
    !operationId
  )
    throw new RangeError("Invalid coherent strain");
  if (!budget || !graph.cells.length) return null;
  const oldPositions = new Map<string, MaterialCell[]>(),
    moved = new Map<string, MaterialCell>(),
    after: MaterialCell[] = [];
  for (const c of graph.cells) {
    const k = key(c),
      list = oldPositions.get(k) ?? [];
    list.push(c);
    oldPositions.set(k, list);
    const p = strainPoint(c, s);
    if (!inside(p)) return null;
    const next = key(c) === key(p) ? c : { ...c, x: p.x, y: p.y };
    after.push(next);
    if (key(c) !== key(p)) moved.set(c.id, next);
  }
  if (!moved.size) return null;
  const sourceById = new Map(graph.sourceCells.map((c) => [c.id, c])),
    occupied = new Map<string, MaterialCell[]>(),
    created: MaterialCell[] = [];
  for (const c of after) {
    const list = occupied.get(key(c)) ?? [];
    list.push(c);
    occupied.set(key(c), list);
  }
  const needs = new Map<string, MaterialCell[]>();
  for (const old of graph.cells) {
    const next = moved.get(old.id);
    if (!next) continue;
    const broken = offsets.some((d) =>
      (oldPositions.get(old.x + d.x + "," + (old.y + d.y)) ?? []).some(
        (other) => {
          if (other.tissueId !== old.tissueId) return false;
          const q = moved.get(other.id) ?? other;
          return (
            !near(next, q) ||
            (Math.abs(d.x) + Math.abs(d.y) === 1 &&
              Math.abs(next.x - q.x) + Math.abs(next.y - q.y) > 1)
          );
        },
      ),
    );
    if (broken) {
      const list = needs.get(key(old)) ?? [];
      list.push(old);
      needs.set(key(old), list);
    }
  }
  for (const [k, parents] of needs) {
    const layers = new Map<string, MaterialCell[]>();
    for (const p of parents) {
      const list = layers.get(p.tissueId) ?? [];
      list.push(p);
      layers.set(p.tissueId, list);
    }
    for (const [tid, layer] of layers) {
      if ((occupied.get(k) ?? []).some((c) => c.tissueId === tid)) continue;
      const parent = [...layer].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      const cell: MaterialCell = {
        ...parent,
        id:
          operationId +
          "/seam/" +
          encodeURIComponent(tid) +
          "/" +
          parent.x +
          "," +
          parent.y,
        provenance: "generated",
        sourceIds: [...parent.sourceIds],
        parentCellIds: [parent.id],
        operationId,
      };
      const existing = occupied.get(k) ?? [];
      if (existing.some((c) => !sourceOverlay(cell, c, sourceById)))
        return null;
      created.push(cell);
      occupied.set(k, [...existing, cell]);
    }
  }
  // One old transport credit covered at most 64 lattice edges. Charge the
  // coordinated one-edge motions at that SAME scale, plus each new daughter.
  const work = created.length + Math.ceil(moved.size / 64);
  if (
    work > budget ||
    graph.cells.filter((c) => c.provenance === "generated").length +
      created.length >
      3072
  )
    return null;
  const cells = [...after, ...created],
    groups = new Map<string, MaterialCell[]>();
  for (const c of cells) {
    const group = groups.get(c.tissueId) ?? [];
    group.push(c);
    groups.set(c.tissueId, group);
  }
  if ([...groups.values()].some((group) => !isLatticeConnected(group)))
    return null;
  const byId = new Map(cells.map((c) => [c.id, c])),
    links: MaterialLink[] = [];
  for (const l of graph.links) {
    const a = byId.get(l.fromCellId!)!,
      b = byId.get(l.toCellId!)!;
    if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= 8) {
      links.push(l);
      continue;
    }
    const candidates = (groups.get(l.fromTissueId) ?? [])
      .flatMap((p) =>
        (groups.get(l.toTissueId) ?? [])
          .filter((q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= 8)
          .map((q) => ({
            p,
            q,
            d:
              (p.x - a.x) ** 2 +
              (p.y - a.y) ** 2 +
              (q.x - b.x) ** 2 +
              (q.y - b.y) ** 2,
          })),
      )
      .sort(
        (a, b) => a.d - b.d || (a.p.id + a.q.id < b.p.id + b.q.id ? -1 : 1),
      );
    if (!candidates.length) return null;
    links.push({
      ...l,
      fromCellId: candidates[0].p.id,
      toCellId: candidates[0].q.id,
    });
  }
  const protectedVoids = strainVoids(graph.protectedVoids, s);
  if (
    anatomicalContinuityFailure(graph.sourceCells, cells, {
      links,
      protectedVoids,
    })
  )
    return null;
  return {
    cells,
    createdCells: created,
    links,
    protectedVoids,
    strain: s,
  };
}
