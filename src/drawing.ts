import {
  DRAW_SIZE,
  PART_KINDS,
  PART_LABELS,
  flattenAnatomy,
  compareAnatomyLayer,
  pixelPaintDepth,
  type PartKind,
  type PetPart,
  type Pixel,
  type Point,
} from "./simulation";

export type DrawTool = "paint" | "erase";

const MAX_PARTS = 1024;
const MAX_REGIONS_PER_KIND = 64;
const MAX_SOURCE_PIXELS = 15 * DRAW_SIZE * DRAW_SIZE;
const keyOf = (point: Point) => point.y * DRAW_SIZE + point.x;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const comparePixels = (a: Pixel, b: Pixel) => a.y - b.y || a.x - b.x;
const neighbors = [-1, 0, 1].flatMap((y) =>
  [-1, 0, 1].filter((x) => x !== 0 || y !== 0).map((x) => ({ x, y })),
);

// Every allowed edge descends this semantic graph, so inference cannot form a cycle.
const PARENTS: Record<PartKind, readonly PartKind[]> = {
  body: [],
  egg: [],
  head: ["body", "egg"],
  arm: ["body", "head", "egg"],
  leg: ["body", "head", "egg"],
  tail: ["body", "head", "egg"],
  wing: ["body", "head", "egg"],
  hand: ["arm"],
  foot: ["leg"],
  eye: ["head", "body", "egg"],
  mouth: ["head", "body", "egg"],
  ear: ["head", "body", "egg"],
  horn: ["head", "body", "egg"],
  decoration: ["body", "head", "egg"],
  hair: ["head", "body", "egg"],
};

/** Canonicalize existing parts without splitting starter shapes or changing their IDs. */
function canonicalParts(parts: PetPart[]): PetPart[] {
  if (
    parts.length > MAX_PARTS ||
    parts.reduce((sum, part) => sum + part.pixels.length, 0) > MAX_SOURCE_PIXELS
  )
    throw new Error("This drawing exceeds the source-pixel budget.");
  const used = new Set<string>();
  return parts.flatMap((part) => {
    if (!PART_KINDS.includes(part.kind))
      throw new Error("This drawing contains an unsupported anatomy type.");
    if (!part.id || used.has(part.id))
      throw new Error(
        "This drawing contains a missing or duplicate anatomy identity.",
      );
    used.add(part.id);
    const position = {
      x: Number.isFinite(part.position?.x) ? Math.round(part.position.x) : 0,
      y: Number.isFinite(part.position?.y) ? Math.round(part.position.y) : 0,
    };
    const pixels = new Map<number, Pixel>();
    for (const pixel of part.pixels) {
      const x = pixel.x + position.x;
      const y = pixel.y + position.y;
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= DRAW_SIZE ||
        y >= DRAW_SIZE
      )
        continue;
      const next = { ...pixel, x, y, z: pixelPaintDepth(part, pixel) };
      const previous = pixels.get(keyOf(next));
      if (!previous || next.z >= previous.z!) pixels.set(keyOf(next), next);
    }
    return pixels.size
      ? [
          {
            ...part,
            pixels: [...pixels.values()].sort(comparePixels),
            position: { x: 0, y: 0 },
            parentId: null,
          },
        ]
      : [];
  });
}

function gapSquared(a: PetPart, b: PetPart): number {
  const occupied = new Set(b.pixels.map(keyOf));
  for (const pixel of a.pixels) if (occupied.has(keyOf(pixel))) return 0;
  let nearest = Infinity;
  for (const first of a.pixels) {
    for (const second of b.pixels) {
      const distance = (first.x - second.x) ** 2 + (first.y - second.y) ** 2;
      if (distance < nearest) nearest = distance;
      if (nearest === 1) return 1;
    }
  }
  return nearest;
}

/**
 * Infer logical compatible parents without requiring painted shapes to touch.
 * Detached and floating authored features remain valid anatomy for the engine.
 */
