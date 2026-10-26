import type { Pixel } from "../../src/simulation";
import type { MonoBitmap, ShapeMetrics } from "./types";

type XY = { x: number; y: number };
type Mask = {
  data: Uint8Array;
  size: number;
  width: number;
  height: number;
  density: number;
};
export const METRIC_VERSION = "retro-mono-v2-native-8fg-4bg";
export const NEAR_EXACT_THRESHOLDS = Object.freeze({
  silhouetteIoU: 0.9,
  filledSilhouetteIoU: 0.94,
  aspectSimilarity: 0.94,
  densitySimilarity: 0.9,
});
export const RAW_RELATIVE_SIZE_THRESHOLD = 0.94;
export function measureBitmap(bitmap: MonoBitmap) {
  const points = bitmap.rows.flatMap((row, y) =>
    [...row].flatMap((ink, x) =>
      ink === "#" || ink === "1" ? [{ x, y }] : [],
    ),
  );
  const xs = points.map((point) => point.x),
    ys = points.map((point) => point.y);
  const left = points.length ? Math.min(...xs) : 0,
    top = points.length ? Math.min(...ys) : 0;
  return {
    left,
    top,
    width: points.length ? Math.max(...xs) - left + 1 : 0,
    height: points.length ? Math.max(...ys) - top + 1 : 0,
    ink: points.length,
  };
}
export function compareRelativeDimensions(
  actual: MonoBitmap,
  actualBirth: MonoBitmap,
  target: MonoBitmap,
  targetBirth: MonoBitmap,
) {
  const a = measureBitmap(actual),
    ab = measureBitmap(actualBirth),
    t = measureBitmap(target),
    tb = measureBitmap(targetBirth);
  const similarity = (x: number, y: number) =>
    x > 0 && y > 0 ? Math.min(x / y, y / x) : 0;
  const actualWidthRatio = ab.width ? a.width / ab.width : 0,
    targetWidthRatio = tb.width ? t.width / tb.width : 0;
  const actualHeightRatio = ab.height ? a.height / ab.height : 0,
    targetHeightRatio = tb.height ? t.height / tb.height : 0;
  return {
    actual: a,
    target: t,
    actualWidthRatio,
    targetWidthRatio,
    actualHeightRatio,
    targetHeightRatio,
    widthSimilarity: similarity(actualWidthRatio, targetWidthRatio),
    heightSimilarity: similarity(actualHeightRatio, targetHeightRatio),
    passed:
      similarity(actualWidthRatio, targetWidthRatio) >=
        RAW_RELATIVE_SIZE_THRESHOLD &&
      similarity(actualHeightRatio, targetHeightRatio) >=
        RAW_RELATIVE_SIZE_THRESHOLD,
  };
}

