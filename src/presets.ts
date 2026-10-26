import type { PartKind, PetPart } from "./simulation";

export type StarterPreset = { id: string; name: string; parts: PetPart[] };
/** Temporary source-level name for existing creation-flow consumers. */
export type HouseholdPreset = StarterPreset;
const WHITE = "#FFFFFF",
  BLACK = "#000000";

// Original LCD infants only. Every cluster is ordinary editable shared-canvas ink.
function drawing() {
  const parts: PetPart[] = [];
  const add = (
    id: string,
    kind: PartKind,
    x: number,
    y: number,
    rows: string[],
    color = WHITE,
    parentId: string | null = "body",
  ) => {
    parts.push({
      id,
      kind,
      name: id
        .split("-")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" "),
      position: { x, y },
      parentId,
      layer: parts.length,
      pixels: rows.flatMap((row, py) =>
        [...row].flatMap((ink, px) =>
          ink === "." ? [] : [{ x: px, y: py, color }],
        ),
      ),
    });
  };
  return { parts, add };
}
function bean() {
  const { parts, add } = drawing();
  add(
    "body",
    "body",
    9,
    11,
    [
      "....aaaaaa....",
      "..aaaaaaaaaa..",
      ".aaaaaaaaaaaa.",
      "aaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaa",
      ".aaaaaaaaaaaa.",
      "..aaaaaaaaaa..",
      "....aaaaaa....",
    ],
    WHITE,
    null,
  );
  add("eye-left", "eye", 13, 14, ["a", "a"], BLACK);
  add("eye-right", "eye", 18, 14, ["a", "a"], BLACK);
  add("mouth", "mouth", 15, 18, ["a.a", ".a."], BLACK);
  add("cheek-left", "decoration", 11, 17, ["aa"], BLACK);
  add("cheek-right", "decoration", 20, 17, ["aa"], BLACK);
  return parts;
}
function sprout() {
  const { parts, add } = drawing();
  add(
    "body",
    "body",
    12,
    16,
    [".aaaaaa.", "aaaaaaaa", "aaaaaaaa", "aaaaaaaa", ".aaaaaa.", "..aaaa.."],
    WHITE,
    null,
  );
  add(
    "head",
    "head",
    10,
    9,
    [
      "..aaaaaaaa..",
      ".aaaaaaaaaa.",
      "aaaaaaaaaaaa",
      "aaaaaaaaaaaa",
      "aaaaaaaaaaaa",
      ".aaaaaaaaaa.",
      "..aaaaaaaa..",
    ],
    WHITE,
  );
  add(
    "hair-left",
    "hair",
    13,
    5,
    ["a...", "aa..", ".aa.", "..aa"],
    WHITE,
    "head",
  );
  add(
    "hair-right",
    "hair",
    16,
    5,
    ["...a", "..aa", ".aa.", "aa.."],
    WHITE,
    "head",
  );
  add("arm-left", "arm", 9, 17, ["aa", "aa", "a."], WHITE);
  add("arm-right", "arm", 21, 17, ["aa", "aa", ".a"], WHITE);
  add("leg-left", "leg", 12, 21, ["aa", "aa", "aa"], WHITE);
  add("leg-right", "leg", 18, 21, ["aa", "aa", "aa"], WHITE);
  add("foot-left", "foot", 10, 24, ["aaaa"], WHITE, "leg-left");
  add("foot-right", "foot", 18, 24, ["aaaa"], WHITE, "leg-right");
  add("eye-left", "eye", 13, 12, ["a", "a"], BLACK, "head");
  add("eye-right", "eye", 18, 12, ["a", "a"], BLACK, "head");
  add("mouth", "mouth", 15, 15, ["aa"], BLACK, "head");
  return parts;
}
function canineCub() {
  const { parts, add } = drawing();
  add(
    "tail",
    "tail",
    3,
    12,
    ["aa.....", ".aa....", "..aa...", "...aa..", "....aaa"],
    WHITE,
  );
  add("leg-hind-right", "leg", 13, 19, ["aa", "aa", "aa", "aa", "aa"], WHITE);
  add("foot-hind-right", "foot", 13, 24, ["aaa"], WHITE, "leg-hind-right");
  add("leg-fore-right", "leg", 24, 19, ["aa", "aa", "aa", "aa", "aa"], WHITE);
  add("foot-fore-right", "foot", 24, 24, ["aaa"], WHITE, "leg-fore-right");
  add(
    "body",
    "body",
    8,
    14,
    [
      "...aaaaaaaaaaa...",
      ".aaaaaaaaaaaaaaa.",
      "aaaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaaa",
      ".aaaaaaaaaaaaaaa.",
      "...aaaaaaaaaaa...",
    ],
    WHITE,
    null,
  );
  add(
    "head",
    "head",
    21,
    10,
    [
      "..aaaaa..",
      ".aaaaaaa.",
      "aaaaaaaaa",
      "aaaaaaaaa",
      "aaaaaaaaa",
      ".aaaaaaaa",
      "..aaaaaa.",
    ],
    WHITE,
  );
  add("ear-left", "ear", 22, 7, ["a..", "aa.", "aaa", "aaa"], WHITE, "head");
  add("ear-right", "ear", 27, 7, ["..a", ".aa", "aaa", "aaa"], WHITE, "head");
  add(
    "leg-hind-left",
    "leg",
    9,
    19,
    ["aa", "aa", "aa", "aa", "aa", "aa"],
    WHITE,
  );
  add("foot-hind-left", "foot", 8, 25, ["aaaa"], WHITE, "leg-hind-left");
  add(
    "leg-fore-left",
    "leg",
    20,
    19,
    ["aa", "aa", "aa", "aa", "aa", "aa"],
    WHITE,
  );
  add("foot-fore-left", "foot", 20, 25, ["aaaa"], WHITE, "leg-fore-left");
  add("eye-left", "eye", 24, 12, ["a", "a"], BLACK, "head");
  add("eye-right", "eye", 28, 12, ["a"], BLACK, "head");
  add("nose", "decoration", 28, 15, ["aa"], BLACK, "head");
  add("mouth", "mouth", 26, 16, ["aa"], BLACK, "head");
  add("flank-mark", "decoration", 12, 16, ["aaa", ".aa"], BLACK);
  return parts;
}
function ribbon() {
  const { parts, add } = drawing();
  add(
    "body",
    "body",
    7,
    14,
    [
      "....aaaaaaaa.....",
      "..aaaaaaaaaaaa...",
      ".aaaa......aaaa..",
      "aaaa........aaaa.",
      "aaa..........aaa.",
      "aaa...aaaa...aaa.",
      "aaaa..aaaa..aaaa.",
      ".aaaa......aaaa..",
      "..aaaaaaaaaaaa...",
      "....aaaaaaaa.....",
    ],
    WHITE,
    null,
  );
  add(
    "tail",
    "tail",
    4,
    19,
    ["aaaa...", ".aaaa..", "..aaaa.", "...aaaa"],
    WHITE,
  );
  add(
    "head",
    "head",
    18,
    8,
    [
      "..aaaaaa..",
      ".aaaaaaaa.",
      "aaaaaaaaaa",
      "aaaaaaaaaa",
      "aaaaaaaaaa",
      ".aaaaaaaa.",
      "..aaaaaa..",
    ],
    WHITE,
  );
  add("horn-left", "horn", 19, 5, ["a.", "aa", "aa"], WHITE, "head");
  add("horn-right", "horn", 25, 5, [".a", "aa", "aa"], WHITE, "head");
  add("eye-left", "eye", 20, 10, ["a", "a"], BLACK, "head");
  add("eye-right", "eye", 25, 10, ["a", "a"], BLACK, "head");
  add("mouth", "mouth", 22, 13, ["aaa"], BLACK, "head");
  add("band-left", "decoration", 8, 18, ["aa", "aa"], BLACK);
  add("band-right", "decoration", 21, 19, ["aa", "aa"], BLACK);
  return parts;
}
function beetle() {
  const { parts, add } = drawing();
  for (let i = 0; i < 3; i++) {
    const y = 15 + i * 3;
    add(`leg-left-${i}`, "leg", 6, y, [".aaaa", "aaa.."], WHITE);
    add(`foot-left-${i}`, "foot", 5, y + 1, ["aa"], WHITE, `leg-left-${i}`);
    add(`leg-right-${i}`, "leg", 22, y, ["aaaa.", "..aaa"], WHITE);
    add(`foot-right-${i}`, "foot", 25, y + 1, ["aa"], WHITE, `leg-right-${i}`);
  }
  add(
    "body",
    "body",
    10,
    13,
    [
      "....aaaa....",
      "..aaaaaaaa..",
      ".aaaaaaaaaa.",
      "aaaaaaaaaaaa",
      "aaaaaaaaaaaa",
      "aaaaaaaaaaaa",
      "aaaaaaaaaaaa",
      ".aaaaaaaaaa.",
      "..aaaaaaaa..",
      "....aaaa....",
    ],
    WHITE,
    null,
  );
  add(
    "head",
    "head",
    12,
    8,
    [".aaaaaa.", "aaaaaaaa", "aaaaaaaa", "aaaaaaaa", ".aaaaaa."],
    WHITE,
  );
  add(
    "horn-left",
    "horn",
    10,
    4,
    ["a...", "aa..", ".aa.", "..aa"],
    WHITE,
    "head",
  );
  add(
    "horn-right",
    "horn",
    18,
    4,
    ["...a", "..aa", ".aa.", "aa.."],
    WHITE,
    "head",
  );
  add("eye-left", "eye", 13, 10, ["a"], BLACK, "head");
  add("eye-right", "eye", 18, 10, ["a"], BLACK, "head");
  add("mouth", "mouth", 15, 12, ["aa"], BLACK, "head");
  add(
    "carapace-seam",
    "decoration",
    15,
    14,
    ["a", "a", "a", "a", "a", "a", "a", "a"],
    BLACK,
  );
  add("carapace-band", "decoration", 11, 18, ["aaaaaaaaaa"], BLACK);
  return parts;
}
function wisp() {
  const { parts, add } = drawing();
  add(
    "body",
    "body",
    10,
    8,
    [
      ".....aa.....",
      "...aa..aa...",
      "..a......a..",
      ".a........a.",
      "a..........a",
      "a..........a",
      "a..........a",
      "a..........a",
      "a..........a",
      ".a........a.",
      ".a........a.",
      "..a.a..a.a..",
      "...a.aa.a...",
    ],
    WHITE,
    null,
  );
  add("eye-left", "eye", 13, 12, ["a", "a"], WHITE);
  add("eye-right", "eye", 18, 12, ["a", "a"], WHITE);
  add("mouth", "mouth", 15, 16, ["aa"], WHITE);
  add("hand-left", "hand", 4, 14, [".aa", "aaa", ".aa"], WHITE);
  add("hand-right", "hand", 25, 14, ["aa.", "aaa", "aa."], WHITE);
  add("halo", "decoration", 13, 4, ["aaaaaa"], WHITE);
  return parts;
}

/** Frozen authored sources; clonePreset creates independently editable copies. */
export const STARTER_PRESETS: readonly StarterPreset[] = [
  { id: "bean", name: "Bean", parts: bean() },
  { id: "sprout", name: "Sprout", parts: sprout() },
  { id: "canine-cub", name: "Cub", parts: canineCub() },
  { id: "ribbon", name: "Ribbon", parts: ribbon() },
  { id: "beetle", name: "Beetle", parts: beetle() },
  { id: "wisp", name: "Wisp", parts: wisp() },
];
for (const preset of STARTER_PRESETS) {
  for (const part of preset.parts) {
    part.pixels.forEach(Object.freeze);
    Object.freeze(part.pixels);
    Object.freeze(part.position);
    Object.freeze(part);
  }
  Object.freeze(preset.parts);
  Object.freeze(preset);
}
Object.freeze(STARTER_PRESETS);
export const HOUSEHOLD_PRESETS = STARTER_PRESETS;
export function clonePreset(id: string): PetPart[] {
  const preset = STARTER_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new RangeError(`Unknown starter preset: ${id}`);
  return preset.parts.map((part) => ({
    ...part,
    position: { ...part.position },
    pixels: part.pixels.map((pixel) => ({ ...pixel })),
  }));
}
