import type { Pixel } from "./model";
import type { Tissue } from "./material";

type BandCell = { pixel: Pixel; distance: number };
const fields = new WeakMap<Tissue, Map<number, BandCell[]>>();
const cavityFields = new WeakMap<Tissue, Set<string>>();
const key = (x: number, y: number) => `${x},${y}`;

/**
 * An outward signed-distance band in original material coordinates. Cavities
 * are excluded by an exterior flood, and a watershed preserves the negative
 * space between disconnected authored islands. Added tissue inherits the
 * nearest source pigment; it never replaces the authored mask with a primitive.
 */
export function grownMaterialCells(
  tissue: Tissue,
  radius: number,
  maximum = 8,
  cavitySource?: Tissue,
): Pixel[] {
  const limit = Number.isFinite(maximum)
    ? Math.max(0, Math.min(8, maximum))
    : 8;
  const amount = Number.isFinite(radius)
    ? Math.max(0, Math.min(limit, radius))
    : 0;
  if (!amount || !tissue.cells.length) return tissue.cells;
  const pad = Math.ceil(limit + 1);
  let cached = fields.get(tissue);
  if (!cached) fields.set(tissue, (cached = new Map()));
  let band = cached.get(pad);
  if (!band) {
    band = buildBand(tissue.cells, pad);
    cached.set(pad, band);
  }
  const protectedCavities = cavitySource ? cavities(cavitySource) : undefined;
  return [
    ...band
      .filter(
        (p) =>
          p.distance <= amount + 1e-9 &&
          !protectedCavities?.has(key(p.pixel.x, p.pixel.y)),
      )
      .map((p) => p.pixel),
    ...tissue.cells,
  ];
}

function cavities(tissue: Tissue): Set<string> {
  const hit = cavityFields.get(tissue);
  if (hit) return hit;
  const occupied = new Set(tissue.cells.map((p) => key(p.x, p.y)));
  const result = new Set<string>();
  if (!tissue.cells.length) return result;
  const minX = Math.min(...tissue.cells.map((p) => p.x)) - 1,
    maxX = Math.max(...tissue.cells.map((p) => p.x)) + 1,
    minY = Math.min(...tissue.cells.map((p) => p.y)) - 1,
    maxY = Math.max(...tissue.cells.map((p) => p.y)) + 1;
  const exterior = new Set([key(minX, minY)]),
    queue = [{ x: minX, y: minY }];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        y = p.y + dy,
        k = key(x, y);
      if (
        x < minX ||
        x > maxX ||
        y < minY ||
        y > maxY ||
        occupied.has(k) ||
        exterior.has(k)
      )
        continue;
      exterior.add(k);
      queue.push({ x, y });
    }
  }
  for (let y = minY + 1; y < maxY; y++)
    for (let x = minX + 1; x < maxX; x++)
      if (!occupied.has(key(x, y)) && !exterior.has(key(x, y)))
        result.add(key(x, y));
  cavityFields.set(tissue, result);
  return result;
}

function buildBand(source: Pixel[], pad: number): BandCell[] {
  const pixels = [...source].sort((a, b) => a.y - b.y || a.x - b.x);
  const occupied = new Map(pixels.map((p) => [key(p.x, p.y), p]));
  const labels = new Map<string, number>();
  let component = 0;
  for (const pixel of pixels) {
    if (labels.has(key(pixel.x, pixel.y))) continue;
    const queue = [pixel];
    labels.set(key(pixel.x, pixel.y), component);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = key(p.x + dx, p.y + dy),
            next = occupied.get(k);
          if (next && !labels.has(k)) {
            labels.set(k, component);
            queue.push(next);
          }
        }
    }
    component++;
  }
  const minX = Math.min(...pixels.map((p) => p.x)) - pad,
    minY = Math.min(...pixels.map((p) => p.y)) - pad,
    maxX = Math.max(...pixels.map((p) => p.x)) + pad,
    maxY = Math.max(...pixels.map((p) => p.y)) + pad;
  const exterior = new Set<string>([key(minX, minY)]),
    queue = [{ x: minX, y: minY }];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const x = p.x + dx,
        y = p.y + dy,
        k = key(x, y);
      if (
        x < minX ||
        y < minY ||
        x > maxX ||
        y > maxY ||
        occupied.has(k) ||
        exterior.has(k)
      )
        continue;
      exterior.add(k);
      queue.push({ x, y });
    }
  }
  type Candidate = {
    x: number;
    y: number;
    nearest: Map<number, { d: number; p: Pixel }>;
  };
  const candidates = new Map<string, Candidate>();
  for (const p of pixels) {
    const label = labels.get(key(p.x, p.y))!;
    for (let dy = -pad; dy <= pad; dy++)
      for (let dx = -pad; dx <= pad; dx++) {
        const x = p.x + dx,
          y = p.y + dy,
          k = key(x, y);
        if (!exterior.has(k)) continue;
        const d = Math.hypot(
          Math.max(0, Math.abs(dx) - 0.5),
          Math.max(0, Math.abs(dy) - 0.5),
        );
        if (d > pad - 1) continue;
        let candidate = candidates.get(k);
        if (!candidate)
          candidates.set(k, (candidate = { x, y, nearest: new Map() }));
        const old = candidate.nearest.get(label);
        if (!old || d < old.d) candidate.nearest.set(label, { d, p });
      }
  }
  const result: BandCell[] = [];
  for (const candidate of candidates.values()) {
    const nearest = [...candidate.nearest.values()].sort(
      (a, b) => a.d - b.d || a.p.y - b.p.y || a.p.x - b.p.x,
    );
    // One-pixel watershed keeps separate fantasy parts separate. Explicit
    // fusion operations may create their own material instead of this band.
    if (nearest[1] && nearest[1].d - nearest[0].d < 1.01) continue;
    result.push({
      pixel: { ...nearest[0].p, x: candidate.x, y: candidate.y },
      distance: nearest[0].d,
    });
  }
  return result.sort((a, b) => a.pixel.y - b.pixel.y || a.pixel.x - b.pixel.x);
}
