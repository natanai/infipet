import {
  clamp,
  compareText,
  flattenAnatomy,
  hash,
  normalizeAnatomy,
  rng,
  type Pixel,
  type Point,
  type PetPart,
  type PartKind,
  type Relationship,
  type Provenance,
} from "./model";
const TAU = Math.PI * 2;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const copyP = (p: Point): Point => ({ x: p.x, y: p.y });
const key = (p: Point) => p.y * 64 + p.x;
const featureKinds = new Set<PartKind>([
  "eye",
  "mouth",
  "hair",
  "ear",
  "horn",
  "decoration",
]);
const bulkKinds = new Set<PartKind>(["body", "head", "egg"]);
type Bounds = { x: number; y: number; width: number; height: number };
export type Tissue = {
  id: string;
  kind: PartKind;
  name: string;
  part: PetPart;
  cells: Pixel[];
  center: Point;
  pivot: Point;
  tip: Point;
  bounds: Bounds;
  parentId: string | null;
  carrierPoint?: Point;
  carrierOffset?: Point;
  sourcePartId?: string;
  provenance: Provenance;
  relationship: Relationship;
  bulk: boolean;
};
export function bounds(pixels: Point[]): Bounds {
  if (!pixels.length) return { x: 0, y: 0, width: 0, height: 0 };
  let x = Infinity,
    y = Infinity,
    mx = -Infinity,
    my = -Infinity;
  for (const p of pixels) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
    mx = Math.max(mx, p.x);
    my = Math.max(my, p.y);
  }
  return { x, y, width: mx - x + 1, height: my - y + 1 };
}
export function center(pixels: Point[]): Point {
  if (!pixels.length) return { x: 31.5, y: 31.5 };
  return {
    x: pixels.reduce((s, p) => s + p.x, 0) / pixels.length,
    y: pixels.reduce((s, p) => s + p.y, 0) / pixels.length,
  };
}
export function canonical(parts: PetPart[]): string {
  return JSON.stringify(
    [...parts]
      .sort((a, b) => compareText(a.id, b.id))
      .map((p) => [
        p.id,
        p.kind,
        p.parentId,
        p.position.x,
        p.position.y,
        p.layer ?? null,
        p.pixels.map((c) => [c.x, c.y, c.color, c.z ?? null]),
      ]),
  );
}
const occupiedCache = new WeakMap<Tissue, Map<number, Pixel>>();
function nearest(
  a: Tissue,
  b: Tissue,
): { gap: number; point: Point; parentPoint: Point } {
  let best = Infinity,
    gap = Infinity,
    pointValue = copyP(a.center),
    parentPoint = copyP(b.center);
  let occupied = occupiedCache.get(b);
  if (!occupied) {
    occupied = new Map(b.cells.map((p) => [key(p), p]));
    occupiedCache.set(b, occupied);
  }
  // An overlap is necessarily the minimum distance. This avoids an O(n*m)
  // scan for enclosed painted masks, including a fully painted 15-layer canvas.
  let overlap: Pixel | undefined,
    overlapScore = Infinity;
  for (const p of a.cells) {
    if (!occupied.has(key(p))) continue;
    const score = (p.x - a.center.x) ** 2 + (p.y - a.center.y) ** 2;
    if (score < overlapScore) {
      overlapScore = score;
      overlap = p;
    }
  }
  if (overlap)
    return { gap: 0, point: copyP(overlap), parentPoint: copyP(overlap) };
  for (const p of a.cells) {
    const bias = dist(p, a.center) * 0.00001;
    for (const q of b.cells) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      const score = d + bias;
      if (score < best) {
        best = score;
        gap = Math.sqrt(d);
        pointValue = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        parentPoint = copyP(q);
      }
    }
  }
  return { gap, point: pointValue, parentPoint };
}
function enclosingMask(t: Tissue): Set<number> {
  const occupied = new Set(t.cells.map(key)),
    outside = new Set<number>(),
    queue: number[] = [];
  for (let x = 0; x < 64; x++)
    for (const y of [0, 63]) {
      const k = y * 64 + x;
      if (!occupied.has(k) && !outside.has(k)) {
        outside.add(k);
        queue.push(k);
      }
    }
  for (let y = 1; y < 63; y++)
    for (const x of [0, 63]) {
      const k = y * 64 + x;
      if (!occupied.has(k) && !outside.has(k)) {
        outside.add(k);
        queue.push(k);
      }
    }
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i],
      x = k % 64,
      y = Math.floor(k / 64);
    for (const n of [
      x > 0 ? k - 1 : -1,
      x < 63 ? k + 1 : -1,
      y > 0 ? k - 64 : -1,
      y < 63 ? k + 64 : -1,
    ])
      if (n >= 0 && !occupied.has(n) && !outside.has(n)) {
        outside.add(n);
        queue.push(n);
      }
  }
  const result = new Set<number>();
  for (let k = 0; k < 4096; k++) if (!outside.has(k)) result.add(k);
  return result;
}
export function compileSources(
  parts: PetPart[],
  fingerprint: number,
  provenance: Provenance = "authored",
): Tissue[] {
  const tissues: Tissue[] = parts.map((p) => {
    const cells = p.pixels.map((c) => ({
        ...c,
        x: c.x + p.position.x + 16,
        y: c.y + p.position.y + 16,
      })),
      c = center(cells);
    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      part: p,
      cells,
      center: c,
      pivot: copyP(c),
      tip: copyP(c),
      bounds: bounds(cells),
      parentId: p.parentId,
      sourcePartId: p.id,
      provenance,
      relationship: "root",
      bulk: bulkKinds.has(p.kind),
    };
  });
  const byId = new Map(tissues.map((t) => [t.id, t])),
    cores = tissues.filter((t) => t.bulk && t.cells.length),
    envelopes = new Map<string, Set<number>>();
  const main = [...tissues].sort(
    (a, b) => b.cells.length - a.cells.length || compareText(a.id, b.id),
  )[0];
  if (!cores.length && main) {
    main.bulk = !featureKinds.has(main.kind);
    if (main.bulk) cores.push(main);
  }
  for (const t of tissues) {
    let parent = t.parentId ? byId.get(t.parentId) : undefined;
    if (!parent && t.kind !== "body" && t.kind !== "egg" && t.cells.length) {
      const arms = tissues.filter((p) => p.kind === "arm"),
        legs = tissues.filter((p) => p.kind === "leg");
      const allowed =
        t.kind === "hand"
          ? arms.length
            ? arms
            : cores
          : t.kind === "foot"
            ? legs.length
              ? legs
              : cores
            : t.kind === "head"
              ? cores.filter((p) => p.kind === "body" || p.kind === "egg")
              : cores;
      const candidates = allowed
        .filter((p) => p.id !== t.id && p.cells.length)
        .sort(
          (a, b) =>
            dist(t.center, a.center) - dist(t.center, b.center) ||
            compareText(a.id, b.id),
        )
        .slice(0, 6);
      let best = Infinity;
      for (const p of candidates) {
        const n = nearest(t, p);
        if (n.gap < best) {
          best = n.gap;
          parent = p;
        }
      }
    }
    if (featureKinds.has(t.kind) && t.cells.length) {
      for (const head of tissues.filter(
        (h) => h.kind === "head" && h.id !== t.id && h.cells.length,
      )) {
        let mask = envelopes.get(head.id);
        if (!mask) {
          mask = enclosingMask(head);
          envelopes.set(head.id, mask);
        }
        if (t.cells.every((p) => mask!.has(key(p)))) {
          parent = head;
          break;
        }
      }
    }
    if (parent && parent.cells.length && t.cells.length) {
      const n = nearest(t, parent);
      let enclosed = false;
      if (featureKinds.has(t.kind) || t.kind === "head") {
        let mask = envelopes.get(parent.id);
        if (!mask) {
          mask = enclosingMask(parent);
          envelopes.set(parent.id, mask);
        }
        enclosed = t.cells.some((p) => mask!.has(key(p)));
      }
      t.relationship =
        enclosed || (featureKinds.has(t.kind) && n.gap <= 2.1)
          ? "surface"
          : n.gap <= 2.1
            ? "joint"
            : "floating";
      if (t.relationship === "surface") {
        t.pivot = ["hair", "ear", "horn"].includes(t.kind)
          ? n.point
          : copyP(t.center);
        t.parentId = parent.id;
      } else if (t.relationship === "joint") {
        t.pivot = n.point;
        t.parentId = parent.id;
      } else {
        t.parentId = parent.id;
        t.pivot = copyP(t.center);
        t.carrierPoint = n.parentPoint;
        t.carrierOffset = {
          x: t.center.x - n.parentPoint.x,
          y: t.center.y - n.parentPoint.y,
        };
      }
    } else {
      t.parentId = null;
      t.relationship = t.bulk ? "root" : "floating";
    }
    let far = -1;
    for (const p of t.cells) {
      const d = dist(p, t.pivot);
      if (d > far) {
        far = d;
        t.tip = copyP(p);
      }
    }
  }
  // Inferred fallback links may cross an imported custom graph. Break cycles deterministically.
  for (const t of tissues) {
    const seen = new Set<string>([t.id]);
    let p = t.parentId ? byId.get(t.parentId) : undefined;
    while (p) {
      if (seen.has(p.id)) {
        t.parentId = null;
        t.relationship = t.bulk ? "root" : "floating";
        t.pivot = copyP(t.center);
        break;
      }
      seen.add(p.id);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
  }
  return tissues;
}
function colorAt(
  pixels: Pixel[],
  x: number,
  y: number,
  fallback: string,
): string {
  if (!pixels.length) return fallback;
  const index = Math.abs(Math.floor(x * 17 + y * 37)) % pixels.length;
  return pixels[index].color;
}
function ellipse(
  id: string,
  kind: PartKind,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  parentId: string | null,
  pattern?: Pixel[],
): PetPart {
  const pixels: Pixel[] = [];
  for (
    let y = Math.max(0, Math.floor(cy - ry));
    y <= Math.min(31, Math.ceil(cy + ry));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(cx - rx));
      x <= Math.min(31, Math.ceil(cx + rx));
      x++
    )
      if (
        ((x - cx) / Math.max(0.6, rx)) ** 2 +
          ((y - cy) / Math.max(0.6, ry)) ** 2 <=
        1.1
      )
        pixels.push({
          x,
          y,
          color:
            pattern && (x + y) % 4 === 0
              ? colorAt(pattern, x, y, color)
              : color,
        });
  return { id, kind, name: kind, position: { x: 0, y: 0 }, parentId, pixels };
}
export function capsulePixels(
  a: Point,
  b: Point,
  width: number,
  color: string,
  z?: number,
): Pixel[] {
  const pixels: Pixel[] = [];
  const minX = Math.floor(Math.min(a.x, b.x) - width),
    maxX = Math.ceil(Math.max(a.x, b.x) + width),
    minY = Math.floor(Math.min(a.y, b.y) - width),
    maxY = Math.ceil(Math.max(a.y, b.y) + width),
    dx = b.x - a.x,
    dy = b.y - a.y,
    l2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const u = clamp(
        ((x - a.x) * dx + (y - a.y) * dy) / Math.max(0.01, l2),
        0,
        1,
      );
      if (Math.hypot(x - a.x - dx * u, y - a.y - dy * u) <= width)
        pixels.push({ x, y, color, ...(z === undefined ? {} : { z }) });
    }
  return pixels;
}
export function hatchling(
  source: PetPart[],
  fingerprint: number,
): { parts: PetPart[]; recipe: Record<string, unknown> } {
  const r = rng(hash(`${fingerprint}|embryo`)),
    shell = flattenAnatomy(source),
    palette = shell.map((p) => p.color),
    main = palette[Math.floor(r() * Math.max(1, palette.length))] ?? "#AAAAAA",
    dark = "#202020";
  const parts: PetPart[] = [];
  const lobes = 1 + Math.floor(r() * 3),
    long = r() > 0.52,
    rx = long ? 5 + r() * 2 : 3 + r() * 2,
    ry = long ? 2 + r() * 2 : 4 + r() * 2;
  const symmetry = r() > 0.25;
  const legs = r() < 0.25 ? 0 : 2 * (1 + Math.floor(r() * 3));
  const wings = legs === 0 && r() > 0.45 ? 2 : 0;
  const eyes = r() < 0.12 ? 0 : r() < 0.3 ? 1 : 2;
  const mouth = r() > 0.2;
  const headOffset = { x: symmetry ? 0 : (r() - 0.5) * 3, y: -ry * 0.7 - 2 };
  for (let i = 0; i < lobes; i++) {
    const cx = 15.5 + (i - (lobes - 1) / 2) * (long ? 3 : 1.5),
      cy = 16 + (i - (lobes - 1) / 2) * (long ? 0.7 : 1.5);
    parts.push(
      ellipse(
        `embryo.mass.${i}`,
        "body",
        cx,
        cy,
        rx * (0.8 + r() * 0.3),
        ry * (0.8 + r() * 0.3),
        main,
        null,
        shell,
      ),
    );
  }
  const core = parts[0];
  parts.push(
    ellipse(
      "embryo.head",
      "head",
      15.5 + headOffset.x,
      16 + headOffset.y,
      2.5 + r() * 1.5,
      2 + r() * 1.5,
      main,
      core.id,
      shell,
    ),
  );
  for (let i = 0; i < eyes; i++)
    parts.push(
      ellipse(
        `embryo.eye.${i}`,
        "eye",
        15.5 + headOffset.x + (i - (eyes - 1) / 2) * 2.3,
        15 + headOffset.y,
        0.65,
        0.7,
        dark,
        "embryo.head",
      ),
    );
  if (mouth)
    parts.push(
      ellipse(
        "embryo.mouth",
        "mouth",
        15.5 + headOffset.x,
        17 + headOffset.y,
        1,
        0.55,
        dark,
        "embryo.head",
      ),
    );
  for (let i = 0; i < legs; i++) {
    const side = i % 2 ? -1 : 1,
      level = Math.floor(i / 2),
      origin = { x: 15.5 + side * (rx * 0.6), y: 17 + level * 1.3 },
      tip = {
        x: origin.x + side * (2.2 + r() * 1.8),
        y: origin.y + 3 + r() * 2,
      };
    const pixels = capsulePixels(origin, tip, 0.65, main).filter(
      (p) => p.x >= 0 && p.y >= 0 && p.x < 32 && p.y < 32,
    );
    parts.push({
      id: `embryo.leg.${i}`,
      kind: "leg",
      name: "leg",
      position: { x: 0, y: 0 },
      parentId: core.id,
      pixels,
    });
    parts.push(
      ellipse(
        `embryo.foot.${i}`,
        "foot",
        tip.x + side * 0.5,
        tip.y,
        0.9,
        0.6,
        main,
        `embryo.leg.${i}`,
      ),
    );
  }
  const arms = r() > 0.5 ? 2 : 0;
  for (let i = 0; i < arms; i++) {
    const side = i ? 1 : -1,
      a = { x: 15.5 + side * rx * 0.75, y: 14 },
      b = { x: 15.5 + side * (rx + 2), y: 15.5 };
    parts.push({
      id: `embryo.arm.${i}`,
      kind: "arm",
      name: "arm",
      position: { x: 0, y: 0 },
      parentId: core.id,
      pixels: capsulePixels(a, b, 0.7, main).filter(
        (p) => p.x >= 0 && p.x < 32 && p.y >= 0 && p.y < 32,
      ),
    });
    parts.push(
      ellipse(
        `embryo.hand.${i}`,
        "hand",
        b.x,
        b.y,
        1,
        0.8,
        main,
        `embryo.arm.${i}`,
      ),
    );
  }
  for (let i = 0; i < wings; i++) {
    const side = i ? 1 : -1;
    parts.push(
      ellipse(
        `embryo.wing.${i}`,
        "wing",
        15.5 + side * (rx + 1),
        15,
        3,
        1.5,
        main,
        core.id,
        shell,
      ),
    );
  }
  if (r() > 0.3) {
    const a = { x: 15.5 - rx * 0.6, y: 17 },
      b = { x: a.x - 3 - r() * 4, y: a.y - 2 + r() * 4 };
    parts.push({
      id: "embryo.tail",
      kind: "tail",
      name: "tail",
      parentId: core.id,
      position: { x: 0, y: 0 },
      pixels: capsulePixels(a, b, 0.7, main).filter(
        (p) => p.x >= 0 && p.x < 32 && p.y >= 0 && p.y < 32,
      ),
    });
  }
  if (r() > 0.45) {
    const n = 2 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = { x: 14 + i, y: 13 + headOffset.y },
        b = { x: a.x + (r() - 0.5) * 2, y: a.y - 2 - r() * 2 };
      parts.push({
        id: `embryo.hair.${i}`,
        kind: "hair",
        name: "hair",
        position: { x: 0, y: 0 },
        parentId: "embryo.head",
        pixels: capsulePixels(a, b, 0.45, main).filter(
          (p) => p.x >= 0 && p.x < 32 && p.y >= 0 && p.y < 32,
        ),
      });
    }
  }
  return {
    parts: normalizeAnatomy(parts),
    recipe: { lobes, long, symmetry, legs, wings, eyes, mouth, arms },
  };
}
