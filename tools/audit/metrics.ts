import { createHash } from "node:crypto";
import {
  compareAnatomyLayer,
  pixelPaintDepth,
  type PartFrame,
  type PetFrame,
  type PetPart,
  type Pixel,
} from "../../src/simulation";

/** Frozen, nonnegative, dimensionless descriptors; lengths use RMS-equivalent extents. */
export const PROPORTION_NAMES = [
  "elongation",
  "fill_ratio",
  "head_body_area",
  "head_body_length",
  "head_body_offset",
  "eye_head_area",
  "eye_head_spacing",
  "mouth_head_length",
  "ear_head_length",
  "tail_body_length",
  "arm_body_length",
  "leg_body_length",
  "hand_body_area",
  "foot_body_area",
  "wing_body_area",
  "hair_head_length",
  "horn_head_length",
  "detail_body_area",
] as const;

export type FrameDescriptor = {
  cells: number;
  components: number;
  holes: number;
  size: { width: number; height: number; area: number; diameter: number };
  posture: { angle: number; anisotropy: number };
  movement: string;
  pace: number;
  /** Unsigned packed binary rows, not arbitrary numeric features. */
  normalized16: number[];
  normalized32: number[];
  proportions: number[];
  /** Compositing alerts, never a claim that a feature was visually verified. */
  visible: {
    fullyOccludedParts: number;
    ambiguousPixels: number;
    testedParts: number;
  };
};

