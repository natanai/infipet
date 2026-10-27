import type { PartKind, PetPart, Pixel } from "./simulation";
import { validateGameState, type GameState } from "./gameplay";
import { datasetVersion, profileVersion } from "./phylogeny";
import { LINEAGE_RULES_VERSION } from "./lineage";
import {
  PROCEDURAL_GRAMMAR_VERSION,
  SURFACE_EXPRESSION_VERSION,
  SOMATIC_GROWTH_VERSION,
} from "./simulation/genome";
import {
  GROOMING_RULES,
  normalizeGroomTimeline,
  validGroomTick,
  type GroomStroke,
} from "./simulation/grooming";
import {
  MAX_SIMULATION_DAYS,
  NEEDS_CATALOG_VERSION,
  NEEDS_RULES_VERSION,
  normalizeNeedTimeline,
  type NeedKeyframe,
} from "./needs";

export const PROTOTYPE_REVISION = "life-v10" as const;
export const LINEAGE_RECIPE_VERSION = `${datasetVersion}|${profileVersion}|${LINEAGE_RULES_VERSION}|${PROCEDURAL_GRAMMAR_VERSION}|${SURFACE_EXPRESSION_VERSION}|${SOMATIC_GROWTH_VERSION}`;

/** The living pet is independent of the editable laboratory recipe. */
export type LivingPet = {
  lineageVersion: string;
  anatomicalClock?:"daily-365-v1";
  /** Optional acceleration only; a malformed cache cannot invalidate the life. */
  anatomicalCheckpoint?:unknown;
  parts: PetPart[];
  mode: "infant" | "egg";
  seed: string;
  name: string;
  game: GameState;
  groomingTimeline: GroomStroke[];
};

/** A portable pet contains its anatomy, deterministic growth recipe, and age. */
export type PetDocument = {
  version: 8;
  algorithmVersion: 7;
  revision: typeof PROTOTYPE_REVISION;
  mode: "infant" | "egg";
  name: string;
  seed: string;
  parts: PetPart[];
  needTimeline: NeedKeyframe[];
  groomingTimeline?: GroomStroke[];
  catalogVersion: typeof NEEDS_CATALOG_VERSION;
  needsRulesVersion: typeof NEEDS_RULES_VERSION;
  bornAt: number;
  age: number;
  life?: LivingPet;
};

const PART_SIZE = 32;
const ASSEMBLY_SIZE = 32;
const MAX_PARTS = 1024;
const MAX_SOURCE_PIXELS = 15 * PART_SIZE * PART_SIZE;
const MAX_SHARE_BYTES = 16 * 1024 * 1024;
const DOCUMENT_KEYS = [
  "version",
  "algorithmVersion",
  "revision",
  "mode",
  "name",
  "seed",
  "parts",
  "needTimeline",
  "groomingTimeline",
  "catalogVersion",
  "needsRulesVersion",
  "bornAt",
  "age",
  "life",
];
const PART_KEYS = [
  "id",
  "kind",
  "name",
  "pixels",
  "position",
  "parentId",
  "layer",
];
const POINT_KEYS = ["x", "y"];
const PIXEL_KEYS = ["x", "y", "color", "z"];
const PART_KINDS = new Set<PartKind>([
  "body",
  "head",
  "arm",
  "hand",
  "leg",
  "foot",
  "eye",
  "mouth",
  "ear",
  "tail",
  "wing",
  "horn",
  "egg",
  "decoration",
  "hair",
]);

