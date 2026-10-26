/** Dependency-free raster output and presentation for the reproducible pet audit. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import type {
  Manifest,
  Rate,
  ReviewSchedule,
  Summary,
  VisualReview,
} from "./types";

export type RasterPixel = { x: number; y: number; color: string };

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 4, "ascii");
  result.set(data, 8);
  result.writeUInt32BE(
    crc32(result.subarray(4, data.length + 8)),
    data.length + 8,
  );
  return result;
}

function rasterLength(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 0x7fffffff ||
    height > 0x7fffffff ||
    !Number.isSafeInteger(width * height * 4)
  )
    throw new Error(
      "Raster dimensions must be positive integer PNG dimensions.",
    );
  return width * height * 4;
}

/** RGBA8, no interlace. Filtering is intentionally simple and deterministic. */
export function encodePng(width: number, height: number, rgba: Uint8Array) {
  if (rgba.length !== rasterLength(width, height))
    throw new Error(`RGBA byte count does not match ${width} × ${height}.`);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (stride + 1);
    scanlines[offset] = 0;
    scanlines.set(rgba.subarray(y * stride, (y + 1) * stride), offset + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 6 })),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

export async function writePng(
  path: string,
  width: number,
  height: number,
  rgba: Uint8Array,
) {
  const encoded = encodePng(width, height, rgba);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encoded);
}

/** Read this tool's noninterlaced RGBA8/filter-0 PNG output, checking every CRC. */
export async function readPng(path: string) {
  const encoded = await readFile(path);
  if (!encoded.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error(`Not a PNG: ${path}.`);
  let width = 0;
  let height = 0;
  let finished = false;
  const data: Uint8Array[] = [];
  for (let offset = 8; offset < encoded.length;) {
    if (offset + 12 > encoded.length)
      throw new Error(`Truncated PNG chunk: ${path}.`);
    const length = encoded.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > encoded.length)
      throw new Error(`Truncated PNG chunk data: ${path}.`);
    const type = encoded.toString("ascii", offset + 4, offset + 8);
    const bytes = encoded.subarray(offset + 8, offset + 8 + length);
    const checksum = encoded.readUInt32BE(offset + 8 + length);
    if (crc32(encoded.subarray(offset + 4, offset + 8 + length)) !== checksum)
      throw new Error(`PNG checksum mismatch in ${type}: ${path}.`);
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13 || width)
        throw new Error(`Invalid PNG header: ${path}.`);
      width = bytes.readUInt32BE(0);
      height = bytes.readUInt32BE(4);
      rasterLength(width, height);
      if (
        bytes[8] !== 8 ||
        bytes[9] !== 6 ||
        bytes[10] !== 0 ||
        bytes[11] !== 0 ||
        bytes[12] !== 0
      )
        throw new Error(`Expected noninterlaced RGBA8 PNG: ${path}.`);
    } else if (type === "IDAT") {
      if (!width) throw new Error(`PNG data precedes header: ${path}.`);
      data.push(bytes);
    } else if (type === "IEND") {
      if (length !== 0 || !data.length || end !== encoded.length)
        throw new Error(`Invalid PNG end: ${path}.`);
      finished = true;
      break;
    }
    offset = end;
  }
  if (!finished) throw new Error(`PNG has no complete image: ${path}.`);
  const stride = width * 4;
  const expected = (stride + 1) * height;
  const scanlines = inflateSync(Buffer.concat(data), {
    maxOutputLength: expected,
  });
  if (scanlines.length !== expected)
    throw new Error(`PNG raster length mismatch: ${path}.`);
  const rgba = new Uint8Array(rasterLength(width, height));
  for (let y = 0; y < height; y += 1) {
    const offset = y * (stride + 1);
    if (scanlines[offset] !== 0)
      throw new Error(`Expected PNG row filter 0: ${path}.`);
    rgba.set(scanlines.subarray(offset + 1, offset + 1 + stride), y * stride);
  }
  return { width, height, rgba };
}

function parseColor(color: string): readonly number[] {
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color))
    throw new Error(`Unsupported audit raster color: ${color}.`);
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
    color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) : 255,
  ];
}

/** Paint an opaque dark world by default; invalid frame coordinates are errors. */
export function rasterPixels(
  pixels: readonly RasterPixel[],
  width = 64,
  height = 64,
  background = "#080808",
) {
  const result = new Uint8Array(rasterLength(width, height));
  const base = parseColor(background);
  for (let offset = 0; offset < result.length; offset += 4)
    result.set(base, offset);
  const colors = new Map<string, readonly number[]>();
  for (const pixel of pixels) {
    if (
      !Number.isInteger(pixel.x) ||
      !Number.isInteger(pixel.y) ||
      pixel.x < 0 ||
      pixel.y < 0 ||
      pixel.x >= width ||
      pixel.y >= height
    )
      throw new Error(`Audit pixel lies outside ${width} × ${height}.`);
    let color = colors.get(pixel.color);
    if (!color) {
      color = parseColor(pixel.color);
      colors.set(pixel.color, color);
    }
    result.set(color, (pixel.y * width + pixel.x) * 4);
  }
  return result;
}

/** Copy one frame into a larger atlas without rescaling its pixels. */
export function blitRgba(
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
) {
  if (
    target.length !== rasterLength(targetWidth, targetHeight) ||
    source.length !== rasterLength(sourceWidth, sourceHeight) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x + sourceWidth > targetWidth ||
    y + sourceHeight > targetHeight
  )
    throw new Error("Audit atlas copy does not fit its destination.");
  for (let row = 0; row < sourceHeight; row += 1)
    target.set(
      source.subarray(row * sourceWidth * 4, (row + 1) * sourceWidth * 4),
      ((y + row) * targetWidth + x) * 4,
    );
}

