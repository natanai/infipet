import { compareText, type Point } from "./model";
import { geneRandom, type InheritedGenome } from "./genome";
import { mapSourcePoint, type Region } from "./development";
import type { SourceAtlas, SourcePatch } from "./source-atlas";
import { getMetamorphosisPhase } from "./metamorphosis";

export const ENCLOSURE_LAYER = 20_000;
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const unit = (p: Point, fallback: Point = { x: 0, y: 1 }): Point => {
  const length = Math.hypot(p.x, p.y);
  return length > 1e-8 ? { x: p.x / length, y: p.y / length } : { ...fallback };
};
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const point = (x: number, y: number): Point => ({ x, y });

export type EnclosureEnvelope = {
  hostId: string;
  sourceIds: string[];
  sourcePatch: SourcePatch;
  center: Point;
  root: Point;
  axis: Point;
  normal: Point;
  axialHalf: number;
  crossHalf: number;
  occupied: Point[];
  palette: string[];
};

function occupied(region: Region): Point[] {
  if (region.source) {
    const clip = region.sourceClip;
    return region.source.cells
      .filter(
        (cell) =>
          !clip ||
          ((clip.axis === "x" ? cell.x : cell.y) >= clip.min &&
            (clip.axis === "x" ? cell.x : cell.y) < clip.max),
      )
      .map((cell) => mapSourcePoint(region, cell))
      .filter(finite);
  }
  const c = Math.cos(region.angle),
    s = Math.sin(region.angle);
  return Array.from({ length: 16 }, (_, i) => {
    const t = (i * Math.PI) / 8,
      x = Math.cos(t) * region.rx,
      y = Math.sin(t) * region.ry;
    return {
      x: region.center.x + x * c - y * s,
      y: region.center.y + x * s + y * c,
    };
  }).filter(finite);
}

/** Current material geometry, not a predefined egg shape or the original undeformed bounds. */
export function getEnclosureEnvelope(
  regions: readonly Region[],
  atlas: SourceAtlas,
): EnclosureEnvelope | null {
  const patches = new Map(atlas.patches.map((patch) => [patch.id, patch]));
  const candidates = regions.filter(
    (region) =>
      region.role !== "enclosure" &&
      region.rx > 0.04 &&
      region.ry > 0.04 &&
      finite(region.center) &&
      region.source?.bulk &&
      region.source.cells.length > 0,
  );
  const bodies = candidates.filter(
    (region) => region.kind === "body" || region.kind === "egg",
  );
  const pool = bodies.length ? bodies : candidates;
  const host = [...pool].sort(
    (a, b) =>
      b.rx * b.ry - a.rx * a.ry ||
      a.center.x - b.center.x ||
      a.center.y - b.center.y ||
      compareText(a.kind, b.kind),
  )[0];
  if (!host) return null;
  const patch =
    patches.get(host.id) ??
    atlas.patches.find((candidate) => host.sourceIds.includes(candidate.id));
  if (!patch) return null;
  const cells = occupied(host);
  if (!cells.length) return null;
  const average = cells.reduce(
    (sum, p) => ({
      x: sum.x + p.x / cells.length,
      y: sum.y + p.y / cells.length,
    }),
    { x: 0, y: 0 },
  );
  const originalAxis = patch.axis === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const a = mapSourcePoint(host, patch.center),
    b = mapSourcePoint(host, {
      x: patch.center.x + originalAxis.x,
      y: patch.center.y + originalAxis.y,
    });
  const reference = unit({ x: b.x - a.x, y: b.y - a.y }, originalAxis);
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of cells) {
    const dx = p.x - average.x,
      dy = p.y - average.y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const spread = Math.hypot(xx - yy, 2 * xy),
    total = xx + yy;
  let axis =
    total > 1e-8 && spread / total > 0.12
      ? point(
          Math.cos(0.5 * Math.atan2(2 * xy, xx - yy)),
          Math.sin(0.5 * Math.atan2(2 * xy, xx - yy)),
        )
      : reference;
  if (dot(axis, reference) < 0) axis = { x: -axis.x, y: -axis.y };
  const normal = { x: -axis.y, y: axis.x };
  const along = cells.map((p) => dot(p, axis)),
    across = cells.map((p) => dot(p, normal));
  const lo = Math.min(...along),
    hi = Math.max(...along),
    left = Math.min(...across),
    right = Math.max(...across);
  const midpoint = (lo + hi) / 2,
    middle = (left + right) / 2;
  const center = {
    x: axis.x * midpoint + normal.x * middle,
    y: axis.y * midpoint + normal.y * middle,
  };
  // A mapped occupied source cell is an actual root even for hollow or disconnected artwork.
  const root = [...cells].sort(
    (p, q) =>
      Math.hypot(p.x - host.tip.x, p.y - host.tip.y) -
        Math.hypot(q.x - host.tip.x, q.y - host.tip.y) ||
      p.y - q.y ||
      p.x - q.x,
  )[0];
  return {
    hostId: host.id,
    sourceIds: [
      ...new Set(host.sourceIds.length ? host.sourceIds : [patch.id]),
    ],
    sourcePatch: patch,
    center,
    root: { ...root },
    axis,
    normal,
    axialHalf: Math.max(0.5, (hi - lo + 1) / 2),
    crossHalf: Math.max(0.5, (right - left + 1) / 2),
    occupied: cells,
    palette: [...new Set(patch.source.cells.map((cell) => cell.color))],
  };
}