export function inferAnatomy(parts: PetPart[]): PetPart[] {
  const result = canonicalParts(parts);
  if (result.length > MAX_PARTS)
    throw new Error("This drawing exceeds the source-region budget.");
  for (const part of result) {
    const allowed = PARENTS[part.kind];
    let best: PetPart | undefined;
    let distance = Infinity;
    for (const candidate of result) {
      const priority = allowed.indexOf(candidate.kind);
      if (candidate.id === part.id || priority < 0) continue;
      const candidateDistance = gapSquared(part, candidate);
      if (
        candidateDistance < distance ||
        (candidateDistance === distance &&
          (!best ||
            priority < allowed.indexOf(best.kind) ||
            (priority === allowed.indexOf(best.kind) &&
              compareText(candidate.id, best.id) < 0)))
      ) {
        best = candidate;
        distance = candidateDistance;
      }
    }
    part.parentId = best?.id ?? null;
  }
  return result;
}

/** Fill bounded gaps in pointer samples; repeated visits affect a cell only once. */
function strokeCells(points: Point[]): Point[] {
  const cells = new Map<number, Point>();
  let previous: Point | null = null;
  for (const sample of points) {
    if (
      !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.y) ||
      sample.x < 0 ||
      sample.y < 0 ||
      sample.x >= DRAW_SIZE ||
      sample.y >= DRAW_SIZE
    ) {
      previous = null;
      continue;
    }
    const point = { x: Math.floor(sample.x), y: Math.floor(sample.y) };
    let x = previous?.x ?? point.x;
    let y = previous?.y ?? point.y;
    const dx = Math.abs(point.x - x);
    const dy = -Math.abs(point.y - y);
    const sx = x < point.x ? 1 : -1;
    const sy = y < point.y ? 1 : -1;
    let error = dx + dy;
    while (true) {
      cells.set(y * DRAW_SIZE + x, { x, y });
      if (x === point.x && y === point.y) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
    previous = point;
  }
  return [...cells.values()];
}

type Region = {
  kind: PartKind;
  pixels: Pixel[];
  positions: Set<number>;
  source?: PetPart;
};

function splitRegions(parts: PetPart[]): Region[] {
  const result: Region[] = [];
  for (const kind of PART_KINDS) {
    const firstRegion = result.length;
    const mask = new Map<number, Pixel>();
    // Sorting makes an equal-depth tie independent of the editor array order.
    for (const part of parts
      .filter((candidate) => candidate.kind === kind)
      .sort((a, b) => compareText(a.id, b.id))) {
      for (const pixel of part.pixels) {
        const previous = mask.get(keyOf(pixel));
        if (!previous || pixelPaintDepth(part, pixel) >= previous.z!)
          mask.set(keyOf(pixel), { ...pixel });
      }
    }
    const remaining = new Set([...mask.keys()].sort((a, b) => a - b));
    while (remaining.size) {
      const queue = [remaining.values().next().value!];
      remaining.delete(queue[0]);
      const positions = new Set<number>();
      const pixels: Pixel[] = [];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const key = queue[cursor];
        const pixel = mask.get(key)!;
        positions.add(key);
        pixels.push({ ...pixel });
        for (const delta of neighbors) {
          const x = pixel.x + delta.x;
          const y = pixel.y + delta.y;
          if (x < 0 || y < 0 || x >= DRAW_SIZE || y >= DRAW_SIZE) continue;
          const neighbor = y * DRAW_SIZE + x;
          if (remaining.delete(neighbor)) queue.push(neighbor);
        }
      }
      result.push({ kind, pixels: pixels.sort(comparePixels), positions });
    }
    // Sparse marks are valid art. Group a highly fragmented typed mask instead
    // of refusing a stroke or discarding any covered or visible source cells.
    if (result.length - firstRegion > MAX_REGIONS_PER_KIND) {
      const pixels = [...mask.values()].sort(comparePixels);
      result.splice(firstRegion, result.length - firstRegion, {
        kind,
        pixels,
        positions: new Set(mask.keys()),
      });
    }
  }
  return result;
}

function identifyRegions(regions: Region[], previous: PetPart[]): PetPart[] {
  const matches: {
    region: Region;
    source: PetPart;
    overlap: number;
    first: number;
  }[] = [];
  for (const region of regions) {
    for (const source of previous) {
      if (source.kind !== region.kind) continue;
      const overlap = source.pixels.reduce(
        (sum, pixel) => sum + Number(region.positions.has(keyOf(pixel))),
        0,
      );
      if (overlap)
        matches.push({
          region,
          source,
          overlap,
          first: keyOf(region.pixels[0]),
        });
    }
  }
  matches.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      compareText(a.source.id, b.source.id) ||
      a.first - b.first,
  );
  const used = new Set<string>();
  for (const match of matches) {
    if (!match.region.source && !used.has(match.source.id)) {
      match.region.source = match.source;
      used.add(match.source.id);
    }
  }
  return regions.map((region) => {
    let ordinal = 1;
    while (used.has(`${region.kind}-${ordinal}`)) ordinal += 1;
    const id = region.source?.id ?? `${region.kind}-${ordinal}`;
    used.add(id);
    return {
      ...(region.source ?? {}),
      id,
      kind: region.kind,
      name: region.source?.name ?? `${PART_LABELS[region.kind]} ${ordinal}`,
      pixels: region.pixels,
      position: { x: 0, y: 0 },
      parentId: null,
    };
  });
}