function invalid(message: string): never {
  throw new Error(`Cannot open this pet: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function boundedText(value: unknown, label: string, limit: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > limit ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return invalid(
      `${label} must be 1–${limit} characters with no control characters.`,
    );
  }
  return value;
}

function wholeCoordinate(value: unknown, size: number, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= size
  ) {
    return invalid(
      `${label} must be a whole-number coordinate from 0 to ${size - 1}.`,
    );
  }
  return value;
}

function depth(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1_000_000_000
  ) {
    return invalid(`${label} must be an integer from 0 to 1,000,000,000.`);
  }
  return value;
}

function validatedPixels(value: unknown, size: number, label: string): Pixel[] {
  if (!Array.isArray(value) || value.length > size * size) {
    return invalid(`${label} must contain at most ${size * size} pixels.`);
  }
  const occupied = new Set<number>();
  return value.map((candidate, index) => {
    const pixelLabel = `${label}, pixel ${index + 1}`;
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, PIXEL_KEYS)) {
      return invalid(
        `${pixelLabel} must contain only x, y, color, and optional paint depth.`,
      );
    }
    const x = wholeCoordinate(candidate.x, size, `${pixelLabel} x`);
    const y = wholeCoordinate(candidate.y, size, `${pixelLabel} y`);
    const color = candidate.color;
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return invalid(
        `${pixelLabel} must have a six-digit hex color such as #72B9A2.`,
      );
    }
    const position = y * size + x;
    if (occupied.has(position))
      invalid(`${pixelLabel} overlaps another pixel in the same part.`);
    occupied.add(position);
    return {
      x,
      y,
      color,
      ...("z" in candidate
        ? { z: depth(candidate.z, `${pixelLabel} paint depth`) }
        : {}),
    };
  });
}

function validatedParts(value: unknown): PetPart[] {
  if (!Array.isArray(value) || value.length > MAX_PARTS) {
    return invalid(`The anatomy must contain at most ${MAX_PARTS} parts.`);
  }
  let pixelCount = 0;
  const ids = new Set<string>();
  const parts: PetPart[] = value.map((candidate, index) => {
    const label = `Part ${index + 1}`;
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, PART_KEYS)) {
      return invalid(
        `${label} must contain only id, kind, name, pixels, position, parentId, and optional layer.`,
      );
    }
    const id = boundedText(candidate.id, `${label} ID`, 64);
    if (ids.has(id)) invalid(`${label} has a duplicate part ID.`);
    ids.add(id);
    const kind = candidate.kind;
    if (typeof kind !== "string" || !PART_KINDS.has(kind as PartKind)) {
      return invalid(`${label} has an unsupported anatomy kind.`);
    }
    const name = boundedText(candidate.name, `${label} name`, 60);
    const pixels = validatedPixels(candidate.pixels, PART_SIZE, label);
    pixelCount += pixels.length;
    if (pixelCount > MAX_SOURCE_PIXELS)
      invalid("The drawing exceeds its 15,360 source-pixel budget.");
    if (
      !isRecord(candidate.position) ||
      !hasOnlyKeys(candidate.position, POINT_KEYS)
    ) {
      return invalid(`${label} position must contain only x and y.`);
    }
    const position = {
      x: wholeCoordinate(
        candidate.position.x,
        ASSEMBLY_SIZE,
        `${label} position x`,
      ),
      y: wholeCoordinate(
        candidate.position.y,
        ASSEMBLY_SIZE,
        `${label} position y`,
      ),
    };
    if (
      pixels.some(
        (pixel) =>
          pixel.x + position.x >= ASSEMBLY_SIZE ||
          pixel.y + position.y >= ASSEMBLY_SIZE,
      )
    ) {
      return invalid(`${label} has pixels outside the 32 by 32 drawing.`);
    }
    const parentId =
      candidate.parentId === null
        ? null
        : boundedText(candidate.parentId, `${label} parent ID`, 64);
    return {
      id,
      kind: kind as PartKind,
      name,
      pixels,
      position,
      parentId,
      ...("layer" in candidate
        ? { layer: depth(candidate.layer, `${label} layer`) }
        : {}),
    };
  });

  const byId = new Map(parts.map((part) => [part.id, part]));
  for (const part of parts) {
    if (part.parentId !== null && !byId.has(part.parentId)) {
      invalid(`Part ${part.id} refers to a missing parent.`);
    }
    const ancestors = new Set<string>([part.id]);
    let parentId = part.parentId;
    while (parentId !== null) {
      if (ancestors.has(parentId))
        invalid("The anatomy contains a parent cycle.");
      ancestors.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return parts;
}

function validatedGrooming(value: unknown): GroomStroke[] {
  if (!Array.isArray(value) || value.length > GROOMING_RULES.maximumStrokes)
    return invalid(
      `grooming must contain at most ${GROOMING_RULES.maximumStrokes} strokes.`,
    );
  const identifiers = new Set<string>(),
    commands = new Set<string>();
  const result = value.map((candidate, index) => {
    const label = `Groom stroke ${index + 1}`;
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
        "id",
        "tick",
        "sourceId",
        "materialAnchor",
        "direction",
        "strength",
      ])
    )
      return invalid(`${label} contains unsupported fields.`);
    if (!validGroomTick(candidate.tick))
      return invalid(`${label} tick must represent a nonnegative integer millisecond in elapsed hours.`);
    const sourceId = boundedText(candidate.sourceId, `${label} source ID`, 64);
    if (
      !isRecord(candidate.materialAnchor) ||
      !hasOnlyKeys(candidate.materialAnchor, POINT_KEYS) ||
      !isRecord(candidate.direction) ||
      !hasOnlyKeys(candidate.direction, POINT_KEYS)
    )
      return invalid(
        `${label} anchor and direction must contain only x and y.`,
      );
    const anchor = candidate.materialAnchor,
      direction = candidate.direction;
    for (const axis of ["x", "y"] as const)
      if (
        typeof anchor[axis] !== "number" ||
        !Number.isFinite(anchor[axis]) ||
        anchor[axis] < 0 ||
        anchor[axis] > 63
      )
        return invalid(
          `${label} material anchor must be finite within the 64-cell source world.`,
        );
    if (
      typeof direction.x !== "number" ||
      typeof direction.y !== "number" ||
      !Number.isFinite(direction.x) ||
      !Number.isFinite(direction.y) ||
      !Number.isFinite(Math.hypot(direction.x, direction.y)) ||
      Math.hypot(direction.x, direction.y) < 1e-9
    )
      return invalid(`${label} direction must be a finite nonzero vector.`);
    if (
      typeof candidate.strength !== "number" ||
      !Number.isFinite(candidate.strength) ||
      candidate.strength <= 0 ||
      candidate.strength > 1
    )
      return invalid(`${label} strength must be greater than 0 and at most 1.`);
    const id =
      "id" in candidate
        ? boundedText(candidate.id, `${label} ID`, 128).trim()
        : undefined;
    if (id && identifiers.has(id))
      return invalid(`${label} has a duplicate gesture ID.`);
    if (id) identifiers.add(id);
    const [stroke] = normalizeGroomTimeline([
      {
        tick: candidate.tick as number,
        sourceId,
        materialAnchor: { x: anchor.x as number, y: anchor.y as number },
        direction: { x: direction.x, y: direction.y },
        strength: candidate.strength,
        ...(id === undefined ? {} : { id }),
      },
    ]);
    if (!stroke) return invalid(`${label} is too small to record.`);
    const command = JSON.stringify([
      stroke.tick,
      stroke.sourceId,
      stroke.materialAnchor,
      stroke.direction,
      stroke.strength,
    ]);
    if (commands.has(command))
      return invalid(`${label} duplicates the same material gesture.`);
    commands.add(command);
    return stroke;
  });
  return normalizeGroomTimeline(result);
}