type XY = { x: number; y: number };
type Raster = {
  map: Uint8Array;
  points: XY[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
const SIDE = 64,
  EPS = 1e-10;
const finite = (value: number) => (Number.isFinite(value) ? value : 0);
function raster(pixels: readonly XY[]): Raster {
  const map = new Uint8Array(SIDE * SIDE);
  let minX = SIDE,
    minY = SIDE,
    maxX = -1,
    maxY = -1;
  for (const p of pixels)
    if (
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < SIDE &&
      p.y < SIDE
    ) {
      map[p.y * SIDE + p.x] = 1;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  const points: XY[] = [];
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++)
      if (map[y * SIDE + x]) points.push({ x, y });
  return { map, points, minX, minY, maxX, maxY };
}

function topologyOf(r: Raster): { components: number; holes: number } {
  if (!r.points.length) return { components: 0, holes: 0 };
  const visited = new Uint8Array(SIDE * SIDE),
    queue = new Int32Array(SIDE * SIDE);
  let components = 0,
    holes = 0;
  for (const p of r.points) {
    const start = p.y * SIDE + p.x;
    if (visited[start]) continue;
    components++;
    let read = 0,
      write = 1;
    queue[0] = start;
    visited[start] = 1;
    while (read < write) {
      const k = queue[read++],
        x = k % SIDE,
        y = (k / SIDE) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy,
            n = yy * SIDE + xx;
          if (
            (dx || dy) &&
            xx >= 0 &&
            xx < SIDE &&
            yy >= 0 &&
            yy < SIDE &&
            r.map[n] &&
            !visited[n]
          ) {
            visited[n] = 1;
            queue[write++] = n;
          }
        }
    }
  }
  visited.fill(0);
  // Four-connected background complements eight-connected foreground. Boundary
  // background is exterior, even when the foreground touches the world border.
  for (let y = r.minY; y <= r.maxY; y++)
    for (let x = r.minX; x <= r.maxX; x++) {
      const start = y * SIDE + x;
      if (r.map[start] || visited[start]) continue;
      let read = 0,
        write = 1,
        exterior = false;
      queue[0] = start;
      visited[start] = 1;
      while (read < write) {
        const k = queue[read++],
          xx = k % SIDE,
          yy = (k / SIDE) | 0;
        if (xx === r.minX || xx === r.maxX || yy === r.minY || yy === r.maxY)
          exterior = true;
        for (const step of [-SIDE, -1, 1, SIDE]) {
          const n = k + step,
            nx = n % SIDE,
            ny = (n / SIDE) | 0;
          if (
            nx >= r.minX &&
            nx <= r.maxX &&
            ny >= r.minY &&
            ny <= r.maxY &&
            Math.abs(nx - xx) + Math.abs(ny - yy) === 1 &&
            !r.map[n] &&
            !visited[n]
          ) {
            visited[n] = 1;
            queue[write++] = n;
          }
        }
      }
      if (!exterior) holes++;
    }
  return { components, holes };
}
export function topology(pixels: readonly XY[]): {
  components: number;
  holes: number;
} {
  return topologyOf(raster(pixels));
}

function moments(points: readonly XY[]) {
  if (!points.length)
    return {
      x: 0,
      y: 0,
      angle: 0,
      anisotropy: 0,
      major: 0,
      minor: 0,
      length: 0,
    };
  let x = 0,
    y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  x /= points.length;
  y /= points.length;
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of points) {
    const dx = p.x - x,
      dy = p.y - y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  xx /= points.length;
  xy /= points.length;
  yy /= points.length;
  const delta = Math.hypot(xx - yy, 2 * xy),
    major = (xx + yy + delta) / 2,
    minor = Math.max(0, (xx + yy - delta) / 2);
  return {
    x,
    y,
    angle: delta < EPS ? 0 : 0.5 * Math.atan2(2 * xy, xx - yy),
    anisotropy: delta / (xx + yy + 1 / 6),
    major,
    minor,
    length: Math.sqrt(12 * major + 1),
  };
}

function maskAt(r: Raster, angle: number, n: number): number[] {
  const rows = Array<number>(n).fill(0);
  if (!r.points.length) return rows;
  const c = Math.cos(angle),
    s = Math.sin(angle),
    m = moments(r.points);
  let lx = Infinity,
    hx = -Infinity,
    ly = Infinity,
    hy = -Infinity;
  // Pixel-square extents keep sub-pixel tissue from disappearing at tiny sizes.
  const half = (Math.abs(c) + Math.abs(s)) * 0.5;
  for (const p of r.points) {
    const x = (p.x - m.x) * c + (p.y - m.y) * s,
      y = -(p.x - m.x) * s + (p.y - m.y) * c;
    lx = Math.min(lx, x - half);
    hx = Math.max(hx, x + half);
    ly = Math.min(ly, y - half);
    hy = Math.max(hy, y + half);
  }
  const span = Math.max(hx - lx, hy - ly),
    cx = (lx + hx) / 2,
    cy = (ly + hy) / 2,
    unit = span / (n - 2);
  for (let y = 1; y < n - 1; y++)
    for (let x = 1; x < n - 1; x++) {
      let hit = 0;
      for (const sy of [-0.25, 0.25])
        for (const sx of [-0.25, 0.25]) {
          const u = (x + 0.5 - n / 2 + sx) * unit + cx,
            v = (y + 0.5 - n / 2 + sy) * unit + cy;
          const xx = Math.floor(m.x + u * c - v * s + 0.5 + EPS),
            yy = Math.floor(m.y + u * s + v * c + 0.5 + EPS);
          if (
            xx >= 0 &&
            xx < SIDE &&
            yy >= 0 &&
            yy < SIDE &&
            r.map[yy * SIDE + xx]
          )
            hit++;
        }
      if (hit >= 1) rows[y] = (rows[y] | (1 << x)) >>> 0;
    }
  return rows;
}
function quarter(rows: readonly number[], n: number): number[] {
  const result = Array<number>(n).fill(0);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if ((rows[y] >>> x) & 1)
        result[x] = (result[x] | (1 << (n - 1 - y))) >>> 0;
  return result;
}
function compareMasks(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
function canonicalMasks(r: Raster, m: ReturnType<typeof moments>) {
  let angle = m.angle,
    order = 2;
  // Near isotropy makes PCA direction unstable. A dominant angular harmonic
  // supplies an equivariant axis; its finite rotational ambiguity is enumerated.
  if (m.anisotropy < 0.08 && r.points.length > 1) {
    let best = 0;
    for (const k of [3, 4, 5, 6]) {
      let re = 0,
        im = 0,
        weight = 0;
      for (const p of r.points) {
        const dx = p.x - m.x,
          dy = p.y - m.y,
          radius = Math.hypot(dx, dy),
          a = Math.atan2(dy, dx),
          w = radius ** k;
        re += Math.cos(k * a) * w;
        im += Math.sin(k * a) * w;
        weight += w;
      }
      const strength = Math.hypot(re, im) / Math.max(EPS, weight);
      if (strength > best + 0.02) {
        best = strength;
        angle = Math.atan2(im, re) / k;
        order = k;
      }
    }
  }
  let best16 = maskAt(r, angle, 16),
    bestAngle = angle;
  for (let j = 1; j < order; j++) {
    const candidate = maskAt(r, angle + (j * 2 * Math.PI) / order, 16);
    if (compareMasks(candidate, best16) < 0) {
      best16 = candidate;
      bestAngle = angle + (j * 2 * Math.PI) / order;
    }
  }
  return { normalized16: best16, normalized32: maskAt(r, bestAngle, 32) };
}

function partStats(parts: readonly PartFrame[], kinds: readonly string[]) {
  const selected = parts.filter(
      (p) => kinds.includes(p.kind) && p.pixels.length,
    ),
    points = selected.flatMap((p) => p.pixels);
  const all = moments(points),
    length = selected.length
      ? selected.reduce((sum, p) => sum + moments(p.pixels).length, 0) /
        selected.length
      : 0;
  return { ...all, area: points.length, meanLength: length, parts: selected };
}
function proportions(
  frame: PetFrame,
  r: Raster,
  m: ReturnType<typeof moments>,
): number[] {
  const ps = frame.parts.filter((p) => p.provenance !== "shell"),
    body0 = partStats(ps, ["body", "egg"]),
    head = partStats(ps, ["head"]);
  const body = body0.area
    ? body0
    : head.area
      ? head
      : { ...m, area: r.points.length, meanLength: m.length, parts: [] };
  const face = head.area ? head : body;
  const eye = partStats(ps, ["eye"]),
    mouth = partStats(ps, ["mouth"]),
    ear = partStats(ps, ["ear"]),
    tail = partStats(ps, ["tail"]),
    arm = partStats(ps, ["arm"]),
    leg = partStats(ps, ["leg"]),
    hand = partStats(ps, ["hand"]),
    foot = partStats(ps, ["foot"]),
    wing = partStats(ps, ["wing"]),
    hair = partStats(ps, ["hair"]),
    horn = partStats(ps, ["horn"]),
    detail = partStats(ps, ["decoration"]);
  const ratio = (a: number, b: number) => (b > EPS ? finite(a / b) : 0);
  let eyeSpacing = 0,
    pairs = 0;
  for (let i = 0; i < eye.parts.length; i++)
    for (let j = 0; j < i; j++) {
      const a = moments(eye.parts[i].pixels),
        b = moments(eye.parts[j].pixels);
      eyeSpacing += Math.hypot(a.x - b.x, a.y - b.y);
      pairs++;
    }
  const elongation = r.points.length
    ? Math.sqrt((m.major + 1 / 12) / (m.minor + 1 / 12))
    : 0;
  const fill = r.points.length
    ? ratio(
        r.points.length,
        Math.sqrt(12 * m.major + 1) * Math.sqrt(12 * m.minor + 1),
      )
    : 0;
  return [
    elongation,
    fill,
    ratio(head.area, body.area),
    ratio(head.length, body.length),
    head.area
      ? ratio(Math.hypot(head.x - body.x, head.y - body.y), body.length)
      : 0,
    ratio(eye.area, face.area),
    ratio(eyeSpacing / Math.max(1, pairs), face.length),
    ratio(mouth.meanLength, face.length),
    ratio(ear.meanLength, face.length),
    ratio(tail.meanLength, body.length),
    ratio(arm.meanLength, body.length),
    ratio(leg.meanLength, body.length),
    ratio(hand.area, body.area),
    ratio(foot.area, body.area),
    ratio(wing.area, body.area),
    ratio(hair.meanLength, face.length),
    ratio(horn.meanLength, face.length),
    ratio(detail.area, body.area),
  ].map(finite);
}

export type VisibilityReport = {
  testedParts: number;
  fullyOccludedParts: number;
  ambiguousPixels: number;
  parts: {
    id: string;
    pixels: number;
    winningPixels: number;
    unambiguousPixels: number;
  }[];
};
/** Reconstructs paint ownership; same-color overlaps remain appearance alerts. */
export function visibleContributions(frame: PetFrame): VisibilityReport {
  const parts = frame.parts.filter((p) => p.pixels.length),
    reports = parts.map((p) => ({
      id: p.id,
      pixels: p.pixels.length,
      winningPixels: 0,
      unambiguousPixels: 0,
    }));
  const owners = new Map<
    number,
    {
      part: PetPart;
      index: number;
      depth: number;
      color: string;
      colors: Map<string, number>;
    }
  >();
  for (let index = 0; index < parts.length; index++) {
    const p = parts[index],
      part = { ...p, position: { x: 0, y: 0 } } as PetPart;
    for (const cell of p.pixels) {
      const key = cell.y * SIDE + cell.x,
        color = cell.color.toLowerCase(),
        depth = p.provenance === "shell" ? 1e9 : pixelPaintDepth(part, cell),
        old = owners.get(key);
      if (!old)
        owners.set(key, {
          part,
          index,
          depth,
          color,
          colors: new Map([[color, 1]]),
        });
      else {
        old.colors.set(color, (old.colors.get(color) ?? 0) + 1);
        if (
          depth > old.depth ||
          (depth === old.depth && compareAnatomyLayer(part, old.part) >= 0)
        ) {
          old.part = part;
          old.index = index;
          old.depth = depth;
          old.color = color;
        }
      }
    }
  }
  const image = new Map(
    frame.pixels.map((p) => [p.y * SIDE + p.x, p.color.toLowerCase()]),
  );
  let ambiguousPixels = 0;
  for (const [key, owner] of owners) {
    const actual = image.get(key);
    if (actual === undefined) continue;
    if (actual !== owner.color) {
      ambiguousPixels++;
      continue;
    }
    reports[owner.index].winningPixels++;
    if ((owner.colors.get(actual) ?? 0) > 1) ambiguousPixels++;
    else reports[owner.index].unambiguousPixels++;
  }
  return {
    testedParts: parts.length,
    fullyOccludedParts: reports.filter((p) => !p.winningPixels).length,
    ambiguousPixels,
    parts: reports,
  };
}

export function describeFrame(frame: PetFrame): FrameDescriptor {
  const r = raster(frame.pixels),
    m = moments(r.points),
    visibility = visibleContributions(frame),
    width = r.points.length ? r.maxX - r.minX + 1 : 0,
    height = r.points.length ? r.maxY - r.minY + 1 : 0;
  return {
    cells: r.points.length,
    ...topologyOf(r),
    size: {
      width,
      height,
      area: r.points.length,
      diameter: Math.hypot(width, height),
    },
    posture: { angle: m.angle, anisotropy: m.anisotropy },
    movement: frame.movementMode,
    pace: finite(frame.motionPace),
    ...canonicalMasks(r, m),
    proportions: proportions(frame, r, m),
    visible: {
      testedParts: visibility.testedParts,
      fullyOccludedParts: visibility.fullyOccludedParts,
      ambiguousPixels: visibility.ambiguousPixels,
    },
  };
}

function popcount(value: number) {
  let n = value >>> 0;
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return Math.imul((n + (n >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}
function dilate(rows: readonly number[]) {
  return rows.map((row, y) => {
    const band = (row | (rows[y - 1] ?? 0) | (rows[y + 1] ?? 0)) >>> 0;
    return (band | (band << 1) | (band >>> 1)) >>> 0;
  });
}
type MaskSummary = {
  small: number[][];
  large: number[][];
  dSmall: number[][];
  dLarge: number[][];
  nSmall: number[];
  nLarge: number[];
  robust: boolean;
};
const maskCache = new Map<FrameDescriptor, MaskSummary>();
function rasterRows(rows: readonly number[], n: number): Raster {
  const pixels: XY[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if ((rows[y] >>> x) & 1) pixels.push({ x, y });
  return raster(pixels);
}
function masks(d: FrameDescriptor): MaskSummary {
  const cached = maskCache.get(d),
    robust = d.posture.anisotropy < 0.2;
  if (
    cached &&
    cached.robust === robust &&
    d.normalized16.every((v, i) => v === cached.small[0][i]) &&
    d.normalized32.every((v, i) => v === cached.large[0][i])
  )
    return cached;
  const small = [[...d.normalized16]],
    large = [[...d.normalized32]];
  for (let i = 1; i < 4; i++) {
    small.push(quarter(small[i - 1], 16));
    large.push(quarter(large[i - 1], 32));
  }
  if (robust) {
    const a = rasterRows(d.normalized16, 16),
      b = rasterRows(d.normalized32, 32);
    for (let step = 1; step < 6; step++) {
      let sm = maskAt(a, (step * Math.PI) / 12, 16),
        lg = maskAt(b, (step * Math.PI) / 12, 32);
      for (let quarterTurn = 0; quarterTurn < 4; quarterTurn++) {
        small.push(sm);
        large.push(lg);
        sm = quarter(sm, 16);
        lg = quarter(lg, 32);
      }
    }
  }
  const result = {
    small,
    large,
    dSmall: small.map(dilate),
    dLarge: large.map(dilate),
    nSmall: small.map((rows) => rows.reduce((n, v) => n + popcount(v), 0)),
    nLarge: large.map((rows) => rows.reduce((n, v) => n + popcount(v), 0)),
    robust,
  };
  maskCache.set(d, result);
  while (maskCache.size > 4096) maskCache.delete(maskCache.keys().next().value!);
  return result;
}
function maskDifference(
  a: readonly number[],
  b: readonly number[],
  da: readonly number[],
  db: readonly number[],
  na: number,
  nb: number,
) {
  if (!na && !nb) return { soft: 0, iou: 0 };
  if (!na || !nb) return { soft: 1, iou: 1 };
  let unmatched = 0,
    intersection = 0;
  for (let y = 0; y < a.length; y++) {
    unmatched += popcount(a[y] & ~db[y]) + popcount(b[y] & ~da[y]);
    intersection += popcount(a[y] & b[y]);
  }
  return {
    soft: unmatched / (na + nb),
    iou: 1 - intersection / (na + nb - intersection),
  };
}
/** 0..1: 75% tolerant32 +15% tolerant16 +10% exact32 mask difference.
 * A one-cell Chebyshev tolerance suppresses aliasing; aspect is never stretched.
 * Rigid quarter turns resolve PCA sign; near-isotropic shapes additionally
 * compare sampled15degree rotations to avoid unstable PCA/harmonic axis changes.
 */
export function shapeDistance(a: FrameDescriptor, b: FrameDescriptor): number {
  const x = masks(a),
    y = masks(b);
  let best = 1;
  const compare = (left: MaskSummary, right: MaskSummary, i: number) => {
    const large = maskDifference(
        left.large[0],
        right.large[i],
        left.dLarge[0],
        right.dLarge[i],
        left.nLarge[0],
        right.nLarge[i],
      ),
      small = maskDifference(
        left.small[0],
        right.small[i],
        left.dSmall[0],
        right.dSmall[i],
        left.nSmall[0],
        right.nSmall[i],
      );
    best = Math.min(
      best,
      0.75 * large.soft + 0.15 * small.soft + 0.1 * large.iou,
    );
  };
  for (let i = 0; i < y.large.length; i++) compare(x, y, i);
  // Resampled arbitrary-angle masks are not lossless rotations. Evaluating both
  // directions explicitly guarantees symmetric distance despite rasterization.
  for (let i = 0; i < x.large.length; i++) compare(y, x, i);
  return best;
}
/** changed counts symmetric ratio changes >=20%; missing/zero -> positive counts.
 * distance averages clipped log changes over dimensions present in either frame.
 */
export function semanticDistance(
  a: FrameDescriptor,
  b: FrameDescriptor,
): { changed: number; distance: number } {
  let changed = 0,
    distance = 0,
    active = 0;
  for (let i = 0; i < PROPORTION_NAMES.length; i++) {
    const x = Math.max(0, a.proportions[i] ?? 0),
      y = Math.max(0, b.proportions[i] ?? 0);
    if (x < EPS && y < EPS) continue;
    active++;
    const delta = Math.min(x, y) < EPS ? Infinity : Math.abs(Math.log(x / y));
    if (delta >= Math.log(1.2) - EPS) changed++;
    distance += Math.min(1, delta / Math.log(2));
  }
  return { changed, distance: active ? distance / active : 0 };
}

/** Image collision/replay hash only: sorted coordinates and rendered colors.
 * Age, wellbeing, source depth, and invisible source tissue do not enter it.
 */
export function frameHash(frame: PetFrame): string {
  const pixels = [...frame.pixels].sort(
    (a, b) =>
      a.y - b.y ||
      a.x - b.x ||
      (a.color < b.color ? -1 : a.color > b.color ? 1 : 0),
  );
  return createHash("sha256")
    .update(
      JSON.stringify(pixels.map((p) => [p.x, p.y, p.color.toLowerCase()])),
    )
    .digest("hex");
}

function varianceVector(d: FrameDescriptor): number[] {
  // Rotation-invariant radial distribution avoids allocating a PCA-directed
  // image coordinate an apparent genetic/history effect. No color/size/pose.
  const rows = d.normalized16,
    points: XY[] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if ((rows[y] >>> x) & 1) points.push({ x, y });
  const m = moments(points),
    radial = Array<number>(8).fill(0);
  const radii = points.map((p) => Math.hypot(p.x - m.x, p.y - m.y)),
    maximum = Math.max(EPS, ...radii);
  for (const radius of radii)
    for (let k = 0; k < 8; k++)
      if (radius / maximum <= (k + 1) / 8) radial[k]++;
  const semantic = d.proportions.map(
    (value) => (2 / Math.PI) * Math.atan(Math.log1p(Math.max(0, value))),
  );
  return [
    ...radial.map((value) => value / Math.max(1, points.length)),
    ...semantic,
  ].map((value) => value / Math.sqrt(8 + PROPORTION_NAMES.length));
}
/** Balanced grid[seed][history], raw vector sums of squares. Percentages are
 * conditional on this cohort/history design, not a causal population estimate.
 */
export function varianceAttribution(grid: FrameDescriptor[][]): {
  seed: number;
  history: number;
  interaction: number;
  total: number;
} {
  const seeds = grid.length,
    histories = grid[0]?.length ?? 0;
  if (!seeds || !histories)
    return { seed: 0, history: 0, interaction: 0, total: 0 };
  if (grid.some((row) => row.length !== histories))
    throw new Error(
      "Variance attribution requires a rectangular balanced grid.",
    );
  const values = grid.map((row) => row.map(varianceVector)),
    dimensions = values[0][0].length,
    grand = Array<number>(dimensions).fill(0),
    seedMeans = grid.map(() => Array<number>(dimensions).fill(0)),
    historyMeans = Array.from({ length: histories }, () =>
      Array<number>(dimensions).fill(0),
    );
  for (let s = 0; s < seeds; s++)
    for (let h = 0; h < histories; h++)
      for (let k = 0; k < dimensions; k++) {
        const x = values[s][h][k];
        grand[k] += x / (seeds * histories);
        seedMeans[s][k] += x / histories;
        historyMeans[h][k] += x / seeds;
      }
  let seed = 0,
    history = 0,
    interaction = 0,
    total = 0;
  for (let k = 0; k < dimensions; k++) {
    for (let s = 0; s < seeds; s++)
      seed += histories * (seedMeans[s][k] - grand[k]) ** 2;
    for (let h = 0; h < histories; h++)
      history += seeds * (historyMeans[h][k] - grand[k]) ** 2;
    for (let s = 0; s < seeds; s++)
      for (let h = 0; h < histories; h++) {
        total += (values[s][h][k] - grand[k]) ** 2;
        interaction +=
          (values[s][h][k] - seedMeans[s][k] - historyMeans[h][k] + grand[k]) **
          2;
      }
  }
  return { seed, history, interaction, total };
}