export function validateBitmap(bitmap: MonoBitmap): MonoBitmap {
  if (
    !bitmap ||
    !Number.isInteger(bitmap.width) ||
    !Number.isInteger(bitmap.height) ||
    bitmap.width < 1 ||
    bitmap.height < 1 ||
    bitmap.width > 256 ||
    bitmap.height > 256 ||
    !Array.isArray(bitmap.rows) ||
    bitmap.rows.length !== bitmap.height ||
    !bitmap.rows.every(
      (row) =>
        typeof row === "string" &&
        row.length === bitmap.width &&
        /^[.#01 ]+$/.test(row),
    )
  )
    throw new Error(
      "Reference bitmap must be a bounded rectangular monochrome grid.",
    );
  if (!bitmap.rows.some((row) => /[#1]/.test(row)))
    throw new Error("An empty reference cannot establish resemblance.");
  return bitmap;
}
export function bitmapPoints(bitmap: MonoBitmap): XY[] {
  validateBitmap(bitmap);
  return bitmap.rows.flatMap((row, y) =>
    [...row].flatMap((ink, x) =>
      ink === "#" || ink === "1" ? [{ x, y }] : [],
    ),
  );
}
export function pixelsToBitmap(
  pixels: readonly Pixel[],
  width = 64,
  height = 64,
): MonoBitmap {
  const rows = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "."),
  );
  // The generated pet uses light LCD ink on a dark world. Black authored pixels remain holes.
  for (const pixel of pixels) {
    if (
      !Number.isInteger(pixel.x) ||
      !Number.isInteger(pixel.y) ||
      pixel.x < 0 ||
      pixel.y < 0 ||
      pixel.x >= width ||
      pixel.y >= height
    )
      throw new Error("Rendered audit pixel is outside its world.");
    const color = /^#[0-9a-f]{6}$/i.test(pixel.color)
      ? pixel.color.slice(1)
      : "000000";
    const light =
      0.2126 * parseInt(color.slice(0, 2), 16) +
      0.7152 * parseInt(color.slice(2, 4), 16) +
      0.0722 * parseInt(color.slice(4, 6), 16);
    rows[pixel.y][pixel.x] = light >= 128 ? "#" : ".";
  }
  return { width, height, rows: rows.map((row) => row.join("")) };
}
function normalize(points: XY[], size = 32): Mask {
  const data = new Uint8Array(size * size);
  if (!points.length) return { data, size, width: 0, height: 0, density: 0 };
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const width = maxX - minX + 1,
    height = maxY - minY + 1,
    scale = (size - 2) / Math.max(width, height);
  const outWidth = Math.max(1, Math.round(width * scale)),
    outHeight = Math.max(1, Math.round(height * scale));
  const left = Math.floor((size - outWidth) / 2),
    top = Math.floor((size - outHeight) / 2);
  const occupied = new Set(points.map((p) => `${p.x},${p.y}`));
  for (let y = 0; y < outHeight; y++)
    for (let x = 0; x < outWidth; x++) {
      const sx = minX + Math.min(width - 1, Math.floor(x / scale)),
        sy = minY + Math.min(height - 1, Math.floor(y / scale));
      if (occupied.has(`${sx},${sy}`)) data[(top + y) * size + left + x] = 1;
    }
  return {
    data,
    size,
    width,
    height,
    density: points.length / (width * height),
  };
}
/** Read-only presentation of the exact uniform-scale/translation normalization used by the metric. */
export function normalizedBitmap(bitmap: MonoBitmap): MonoBitmap {
  const points = bitmap.rows.flatMap((row, y) =>
    [...row].flatMap((ink, x) =>
      ink === "#" || ink === "1" ? [{ x, y }] : [],
    ),
  );
  const mask = normalize(points);
  return {
    width: mask.size,
    height: mask.size,
    rows: Array.from({ length: mask.size }, (_, y) =>
      Array.from({ length: mask.size }, (_, x) =>
        mask.data[y * mask.size + x] ? "#" : ".",
      ).join(""),
    ),
  };
}
function topology(data: Uint8Array, size: number, value: 0 | 1) {
  const seen = new Uint8Array(data.length);
  let count = 0,
    enclosed = 0;
  for (let start = 0; start < data.length; start++)
    if (!seen[start] && data[start] === value) {
      count++;
      const queue = [start];
      seen[start] = 1;
      let boundary = false;
      for (let at = 0; at < queue.length; at++) {
        const cell = queue[at],
          x = cell % size,
          y = Math.floor(cell / size);
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1)
          boundary = true;
        const neighbors = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          ...(value === 1
            ? [
                [1, 1],
                [-1, 1],
                [1, -1],
                [-1, -1],
              ]
            : []),
        ];
        for (const [dx, dy] of neighbors) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const next = ny * size + nx;
          if (!seen[next] && data[next] === value) {
            seen[next] = 1;
            queue.push(next);
          }
        }
      }
      if (!boundary) enclosed++;
    }
  return { count, enclosed };
}
/** Pixel-art digital topology: complementary8-connected ink and4-connected background. */
export function bitmapTopology(bitmap: MonoBitmap) {
  const bounds = measureBitmap(bitmap);
  const size = Math.max(bounds.width, bounds.height) + 2;
  const data = new Uint8Array(size * size);
  bitmap.rows.forEach((row, y) =>
    [...row].forEach((ink, x) => {
      if (ink === "#" || ink === "1")
        data[(y - bounds.top + 1) * size + (x - bounds.left + 1)] = 1;
    }),
  );
  return {
    components: topology(data, size, 1).count,
    holes: topology(data, size, 0).enclosed,
  };
}
function fillHoles(data: Uint8Array, size: number) {
  const outside = new Uint8Array(data.length),
    queue: number[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (
        (!x || !y || x === size - 1 || y === size - 1) &&
        !data[y * size + x] &&
        !outside[y * size + x]
      ) {
        outside[y * size + x] = 1;
        queue.push(y * size + x);
      }
  for (let at = 0; at < queue.length; at++) {
    const cell = queue[at],
      x = cell % size,
      y = Math.floor(cell / size);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (!data[n] && !outside[n]) {
        outside[n] = 1;
        queue.push(n);
      }
    }
  }
  return Uint8Array.from(data, (v, i) => (v || !outside[i] ? 1 : 0));
}
function overlap(
  a: Uint8Array,
  b: Uint8Array,
  size: number,
  dx: number,
  dy: number,
) {
  let intersection = 0,
    union = 0,
    equal = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ax = x - dx,
        ay = y - dy;
      const av =
          ax >= 0 && ay >= 0 && ax < size && ay < size ? a[ay * size + ax] : 0,
        bv = b[y * size + x];
      if (av && bv) intersection++;
      if (av || bv) union++;
      if (av === bv) equal++;
    }
  return {
    iou: union ? intersection / union : 0,
    agreement: equal / (size * size),
  };
}
export function compareBitmaps(
  actual: MonoBitmap,
  target: MonoBitmap,
): ShapeMetrics {
  validateBitmap(target);
  const actualPoints = actual.rows.flatMap((row, y) =>
    [...row].flatMap((v, x) => (v === "#" || v === "1" ? [{ x, y }] : [])),
  );
  const a = normalize(actualPoints),
    b = normalize(bitmapPoints(target));
  let best = { iou: -1, agreement: 0, dx: 0, dy: 0 };
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const result = overlap(a.data, b.data, a.size, dx, dy);
      if (result.iou > best.iou) best = { ...result, dx, dy };
    }
  const ratio = (x: number, y: number) => (x && y ? Math.min(x / y, y / x) : 0);
  const nativeActual = bitmapTopology(actual),
    nativeTarget = bitmapTopology(target);
  return {
    silhouetteIoU: Math.max(0, best.iou),
    filledSilhouetteIoU: overlap(
      fillHoles(a.data, a.size),
      fillHoles(b.data, b.size),
      a.size,
      best.dx,
      best.dy,
    ).iou,
    pixelAgreement: best.agreement,
    aspectSimilarity: ratio(a.width / a.height, b.width / b.height),
    densitySimilarity: ratio(a.density, b.density),
    components: {
      actual: nativeActual.components,
      target: nativeTarget.components,
    },
    holes: {
      actual: nativeActual.holes,
      target: nativeTarget.holes,
    },
    alignment: {
      dx: best.dx,
      dy: best.dy,
      gridSize: a.size,
      transform: "translate-and-uniform-scale",
    },
  };
}
export function meetsNearExactGate(m: ShapeMetrics): boolean {
  return (
    m.silhouetteIoU >= NEAR_EXACT_THRESHOLDS.silhouetteIoU &&
    m.filledSilhouetteIoU >= NEAR_EXACT_THRESHOLDS.filledSilhouetteIoU &&
    m.aspectSimilarity >= NEAR_EXACT_THRESHOLDS.aspectSimilarity &&
    m.densitySimilarity >= NEAR_EXACT_THRESHOLDS.densitySimilarity &&
    m.components.actual === m.components.target &&
    m.holes.actual === m.holes.target
  );
}