function localColor(envelope: EnclosureEnvelope, side: number): string {
  const patch = envelope.sourcePatch;
  const axis = patch.axis === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const normal = { x: -axis.y, y: axis.x };
  const cross = patch.axis === "x" ? patch.height : patch.width;
  const sample = {
    x: patch.center.x + normal.x * side * cross * 0.2,
    y: patch.center.y + normal.y * side * cross * 0.2,
  };
  const weights = new Map<string, number>();
  for (const cell of patch.source.cells) {
    const distance = (cell.x - sample.x) ** 2 + (cell.y - sample.y) ** 2;
    weights.set(
      cell.color,
      (weights.get(cell.color) ?? 0) + 1 / (1 + distance),
    );
  }
  return (
    [...weights].sort(
      (a, b) => b[1] - a[1] || compareText(a[0], b[0]),
    )[0]?.[0] ?? "#FFFFFF"
  );
}

/** Foreground material panels. The renderer MUST carve its current facial window from these. */
export function buildEnclosure(
  regions: readonly Region[],
  atlas: SourceAtlas,
  genome: InheritedGenome,
  age: number,
): Region[] {
  if (!Number.isFinite(age) || age <= 0) return [];
  const phase = getMetamorphosisPhase(genome, age);
  if (
    phase.kind !== "sheltered" ||
    phase.enclosure <= 0 ||
    phase.emergence >= 1
  )
    return [];
  const envelope = getEnclosureEnvelope(regions, atlas);
  if (!envelope) return [];
  const opening = clamp(phase.emergence, 0, 1);
  const formation = clamp(phase.enclosure / Math.max(1e-10, 1 - opening), 0, 1);
  const grow = Math.sqrt(formation),
    centerProgress = formation * formation;
  const padding =
    1.25 + geneRandom(genome.fingerprint, "enclosure/padding") * 2.25;
  const axial = envelope.axialHalf + padding,
    cross = envelope.crossHalf + padding;
  const offset =
    envelope.crossHalf *
    (0.12 + geneRandom(genome.fingerprint, "enclosure/seam") * 0.12);
  // Fit the material samples to their nearest panel, including square/irregular drawn corners.
  let fit = 1;
  for (const cell of envelope.occupied) {
    const local = {
      x: cell.x - envelope.center.x,
      y: cell.y - envelope.center.y,
    };
    const x = dot(local, envelope.axis),
      y = dot(local, envelope.normal),
      side = y < 0 ? -1 : 1;
    fit = Math.max(fit, Math.hypot(x / axial, (y - side * offset) / cross));
  }
  fit *= 1.025;
  const decay = Math.sqrt(1 - opening);
  const rx = axial * fit * grow * decay * (1 - opening * 0.16);
  const ry = cross * fit * grow * decay * (1 - opening * 0.45);
  if (rx <= 0.00001 || ry <= 0.00001) return [];
  const angle = Math.atan2(envelope.axis.y, envelope.axis.x);
  return [-1, 1].map((side) => {
    const spread = offset + opening * cross * 1.15;
    const target = {
      x: envelope.center.x + envelope.normal.x * side * spread,
      y: envelope.center.y + envelope.normal.y * side * spread,
    };
    const center = mix(envelope.root, target, centerProgress);
    const id = `enclosure/${envelope.hostId}/${side < 0 ? "left" : "right"}`;
    return {
      id,
      kind: "body",
      role: "enclosure",
      parentId: envelope.hostId,
      sourceIds: [...envelope.sourceIds],
      center,
      anchor: { ...envelope.root },
      tip: {
        x: center.x + envelope.axis.x * rx,
        y: center.y + envelope.axis.y * rx,
      },
      rx,
      ry,
      angle,
      readiness: phase.enclosure,
      material: 1,
      shape: "ellipse",
      color: localColor(envelope, side),
      layer: ENCLOSURE_LAYER,
      lineage: [...envelope.sourceIds, id],
      operationId: "lifecycle/enclosure",
      topologyGroup: `enclosure/${envelope.hostId}`,
    } satisfies Region;
  });
}