/** Integer nearest-neighbor enlargement for readable contact-sheet cells. */
export function scaleRgba(
  source: Uint8Array,
  width: number,
  height: number,
  scale = 2,
) {
  if (
    source.length !== rasterLength(width, height) ||
    !Number.isInteger(scale) ||
    scale < 1
  )
    throw new Error("Audit raster scale must be a positive integer.");
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const rgba = new Uint8Array(rasterLength(scaledWidth, scaledHeight));
  for (let y = 0; y < scaledHeight; y += 1)
    for (let x = 0; x < scaledWidth; x += 1) {
      const offset =
        (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      rgba.set(source.subarray(offset, offset + 4), (y * scaledWidth + x) * 4);
    }
  return { width: scaledWidth, height: scaledHeight, rgba };
}

// A small original code font for audit IDs/captions, independent of app fonts.
const GLYPHS: Record<string, string> = {
  A: "01110/10001/10001/11111/10001/10001/10001",
  B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01111/10000/10000/10000/10000/10000/01111",
  D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111",
  F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01111/10000/10000/10111/10001/10001/01111",
  H: "10001/10001/10001/11111/10001/10001/10001",
  I: "11111/00100/00100/00100/00100/00100/11111",
  J: "00111/00010/00010/00010/00010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001",
  L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001",
  N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110",
  P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101",
  R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110",
  T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110",
  V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/10101/01010",
  X: "10001/10001/01010/00100/01010/10001/10001",
  Y: "10001/10001/01010/00100/00100/00100/00100",
  Z: "11111/00001/00010/00100/01000/10000/11111",
  "0": "01110/10001/10011/10101/11001/10001/01110",
  "1": "00100/01100/00100/00100/00100/00100/01110",
  "2": "01110/10001/00001/00010/00100/01000/11111",
  "3": "11110/00001/00001/01110/00001/00001/11110",
  "4": "00010/00110/01010/10010/11111/00010/00010",
  "5": "11111/10000/10000/11110/00001/00001/11110",
  "6": "01110/10000/10000/11110/10001/10001/01110",
  "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110",
  "9": "01110/10001/10001/01111/00001/00001/01110",
  " ": "00000/00000/00000/00000/00000/00000/00000",
  ".": "00000/00000/00000/00000/00000/00110/00110",
  ",": "00000/00000/00000/00000/00110/00110/00100",
  ":": "00000/00110/00110/00000/00110/00110/00000",
  ";": "00000/00110/00110/00000/00110/00110/00100",
  "-": "00000/00000/00000/11111/00000/00000/00000",
  _: "00000/00000/00000/00000/00000/00000/11111",
  "/": "00001/00010/00010/00100/01000/01000/10000",
  "\\": "10000/01000/01000/00100/00010/00010/00001",
  "?": "01110/10001/00001/00010/00100/00000/00100",
  "!": "00100/00100/00100/00100/00100/00000/00100",
  "#": "01010/01010/11111/01010/11111/01010/01010",
  "%": "11001/11010/00100/00100/01000/10110/00110",
  "+": "00000/00100/00100/11111/00100/00100/00000",
  "=": "00000/00000/11111/00000/11111/00000/00000",
  "(": "00010/00100/01000/01000/01000/00100/00010",
  ")": "01000/00100/00010/00010/00010/00100/01000",
  "[": "01110/01000/01000/01000/01000/01000/01110",
  "]": "01110/00010/00010/00010/00010/00010/01110",
  "<": "00010/00100/01000/10000/01000/00100/00010",
  ">": "01000/00100/00010/00001/00010/00100/01000",
  "'": "00100/00100/00000/00000/00000/00000/00000",
  '"': "01010/01010/00000/00000/00000/00000/00000",
  "*": "00000/10101/01110/11111/01110/10101/00000",
};

export function bitmapTextWidth(text: string, scale = 1) {
  if (!Number.isInteger(scale) || scale < 1)
    throw new Error("Bitmap text scale must be a positive integer.");
  return (
    Math.max(
      ...text.split("\n").map((line) => Math.max(0, line.length * 6 - 1)),
    ) * scale
  );
}

/** Draw uppercase 5×7 captions; clipping keeps labels within the given raster. */
export function drawBitmapText(
  rgba: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  options: { color?: string; scale?: number } = {},
) {
  if (rgba.length !== rasterLength(width, height))
    throw new Error("Bitmap text destination does not match its dimensions.");
  const scale = options.scale ?? 1;
  bitmapTextWidth(text, scale);
  if (!Number.isInteger(x) || !Number.isInteger(y))
    throw new Error("Bitmap text coordinates must be integers.");
  const color = parseColor(options.color ?? "#AAAAAA");
  let column = 0;
  let line = 0;
  for (const character of text.toUpperCase()) {
    if (character === "\n") {
      column = 0;
      line += 1;
      continue;
    }
    const glyph = (GLYPHS[character] ?? GLYPHS["?"]).split("/");
    for (let gy = 0; gy < 7; gy += 1)
      for (let gx = 0; gx < 5; gx += 1)
        if (glyph[gy][gx] === "1")
          for (let sy = 0; sy < scale; sy += 1)
            for (let sx = 0; sx < scale; sx += 1) {
              const px = x + (column * 6 + gx) * scale + sx;
              const py = y + (line * 9 + gy) * scale + sy;
              if (px >= 0 && py >= 0 && px < width && py < height)
                rgba.set(color, (py * width + px) * 4);
            }
    column += 1;
  }
}

const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const md = (value: unknown) =>
  String(value)
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
const number = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "n/a";
const count = (value: number) => value.toLocaleString("en-US");
const label = (key: string) =>
  key === "faceContainment"
    ? "face containment (diagnostic)"
    : key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
const percentage = (numerator: number, denominator: number) =>
  denominator ? `${number((numerator / denominator) * 100)}%` : "not measured";
const rateText = (rate: Rate) =>
  `${count(rate.numerator)} / ${count(rate.denominator)} (${rate.percent === null ? "not measured" : `${number(rate.percent)}%`})${rate.ci95 ? `; 95% CI ${number(rate.ci95[0])}–${number(rate.ci95[1])}%` : ""}`;

function exampleLink(example: string) {
  if (/^[^/]+\/s\d+\/[^/]+\/d[\d.]+$/.test(example))
    return `[${md(example)}](index.html#case=${encodeURIComponent(example)})`;
  const pair = /^([^/]+)\/s(\d+)\/([^/]+) ~ s(\d+)$/.exec(example);
  if (pair)
    return [pair[2], pair[4]]
      .map((seed) => {
        const id = `${pair[1]}/s${String(Number(seed)).padStart(3, "0")}/${pair[3]}/d75`;
        return `[${md(id)}](index.html#case=${encodeURIComponent(id)})`;
      })
      .join(" ↔ ");
  return `\`${md(example).replace(/`/g, "'")}\``;
}

export function reviewCoverage(
  manifest: Manifest,
  schedule: ReviewSchedule,
  reviews: VisualReview[],
) {
  const primary = new Set<string>();
  const secondary = new Set<string>();
  const pageRows = new Map(
    schedule.pages.map((page) => [
      page.id,
      new Map(page.rows.map((row) => [row.id, row])),
    ]),
  );
  const pageSecondary = new Map(
    schedule.pages.map((page) => [page.id, page.secondary]),
  );
  for (const page of schedule.pages)
    for (const row of page.rows)
      for (const id of row.frameIds)
        (page.secondary ? secondary : primary).add(id);
  const seen = new Set<string>();
  const primaryObservers = new Map<string, Set<string>>();
  const secondaryObservers = new Map<string, Set<string>>();
  const byKind = { agent: new Set<string>(), human: new Set<string>() };
  const statuses: Record<string, { agent: number; human: number }> = {};
  const sourcePresets = new Set<string>();
  const scored = Object.fromEntries(
    ["distinctiveness", "coherence", "richness", "continuity"].map((name) => [
      name,
      {
        observations: 0,
        weightedSum: 0,
        meets: 0,
        frames: new Set<string>(),
        rows: new Set<string>(),
      },
    ]),
  ) as Record<
    keyof VisualReview["scores"],
    {
      observations: number;
      weightedSum: number;
      meets: number;
      frames: Set<string>;
      rows: Set<string>;
    }
  >;
  const scoredByPreset: Record<
    string,
    Record<string, { observations: number; sum: number; meets: number }>
  > = {};
  const agreementScores = new Map<
    string,
    {
      dimension: keyof VisualReview["scores"];
      primary: Map<string, number>;
      secondary: Map<string, number>;
    }
  >();
  const observationKeys = new Set<string>();
  let unmappedRows = 0;
  for (const review of [...reviews].sort((a, b) =>
    b.reviewedAt.localeCompare(a.reviewedAt),
  )) {
    const rows = pageRows.get(review.pageId);
    for (const rowId of new Set(review.rowIds)) {
      const row = rows?.get(rowId);
      if (!row) {
        unmappedRows += 1;
        continue;
      }
      const secondaryPage = pageSecondary.get(review.pageId) === true;
      const observer = `${review.kind}\0${review.reviewer}`;
      for (const id of row.frameIds) {
        seen.add(id);
        byKind[review.kind].add(id);
        const observers = secondaryPage ? secondaryObservers : primaryObservers;
        if (!observers.has(id)) observers.set(id, new Set());
        observers.get(id)!.add(observer);
        const status = (statuses[id] ??= { agent: 0, human: 0 });
        const reviewerFrame = `${review.kind}\0${review.reviewer}\0${id}`;
        if (!observationKeys.has(reviewerFrame)) {
          status[review.kind] += 1;
          observationKeys.add(reviewerFrame);
        }
        const frame = schedule.frameKey[id];
        if (frame?.age === 0) sourcePresets.add(frame.presetId);
      }
      for (const key of Object.keys(scored) as (keyof typeof scored)[]) {
        const score = review.scores[key];
        if (
          score === null ||
          !Number.isFinite(score) ||
          score < 0 ||
          score > 3 ||
          ((key === "richness" || key === "continuity") &&
            row.kind !== "lifecycle")
        )
          continue;
        const context = JSON.stringify([row.kind, row.frameIds]);
        const agreementKey = `${context}\0${key}`;
        if (!agreementScores.has(agreementKey))
          agreementScores.set(agreementKey, {
            dimension: key,
            primary: new Map(),
            secondary: new Map(),
          });
        const panel = secondaryPage
          ? agreementScores.get(agreementKey)!.secondary
          : agreementScores.get(agreementKey)!.primary;
        if (!panel.has(observer)) panel.set(observer, score);
        const keyId = `${observer}\0${context}\0${key}`;
        if (observationKeys.has(keyId)) continue;
        observationKeys.add(keyId);
        scored[key].observations += 1;
        scored[key].weightedSum += score;
        scored[key].meets += Number(score >= 2);
        scored[key].rows.add(context);
        for (const id of row.frameIds) scored[key].frames.add(id);
        const presetId = schedule.frameKey[row.frameIds[0]]?.presetId;
        if (presetId) {
          const byPreset = (scoredByPreset[presetId] ??= {});
          const values = (byPreset[key] ??= {
            observations: 0,
            sum: 0,
            meets: 0,
          });
          values.observations += 1;
          values.sum += score;
          values.meets += Number(score >= 2);
        }
      }
    }
  }
  const primaryReviewed = [...primaryObservers.keys()].filter((id) =>
    primary.has(id),
  );
  const secondaryRead = [...secondaryObservers.keys()].filter((id) =>
    secondary.has(id),
  );
  const secondaryReviewed = secondaryRead.filter((id) =>
    [...secondaryObservers.get(id)!].some((observer) =>
      [...(primaryObservers.get(id) ?? [])].some(
        (primaryObserver) => primaryObserver !== observer,
      ),
    ),
  );
  const agreement = Object.fromEntries(
    Object.keys(scored).map((key) => [key, { jointRows: 0, disagreements: 0 }]),
  ) as Record<
    keyof VisualReview["scores"],
    { jointRows: number; disagreements: number }
  >;
  for (const values of agreementScores.values()) {
    const pairs = [...values.primary].flatMap(([observer, score]) =>
      [...values.secondary].flatMap(([other, otherScore]) =>
        observer === other ? [] : [[score, otherScore]],
      ),
    );
    if (!pairs.length) continue;
    agreement[values.dimension].jointRows += 1;
    agreement[values.dimension].disagreements += Number(
      pairs.some(([a, b]) => Math.abs(a - b) >= 1),
    );
  }
  const mainReviewed = [...seen].filter((id) => {
    const key = schedule.frameKey[id];
    return (
      key &&
      id ===
        `${key.presetId}/s${String(key.seedIndex).padStart(3, "0")}/${key.historyId}/d${key.age}` &&
      manifest.ages.includes(key.age)
    );
  });
  return {
    primary,
    secondary,
    seen,
    byKind,
    statuses,
    sourcePresets,
    scored,
    scoredByPreset,
    primaryReviewed,
    secondaryReviewed,
    secondaryRead,
    agreement,
    mainReviewed,
    unmappedRows,
    pageSecondary,
  };
}

