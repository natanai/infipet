import type { Pixel, Point } from "./model";

export type MaterialCellQuad = { cell: Pixel; quad: Point[]; center: Point };
export const cellCorners = (cell: Point): Point[] => [
  { x: cell.x - 0.5, y: cell.y - 0.5 },
  { x: cell.x + 0.5, y: cell.y - 0.5 },
  { x: cell.x + 0.5, y: cell.y + 0.5 },
  { x: cell.x - 0.5, y: cell.y + 0.5 },
];

/** Transport occupied pixel areas, rather than sparse rounded center samples. */
export function rasterCellQuads(
  material: readonly MaterialCellQuad[],
  transport?: (point: Point) => Point,
): Pixel[] {
  const cells = new Map<string, Pixel>();
  const cross = (a: Point, b: Point, p: Point) =>
    (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const inTriangle = (a: Point, b: Point, c: Point, p: Point) => {
    if (Math.abs(cross(a, b, c)) < 1e-9) return false;
    const sides = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
    return sides.every((s) => s >= -1e-7) || sides.every((s) => s <= 1e-7);
  };
  for (const materialCell of material) {
    const { cell } = materialCell,
      quad = transport ? materialCell.quad.map(transport) : materialCell.quad;
    if (quad.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
      continue;
    const minX = Math.max(
        -256,
        Math.ceil(Math.min(...quad.map((p) => p.x)) - 1e-8),
      ),
      maxX = Math.min(
        256,
        Math.floor(Math.max(...quad.map((p) => p.x)) + 1e-8),
      ),
      minY = Math.max(
        -256,
        Math.ceil(Math.min(...quad.map((p) => p.y)) - 1e-8),
      ),
      maxY = Math.min(
        256,
        Math.floor(Math.max(...quad.map((p) => p.y)) + 1e-8),
      );
    let filled = false;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const p = { x, y };
        if (
          inTriangle(quad[0], quad[1], quad[2], p) ||
          inTriangle(quad[0], quad[2], quad[3], p)
        ) {
          cells.set(`${x},${y}`, { ...cell, x, y });
          filled = true;
        }
      }
    if (!filled) {
      const p = transport
          ? transport(materialCell.center)
          : materialCell.center,
        x = Math.round(p.x),
        y = Math.round(p.y);
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Math.abs(x) <= 256 &&
        Math.abs(y) <= 256
      )
        cells.set(`${x},${y}`, { ...cell, x, y });
    }
  }
  return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
