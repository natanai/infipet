import type {
  LiveDevelopmentContext,
  DevelopmentStagePoint,
} from "../lineage/types";
import {
  geneRandom,
  SURFACE_EXPRESSION_VERSION,
  type InheritedGenome,
} from "./genome";
import { clamp, type PartFrame, type Pixel } from "./model";

export type SurfaceExpressionGenes = Readonly<{
  version: typeof SURFACE_EXPRESSION_VERSION;
  enabled: boolean;
  /** Fractional pixel distance over which the retained exterior rim becomes interior pigment. */
  rimWidth: number;
  stageRanks: readonly number[];
}>;
export type SurfaceExpressionState = Readonly<{
  version: typeof SURFACE_EXPRESSION_VERSION;
  expression: number;
  committedStages: number;
  transitionHours: 1;
}>;

const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Seed-only potentials. Geometry, source names, care, reference images and frame seeking never enter. */
export function compileSurfaceExpression(
  genome: InheritedGenome,
): SurfaceExpressionGenes {
  const r = (channel: string) =>
    geneRandom(genome.fingerprint, `${SURFACE_EXPRESSION_VERSION}/${channel}`);
  return {
    version: SURFACE_EXPRESSION_VERSION,
    enabled: r("enabled") < 0.38,
    rimWidth: 0.75 + r("rim-width") * 0.85,
    stageRanks: [0, 1, 2, 3].map((stage) =>
      r(`stage/${stage}/interior-expression`),
    ),
  };
}

function stageGoal(
  genes: SurfaceExpressionGenes,
  index: number,
  point?: DevelopmentStagePoint,
) {
  // Recorded stage summaries select among inherited potential; they do not rewrite earlier choices.
  const care = point ? (clamp(point.care, 0, 1) - 0.5) * 0.28 : 0;
  const activity = point
    ? (clamp(point.training, 0, 1) - clamp(point.battle, 0, 1)) * 0.08
    : 0;
  return genes.stageRanks[index % genes.stageRanks.length] + care + activity >=
    0.4
    ? 1
    : 0;
}

/** Live expression follows reached commitments with a common one-hour window. Lab retains its anatomical clock. */
export function surfaceExpressionAt(
  genes: SurfaceExpressionGenes,
  morphologyAge: number,
  chronologicalCareHours: number,
  context?: LiveDevelopmentContext,
): SurfaceExpressionState {
  let expression = 0,
    committedStages = 0;
  if (genes.enabled && morphologyAge > 0) {
    if (context) {
      const points = [...context.stagePoints]
        .filter(
          (point) => point.atHour > 0 && point.atHour <= chronologicalCareHours,
        )
        .sort(
          (a, b) =>
            a.atHour - b.atHour || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        );
      for (const [index, point] of points.entries()) {
        const t = smooth(chronologicalCareHours - point.atHour);
        expression += (stageGoal(genes, index, point) - expression) * t;
        committedStages++;
      }
    } else {
      const ends = [10, 30, 75, 120];
      for (let index = 0; index < ends.length; index++) {
        const start = index ? ends[index - 1] : 0;
        if (morphologyAge <= start) break;
        const t = smooth((morphologyAge - start) / (ends[index] - start));
        expression += (stageGoal(genes, index) - expression) * t;
        committedStages++;
      }
    }
  }
  return {
    version: SURFACE_EXPRESSION_VERSION,
    expression,
    committedStages,
    transitionHours: 1,
  };
}

const rgb = (color: string) =>
  /^#[0-9a-f]{6}$/i.test(color)
    ? [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16))
    : [0, 0, 0];