function ratesTable(rates: Record<string, Rate>) {
  return [
    "| Measure | Result |",
    "| --- | --- |",
    ...Object.entries(rates).map(
      ([key, rate]) => `| ${md(label(key))} | ${rateText(rate)} |`,
    ),
  ].join("\n");
}

function makeReport(
  manifest: Manifest,
  summary: Summary,
  reviews: VisualReview[],
  schedule: ReviewSchedule,
  coverage: ReturnType<typeof reviewCoverage>,
) {
  const findings = [...summary.findings].sort((a, b) => {
    const rank: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };
    return (
      (rank[a.severity.toLowerCase()] ?? 5) -
      (rank[b.severity.toLowerCase()] ?? 5)
    );
  });
  const lines = [
    `# Household pet audit / ${manifest.runId}`,
    "",
    `Generated ${summary.generatedAt}. Protocol **${manifest.protocolVersion}**, metrics **${manifest.metricVersion}**. Engine hash: \`${manifest.engineHash}\`. Engine unchanged during this run: **${summary.engineUnchanged ? "yes" : "no"}**.`,
    "",
    `Runtime: ${md(JSON.stringify(manifest.runtime))}. Version metadata: ${md(JSON.stringify(manifest.versions))}.`,
    "",
    "This report records measured execution, structural checks and visual-review receipts separately. Completion percentages describe this finite protocol, not overall product readiness or an unlimited possibility space.",
    "",
    "## Execution and review coverage",
    "",
    "| Workstream | Completed / denominator | Percentage |",
    "| --- | ---: | ---: |",
    `| Cases executed | ${count(summary.counts.completedCases)} / ${count(summary.counts.expectedCases)} | ${percentage(summary.counts.completedCases, summary.counts.expectedCases)} |`,
    `| Main matrix frames generated | ${count(summary.counts.frames)} / ${count(summary.counts.expectedFrames)} | ${percentage(summary.counts.frames, summary.counts.expectedFrames)} |`,
    `| Failed cases | ${count(summary.counts.failedCases)} / ${count(summary.counts.completedCases)} | ${percentage(summary.counts.failedCases, summary.counts.completedCases)} |`,
    `| Primary review schedule generated | ${count(schedule.frameCount)} / ${count(manifest.expected.scheduledReviewFrames)} | ${percentage(schedule.frameCount, manifest.expected.scheduledReviewFrames)} |`,
    `| Scheduled primary visual review | ${count(coverage.primaryReviewed.length)} / ${count(manifest.expected.scheduledReviewFrames)} | ${percentage(coverage.primaryReviewed.length, manifest.expected.scheduledReviewFrames)} |`,
    `| Independent second review | ${count(coverage.secondaryReviewed.length)} / ${count(Math.round(manifest.expected.scheduledReviewFrames * 0.2))} | ${percentage(coverage.secondaryReviewed.length, Math.round(manifest.expected.scheduledReviewFrames * 0.2))} |`,
    `| Unique main frames visually reviewed | ${count(coverage.mainReviewed.length)} / ${count(summary.counts.expectedFrames)} | ${percentage(coverage.mainReviewed.length, summary.counts.expectedFrames)} |`,
    `| Presets with a reviewed day-0 frame | ${count(coverage.sourcePresets.size)} / ${count(manifest.presets.length)} | ${percentage(coverage.sourcePresets.size, manifest.presets.length)} |`,
    "",
    `Recorded agent review covers **${count(coverage.byKind.agent.size)}** unique frames; recorded human review covers **${count(coverage.byKind.human.size)}**. These sets may overlap. ${reviews.length} receipts exist; ${coverage.unmappedRows} referenced rows could not be mapped and receive no coverage credit. Secondary pages have receipts for ${count(coverage.secondaryRead.length)} unique frames; independent second-review credit additionally requires a different primary-page reviewer for that frame. Primary completion requires primary-page receipts. Unreviewed frames remain unreviewed.`,
    "",
    `[Interactive contact sheets](index.html) · [Manifest](manifest.json) · [Machine summary](summary.json) · [Review schedule / reveal key](review-schedule.json) · [Review receipts](reviews.json) · [Review analysis](review-analysis.json)`,
    "",
    "The [pre-growth source approval](source-review.json) and [authored source sheet](sources.png) are separate from scheduled developmental review. Source approval does not automatically credit growth images.",
    "",
    "## Frozen input matrix",
    "",
    `${manifest.presets.length} presets × ${manifest.seedCount} declared seeds × ${manifest.histories.length} care histories × ${manifest.ages.length} ages = **${count(manifest.expected.frames)} expected main frames**. Ages: ${manifest.ages.join(", ")}. Structural frames use ${manifest.render.action} at explicit animation time ${manifest.render.time}. Seeds are not rerolled to select attractive results.`,
    "",
    "| Preset | Authored cues | Declared limitations |",
    "| --- | --- | --- |",
    ...manifest.presets.map(
      (preset) =>
        `| ${md(preset.name)} | ${md(preset.cues.join("; "))} | ${md(preset.limitations.join("; ") || "None recorded")} |`,
    ),
    "",
    "| Care history | Recorded events |",
    "| --- | --- |",
    ...manifest.histories.map(
      (history) =>
        `| ${md(history.label)} | ${history.timeline.length ? md(history.timeline.map((event) => `${event.needId}: ${number(event.fulfillment * 100, 0)}% from hour ${event.tick}`).join("; ")) : "Default 75% for all needs"} |`,
    ),
    "",
    "## Automated measures",
    "",
    ratesTable(summary.rates),
    "",
    "Pooled results above add the recorded numerators and denominators. Equal-weight preset means below first compute each preset's percentage, then average only measured presets:",
    "",
    "| Measure | Mean preset percentage | Presets measured |",
    "| --- | ---: | ---: |",
    ...[
      ...new Set(
        summary.presets.flatMap((preset) => Object.keys(preset.rates)),
      ),
    ].map((key) => {
      const values = summary.presets.flatMap((preset) =>
        preset.rates[key]?.percent == null ? [] : [preset.rates[key].percent!],
      );
      return `| ${md(label(key))} | ${values.length ? `${number(values.reduce((sum, value) => sum + value, 0) / values.length)}%` : "not measured"} | ${values.length} / ${manifest.presets.length} |`;
    }),
    "",
    "### Operational definitions",
    "",
    "- Normalization centers silhouettes, uses uniform scale, and removes rigid PCA/harmonic orientation with quarter-turn ambiguity minimization. It does not mirror shapes or independently stretch their axes. The 16×16 and 32×32 masks retain aspect ratio.",
    "- Shape distance is 75% tolerant 32×32 distance + 15% tolerant 16×16 distance + 10% exact 32×32 Jaccard distance. Tolerance uses a one-cell Chebyshev envelope. Shape5/10/20 are pair rates exceeding 0.05/0.10/0.20 at two or more developed ages; birth is excluded. Thresholds are operational, not guaranteed perceptual uniqueness.",
    "- Semantic20 requires at least two proportion descriptors to differ by a symmetric ratio of 1.20 at two or more developed ages. Descriptor dimensions are not independent anatomical features.",
    "- NearTwin10 counts seeds with at least one cohort partner failing lifecycle Shape10 separation. Exact and silhouette lifecycle collisions instead count seeds with identical developed image or silhouette sequences. Near-twins are not automatically identical artwork.",
    "- Care responses compare matched source/seed cases to neutral: shape distance ≥0.10, at least two proportions differing by 20%, posture differing by at least 5° modulo 180° with both silhouette anisotropies ≥0.20, or RMS-equivalent diameter differing by at least 10%, at two or more developed ages. The anisotropy requirement excludes unstable orientation estimates for near-round silhouettes. Any visual response is their union. Raw image change is separate.",
    "- Own-baseline closer compares day 120 to the same seed's neutral output and the predeclared next seed's neutral output using 60% shape + 40% semantic distance. This is a diagnostic, not an identity-recognition test.",
    "- Recovery cases compare a need restored to 100% with that need fully tended from birth. Late Safety instead compares with Safety unmet from birth and reports convergence toward that chronic control. Both gap-reduction percentages use (distance at75 − distance at240) / distance at75 ×100 for initial distance >0.001 and can be negative. Recovery-toward-control and convergence-toward-chronic-control exclude initial zero-distance cases.",
    "- Occlusion reconstructs paint ownership. Same-color ambiguity and edge contact are alerts requiring inspection. Face containment is a diagnostic rate using occupied host tissue plus its filled enclosed holes, excluding floating features. Authored projecting mouths or tongues in the dog, fish and snake drawings already extend beyond the head at birth; containment is not a pass/failure criterion.",
    "- Authored-parts retention checks stable source identity metadata; it does not prove that every part remains visible or recognizable. Rare eligibility is the fixed genetic potential, while rare expression counts cohort seeds with a generated feature in any tested history. At-most-one and forbidden-organ checks are separate compliance measures.",
    "- Confidence intervals use 500 fixed-seed whole-seed bootstrap resamples for seed outcomes, or 256 weighted whole-seed resamples for pair rates. Pair resamples normalize by Σᵢ<ⱼ wᵢwⱼ over distinct original seed pairs; duplicate draws do not invent collisions. By-age tables are descriptive. These intervals are conditional on the declared cohort and protocol, not a measured player population.",
    "- Variance panels allocate bounded radial/semantic descriptor sums of squares to seed, care and interaction. They exclude size, color and posture. The moderate panel contains neutral plus six 50% and six 100% histories; the severe panel contains the remaining histories. These shares depend on that chosen panel and are not universal genetic or care effects.",
    "",
    "[Full machine-readable definitions](metric-definitions.json). A larger distance, more pixels, or more connected components is not automatically better growth.",
    "",
    "## Visual ratings",
    "",
    "The rubric uses 0–3 and its scoring unit is an inspected row: one adult overview image or one five-age lifecycle. Means and score≥2 fractions count reviewer/row observations once, rather than weighting a lifecycle five times. The latest applicable score from each reviewer/row is used. The same row may have multiple reviewers. Frame coverage is separately deduplicated. Richness and continuity are credited only for lifecycle rows; adult overview images do not supply a developmental sequence. Missing scores stay missing. Distinctiveness is not a measured blind species-recognition accuracy. Score≥2 means the recorded rubric criterion was met for that observation; it is not product readiness.",
    "",
    "The [frozen review rubric](review-rubric.json) defines each ordinal label. Milestone continuity means consistency of the five displayed samples, not proof of smoothness at every intermediate time.",
    "",
    "| Dimension | Mean recorded score | Score ≥2 / observed rows | Criterion percentage | Unique rows | Unique frames with scores |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(coverage.scored).map(
      ([key, values]) =>
        `| ${label(key)} | ${values.observations ? number(values.weightedSum / values.observations) : "not measured"} | ${count(values.meets)} / ${count(values.observations)} | ${percentage(values.meets, values.observations)} | ${count(values.rows.size)} | ${count(values.frames.size)} |`,
    ),
    "",
    "Independent primary/secondary reviewer disagreement (at least one point on the ordinal scale):",
    "",
    "| Dimension | Rows disagreeing / jointly rated | Disagreement percentage |",
    "| --- | ---: | ---: |",
    ...Object.entries(coverage.agreement).map(
      ([key, value]) =>
        `| ${label(key)} | ${count(value.disagreements)} / ${count(value.jointRows)} | ${percentage(value.disagreements, value.jointRows)} |`,
    ),
    "",
    "Only matched row contexts with different reviewers on primary and secondary pages enter disagreement denominators. If several such pairs exist, a row is marked disagreeing when any pair differs by at least one point.",
    "",
    "## Prioritized findings",
    "",
    ...(findings.length
      ? findings.flatMap((finding) => [
          `### ${finding.severity.toUpperCase()} / ${finding.title}`,
          "",
          finding.detail,
          "",
          ...(finding.examples?.length
            ? [`Examples: ${finding.examples.map(exampleLink).join(", ")}.`, ""]
            : []),
        ])
      : [
          "No findings have been recorded. This does not assign a passing visual grade to unreviewed samples.",
          "",
        ]),
    "## Per-preset results",
    "",
  ];
  for (const preset of summary.presets) {
    lines.push(
      `### ${preset.name}`,
      "",
      ratesTable(preset.rates),
      "",
      "Age-specific measures:",
      "",
      "| Age | Measured results |",
      "| ---: | --- |",
      ...preset.byAge.map(
        (age) =>
          `| ${age.age} | ${md(
            Object.entries(age.rates)
              .map(([key, value]) => `${label(key)}: ${rateText(value)}`)
              .join("; "),
          )} |`,
      ),
      "",
      "Care comparisons with the same source and seed:",
      "",
      "| History | Mean normalized distance | Mean recovery percentage | Mean convergence toward chronic control | Measured results |",
      "| --- | ---: | ---: | ---: | --- |",
      ...preset.care.map(
        (care) =>
          `| ${md(manifest.histories.find((h) => h.id === care.historyId)?.label ?? care.historyId)} | ${number(care.meanDistance, 4)} | ${care.recoveryPercent == null ? "not measured" : `${number(care.recoveryPercent)}%`} | ${care.convergencePercent == null ? "not measured" : `${number(care.convergencePercent)}%`} | ${md(
            Object.entries(care.rates)
              .map(([key, value]) => `${label(key)}: ${rateText(value)}`)
              .join("; "),
          )} |`,
      ),
      "",
    );
    const visual = coverage.scoredByPreset[preset.id];
    if (visual)
      lines.push(
        "Recorded visual row ratings (0–3):",
        "",
        "| Dimension | Mean | Score ≥2 / observed rows | Criterion percentage |",
        "| --- | ---: | ---: | ---: |",
        ...Object.entries(visual).map(
          ([key, value]) =>
            `| ${label(key)} | ${number(value.sum / value.observations)} | ${count(value.meets)} / ${count(value.observations)} | ${percentage(value.meets, value.observations)} |`,
        ),
        "",
      );
    if (preset.variance.length)
      lines.push(
        "Descriptor variance allocation:",
        "",
        "| Age | Panel | Seed share | Care share | Interaction share | Seed share larger |",
        "| ---: | --- | ---: | ---: | ---: | --- |",
        ...preset.variance.map(
          (item) =>
            `| ${item.age} | ${md(item.panel)} | ${item.seedPercent === null ? "not measured" : `${number(item.seedPercent)}%`} | ${item.historyPercent === null ? "not measured" : `${number(item.historyPercent)}%`} | ${item.interactionPercent === null ? "not measured" : `${number(item.interactionPercent)}%`} | ${item.seedDominates === null ? "not measured" : item.seedDominates ? "yes" : "no"} |`,
        ),
        "",
      );
    if (preset.geneticsByHistory?.length)
      lines.push(
        "Genetic separation under each care history (no bootstrap intervals for these additional history panels):",
        "",
        "| History | Lifecycle shape 5 / 10 / 20 | Semantic20 | NearTwin10 | Exact / silhouette lifecycle collisions |",
        "| --- | --- | --- | --- | --- |",
        ...preset.geneticsByHistory.map(
          (item) =>
            `| ${md(manifest.histories.find((h) => h.id === item.historyId)?.label ?? item.historyId)} | ${["shape5", "shape10", "shape20"].map((key) => (item.rates[key] ? rateText(item.rates[key]) : "not measured")).join(" / ")} | ${item.rates.semantic20 ? rateText(item.rates.semantic20) : "not measured"} | ${item.rates.nearTwin10 ? rateText(item.rates.nearTwin10) : "not measured"} | ${["exactLifecycleCollision", "silhouetteLifecycleCollision"].map((key) => (item.rates[key] ? rateText(item.rates[key]) : "not measured")).join(" / ")} |`,
        ),
        "",
      );
    if (Object.keys(preset.featureChanges).length)
      lines.push(
        "Authored proportion-change rates (birth → day 75):",
        "",
        ratesTable(preset.featureChanges),
        "",
      );
    lines.push(
      `Movement counts: ${md(JSON.stringify(preset.movements))}. Structural counts: ${md(JSON.stringify(preset.structures))}.`,
      "",
    );
    if (preset.nearest.length)
      lines.push(
        `Closest declared seed pairs: ${preset.nearest
          .slice(0, 8)
          .map(
            (item) =>
              `s${item.seedIndex} / s${item.otherSeedIndex}: ${number(item.distance, 4)}`,
          )
          .join("; ")}.`,
        "",
      );
  }
  if (summary.supplemental) {
    const supplemental = summary.supplemental;
    lines.push(
      "## Supplemental checks",
      "",
      "| Check | Result |",
      "| --- | --- |",
      `| Unmodeled-appearance geometry unchanged | ${rateText(supplemental.controls.geometryUnchanged)} |`,
      `| Unmodeled-appearance feelings changed | ${rateText(supplemental.controls.feelingsChanged)} |`,
      `| Event-boundary causality | ${rateText(supplemental.boundaries.causal)} |`,
      `| Event-boundary finite frames | ${rateText(supplemental.boundaries.finite)} |`,
      `| Robustness validity | ${rateText(supplemental.robustness.valid)} |`,
      `| Robustness replay | ${rateText(supplemental.robustness.replay)} |`,
      `| Motion-frame validity | ${rateText(supplemental.motion.valid)} |`,
      `| Motion occupied-pixel contact | ${rateText(supplemental.motion.contactValid)} |`,
      "",
      `Supplemental counts: controls ${count(supplemental.controls.cases)} cases / ${count(supplemental.controls.frames)} frames; event boundaries ${count(supplemental.boundaries.checked)}; robustness ${count(supplemental.robustness.checked)}; motion ${count(supplemental.motion.frames)} frames. These are reported separately from the main matrix.`,
      "",
    );
  }
  lines.push(
    "## Performance",
    "",
    `${count(summary.performance.samples)} measured frame samples: p50 **${number(summary.performance.p50)} ms**, p95 **${number(summary.performance.p95)} ms**, maximum **${number(summary.performance.maximum)} ms**.`,
    "",
    "| Budget | Observed frames within budget |",
    "| --- | --- |",
    `| 16.667 ms | ${rateText(summary.performance.under16)} |`,
    `| 33.333 ms | ${rateText(summary.performance.under33)} |`,
    `| 100 ms | ${rateText(summary.performance.under100)} |`,
    "",
    summary.performance.note,
    "",
    "These are engine measurements on the recorded runtime. They exclude native-device, React/SVG, display and widget scheduling costs. No iPhone frame-rate claim follows from these values.",
    "",
    "## Review receipts",
    "",
  );
  if (!reviews.length)
    lines.push("No visual-review receipts have been recorded.", "");
  for (const review of reviews)
    lines.push(
      `- **${md(review.kind)} / ${md(review.reviewer)}** — ${md(review.pageId)}, ${count(review.rowIds.length)} declared rows, ${md(review.reviewedAt)}. Scores: ${md(JSON.stringify(review.scores))}. ${md(review.notes)}${review.defects.length ? ` Defects: ${md(review.defects.join("; "))}.` : ""}`,
    );
  lines.push(
    "",
    "## Baseline policy",
    "",
    "This run is an immutable, versioned audit record. A first baseline has no before/after regression result. Compare only matched source/seed/history/age/pose cases with declared engine and metric versions; disclose changed source hashes. Preserve failed cases and earlier reports. A later accepted baseline requires an explicit reason, rather than overwriting inconvenient results.",
    "",
  );
  return lines.join("\n");
}

