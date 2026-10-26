import type { SourceAtlas } from "../simulation/source-atlas";

/** Label-free, color-free signature of the exact authored ink union. */
export type InkSignature = Readonly<{
  version: "ink-signature-v1";
  occupiedCells: number;
  connectedComponents: number;
  bounds: Readonly<{ width: number; height: number }>;
  verticalSymmetry: number;
  horizontalSymmetry: number;
  holes: number;
}>;

const key = (x: number, y: number) => x + "," + y;
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** A geometric observation, NOT a biological identification or plant/animal classifier. */
export function inferInkSignature(atlas: SourceAtlas): InkSignature {
  const cells = new Set<string>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const patch of atlas.patches)
    for (const pixel of patch.source.cells) {
      cells.add(key(pixel.x, pixel.y));
      minX = Math.min(minX, pixel.x); maxX = Math.max(maxX, pixel.x);
      minY = Math.min(minY, pixel.y); maxY = Math.max(maxY, pixel.y);
    }
  if (!cells.size) return {
    version:"ink-signature-v1", occupiedCells:0, connectedComponents:0,
    bounds:{width:0,height:0}, verticalSymmetry:0, horizontalSymmetry:0, holes:0,
  };

  const seen = new Set<string>();
  let connectedComponents = 0;
  for (const cell of cells) {
    if (seen.has(cell)) continue;
    connectedComponents++;
    const queue = [cell];
    seen.add(cell);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i].split(",").map(Number);
      for (const [dx, dy] of directions) {
        const next = key(x + dx, y + dy);
        if (cells.has(next) && !seen.has(next)) {
          seen.add(next); queue.push(next);
        }
      }
    }
  }

  // Flood only the finite bounding rectangle; empty pockets not connected
  // to its padded exterior are actual authored voids.
  const emptySeen = new Set<string>();
  let holes = 0;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const start = key(x, y);
      if (cells.has(start) || emptySeen.has(start)) continue;
      const queue = [[x, y]];
      emptySeen.add(start);
      let reachesBorder = false;
      for (let i = 0; i < queue.length; i++) {
        const [qx, qy] = queue[i];
        if (qx === minX || qx === maxX || qy === minY || qy === maxY)
          reachesBorder = true;
        for (const [dx, dy] of directions) {
          const nx = qx + dx, ny = qy + dy, next = key(nx, ny);
          if (nx < minX || nx > maxX || ny < minY || ny > maxY ||
              cells.has(next) || emptySeen.has(next)) continue;
          emptySeen.add(next);
          queue.push([nx, ny]);
        }
      }
      if (!reachesBorder) holes++;
    }
  let verticalMatches = 0, horizontalMatches = 0;
  for (const cell of cells) {
    const [x, y] = cell.split(",").map(Number);
    if (cells.has(key(minX + maxX - x, y))) verticalMatches++;
    if (cells.has(key(x, minY + maxY - y))) horizontalMatches++;
  }
  return {
    version:"ink-signature-v1", occupiedCells:cells.size, connectedComponents,
    bounds:{width:maxX-minX+1,height:maxY-minY+1},
    verticalSymmetry:verticalMatches / cells.size,
    horizontalSymmetry:horizontalMatches / cells.size,
    holes,
  };
}


/**
 * Geometry-only measurements over the union of drawn pixels. Numbers describe
 * visible 2-D marks, not true biological organs or phylogenetic membership.
 * Never consult SourcePatch.kind, parentId, colour, drawing order, or seed.
 */
export type InkMorphology = Readonly<{
  version: "ink-morphology-v1";
  signature: InkSignature;
  occupiedFraction: number;
  elongation: number;
  bilateralSymmetry: number;
  radialOrganization: number;
  branchJunctions: number;
  branchEndpoints: number;
  repeatedAppendages: number;
  attachedFraction: number;
  detachedComponents: number;
  cavityCount: number;
  /** Lower values indicate less drawn material to support an interpretation. */
  observationStrength: number;
}>;

const neighbors8 = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
] as const;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function silhouette(atlas: SourceAtlas) {
  const pixels = new Set<string>();
  let minX = Infinity, minY = Infinity;
  for (const patch of atlas.patches)
    for (const p of patch.source.cells) {
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) continue;
      pixels.add(key(p.x, p.y));
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
  const relative = new Set<string>();
  if (pixels.size)
    for (const item of pixels) {
      const [x, y] = item.split(",").map(Number);
      relative.add(key(x - minX, y - minY));
    }
  return relative;
}