/**
 * Paint on one shared canvas. The type selector labels the new pixels; it never
 * moves the drawing. Separate same-type shapes become hidden anatomical parts.
 * Erase removes the visible pixel once per stroke and reveals any shape below.
 */
export function paintStroke(
  parts: PetPart[],
  kind: PartKind,
  color: string,
  points: Point[],
  tool: DrawTool = "paint",
  options: { mirror?: boolean } = {},
): PetPart[] {
  // Reflect the rasterized cells, never the pointer samples. Interleaving a
  // sample and its reflection before interpolation would paint across the gap.
  const sampled = strokeCells(points);
  const unique = new Map(sampled.map((cell) => [keyOf(cell), cell]));
  if (options.mirror) {
    for (const cell of sampled) {
      const reflected = { x: DRAW_SIZE - 1 - cell.x, y: cell.y };
      unique.set(keyOf(reflected), reflected);
    }
  }
  const cells = [...unique.values()];
  if (!cells.length) return parts;
  if (!PART_KINDS.includes(kind))
    throw new Error("Choose a supported anatomy type.");
  if (tool !== "paint" && tool !== "erase")
    throw new Error("Choose the paint brush or eraser.");
  if (tool === "paint" && !/^#[0-9a-f]{6}$/i.test(color))
    throw new Error("Choose a six-digit hex brush color.");
  const previous = canonicalParts(parts);
  const next = previous.map((part) => ({
    ...part,
    pixels: part.pixels.map((pixel) => ({ ...pixel })),
  }));
  const positions = new Set(cells.map(keyOf));
  let changed = false;
  if (tool === "erase") {
    const visible = new Map<
      number,
      { part: PetPart; pixel: Pixel; depth: number }
    >();
    for (const part of [...next].sort(compareAnatomyLayer)) {
      for (const pixel of part.pixels) {
        const key = keyOf(pixel);
        if (!positions.has(key)) continue;
        const depth = pixelPaintDepth(part, pixel);
        if (!visible.has(key) || depth >= visible.get(key)!.depth)
          visible.set(key, { part, pixel, depth });
      }
    }
    for (const part of next) {
      part.pixels = part.pixels.filter(
        (pixel) => visible.get(keyOf(pixel))?.pixel !== pixel,
      );
    }
    changed = visible.size > 0;
  } else {
    let depth = 9000;
    for (const part of previous)
      for (const pixel of part.pixels)
        depth = Math.max(depth, pixelPaintDepth(part, pixel));
    if (!Number.isSafeInteger(depth) || depth >= 1_000_000_000)
      throw new Error("This drawing has reached its paint history limit.");
    depth += 1;
    // Replace that type's pixel only; all other anatomical masks remain intact.
    for (const part of next)
      if (part.kind === kind)
        part.pixels = part.pixels.filter(
          (pixel) => !positions.has(keyOf(pixel)),
        );
    const holder = next.find((part) => part.kind === kind);
    const pixels = cells.map((point) => ({ ...point, color, z: depth }));
    if (holder) holder.pixels.push(...pixels);
    else {
      let ordinal = 1;
      while (next.some((part) => part.id === `${kind}-${ordinal}`))
        ordinal += 1;
      next.push({
        id: `${kind}-${ordinal}`,
        kind,
        name: PART_LABELS[kind],
        pixels,
        position: { x: 0, y: 0 },
        parentId: null,
      });
    }
    changed = true;
  }
  if (!changed) return parts;
  const regions = splitRegions(next);
  if (regions.length > MAX_PARTS)
    throw new Error("This drawing exceeds the source-region budget.");
  return inferAnatomy(identifyRegions(regions, previous));
}

export function drawingPixels(parts: PetPart[]): Pixel[] {
  return flattenAnatomy(parts);
}