const GALLERY_SCRIPT = String.raw`
(() => {
  const data = JSON.parse(document.getElementById('audit-data').textContent);
  const m = data.manifest, schedule = data.schedule;
  const $ = id => document.getElementById(id);
  const statuses = data.statuses;
  const images = new Map();
  const flagged = new Set([...(data.flaggedFrameIds || []), ...schedule.pages.flatMap(page => page.rows.filter(row => row.kind === 'flagged').flatMap(row => row.frameIds))]);
  for (const finding of data.summary.findings) for (const id of finding.examples || []) flagged.add(id);
  let baseline = null, baselineBase = null;
  let presetIndex = 0, historyIndex = 0, page = 0;
  const perPage = 8, cell = 128;
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const idFor = (p,s,h,a) => p + '/s' + String(s).padStart(3,'0') + '/' + h + '/d' + a;
  const imageUrl = (p,h,base) => new URL('atlases/' + encodeURIComponent(p) + '--' + encodeURIComponent(h) + '.png', base || location.href).href;
  const loadImage = url => {
    if (images.has(url)) return images.get(url);
    const promise = new Promise((resolve,reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('PNG unavailable: ' + url)); img.src = url; });
    images.set(url,promise);
    if (images.size > 12) images.delete(images.keys().next().value);
    return promise;
  };
  function statusFor(id) {
    const s = statuses[id];
    return s ? (s.human ? 'Human reviewed' : 'Agent reviewed') : 'Unreviewed';
  }
  function passes(id) {
    const mode = $('status').value, s = statuses[id];
    return mode === 'all' || (mode === 'unreviewed' && !s) || (mode === 'agent' && s && s.agent) || (mode === 'human' && s && s.human) || (mode === 'flagged' && flagged.has(id));
  }
  function opaqueId(p,h,s,a) { return 'F' + String(p).padStart(2,'0') + String(h).padStart(2,'0') + String(s).padStart(3,'0') + String(a).padStart(2,'0'); }
  function refreshLabels() {
    const blind = $('blind').checked;
    $('preset').replaceChildren(...m.presets.map((p,i) => { const n = node('option','',blind ? 'P' + String(i+1).padStart(2,'0') : p.name); n.value = i; return n; }));
    $('history').replaceChildren(...m.histories.map((h,i) => { const n = node('option','',blind ? 'H' + String(i+1).padStart(2,'0') : h.label); n.value = i; return n; }));
    $('preset').value = presetIndex; $('history').value = historyIndex;
    document.body.classList.toggle('blind',blind);
  }
  async function compareCanvas(canvas, p, h, seed, ageIndex, mode) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    const current = await loadImage(imageUrl(p.id,h.id));
    const currentCanvas = document.createElement('canvas'); currentCanvas.width = 64; currentCanvas.height = 64;
    const currentContext = currentCanvas.getContext('2d', { willReadFrequently:true });
    currentContext.drawImage(current,ageIndex*64,seed*64,64,64,0,0,64,64);
    const otherCanvas = document.createElement('canvas'); otherCanvas.width = 64; otherCanvas.height = 64;
    const otherContext = otherCanvas.getContext('2d', { willReadFrequently:true });
    if (mode === 'source') {
      const source = await loadImage(new URL('source.png',location.href).href);
      otherContext.drawImage(source,presetIndex*64,0,64,64,0,0,64,64);
    } else {
      if (!baseline) throw new Error('Load a real baseline audit to compare.');
      const si = baseline.seeds.indexOf(m.seeds[seed]), ai = baseline.ages.indexOf(m.ages[ageIndex]);
      if (si < 0 || ai < 0 || !baseline.presets.some(x => x.id === p.id) || !baseline.histories.some(x => x.id === h.id)) throw new Error('No matching source/seed/history/age in baseline.');
      const old = await loadImage(imageUrl(p.id,h.id,baselineBase));
      otherContext.drawImage(old,ai*64,si*64,64,64,0,0,64,64);
    }
    if (mode === 'side') {
      canvas.width = 128;
      context.drawImage(otherCanvas,0,0); context.drawImage(currentCanvas,64,0);
    } else if (mode === 'diff') {
      const now = currentContext.getImageData(0,0,64,64), old = otherContext.getImageData(0,0,64,64);
      const output = context.createImageData(64,64);
      for (let offset = 0; offset < output.data.length; offset += 4) {
        const equal = [0,1,2,3].every(k => now.data[offset+k] === old.data[offset+k]);
        const occupied = bytes => bytes[offset+3] && (bytes[offset] !== 8 || bytes[offset+1] !== 8 || bytes[offset+2] !== 8);
        const n = occupied(now.data), o = occupied(old.data);
        const color = equal ? (n ? [100,100,100,255] : [8,8,8,255]) : n && !o ? [255,60,60,255] : !n && o ? [24,215,232,255] : [230,180,60,255];
        output.data.set(color,offset);
      }
      context.putImageData(output,0,0);
    } else {
      context.globalAlpha = 1; context.drawImage(otherCanvas,0,0); context.globalAlpha = 0.5; context.drawImage(currentCanvas,0,0); context.globalAlpha = 1;
    }
  }
  function render() {
    const p = m.presets[presetIndex], h = m.histories[historyIndex], blind = $('blind').checked;
    const mode = $('view').value, side = mode === 'side', width = side ? cell*2 : cell;
    const url = imageUrl(p.id,h.id);
    $('page-label').textContent = 'Seed rows ' + (page*perPage+1) + '–' + Math.min((page+1)*perPage,m.seedCount) + ' / ' + m.seedCount;
    $('previous').disabled = page === 0; $('next').disabled = (page+1)*perPage >= m.seedCount;
    $('seed-page').value = page;
    $('case-facts').textContent = blind ? 'Labels hidden. Ratings apply only to inspected images.' : p.name + ' / ' + h.label + '. Events: ' + (h.timeline.length ? h.timeline.map(e => e.needId + ' ' + Math.round(e.fulfillment*100) + '% at hour ' + e.tick).join('; ') : 'all needs default 75%');
    $('limitations').textContent = blind ? '' : 'Authored cues: ' + p.cues.join('; ') + '. Limitations: ' + (p.limitations.join('; ') || 'none recorded') + '.';
    $('records').href = 'data/' + encodeURIComponent(p.id) + '--' + encodeURIComponent(h.id) + '.json.gz';
    const source = $('source-picture'); source.style.backgroundImage = 'url("source.png")'; source.style.backgroundSize = (m.presets.length*cell) + 'px ' + cell + 'px'; source.style.backgroundPosition = (-presetIndex*cell) + 'px 0px';
    source.setAttribute('aria-label',blind ? 'Authored source drawing' : p.name + ' authored source');
    $('source-caption').textContent = blind ? 'SOURCE P' + String(presetIndex+1).padStart(2,'0') : p.name + ' / authored beginning';
    const grid = $('grid'); grid.replaceChildren(); grid.style.gridTemplateColumns = '132px repeat(' + m.ages.length + ',' + width + 'px)';
    grid.append(node('div','axis','Seed / age'));
    for (const age of m.ages) grid.append(node('div','axis','DAY ' + age));
    let shown = 0;
    for (let seed = page*perPage; seed < Math.min((page+1)*perPage,m.seedCount); seed += 1) {
      grid.append(node('div','seed-label',blind ? 'S' + String(seed).padStart(3,'0') : 'S' + String(seed).padStart(3,'0') + '\n' + m.seeds[seed]));
      for (let ai = 0; ai < m.ages.length; ai += 1) {
        const id = idFor(p.id,seed,h.id,m.ages[ai]);
        const box = node('figure','frame' + (flagged.has(id) ? ' flagged' : ''));
        if (!passes(id)) { box.append(node('div','filtered','Filtered')); grid.append(box); continue; }
        shown += 1;
        const title = blind ? opaqueId(presetIndex,historyIndex,seed,ai) : id;
        const picture = mode === 'growth' ? node('div','pet') : node('canvas','pet comparison');
        picture.setAttribute('role','img'); picture.setAttribute('aria-label',title); picture.title = title;
        if (mode === 'growth') {
          picture.style.backgroundImage = 'url("' + url + '")';
          picture.style.backgroundSize = (m.ages.length*cell) + 'px ' + (m.seedCount*cell) + 'px';
          picture.style.backgroundPosition = (-ai*cell) + 'px ' + (-seed*cell) + 'px';
        } else {
          picture.width = 64; picture.height = 64;
          if (side) picture.style.width = (cell*2) + 'px';
          compareCanvas(picture,p,h,seed,ai,mode).catch(error => { picture.replaceWith(node('div','unavailable',error.message)); });
        }
        box.append(picture,node('figcaption','',title),node('span','review-status',statusFor(id)));
        grid.append(box);
      }
    }
    $('notice').textContent = shown ? '' : 'No matching frames on this seed page. Try another page, preset or history; diagnostic examples are linked below.';
    loadImage(url).catch(error => { $('notice').textContent = error.message + '. The atlas may not have been generated yet.'; });
  }
  function renderReviewPage() {
    const page = schedule.pages.find(item => item.id === $('review-page').value);
    if (!page) return;
    $('review-image').src = page.path;
    $('review-image').alt = 'Opaque review contact sheet ' + page.id;
    const ids = page.rows.flatMap(row => row.frameIds);
    const reviewed = ids.filter(id => statuses[id]).length;
    $('review-caption').textContent = page.id + ' / ' + page.rows.length + ' rows / ' + ids.length + ' frame references / ' + reviewed + ' with review receipts' + (page.secondary ? ' / secondary sample' : ' / primary sample');
    $('review-key').textContent = $('blind').checked ? 'Reveal labels to inspect the page mapping.' : JSON.stringify(page.rows.map(row => ({id:row.id,kind:row.kind,frames:row.frameIds})),null,2);
  }
  for (let i = 0; i < Math.ceil(m.seedCount/perPage); i += 1) { const option = node('option','','Seed rows ' + (i*perPage+1) + '–' + Math.min((i+1)*perPage,m.seedCount)); option.value = i; $('seed-page').append(option); }
  for (const page of schedule.pages) { const option = node('option','',page.id + (page.secondary ? ' / secondary' : '')); option.value = page.id; $('review-page').append(option); }
  $('preset').onchange = () => { presetIndex = Number($('preset').value); render(); };
  $('history').onchange = () => { historyIndex = Number($('history').value); render(); };
  $('seed-page').onchange = () => { page = Number($('seed-page').value); render(); };
  $('previous').onclick = () => { page -= 1; render(); }; $('next').onclick = () => { page += 1; render(); };
  $('blind').onchange = () => { refreshLabels(); render(); renderReviewPage(); };
  $('status').onchange = render; $('view').onchange = render;
  $('review-page').onchange = renderReviewPage;
  $('baseline-load').onclick = async () => {
    try {
      const path = $('baseline-path').value.trim();
      if (!path) throw new Error('Enter an existing audit directory. A first baseline has no prior comparison.');
      const base = new URL(path.replace(/\/?$/, '/'), location.href);
      if (base.origin !== location.origin) throw new Error('Use an audit served from the same local origin.');
      const response = await fetch(new URL('manifest.json',base));
      if (!response.ok) throw new Error('Baseline manifest could not be loaded.');
      const other = await response.json();
      if (other.protocolVersion !== m.protocolVersion || !Array.isArray(other.presets) || !Array.isArray(other.seeds) || !Array.isArray(other.ages) || !Array.isArray(other.histories)) throw new Error('Baseline protocol does not match this run.');
      baseline = other; baselineBase = base;
      const changed = m.presets.filter(p => other.presets.find(x => x.id === p.id)?.sourceHash !== p.sourceHash).map(p => p.id);
      const historiesChanged = m.histories.filter(h => JSON.stringify(other.histories.find(x => x.id === h.id)?.timeline) !== JSON.stringify(h.timeline)).map(h => h.id);
      $('baseline-note').textContent = 'Loaded ' + other.runId + '. Engine ' + other.engineHash + '. Changed sources: ' + (changed.join(', ') || 'none') + '. Changed histories: ' + (historiesChanged.join(', ') || 'none') + '. Differences are measured pixels, not automatic defect judgments.';
      for (const option of $('view').options) if (['overlay','diff','side'].includes(option.value)) option.disabled = false;
      $('view').value = 'diff'; render();
    } catch (error) { $('baseline-note').textContent = error.message; }
  };
  function followHash() {
    if (!location.hash.startsWith('#case=')) return;
    const id = decodeURIComponent(location.hash.slice(6));
    const match = /^([^/]+)\/s(\d+)\/([^/]+)\/d([\d.]+)$/.exec(id);
    if (!match) return;
    const pi = m.presets.findIndex(p => p.id === match[1]), hi = m.histories.findIndex(h => h.id === match[3]);
    if (pi < 0 || hi < 0) return;
    presetIndex = pi; historyIndex = hi; page = Math.floor(Number(match[2])/perPage);
    refreshLabels(); render(); $('gallery').scrollIntoView();
  }
  window.addEventListener('hashchange',followHash);
  refreshLabels(); render(); renderReviewPage(); followHash();
})();
`;