/** Zhang–Suen thinning: inexpensive, deterministic, and coordinate-independent. */
function skeletonize(cells: ReadonlySet<string>, width: number, height: number) {
  const thin = new Set(cells);
  for (let iteration = 0; iteration < width * height; iteration++) {
    let removed = false;
    for (let pass = 0; pass < 2; pass++) {
      const deletions: string[] = [];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (!thin.has(key(x, y))) continue;
          const n = neighbors8.map(([dx, dy]) => Number(thin.has(key(x + dx, y + dy))));
          const count = n.reduce((sum, value) => sum + value, 0);
          if (count < 2 || count > 6) continue;
          const changes = n.filter((v, i) => v === 0 && n[(i + 1) % 8] === 1).length;
          if (changes !== 1) continue;
          const [north, , east, , south, , west] = n;
          const gateA = pass === 0
            ? north * east * south === 0
            : north * east * west === 0;
          const gateB = pass === 0
            ? east * south * west === 0
            : north * south * west === 0;
          if (gateA && gateB) deletions.push(key(x, y));
        }
      for (const item of deletions) thin.delete(item);
      removed ||= deletions.length > 0;
    }
    if (!removed) break;
  }
  return thin;
}

function crossingCount(cells: ReadonlySet<string>, x: number, y: number) {
  const n = neighbors8.map(([dx, dy]) => Number(cells.has(key(x + dx, y + dy))));
  return n.filter((v, i) => v === 0 && n[(i + 1) % 8] === 1).length;
}

function componentSizes(cells: ReadonlySet<string>, offsets: readonly (readonly [number, number])[]) {
  const unvisited = new Set(cells);
  const sizes: number[] = [];
  for (const first of unvisited) {
    if (!unvisited.has(first)) continue;
    unvisited.delete(first);
    const queue = [first];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i].split(",").map(Number);
      for (const [dx, dy] of offsets) {
        const candidate = key(x + dx, y + dy);
        if (unvisited.delete(candidate)) queue.push(candidate);
      }
    }
    sizes.push(queue.length);
  }
  return sizes;
}

function distanceToJunction(
  skeleton: ReadonlySet<string>, start: string, junctions: ReadonlySet<string>,
): number {
  if (!junctions.size) return Infinity;
  const visited = new Set([start]);
  const queue: { item: string; distance: number }[] = [{ item: start, distance: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const { item, distance } = queue[i];
    if (junctions.has(item)) return distance;
    const [x, y] = item.split(",").map(Number);
    for (const [dx, dy] of neighbors8) {
      const next = key(x + dx, y + dy);
      if (skeleton.has(next) && !visited.has(next)) {
        visited.add(next);
        queue.push({ item: next, distance: distance + 1 });
      }
    }
  }
  return Infinity;
}

export function inferInkMorphology(atlas: SourceAtlas): InkMorphology {
  const signature = inferInkSignature(atlas);
  const width = signature.bounds.width, height = signature.bounds.height;
  if (!signature.occupiedCells)
    return {
      version: "ink-morphology-v1", signature,
      occupiedFraction: 0, elongation: 0, bilateralSymmetry: 0,
      radialOrganization: 0, branchJunctions: 0, branchEndpoints: 0,
      repeatedAppendages: 0, attachedFraction: 0,
      detachedComponents: 0, cavityCount: 0, observationStrength: 0,
    };
  const cells = silhouette(atlas);
  const skeleton = skeletonize(cells, width, height);
  const junctionPixels = new Set<string>(), endpoints: string[] = [];
  for (const item of skeleton) {
    const [x, y] = item.split(",").map(Number);
    const crossing = crossingCount(skeleton, x, y);
    if (crossing >= 3) junctionPixels.add(item);
    else if (crossing === 1) endpoints.push(item);
  }
  const junctions = componentSizes(junctionPixels, neighbors8).length;
  const arms = junctions
    ? endpoints.filter((point) => distanceToJunction(skeleton, point, junctionPixels) >= 2).length
    : 0;
  let halfTurn = 0, quarterTurn = 0;
  for (const item of cells) {
    const [x, y] = item.split(",").map(Number);
    if (cells.has(key(width - 1 - x, height - 1 - y))) halfTurn++;
    if (width === height && cells.has(key(height - 1 - y, x))) quarterTurn++;
  }
  const sizes = componentSizes(cells, directions);
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return {
    version: "ink-morphology-v1", signature,
    occupiedFraction: signature.occupiedCells / (width * height),
    elongation: clamp01((ratio - 1) / 2.5),
    bilateralSymmetry: Math.max(signature.verticalSymmetry, signature.horizontalSymmetry),
    radialOrganization: clamp01(
      (width === height ? 0.75 * quarterTurn / cells.size : 0) +
      0.25 * halfTurn / cells.size,
    ),
    branchJunctions: junctions,
    branchEndpoints: endpoints.length,
    repeatedAppendages: arms,
    attachedFraction: Math.max(...sizes) / signature.occupiedCells,
    detachedComponents: Math.max(0, signature.connectedComponents - 1),
    cavityCount: signature.holes,
    observationStrength: clamp01(signature.occupiedCells / 24),
  };
}