function validatedPet(value: unknown): PetDocument {
  if (!isRecord(value)) invalid("the file must contain a pet object.");
  if (value.version !== 8)
    invalid(
      `this code belongs to a different prototype. Start a new ${PROTOTYPE_REVISION} pet.`,
    );
  if (value.algorithmVersion !== 7)
    invalid("this growth algorithm version is not supported.");
  if (value.revision !== PROTOTYPE_REVISION)
    invalid(
      `this prototype revision is not supported. Start a new ${PROTOTYPE_REVISION} pet.`,
    );
  if (!hasOnlyKeys(value, DOCUMENT_KEYS))
    invalid("the file contains unrecognized pet fields.");
  if (value.catalogVersion !== NEEDS_CATALOG_VERSION)
    invalid("this needs catalog version is not supported.");
  if (value.needsRulesVersion !== NEEDS_RULES_VERSION)
    invalid("this needs rules version is not supported.");
  if (value.mode !== "infant" && value.mode !== "egg")
    invalid("the beginning must be infant or egg.");
  const name = boundedText(value.name, "The name", 60);
  const seed = boundedText(value.seed, "The seed", 128);
  const bornAt = value.bornAt;
  const age = value.age;
  const maxAge = MAX_SIMULATION_DAYS;
  if (
    typeof bornAt !== "number" ||
    !Number.isSafeInteger(bornAt) ||
    bornAt < 0
  ) {
    invalid("the birth time must be a nonnegative, safe integer timestamp.");
  }
  if (
    typeof age !== "number" ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > maxAge
  ) {
    invalid(`the age must be a number between 0 and ${maxAge}.`);
  }
  const parts = validatedParts(value.parts);
  let needTimeline: NeedKeyframe[];
  try {
    needTimeline = normalizeNeedTimeline(value.needTimeline);
  } catch (error) {
    return invalid(
      error instanceof Error ? error.message : "the need timeline is invalid.",
    );
  }
  const groomingTimeline =
    "groomingTimeline" in value
      ? validatedGrooming(value.groomingTimeline)
      : undefined;
  let life: LivingPet | undefined;
  if ("life" in value) {
    const saved = value.life;
    if (
      !isRecord(saved) ||
      !hasOnlyKeys(saved, [
        "lineageVersion",
        "anatomicalClock",
        "anatomicalCheckpoint",
        "parts",
        "mode",
        "seed",
        "name",
        "game",
        "groomingTimeline",
      ])
    )
      return invalid("the living pet contains unrecognized fields.");
    if (saved.lineageVersion !== LINEAGE_RECIPE_VERSION)
      return invalid(
        "the animal dataset or lineage rules version is not supported.",
      );
    if (saved.mode !== "egg" && saved.mode !== "infant")
      return invalid("the living pet must begin as infant or egg.");
    try {
      life = {
        lineageVersion: LINEAGE_RECIPE_VERSION,
        ...(saved.anatomicalClock===undefined?{}:saved.anatomicalClock==="daily-365-v1"?
          {anatomicalClock:"daily-365-v1" as const}:invalid("unsupported anatomical clock")),
        ...(saved.anatomicalCheckpoint===undefined?{}:{anatomicalCheckpoint:saved.anatomicalCheckpoint}),
        parts: validatedParts(saved.parts),
        mode: saved.mode,
        seed: boundedText(saved.seed, "The living seed", 128),
        name: boundedText(saved.name, "The living name", 60),
        game: validateGameState(saved.game),
        groomingTimeline: validatedGrooming(saved.groomingTimeline),
      };
      if (life.game.seed !== life.seed || life.game.mode !== life.mode)
        return invalid(
          "the living game must match its committed source seed and beginning.",
        );
    } catch (error) {
      return invalid(
        error instanceof Error ? error.message : "the living game is invalid.",
      );
    }
  }
  return {
    version: 8,
    algorithmVersion: 7,
    revision: PROTOTYPE_REVISION,
    mode: value.mode,
    name,
    seed,
    parts,
    needTimeline,
    ...(groomingTimeline === undefined ? {} : { groomingTimeline }),
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
    bornAt,
    age,
    ...(life ? { life } : {}),
  };
}

function utf8Bytes(text: string): number {
  // Native encoding avoids a multi-megabyte JavaScript character loop when
  // saving a fully recorded year. Hermes without TextEncoder uses the same
  // Unicode-code-point count below.
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).byteLength;
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function enforceSize(raw: string): void {
  if (raw.length > MAX_SHARE_BYTES || utf8Bytes(raw) > MAX_SHARE_BYTES) {
    invalid("the file is too large; pet files must be at most 16 MB.");
  }
}

/** Validate and serialize without changing anatomy, pixel order, or colors. */
export function encodePet(pet: PetDocument): string {
  const raw = JSON.stringify(validatedPet(pet));
  enforceSize(raw);
  return raw;
}

/** Read a validated document. Unsupported versions are preserved by storage. */
export function decodePet(raw: string): PetDocument {
  if (typeof raw !== "string") invalid("the file must contain JSON text.");
  enforceSize(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid(
      "the text is not valid JSON. Paste the complete exported pet.",
    );
  }
  return validatedPet(parsed);
}

/** Plain JSON is easy to copy, inspect, and import on another phone. */
export function shareCode(pet: PetDocument): string {
  return encodePet(pet);
}