function makeHtml(
  manifest: Manifest,
  summary: Summary,
  schedule: ReviewSchedule,
  coverage: ReturnType<typeof reviewCoverage>,
  extras: {
    flaggedFrameIds: string[];
    flaggedPages: { id: string; path: string }[];
    hasExtraReviewSummary: boolean;
  },
) {
  const payload = JSON.stringify({
    manifest,
    summary,
    schedule,
    statuses: coverage.statuses,
    flaggedFrameIds: extras.flaggedFrameIds,
  }).replace(/</g, "\\u003c");
  const extraPanel =
    extras.flaggedFrameIds.length || extras.hasExtraReviewSummary
      ? `<section class="panel"><h2>Additional diagnostic evidence</h2><p>${count(extras.flaggedFrameIds.length)} canonical flagged-frame IDs are available to the review filter. Generating these sheets does not credit primary or independent review.</p><p><a href="flagged-schedule.json">Flagged schedule / reveal key</a>${extras.hasExtraReviewSummary ? ' · <a href="extra-review-summary.json">Separate extra-review evidence</a>' : ""}</p><p>${extras.flaggedPages.map((page) => `<a href="${escapeHtml(page.path)}">${escapeHtml(page.id)}</a>`).join(" · ")}</p><details><summary>Flagged example links</summary><p>${extras.flaggedFrameIds
          .slice(0, 80)
          .map(
            (id) =>
              `<a href="#case=${encodeURIComponent(id)}">${escapeHtml(id)}</a>`,
          )
          .join(" · ")}</p></details></section>`
      : "";
  const styles = `@font-face{font-family:DOS;src:url('../../../assets/fonts/DOS.ttf')}*{box-sizing:border-box}body{margin:0;background:#000;color:#aaa;font:16px DOS,monospace;padding:20px}main{max-width:1600px;margin:auto}h1{font-size:24px}h1,h2,h3,strong{font-weight:400;color:#ddd}h2{font-size:18px}p{line-height:1.4}a{color:#ddd}button,select,input{font:inherit;background:#000;color:#aaa;border:1px solid #444;padding:8px;max-width:100%}button{cursor:pointer}button:disabled,option:disabled{color:#555;cursor:default}a:focus,button:focus,select:focus,input:focus{outline:1px dotted #ddd;outline-offset:3px}label{display:flex;align-items:center;gap:8px}.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.panel{border:1px solid #444;padding:14px;margin:20px 0}.muted,.review-status{color:#777}.scroll{overflow:auto;max-width:100%}.grid{display:grid;gap:8px;width:max-content;align-items:start}.axis{color:#ddd;padding:5px 0}.seed-label{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px 5px;line-height:1.5}.pet{display:block;width:128px;height:128px;background-color:#080808;background-repeat:no-repeat;image-rendering:pixelated}.comparison{image-rendering:pixelated}.frame{margin:0;min-height:175px;width:max-content;max-width:256px}.frame figcaption{font-size:12px;line-height:1.2;overflow-wrap:anywhere;max-width:128px;margin-top:4px}.review-status{font-size:12px;display:block;margin-top:4px}.flagged{outline:1px solid #777;outline-offset:2px}.filtered,.unavailable{width:128px;min-height:128px;color:#777;padding:8px;font-size:14px}.source{display:flex;gap:16px;align-items:center;margin:14px 0}.source p{max-width:800px}.blind .reveal-only{display:none}details{margin:12px 0}summary{cursor:pointer;color:#ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px DOS,monospace;line-height:1.4}#review-image{max-width:100%;height:auto;image-rendering:pixelated;display:block}#notice{color:#ddd}code{font:inherit;overflow-wrap:anywhere}.statistics{display:flex;gap:24px;flex-wrap:wrap}.statistics p{margin:4px 0}input[type=checkbox]{accent-color:#aaa}input[type=text]{min-width:220px}@media(max-width:650px){body{padding:10px}.panel{padding:10px}.controls{gap:8px}select{max-width:300px}}`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>INFIPET / ${escapeHtml(manifest.runId)}</title><style>${styles}</style><main><h1>INFIPET.EXE / HOUSEHOLD PET AUDIT</h1><p>Run <code>${escapeHtml(manifest.runId)}</code> / protocol ${escapeHtml(manifest.protocolVersion)} / engine <code>${escapeHtml(manifest.engineHash)}</code></p><div class="statistics"><p>Generated <strong>${count(summary.counts.frames)} / ${count(summary.counts.expectedFrames)}</strong> (${percentage(summary.counts.frames, summary.counts.expectedFrames)})</p><p>Primary visual review <strong>${count(coverage.primaryReviewed.length)} / ${count(manifest.expected.scheduledReviewFrames)}</strong> (${percentage(coverage.primaryReviewed.length, manifest.expected.scheduledReviewFrames)})</p><p>Agent ${count(coverage.byKind.agent.size)} / human ${count(coverage.byKind.human.size)} unique reviewed frames</p></div><p><a href="REPORT.md">Detailed report</a> · <a href="summary.json">Machine summary</a> · <a href="manifest.json">Frozen manifest</a> · <a href="reviews.json">Review receipts</a> · <a href="../index.html">All audit runs</a></p><p class="muted">Generated and checked are separate from visually reviewed. Pixel differences do not automatically mean defects. Serve this folder through the local web server for image comparison and manifest loading.</p><section class="panel" id="gallery"><h2>Growth matrix</h2><div class="controls"><label>Preset <select id="preset"></select></label><label>Care history <select id="history"></select></label><label><input type="checkbox" id="blind">Hide labels</label></div><p id="case-facts"></p><p class="muted" id="limitations"></p><div class="source"><div id="source-picture" class="pet" role="img"></div><p id="source-caption"></p></div><div class="controls"><label>View <select id="view"><option value="growth">Growth</option><option value="source">Source overlay</option><option value="side" disabled>Baseline / current</option><option value="overlay" disabled>Baseline overlay</option><option value="diff" disabled>Baseline difference</option></select></label><label>Review filter <select id="status"><option value="all">All frames</option><option value="unreviewed">Unreviewed</option><option value="agent">Agent reviewed</option><option value="human">Human reviewed</option><option value="flagged">Flagged examples</option></select></label></div><p><a id="records" href="#">Compressed case records for this preset/history</a></p><div class="controls"><button id="previous">Previous</button><label>Page <select id="seed-page"></select></label><button id="next">Next</button><span id="page-label"></span></div><p id="notice" role="status"></p><div class="scroll"><div class="grid" id="grid"></div></div></section><section class="panel"><h2>Versioned comparison</h2><p id="baseline-note">No comparison is loaded. A first baseline has no earlier result. Difference colors: red current-only, cyan baseline-only, gold changed occupied pixels, gray unchanged.</p><div class="controls"><label>Existing local audit directory <input id="baseline-path" type="text" placeholder="../another-run/"></label><button id="baseline-load">Load comparison</button></div></section><section class="panel"><h2>Scheduled visual review</h2><p>Contact sheets use opaque IDs. Hiding labels helps review without category hints; it is a presentation aid rather than secure blinding. Ratings are credited only from recorded receipts, never automatically from generating a sheet.</p><div class="controls"><label>Contact sheet <select id="review-page"></select></label><a href="review-schedule.json" class="reveal-only">Full reveal key</a></div><p id="review-caption"></p><img id="review-image" alt="Review contact sheet"><details><summary>Page mapping</summary><pre id="review-key"></pre></details></section><section class="panel"><h2>Interpretation</h2><p>Distinctiveness and coherence can be rated from overview images. Growth richness and developmental continuity require a lifecycle sequence; their missing scores remain unmeasured. Normalized shape descriptors, retained tissue and topology are diagnostics, not proof of species recognition or attractive growth. The report gives numerator/denominator percentages and known limitations.</p></section><p class="muted">Application font by VileR / <a href="https://int10h.org/oldschool-pc-fonts/">Ultimate Oldschool PC Font Pack</a> / <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Contact-sheet captions use an original 5×7 code font.</p></main><script type="application/json" id="audit-data">${payload}</script><script>${GALLERY_SCRIPT}</script></html>`.replace(
    "</main>",
    extraPanel + "</main>",
  );
}

async function writeAuditIndex(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  const runs: Manifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      runs.push(
        JSON.parse(
          await readFile(join(root, entry.name, "manifest.json"), "utf8"),
        ),
      );
    } catch {
      /* Incomplete directories are not listed as completed artifacts. */
    }
  }
  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cards = runs
    .map(
      (run) =>
        `<li><a href="${encodeURIComponent(run.runId)}/index.html">${escapeHtml(run.runId)}</a> / ${escapeHtml(run.createdAt)} / ${count(run.expected.frames)} expected frames / <a href="${encodeURIComponent(run.runId)}/REPORT.md">report</a></li>`,
    )
    .join("");
  await writeFile(
    join(root, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>INFIPET / Audit runs</title><style>@font-face{font-family:DOS;src:url('../../assets/fonts/DOS.ttf')}body{max-width:1100px;margin:24px auto;padding:12px;background:#000;color:#aaa;font:16px DOS,monospace}h1,a{color:#ddd;font-weight:400}li{margin:18px 0;line-height:1.4}code{font:inherit}</style><h1>INFIPET.EXE / VERSIONED AUDITS</h1><p>Each run preserves its fixed inputs, engine hash, measured results and actual visual-review receipts. Expected frame counts describe scope; inspect each report for execution and review completion. A first baseline does not establish before/after improvement.</p><ul>${cards || "<li>No manifested runs yet.</li>"}</ul></html>`,
    "utf8",
  );
}

