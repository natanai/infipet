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
