import type { PetFrame, PetPart, Pixel } from "../../src/simulation";
import { describeFrame } from "../audit/metrics";
import { digest } from "./protocol";

const excluded = new Set([
  "eye",
  "mouth",
  "ear",
  "tail",
  "hair",
  "horn",
  "arm",
  "hand",
  "leg",
  "foot",
  "wing",
  "decoration",
]);
const enclosures = new Set([
  "enclosure",
  "covering",
  "carapace",
  "mantle",
  "cocoon",
  "shell",
]);
export function isCorePart(part: { kind: string; role?: string }) {
  return (
    !excluded.has(part.kind) &&
    (["body", "head"].includes(part.kind) || enclosures.has(part.role ?? ""))
  );
}
/** White means occupied core material, not white authored pigment. No filling, smoothing or hull. */
export function coreOccupancy(
  parts: readonly { kind: string; role?: string; pixels: readonly Pixel[] }[],
): Pixel[] {
  const cells = new Map<string, Pixel>();
  for (const part of parts.filter(isCorePart))
    for (const p of part.pixels) {
      if (
        Number.isInteger(p.x) &&
        Number.isInteger(p.y) &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < 64 &&
        p.y < 64
      )
        cells.set(`${p.x},${p.y}`, { x: p.x, y: p.y, color: "#FFFFFF" });
    }
  return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
export const coreHash = (pixels: readonly Pixel[]) =>
  digest(pixels.map((p) => [p.x, p.y]));
export const coreDiagnosticId = (viewId: string) => `${viewId}__core`;
export const regionalDiagnosticId = (viewId: string) => `${viewId}__regions`;
export function regionalMasks(parts: Parameters<typeof coreOccupancy>[0]) {
  const pixels = coreOccupancy(parts);
  const categories = {
    head: new Set<string>(),
    trunk: new Set<string>(),
    enclosure: new Set<string>(),
  };
  for (const part of parts.filter(isCorePart))
    for (const p of part.pixels) {
      if (
        !Number.isInteger(p.x) ||
        !Number.isInteger(p.y) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x >= 64 ||
        p.y >= 64
      )
        continue;
      const category = enclosures.has(part.role ?? "")
        ? "enclosure"
        : part.kind === "head"
          ? "head"
          : "trunk";
      categories[category].add(`${p.x},${p.y}`);
    }
  const regionalPixels = pixels.map((p) => {
    const key = `${p.x},${p.y}`;
    return {
      ...p,
      color: categories.enclosure.has(key)
        ? "#C5A5FF"
        : categories.head.has(key) && categories.trunk.has(key)
          ? "#FFE08A"
          : categories.head.has(key)
            ? "#99DDFF"
            : "#FFFFFF",
    };
  });
  const size = pixels.length || 1;
  return {
    corePixels: pixels,
    regionalPixels,
    regionalHash: digest(regionalPixels.map((p) => [p.x, p.y, p.color])),
    regionalOccupancy: {
      coreUnion: pixels.length,
      head: categories.head.size,
      trunk: categories.trunk.size,
      enclosure: categories.enclosure.size,
      headTrunkOverlap: [...categories.head].filter((k) =>
        categories.trunk.has(k),
      ).length,
      headFraction: categories.head.size / size,
      trunkFraction: categories.trunk.size / size,
      enclosureFraction: categories.enclosure.size / size,
      headToTrunk: categories.trunk.size
        ? categories.head.size / categories.trunk.size
        : null,
      unit: "projected occupied pixels, not physical mass" as const,
    },
  };
}
export function describeCore(frame: PetFrame) {
  const region = regionalMasks(frame.parts),
    pixels = region.corePixels;
  return {
    pixels,
    hash: coreHash(pixels),
    descriptor: describeFrame({
      ...frame,
      pixels,
      parts: frame.parts.filter(isCorePart),
      cellCount: pixels.length,
    }),
    regionalPixels: region.regionalPixels,
    regionalHash: region.regionalHash,
    regionalOccupancy: region.regionalOccupancy,
  };
}
export function authoredCore(parts: readonly PetPart[]): Pixel[] {
  return coreOccupancy(
    parts.map((p) => ({
      ...p,
      pixels: p.pixels.map((c) => ({
        ...c,
        x: c.x + p.position.x + 16,
        y: c.y + p.position.y + 16,
      })),
    })),
  );
}
export function authoredRegions(parts: readonly PetPart[]): Pixel[] {
  return regionalMasks(
    parts.map((p) => ({
      ...p,
      pixels: p.pixels.map((c) => ({
        ...c,
        x: c.x + p.position.x + 16,
        y: c.y + p.position.y + 16,
      })),
    })),
  ).regionalPixels;
}