export const pigmentLuminance = (color: string) => {
  const [r, g, b] = rgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const mix = (from: string, to: string, amount: number) => {
  const a = rgb(from),
    b = rgb(to);
  return (
    "#" +
    a
      .map((v, i) =>
        Math.round(v + (b[i] - v) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
};
const ancestry = (part: PartFrame) => [
  ...new Set(
    [part.sourcePartId, ...(part.sourcePartIds ?? [])].filter(
      (id): id is string => !!id,
    ),
  ),
];
const palette = (pixels: readonly Pixel[]) =>
  [...new Set(pixels.map((pixel) => pixel.color.toUpperCase()))].sort();
const structural = (part: PartFrame) =>
  !["eye", "mouth", "hair", "decoration", "egg"].includes(part.kind);

/**
 * Pigment expression on existing occupied material. The filled silhouette is a distance measurement
 * only: it never creates a carrier cell or copies a contour. Source pixels/roles/coordinates remain.
 * Called after the common camera and viewport normalization, so its bounded field is always 64².
 */
export function applySurfaceExpression(
  parts: PartFrame[],
  genes: SurfaceExpressionGenes,
  state: SurfaceExpressionState,
) {
  if (!genes.enabled || state.expression <= 0) return state;
  const size = 66,
    grid = new Uint8Array(size * size);
  const key = (x: number, y: number) => (y + 1) * size + x + 1;
  const material = parts.filter(structural);
  if (!material.some((part) => part.pixels.length)) return state;
  for (const part of material)
    for (const pixel of part.pixels) grid[key(pixel.x, pixel.y)] = 1;
  const outside = new Uint8Array(grid.length),
    queue = [0];
  outside[0] = 1;
  const neighbours = (at: number, visit: (next: number) => void) => {
    const x = at % size,
      y = Math.floor(at / size);
    if (x > 0) visit(at - 1);
    if (x + 1 < size) visit(at + 1);
    if (y > 0) visit(at - size);
    if (y + 1 < size) visit(at + size);
  };
  for (let cursor = 0; cursor < queue.length; cursor++)
    neighbours(queue[cursor], (next) => {
      if (!outside[next] && !grid[next]) {
        outside[next] = 1;
        queue.push(next);
      }
    });
  const distance = new Uint16Array(grid.length),
    frontier: number[] = [];
  for (let at = 0; at < grid.length; at++)
    if (!outside[at]) {
      let boundary = false;
      neighbours(at, (next) => {
        if (outside[next]) boundary = true;
      });
      if (boundary) {
        distance[at] = 1;
        frontier.push(at);
      }
    }
  for (let cursor = 0; cursor < frontier.length; cursor++)
    neighbours(frontier[cursor], (next) => {
      if (!outside[next] && !distance[next]) {
        distance[next] = distance[frontier[cursor]] + 1;
        frontier.push(next);
      }
    });
  const depthAt = (pixel: { x: number; y: number }) =>
    distance[key(pixel.x, pixel.y)] ?? 0;
  const amountAt = (pixel: { x: number; y: number }) =>
    state.expression * smooth((depthAt(pixel) - 1) / genes.rimWidth);
  const pigments = new Map<string, number>();
  for (const part of material) {
    const colors = palette(part.pixels);
    const mean =
      part.pixels.reduce(
        (sum, pixel) => sum + pigmentLuminance(pixel.color),
        0,
      ) / Math.max(1, part.pixels.length);
    const target = mean >= 0.5 ? "#000000" : "#FFFFFF";
    let changed = 0;
    part.pixels = part.pixels.map((pixel) => {
      const color = mix(pixel.color, target, amountAt(pixel));
      if (color !== pixel.color.toUpperCase()) changed++;
      return color === pixel.color.toUpperCase() ? pixel : { ...pixel, color };
    });
    part.surfaceExpression = {
      version: state.version,
      operation: "interior-pigment",
      expression: state.expression,
      sourcePartIds: ancestry(part),
      originalColors: colors,
      expressedColors: palette(part.pixels),
      changedPixelCount: changed,
    };
  }
  // Resolve the actual expressed carrier paint with the renderer's ordinary depth/tie ordering.
  const top = new Map<string, { color: string; depth: number; id: string }>();
  for (const part of material)
    for (const pixel of part.pixels) {
      const cell = `${pixel.x},${pixel.y}`,
        depth = pixel.z ?? part.layer ?? 100,
        previous = top.get(cell);
      if (
        !previous ||
        depth > previous.depth ||
        (depth === previous.depth && part.id > previous.id)
      )
        top.set(cell, { color: pixel.color, depth, id: part.id });
    }
  for (const [cell, paint] of top)
    pigments.set(cell, pigmentLuminance(paint.color));
  for (const part of parts.filter(
    (part) => part.kind === "eye" || part.kind === "mouth",
  )) {
    const colors = palette(part.pixels),
      carrier = material.find((candidate) => candidate.id === part.parentId);
    const ownCells = new Set(
      part.pixels.map((pixel) => `${pixel.x},${pixel.y}`),
    );
    const surround = new Set<string>();
    for (const pixel of part.pixels)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cell = `${pixel.x + dx},${pixel.y + dy}`;
          if (!ownCells.has(cell) && pigments.has(cell)) surround.add(cell);
        }
    const surroundingLuminance = surround.size
      ? [...surround].reduce((sum, cell) => sum + pigments.get(cell)!, 0) /
        surround.size
      : 0;
    let before = 0,
      after = 0,
      changed = 0;
    const backgrounds = part.pixels.map(
      (pixel) => pigments.get(`${pixel.x},${pixel.y}`) ?? surroundingLuminance,
    );
    const coherentColor =
      colors.length === 1 &&
      part.pixels.some(
        (pixel, index) =>
          Math.abs(pigmentLuminance(pixel.color) - backgrounds[index]) <
          0.5 - 1e-12,
      )
        ? backgrounds.reduce((sum, value) => sum + value, 0) /
            Math.max(1, backgrounds.length) >=
          0.5
          ? "#000000"
          : "#FFFFFF"
        : undefined;
    part.pixels = part.pixels.map((pixel, index) => {
      // Sample actual adjacent paint through small facial holes. An already hollow source has
      // empty dark space here, not imaginary skin from the silhouette used for rim measurement.
      const background = backgrounds[index];
      const previousContrast = Math.abs(
        pigmentLuminance(pixel.color) - background,
      );
      const color =
        coherentColor ??
        (previousContrast + 1e-12 >= 0.5
          ? pixel.color
          : background >= 0.5
            ? "#000000"
            : "#FFFFFF");
      before += previousContrast;
      after += Math.abs(pigmentLuminance(color) - background);
      if (color.toUpperCase() !== pixel.color.toUpperCase()) changed++;
      return color === pixel.color ? pixel : { ...pixel, color };
    });
    part.surfaceExpression = {
      version: state.version,
      operation: "facial-contrast",
      expression: state.expression,
      sourcePartIds: ancestry(part),
      originalColors: colors,
      expressedColors: palette(part.pixels),
      changedPixelCount: changed,
      ...(carrier ? { carrierId: carrier.id } : {}),
      contrastBefore: before / Math.max(1, part.pixels.length),
      contrastAfter: after / Math.max(1, part.pixels.length),
    };
  }
  return state;
}
