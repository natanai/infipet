import { clamp, compareText, hash, type PartKind, type Point } from "./model";
import { bounds, type Tissue } from "./material";

export type SourcePatch = {
  id: string;
  kind: PartKind;
  source: Tissue;
  center: Point;
  pivot: Point;
  width: number;
  height: number;
  area: number;
  density: number;
  axis: "x" | "y";
  axisWeight: number;
  widthProfile: number[];
  centerline: Point[];
  boundary: Point[];
  components: number;
  holes: number;
  protected: boolean;
  ports: {
    id: string;
    point: Point;
    normal: Point;
    purpose: "support" | "terminal" | "surface";
  }[];
};
export type SourceAtlas = {
  version: 7;
  geometryHash: string;
  patches: SourcePatch[];
  center: Point;
  bounds: ReturnType<typeof bounds>;
  cellCount: number;
  faceIslands: FaceIsland[];
  descriptors: {
    aspect: number;
    density: number;
    components: number;
    holes: number;
    headCount: number;
    supportCount: number;
    floatingCount: number;
    symmetry: number;
  };
};
export type FaceIsland = {
  id: string;
  hostId: string | null;
  sourceIds: string[];
  primarySourceIds?: string[];
  center: Point;
  carrierPoint: Point;
  radius: number;
  floating: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
  material?: {
    cells: Point[];
    center: Point;
    bounds: { x: number; y: number; width: number; height: number };
    outward: Point;
  };
  voidCells?: Point[];
};
/** Source/target are in a warp step's input world coordinates. Width samples are
 * dimensionless normal-offset ratios at evenly spaced normalized arc positions. */
export type CenterlineTransport = {
  source: readonly Point[];
  target: readonly Point[];
  widths: readonly number[];
  strength?: number;
  carriers?: readonly {
    anchor: Point;
    radius: number;
    sourceAngle?: number;
    maxTurn?: number;
  }[];
};
/** Independent source-material cages share ownership coordinates, not a target sprite. */
export type RegionalMaterialCage = {
  id: string;
  uMin: number;
  uMax: number;
  sourceCenter: Point;
  sourceRadius: Point;
  center: Point;
  radius: Point;
  angle: number;
  roundness?: number;
};
export type RegionalMaterialTransport = {
  centerline: readonly Point[];
  axis: Point;
  normal: Point;
  cages: readonly RegionalMaterialCage[];
  fixedDomainId?: string;
  carriers?: readonly { anchor: Point; radius: number; maxTurn?: number }[];
  cranium?: RegionalMaterialCage & { cells: readonly Point[] };
  voids?: readonly {
    sourceCenter: Point;
    center: Point;
    angle: number;
    scale: number;
    cells: readonly Point[];
  }[];
};
const materialCellSets = new WeakMap<object, Set<string>>();
function hasMaterialCell(owner: object, cells: readonly Point[], p: Point) {
  let set = materialCellSets.get(owner);
  if (!set)
    materialCellSets.set(
      owner,
      (set = new Set(cells.map((p) => `${p.x},${p.y}`))),
    );
  return set.has(`${Math.floor(p.x + 0.5)},${Math.floor(p.y + 0.5)}`);
}
function regionalCageAt(
  kernel: RegionalMaterialTransport,
  point: Point,
  fixed = true,
) {
  const u = sourceCenterlineU(kernel.centerline, point);
  if (
    kernel.cranium &&
    ((fixed && kernel.fixedDomainId === kernel.cranium.id) ||
      (!kernel.fixedDomainId &&
        hasMaterialCell(kernel.cranium, kernel.cranium.cells, point)))
  )
    return kernel.cranium;
  return (
    (fixed && kernel.fixedDomainId
      ? kernel.cages.find((c) => c.id === kernel.fixedDomainId)
      : undefined) ??
    kernel.cages.find(
      (c, i) => u >= c.uMin && (u < c.uMax || i === kernel.cages.length - 1),
    ) ??
    kernel.cages[0]
  );
}
function rawRegionalPoint(
  kernel: RegionalMaterialTransport,
  point: Point,
  fixed = true,
): Point {
  const cage = regionalCageAt(kernel, point, fixed);
  if (!cage) return { ...point };
  if (
    cage.angle === 0 &&
    cage.sourceCenter.x === cage.center.x &&
    cage.sourceCenter.y === cage.center.y &&
    cage.sourceRadius.x === cage.radius.x &&
    cage.sourceRadius.y === cage.radius.y &&
    !cage.roundness
  )
    return { ...point };
  const dx = point.x - cage.sourceCenter.x,
    dy = point.y - cage.sourceCenter.y;
  const u =
    (dx * kernel.axis.x + dy * kernel.axis.y) *
    clamp(cage.radius.x / Math.max(0.25, cage.sourceRadius.x), 0.2, 5);
  const axial = clamp(
    Math.abs(
      (dx * kernel.axis.x + dy * kernel.axis.y) /
        Math.max(0.5, cage.sourceRadius.x),
    ),
    0,
    1,
  );
  const end = axial * axial,
    taper = end * end * (3 - 2 * end);
  const v =
    (dx * kernel.normal.x + dy * kernel.normal.y) *
    clamp(cage.radius.y / Math.max(0.25, cage.sourceRadius.y), 0.2, 5) *
    (1 - clamp(cage.roundness ?? 0, 0, 0.65) * taper);
  const x = kernel.axis.x * u + kernel.normal.x * v,
    y = kernel.axis.y * u + kernel.normal.y * v;
  const c = Math.cos(cage.angle),
    s = Math.sin(cage.angle);
  return { x: cage.center.x + x * c - y * s, y: cage.center.y + x * s + y * c };
}
/** The same protected material island carries its skin and facial marks, even
 * when the two source masses on either side are independently reorganized. */