export async function writePresentation(
  runDir: string,
  manifest: Manifest,
  summary: Summary,
  reviews: VisualReview[],
  schedule: ReviewSchedule,
) {
  const coverage = reviewCoverage(manifest, schedule, reviews);
  const optional = async (name: string) => {
    try {
      return await readFile(join(runDir, name), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const [flaggedText, assessment, extraReview, verification] =
    await Promise.all([
      optional("flagged-schedule.json"),
      optional("assessment.md"),
      optional("extra-review-summary.json"),
      optional("verification.json"),
    ]);
  const flagged = flaggedText
    ? (JSON.parse(flaggedText) as {
        frameKey?: Record<string, unknown>;
        pages?: { id: string; path: string }[];
      })
    : null;
  const extras = {
    flaggedFrameIds: Object.keys(flagged?.frameKey ?? {}),
    flaggedPages: flagged?.pages ?? [],
    hasExtraReviewSummary: extraReview !== null,
  };
  let report = makeReport(manifest, summary, reviews, schedule, coverage);
  if (assessment)
    report = report.replace(
      "\n## Execution and review coverage",
      `\n## Assessment\n\n[Standalone interpretation](assessment.md).\n\n${assessment.trim().replace(/^(#{1,4}) /gm, "$1## ")}\n\n## Execution and review coverage`,
    );
  if (flagged)
    report += `\n## Additional diagnostic evidence\n\nThe [flagged schedule](flagged-schedule.json) supplies ${count(extras.flaggedFrameIds.length)} canonical flagged-frame IDs and these diagnostic sheets: ${extras.flaggedPages.map((page) => `[${md(page.id)}](${page.path})`).join(", ")}. These artifacts do not imply visual review and are excluded from primary and independent coverage.\n`;
  if (extraReview)
    report += `\n## Separate extra visual reviews\n\n[Extra review summary](extra-review-summary.json). This evidence is reported independently; it does not inflate the frozen primary or independent-second-review denominators.\n\n\`\`\`json\n${JSON.stringify(JSON.parse(extraReview), null, 2)}\n\`\`\`\n`;
  if (verification)
    report += `\n## Application validation\n\nThe [recorded validation evidence](verification.json) is separate from growth-quality measurements and visual ratings.\n\n\`\`\`json\n${JSON.stringify(JSON.parse(verification), null, 2)}\n\`\`\`\n`;
  await mkdir(runDir, { recursive: true });
  await Promise.all([
    writeFile(join(runDir, "REPORT.md"), report, "utf8"),
    writeFile(
      join(runDir, "index.html"),
      makeHtml(manifest, summary, schedule, coverage, extras),
      "utf8",
    ),
    writeFile(
      join(runDir, "reviews.json"),
      JSON.stringify(reviews, null, 2) + "\n",
      "utf8",
    ),
    writeFile(
      join(runDir, "review-analysis.json"),
      JSON.stringify(
        {
          scoringUnit:
            "reviewer-row; latest applicable score; range0..3; score>=2 is rubric criterion only",
          primary: {
            reviewed: coverage.primaryReviewed.length,
            expected: manifest.expected.scheduledReviewFrames,
          },
          independentSecond: {
            reviewed: coverage.secondaryReviewed.length,
            expected: Math.round(manifest.expected.scheduledReviewFrames * 0.2),
          },
          secondaryPageFramesRead: coverage.secondaryRead.length,
          agentFrames: coverage.byKind.agent.size,
          humanFrames: coverage.byKind.human.size,
          unmappedRows: coverage.unmappedRows,
          dimensions: Object.fromEntries(
            Object.entries(coverage.scored).map(([key, value]) => [
              key,
              {
                observations: value.observations,
                mean: value.observations
                  ? value.weightedSum / value.observations
                  : null,
                scoreAtLeast2: {
                  numerator: value.meets,
                  denominator: value.observations,
                  percent: value.observations
                    ? (value.meets / value.observations) * 100
                    : null,
                },
                uniqueRows: value.rows.size,
                uniqueFrames: value.frames.size,
              },
            ]),
          ),
          byPreset: coverage.scoredByPreset,
          disagreement: coverage.agreement,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    ),
  ]);
  await writeAuditIndex(dirname(runDir));
  return {
    report: join(runDir, "REPORT.md"),
    gallery: join(runDir, "index.html"),
    primaryReviewedFrames: coverage.primaryReviewed.length,
    scheduledPrimaryFrames: manifest.expected.scheduledReviewFrames,
  };
}