export function transportRegionalPoint(
  kernel: RegionalMaterialTransport,
  point: Point,
): Point {
  let result = rawRegionalPoint(kernel, point);
  let chosen:
      NonNullable<RegionalMaterialTransport["carriers"]>[number] | undefined,
    weight = 0;
  for (const carrier of kernel.carriers ?? []) {
    const d =
      Math.hypot(point.x - carrier.anchor.x, point.y - carrier.anchor.y) /
      Math.max(0.5, carrier.radius);
    const t = clamp(2 - d, 0, 1),
      w = t * t * (3 - 2 * t);
    if (w > weight) {
      weight = w;
      chosen = carrier;
    }
  }
  if (chosen && weight > 0) {
    const cage = regionalCageAt(kernel, chosen.anchor, false),
      anchor = rawRegionalPoint(kernel, chosen.anchor, false);
    const turn = (chosen.maxTurn ?? Math.PI / 6) * Math.sin(cage?.angle ?? 0);
    const scale = cage
      ? clamp(
          Math.min(
            cage.radius.x / Math.max(0.25, cage.sourceRadius.x),
            cage.radius.y / Math.max(0.25, cage.sourceRadius.y),
          ),
          1,
          1.35,
        )
      : 1;
    const dx = (point.x - chosen.anchor.x) * scale,
      dy = (point.y - chosen.anchor.y) * scale;
    const c = Math.cos(turn),
      s = Math.sin(turn);
    const rigid = {
      x: anchor.x + dx * c - dy * s,
      y: anchor.y + dx * s + dy * c,
    };
    result = {
      x: result.x + (rigid.x - result.x) * weight,
      y: result.y + (rigid.y - result.y) * weight,
    };
  }
  return guardMaterialVoids(kernel.voids ?? [], point, result);
}
export function guardMaterialVoids(
  guards: NonNullable<RegionalMaterialTransport["voids"]>,
  point: Point,
  mapped: Point,
): Point {
  let result = mapped;
  for (const guard of guards) {
    // Only skin moves around the authored empty volume. Facial ink is carried
    // separately and must never be pushed out of its own original opening.
    if (hasMaterialCell(guard, guard.cells, point)) continue;
    const c = Math.cos(guard.angle),
      s = Math.sin(guard.angle),
      scale = Math.max(1, guard.scale),
      dx = (result.x - guard.center.x) / scale,
      dy = (result.y - guard.center.y) / scale,
      local = {
        x: guard.sourceCenter.x + dx * c + dy * s,
        y: guard.sourceCenter.y - dx * s + dy * c,
      };
    if (!hasMaterialCell(guard, guard.cells, local)) continue;
    let vx = local.x - guard.sourceCenter.x,
      vy = local.y - guard.sourceCenter.y;
    let n = Math.hypot(vx, vy);
    if (n < 1e-8) {
      vx = point.x - guard.sourceCenter.x;
      vy = point.y - guard.sourceCenter.y;
      n = Math.hypot(vx, vy);
    }
    if (n < 1e-8) {
      vx = 0;
      vy = -1;
      n = 1;
    }
    vx /= n;
    vy /= n;
    let radius = 0;
    while (
      radius < 64 &&
      hasMaterialCell(guard, guard.cells, {
        x: guard.sourceCenter.x + vx * radius,
        y: guard.sourceCenter.y + vy * radius,
      })
    )
      radius += 0.25;
    radius += 0.55;
    const x = vx * radius * scale,
      y = vy * radius * scale;
    result = {
      x: guard.center.x + x * c - y * s,
      y: guard.center.y + x * s + y * c,
    };
  }
  return result;
}
type Polyline = {
  points: Point[];
  cumulative: number[];
  tangents: Point[];
  total: number;
};
const length = (p: Point) => Math.hypot(p.x, p.y);
const direction = (p: Point, fallback: Point = { x: 1, y: 0 }): Point => {
  const n = length(p);
  return n > 1e-8 ? { x: p.x / n, y: p.y / n } : { ...fallback };
};
function polyline(input: readonly Point[]): Polyline {
  const points: Point[] = [];
  for (const p of input ?? [])
    if (
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      (!points.length ||
        Math.hypot(
          p.x - points[points.length - 1].x,
          p.y - points[points.length - 1].y,
        ) > 1e-7)
    )
      points.push({ x: p.x, y: p.y });
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        ),
    );
  const tangents = points.map((p, i) => {
    const before = points[Math.max(0, i - 1)],
      after = points[Math.min(points.length - 1, i + 1)];
    return direction({ x: after.x - before.x, y: after.y - before.y });
  });
  return {
    points,
    cumulative,
    tangents,
    total: cumulative[cumulative.length - 1] ?? 0,
  };
}
function sample(line: Polyline, arc: number) {
  if (line.points.length < 2 || line.total < 1e-7)
    return { point: line.points[0] ?? { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
  const d = clamp(arc, 0, line.total);
  let segment = 0;
  while (segment < line.points.length - 2 && line.cumulative[segment + 1] < d)
    segment++;
  const a = line.points[segment],
    b = line.points[segment + 1],
    span = Math.max(
      1e-8,
      line.cumulative[segment + 1] - line.cumulative[segment],
    );
  const u = clamp((d - line.cumulative[segment]) / span, 0, 1);
  const ta = line.tangents[segment],
    tb = line.tangents[segment + 1];
  const tangent = direction(
    { x: ta.x + (tb.x - ta.x) * u, y: ta.y + (tb.y - ta.y) * u },
    direction({ x: b.x - a.x, y: b.y - a.y }),
  );
  return {
    point: {
      x: a.x + (b.x - a.x) * u + tangent.x * (arc - d),
      y: a.y + (b.y - a.y) * u + tangent.y * (arc - d),
    },
    tangent,
  };
}
const materialLineCache = new WeakMap<readonly Point[], Polyline>();
/** Seed-independent material ownership along the original source centerline. */
export function sourceCenterlineU(
  points: readonly Point[],
  point: Point,
): number {
  let line = materialLineCache.get(points);
  if (!line) {
    line = polyline(points);
    materialLineCache.set(points, line);
  }
  if (line.total < 1e-8 || line.points.length < 2) return 0.5;
  let best = Infinity,
    arc = 0;
  for (let i = 0; i < line.points.length - 1; i++) {
    const a = line.points[i],
      b = line.points[i + 1],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const u = clamp(
      ((point.x - a.x) * dx + (point.y - a.y) * dy) /
        Math.max(1e-12, dx * dx + dy * dy),
      0,
      1,
    );
    const x = a.x + dx * u,
      y = a.y + dy * u,
      d = (point.x - x) ** 2 + (point.y - y) ** 2;
    const candidate =
      line.cumulative[i] + (line.cumulative[i + 1] - line.cumulative[i]) * u;
    if (d < best - 1e-10 || (Math.abs(d - best) <= 1e-10 && candidate < arc)) {
      best = d;
      arc = candidate;
    }
  }
  return clamp(arc / line.total, 0, 1);
}
export function resampleCenterline(
  points: readonly Point[],
  count = 17,
): Point[] {
  const line = polyline(points),
    n = Math.max(2, Math.min(65, Math.round(count)));
  return Array.from(
    { length: n },
    (_, i) => sample(line, (line.total * i) / (n - 1)).point,
  );
}
type PreparedTransport = {
  source: Polyline;
  target: Polyline;
  identity: boolean;
};
const transportCache = new WeakMap<CenterlineTransport, PreparedTransport>();
function prepare(kernel: CenterlineTransport): PreparedTransport {
  let prepared = transportCache.get(kernel);
  if (!prepared) {
    const source = polyline(kernel.source),
      target = polyline(kernel.target);
    const identity =
      source.points.length === target.points.length &&
      source.points.every(
        (p, i) => p.x === target.points[i].x && p.y === target.points[i].y,
      ) &&
      kernel.widths.every((w) => w === 1);
    prepared = { source, target, identity };
    transportCache.set(kernel, prepared);
  }
  return prepared;
}
function rawCenterlineMaterialFrame(kernel: CenterlineTransport, p: Point) {
  const prepared = prepare(kernel),
    source = prepared.source,
    target = prepared.target;
  if (
    source.points.length < 2 ||
    target.points.length < 2 ||
    source.total < 1e-7 ||
    target.total < 1e-7
  )
    return {
      sourcePoint: { ...p },
      targetPoint: { ...p },
      sourceTangent: { x: 1, y: 0 },
      targetTangent: { x: 1, y: 0 },
      normalOffset: 0,
      arc: 0,
      width: 1,
    };
  let best = Infinity,
    arc = 0;
  for (let i = 0; i < source.points.length - 1; i++) {
    const a = source.points[i],
      b = source.points[i + 1],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const u = clamp(
      ((p.x - a.x) * dx + (p.y - a.y) * dy) /
        Math.max(1e-12, dx * dx + dy * dy),
      0,
      1,
    );
    const q = { x: a.x + dx * u, y: a.y + dy * u },
      d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    const candidateArc =
      source.cumulative[i] +
      (source.cumulative[i + 1] - source.cumulative[i]) * u;
    if (
      d < best - 1e-10 ||
      (Math.abs(d - best) <= 1e-10 && candidateArc < arc)
    ) {
      best = d;
      arc = candidateArc;
    }
  }
  const from = sample(source, arc),
    to = sample(target, (arc / source.total) * target.total);
  const rx = p.x - from.point.x,
    ry = p.y - from.point.y;
  const normalOffset = -rx * from.tangent.y + ry * from.tangent.x;
  const longitudinalOffset = rx * from.tangent.x + ry * from.tangent.y;
  const fraction = arc / source.total,
    widths = kernel.widths,
    at = fraction * Math.max(0, widths.length - 1),
    lo = Math.floor(at),
    w = at - lo;
  const a = Number.isFinite(widths[lo]) ? widths[lo] : 1,
    b = Number.isFinite(widths[Math.min(widths.length - 1, lo + 1)])
      ? widths[Math.min(widths.length - 1, lo + 1)]
      : a;
  const width = clamp(a + (b - a) * w, 0.15, 3);
  return {
    sourcePoint: from.point,
    sourceTangent: from.tangent,
    targetTangent: to.tangent,
    normalOffset,
    arc: fraction,
    width,
    targetPoint: {
      x:
        to.point.x +
        (to.tangent.x * longitudinalOffset * target.total) / source.total -
        to.tangent.y * normalOffset * width,
      y:
        to.point.y +
        (to.tangent.y * longitudinalOffset * target.total) / source.total +
        to.tangent.x * normalOffset * width,
    },
  };
}
/** Continuous nearest-material transport; endpoint residuals extrapolate instead of clamping. */
export function transportCenterlinePoint(
  kernel: CenterlineTransport,
  p: Point,
): Point {
  const strength = clamp(
    Number.isFinite(kernel.strength) ? kernel.strength! : 1,
    0,
    1,
  );
  if (strength === 0) return { x: p.x, y: p.y };
  const prepared = prepare(kernel);
  if (prepared.identity) return { x: p.x, y: p.y };
  const frame = rawCenterlineMaterialFrame(kernel, p),
    mapped = frame.targetPoint;
  let chosen:
      | {
          anchor: Point;
          radius: number;
          sourceAngle?: number;
          maxTurn?: number;
        }
      | undefined,
    weight = 0;
  for (const carrier of kernel.carriers ?? []) {
    const radius = Math.max(0.5, carrier.radius),
      d = Math.hypot(p.x - carrier.anchor.x, p.y - carrier.anchor.y) / radius;
    const t = clamp(2 - d, 0, 1),
      w = t * t * (3 - 2 * t);
    if (w > weight) {
      weight = w;
      chosen = carrier;
    }
  }
  let result = {
    x: p.x + (mapped.x - p.x) * strength,
    y: p.y + (mapped.y - p.y) * strength,
  };
  if (chosen && weight > 0) {
    const anchor = rawCenterlineMaterialFrame(kernel, chosen.anchor);
    let turn = Math.atan2(
      anchor.sourceTangent.x * anchor.targetTangent.y -
        anchor.sourceTangent.y * anchor.targetTangent.x,
      anchor.sourceTangent.x * anchor.targetTangent.x +
        anchor.sourceTangent.y * anchor.targetTangent.y,
    );
    if (Number.isFinite(chosen.maxTurn)) {
      const sourceAngle = chosen.sourceAngle ?? 0;
      // Periodic damping avoids the +30 -> -30 degree snap a hard atan2 clamp
      // would cause when a coiling host crosses the authored backwards axis.
      const total = chosen.maxTurn! * Math.sin(sourceAngle + turn);
      turn = total - sourceAngle;
    }
    const c = Math.cos(turn * strength),
      s = Math.sin(turn * strength),
      dx = p.x - chosen.anchor.x,
      dy = p.y - chosen.anchor.y;
    const partialAnchor = {
      x: chosen.anchor.x + (anchor.targetPoint.x - chosen.anchor.x) * strength,
      y: chosen.anchor.y + (anchor.targetPoint.y - chosen.anchor.y) * strength,
    };
    const rigid = {
      x: partialAnchor.x + dx * c - dy * s,
      y: partialAnchor.y + dx * s + dy * c,
    };
    result = {
      x: result.x + (rigid.x - result.x) * weight,
      y: result.y + (rigid.y - result.y) * weight,
    };
  }
  return result;
}
/** Frame follows the actual strength-blended map, including rigid facial guards. */
export function centerlineMaterialFrame(kernel: CenterlineTransport, p: Point) {
  const frame = rawCenterlineMaterialFrame(kernel, p),
    eps = 0.001;
  const a = transportCenterlinePoint(kernel, {
    x: p.x - frame.sourceTangent.x * eps,
    y: p.y - frame.sourceTangent.y * eps,
  });
  const b = transportCenterlinePoint(kernel, {
    x: p.x + frame.sourceTangent.x * eps,
    y: p.y + frame.sourceTangent.y * eps,
  });
  const n = { x: -frame.sourceTangent.y, y: frame.sourceTangent.x };
  const lower = transportCenterlinePoint(kernel, {
    x: p.x - n.x * eps,
    y: p.y - n.y * eps,
  });
  const upper = transportCenterlinePoint(kernel, {
    x: p.x + n.x * eps,
    y: p.y + n.y * eps,
  });
  return {
    ...frame,
    targetPoint: transportCenterlinePoint(kernel, p),
    targetTangent: direction(
      { x: b.x - a.x, y: b.y - a.y },
      frame.sourceTangent,
    ),
    width: Math.hypot(upper.x - lower.x, upper.y - lower.y) / (2 * eps),
  };
}
function topology(points: Point[], b: ReturnType<typeof bounds>) {
  const occupied = new Set(points.map((p) => p.y * 64 + p.x));
  const walk = (set: Set<number>, diagonal: boolean) => {
    let count = 0;
    while (set.size) {
      count++;
      const first = set.values().next().value!;
      set.delete(first);
      const queue = [first];
      for (let i = 0; i < queue.length; i++) {
        const k = queue[i],
          x = k % 64,
          y = Math.floor(k / 64);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
            const xx = x + dx,
              yy = y + dy,
              key = yy * 64 + xx;
            if (xx >= 0 && xx < 64 && yy >= 0 && yy < 64 && set.delete(key))
              queue.push(key);
          }
      }
    }
    return count;
  };
  const blank = new Set<number>();
  for (let y = Math.max(0, b.y - 1); y <= Math.min(63, b.y + b.height); y++)
    for (let x = Math.max(0, b.x - 1); x <= Math.min(63, b.x + b.width); x++)
      if (!occupied.has(y * 64 + x)) blank.add(y * 64 + x);
  return {
    components: walk(new Set(occupied), true),
    holes: Math.max(0, walk(blank, false) - 1),
  };
}
const voidCache = new WeakMap<Tissue, Point[]>();
function enclosedVoid(tissue: Tissue): Point[] {
  const hit = voidCache.get(tissue);
  if (hit) return hit;
  const key = (p: Point) => `${p.x},${p.y}`;
  const occupied = new Set(tissue.cells.map(key)),
    b = tissue.bounds;
  const low = { x: b.x - 1, y: b.y - 1 },
    high = { x: b.x + b.width, y: b.y + b.height };
  const exterior = new Set([key(low)]),
    queue = [low];
  for (let i = 0; i < queue.length; i++)
    for (const [x, y] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const p = { x: queue[i].x + x, y: queue[i].y + y },
        k = key(p);
      if (
        p.x < low.x ||
        p.x > high.x ||
        p.y < low.y ||
        p.y > high.y ||
        occupied.has(k) ||
        exterior.has(k)
      )
        continue;
      exterior.add(k);
      queue.push(p);
    }
  const result: Point[] = [];
  for (let y = b.y; y < b.y + b.height; y++)
    for (let x = b.x; x < b.x + b.width; x++)
      if (!occupied.has(`${x},${y}`) && !exterior.has(`${x},${y}`))
        result.push({ x, y });
  voidCache.set(tissue, result);
  return result;
}
/** Pure geometric/material description; no seeded or need-dependent classification. */
export function describeSource(tissues: Tissue[]): SourceAtlas {
  const active = tissues
    .filter((t) => t.cells.length)
    .sort((a, b) => compareText(a.id, b.id));
  const patches: SourcePatch[] = active.map((t) => {
    const b = t.bounds,
      axial = Math.max(
        0,
        Math.min(1, (b.width / Math.max(1, b.height) - 1.2) / 1.05),
      );
    const axisWeight = axial * axial * (3 - 2 * axial),
      axis = axisWeight > 0.5 ? "x" : "y";
    const widthProfile: number[] = [],
      centerline: Point[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i + 0.5) / 7;
      const sample = (direction: "x" | "y") => {
        const low =
          direction === "x"
            ? b.x + (i * b.width) / 7
            : b.y + (i * b.height) / 7;
        const high =
          direction === "x"
            ? b.x + ((i + 1) * b.width) / 7
            : b.y + ((i + 1) * b.height) / 7;
        const cells = t.cells.filter(
          (p) =>
            (direction === "x" ? p.x : p.y) >= low &&
            (direction === "x" ? p.x : p.y) < high,
        );
        const cross = cells.map((p) => (direction === "x" ? p.y : p.x));
        const span = cross.length
          ? Math.max(...cross) - Math.min(...cross) + 1
          : Math.max(1, (direction === "x" ? b.height : b.width) * 0.3);
        const middle = cross.length
          ? cross.reduce((s, v) => s + v, 0) / cross.length
          : direction === "x"
            ? t.center.y
            : t.center.x;
        return {
          span,
          point:
            direction === "x"
              ? { x: b.x + a * b.width - 0.5, y: middle }
              : { x: middle, y: b.y + a * b.height - 0.5 },
        };
      };
      const x = sample("x"),
        y = sample("y");
      widthProfile.push(y.span + (x.span - y.span) * axisWeight);
      centerline.push({
        x: y.point.x + (x.point.x - y.point.x) * axisWeight,
        y: y.point.y + (x.point.y - y.point.y) * axisWeight,
      });
    }
    const extrema = [
      { id: "left", normal: { x: -1, y: 0 }, score: (p: Point) => p.x },
      { id: "right", normal: { x: 1, y: 0 }, score: (p: Point) => -p.x },
      { id: "crown", normal: { x: 0, y: -1 }, score: (p: Point) => p.y },
      { id: "sole", normal: { x: 0, y: 1 }, score: (p: Point) => -p.y },
    ];
    const tp = topology(t.cells, b);
    const occupied = new Set(t.cells.map((p) => p.y * 64 + p.x));
    const boundary = t.cells
      .filter(
        (p) =>
          !occupied.has(p.y * 64 + p.x - 1) ||
          !occupied.has(p.y * 64 + p.x + 1) ||
          !occupied.has((p.y - 1) * 64 + p.x) ||
          !occupied.has((p.y + 1) * 64 + p.x),
      )
      .map((p) => ({ x: p.x, y: p.y }));
    return {
      id: t.id,
      kind: t.kind,
      source: t,
      center: { ...t.center },
      pivot: { ...t.pivot },
      width: b.width,
      height: b.height,
      area: t.cells.length,
      density: t.cells.length / Math.max(1, b.width * b.height),
      axis,
      axisWeight,
      widthProfile,
      centerline,
      boundary,
      ...tp,
      protected:
        ["eye", "mouth", "decoration"].includes(t.kind) ||
        t.relationship === "floating",
      ports: extrema.map((e) => ({
        id: e.id,
        normal: e.normal,
        purpose:
          e.id === "sole"
            ? ("support" as const)
            : e.id === "crown"
              ? ("surface" as const)
              : ("terminal" as const),
        point: {
          ...t.cells.reduce((a, p) =>
            e.score(p) < e.score(a) ||
            (e.score(p) === e.score(a) &&
              Math.hypot(p.x - t.center.x, p.y - t.center.y) <
                Math.hypot(a.x - t.center.x, a.y - t.center.y))
              ? p
              : a,
          ),
        },
      })),
    };
  });
  const all = active.flatMap((t) => t.cells),
    b = bounds(all);
  const c = all.length
    ? {
        x: all.reduce((s, p) => s + p.x, 0) / all.length,
        y: all.reduce((s, p) => s + p.y, 0) / all.length,
      }
    : { x: 32, y: 32 };
  const unique = new Set(all.map((p) => p.y * 64 + p.x));
  let reflected = 0;
  for (const p of all)
    if (unique.has(p.y * 64 + Math.round(2 * c.x - p.x))) reflected++;
  const geometry = active
    .flatMap((t) => t.cells.map((p) => [t.kind, p.x, p.y]))
    .sort((a, bb) =>
      String(a) < String(bb) ? -1 : String(a) > String(bb) ? 1 : 0,
    );
  const facialHosts = new Map<string, SourcePatch[]>();
  for (const p of patches.filter(
    (p) => p.kind === "eye" || p.kind === "mouth",
  )) {
    const host = p.source.parentId ?? "__assembly__";
    const members = facialHosts.get(host) ?? [];
    members.push(p);
    facialHosts.set(host, members);
  }
  const faceIslands: FaceIsland[] = [...facialHosts]
    .map(([hostKey, primary]) => {
      const primaryCells = primary.flatMap((p) => p.source.cells),
        faceBounds = bounds(primaryCells);
      const details = patches.filter(
        (p) =>
          p.kind === "decoration" &&
          (p.source.parentId ?? "__assembly__") === hostKey &&
          p.source.cells.every(
            (cell) =>
              cell.x >= faceBounds.x - 1 &&
              cell.x < faceBounds.x + faceBounds.width + 1 &&
              cell.y >= faceBounds.y - 1 &&
              cell.y < faceBounds.y + faceBounds.height + 1,
          ),
      );
      const members = [...primary, ...details],
        cells = primaryCells;
      const center = {
        x: cells.reduce((sum, p) => sum + p.x, 0) / cells.length,
        y: cells.reduce((sum, p) => sum + p.y, 0) / cells.length,
      };
      const host = patches.find((p) => p.id === hostKey);
      const occupied = new Set(
          host?.source.cells.map((cell) => `${cell.x},${cell.y}`) ?? [],
        ),
        supported =
          cells.filter((cell) => occupied.has(`${cell.x},${cell.y}`)).length /
          Math.max(1, cells.length),
        floating =
          primary.every((p) => p.source.relationship === "floating") ||
          supported < 0.5;
      const materialCells =
        host?.source.cells.filter(
          (cell) =>
            cell.x >= faceBounds.x - 1 &&
            cell.x < faceBounds.x + faceBounds.width + 1 &&
            cell.y >= faceBounds.y - 1 &&
            cell.y < faceBounds.y + faceBounds.height + 1,
        ) ?? [];
      const eyes = primary
          .filter((p) => p.kind === "eye")
          .flatMap((p) => p.source.cells),
        forwardMarks = eyes.length ? eyes : cells;
      const outwardRaw = {
          x:
            forwardMarks.reduce((s, p) => s + p.x, 0) / forwardMarks.length -
            (host?.center.x ?? center.x),
          y:
            forwardMarks.reduce((s, p) => s + p.y, 0) / forwardMarks.length -
            (host?.center.y ?? center.y) -
            0.25,
        },
        outwardNorm = Math.max(1e-8, Math.hypot(outwardRaw.x, outwardRaw.y));
      const material =
        !floating &&
        host &&
        ["body", "egg"].includes(host.kind) &&
        materialCells.length >= 4 &&
        host.area - materialCells.length >= 4
          ? {
              cells: materialCells.map(({ x, y }) => ({ x, y })),
              center: {
                x:
                  materialCells.reduce((s, p) => s + p.x, 0) /
                  materialCells.length,
                y:
                  materialCells.reduce((s, p) => s + p.y, 0) /
                  materialCells.length,
              },
              bounds: bounds(materialCells),
              outward: {
                x: outwardRaw.x / outwardNorm,
                y: outwardRaw.y / outwardNorm,
              },
            }
          : undefined;
      let voidCells = floating && host ? enclosedVoid(host.source) : [];
      if (floating && !voidCells.length) {
        voidCells = [];
        for (
          let y = faceBounds.y - 1;
          y <= faceBounds.y + faceBounds.height;
          y++
        )
          for (
            let x = faceBounds.x - 1;
            x <= faceBounds.x + faceBounds.width;
            x++
          )
            if (!occupied.has(`${x},${y}`)) voidCells.push({ x, y });
      }
      const carrierPoint = host?.source.cells.reduce((best, p) =>
        Math.hypot(p.x - center.x, p.y - center.y) <
        Math.hypot(best.x - center.x, best.y - center.y)
          ? p
          : best,
      );
      return {
        id: `face/${hostKey}`,
        hostId: host?.id ?? null,
        sourceIds: members.map((p) => p.id).sort(compareText),
        primarySourceIds: primary.map((p) => p.id).sort(compareText),
        center,
        carrierPoint: carrierPoint
          ? { x: carrierPoint.x, y: carrierPoint.y }
          : { ...center },
        radius: Math.max(
          1.5,
          ...cells.map((p) => Math.hypot(p.x - center.x, p.y - center.y) + 0.8),
        ),
        floating,
        bounds: faceBounds,
        ...(material ? { material } : {}),
        ...(floating ? { voidCells } : {}),
      };
    })
    .sort(
      (a, bb) =>
        a.center.x - bb.center.x ||
        a.center.y - bb.center.y ||
        compareText(a.id, bb.id),
    );
  return {
    version: 7,
    geometryHash: hash(JSON.stringify(geometry)).toString(16),
    patches,
    center: c,
    bounds: b,
    cellCount: all.length,
    faceIslands,
    descriptors: {
      aspect: b.width / Math.max(1, b.height),
      density: unique.size / Math.max(1, b.width * b.height),
      components: patches.reduce((s, p) => s + p.components, 0),
      holes: patches.reduce((s, p) => s + p.holes, 0),
      headCount: active.filter((t) => t.kind === "head").length,
      supportCount: active.filter(
        (t) => t.kind === "leg" && t.relationship !== "floating",
      ).length,
      floatingCount: active.filter((t) => t.relationship === "floating").length,
      symmetry: all.length ? reflected / all.length : 1,
    },
  };
}
