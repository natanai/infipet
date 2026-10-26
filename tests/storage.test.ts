import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  decodePet,
  encodePet,
  shareCode,
  PROTOTYPE_REVISION,
  type PetDocument,
} from "../src/pet-format";
import { PART_KINDS, type PetPart } from "../src/simulation";
import {
  MAX_NEED_TICK,
  MAX_SIMULATION_DAYS,
  NEEDS_CATALOG_VERSION,
  NEEDS_RULES_VERSION,
} from "../src/needs";
import {
  normalizeGroomTimeline,
  type GroomStroke,
} from "../src/simulation/grooming";

const body: PetPart = {
  id: "body",
  kind: "body",
  name: "Body",
  pixels: [{ x: 12, y: 12, color: "#aAbB77", z: 0 }],
  position: { x: 0, y: 0 },
  parentId: null,
};
const hand: PetPart = {
  ...body,
  id: "hand",
  kind: "hand",
  name: "Hand",
  pixels: [{ x: 1, y: 1, color: "#CC2211", z: 55 }],
  parentId: "body",
  layer: 100,
};
const pet: PetDocument = {
  version: 8,
  algorithmVersion: 7,
  revision: PROTOTYPE_REVISION,
  mode: "infant",
  name: "Mochi",
  seed: "possibility",
  parts: [body, hand],
  needTimeline: [
    { needId: "safety", tick: 0, fulfillment: 0.25 },
    { needId: "rest", tick: 720, fulfillment: 1 },
  ],
  catalogVersion: NEEDS_CATALOG_VERSION,
  needsRulesVersion: NEEDS_RULES_VERSION,
  bornAt: 123456,
  age: 27.5,
};
const read = (value: unknown) => decodePet(JSON.stringify(value));

test("current infant and egg codes preserve source anatomy, hidden paint, metadata, and mode", () => {
  for (const mode of ["infant", "egg"] as const) {
    const document = { ...pet, mode };
    assert.deepEqual(decodePet(shareCode(document)), document);
    assert.equal(encodePet(read(document)), encodePet(document));
  }
  const hair: PetPart = {
    ...body,
    id: "hair",
    kind: "hair",
    parentId: body.id,
    pixels: [{ x: 12, y: 12, color: "#112233", z: 99 }],
  };
  const document = { ...pet, parts: [body, hair] };
  assert.deepEqual(read(document), document);
  assert.equal(read(document).parts[0].pixels[0].color, "#aAbB77");
});

test("old and unknown prototype codes are rejected instead of migrated", () => {
  for (const version of [1, 2, 3, 4, 5, 6, 7, 9])
    assert.throws(() => read({ ...pet, version }), /different prototype/);
  assert.throws(
    () => read({ ...pet, algorithmVersion: 3 }),
    /growth algorithm/,
  );
  assert.throws(
    () => read({ ...pet, revision: "life-v3" }),
    /prototype revision/,
  );
  for (const mode of ["adult", "", null, undefined])
    assert.throws(() => read({ ...pet, mode }), /infant or egg/);
});

test("chronological age extends past the initial preview window within numeric safety", () => {
  for (const mode of ["infant", "egg"] as const)
    for (const age of [240, 250, 365, 3650, 1_000_000, MAX_SIMULATION_DAYS])
      assert.equal(read({ ...pet, mode, age }).age, age);
  for (const age of [-1, NaN, Infinity, MAX_SIMULATION_DAYS + 1])
    assert.throws(() => read({ ...pet, age }), /age must be a number between/);
});

test("all fifteen types, detached parts, and empty drawings remain legal", () => {
  assert.equal(PART_KINDS.length, 15);
  const parts = PART_KINDS.map((kind) => ({
    ...body,
    id: kind,
    name: kind,
    kind,
  }));
  assert.deepEqual(read({ ...pet, parts }).parts, parts);
  assert.deepEqual(read({ ...pet, parts: [] }).parts, []);
  assert.deepEqual(
    read({ ...pet, parts: [{ ...body, pixels: [] }] }).parts[0].pixels,
    [],
  );
});

test("rejects duplicate IDs, invalid kinds, missing parents, and cycles", () => {
  for (const parts of [
    [body, body],
    [{ ...body, kind: "alien" }],
    [{ ...body, parentId: "missing" }],
    [{ ...body, parentId: "body" }],
    [{ ...body, parentId: "hand" }, hand],
  ]) {
    assert.throws(() => read({ ...pet, parts }), /Cannot open this pet/);
  }
});

test("source coordinates and colors are strict while layer overlap survives", () => {
  for (const pixel of [
    { x: -1, y: 0, color: "#112233" },
    { x: 32, y: 0, color: "#112233" },
    { x: 0.5, y: 0, color: "#112233" },
    { x: 0, y: 0, color: "red" },
    { x: 0, y: 0, color: "#123456;display:none" },
  ]) {
    assert.throws(
      () => read({ ...pet, parts: [{ ...body, pixels: [pixel] }] }),
      /Cannot open this pet/,
    );
  }
  assert.throws(
    () =>
      read({
        ...pet,
        parts: [{ ...body, pixels: [body.pixels[0], body.pixels[0]] }],
      }),
    /overlaps/,
  );
  assert.throws(
    () => read({ ...pet, parts: [{ ...body, position: { x: 31, y: 0 } }] }),
    /outside/,
  );
  const edge = { ...body, pixels: [{ x: 31, y: 31, color: "#112233" }] };
  assert.deepEqual(read({ ...pet, parts: [edge] }).parts, [edge]);
});

test("paint depth, fallback layers, metadata, and unknown fields remain validated", () => {
  for (const value of [-1, 0.1, 1_000_000_001, NaN, Infinity, "1", null]) {
    assert.throws(
      () => read({ ...pet, parts: [{ ...body, layer: value }] }),
      /integer from/,
    );
    assert.throws(
      () =>
        read({
          ...pet,
          parts: [{ ...body, pixels: [{ ...body.pixels[0], z: value }] }],
        }),
      /integer from/,
    );
  }
  for (const bad of [
    { ...pet, name: "" },
    { ...pet, seed: "x".repeat(129) },
    { ...pet, name: "a\nb" },
    { ...pet, bornAt: -1 },
    { ...pet, bornAt: 0.5 },
    { ...pet, age: Infinity },
    { ...pet, age: -1 },
    { ...pet, age: MAX_SIMULATION_DAYS + 1 },
  ]) {
    assert.throws(() => encodePet(bad), /Cannot open this pet/);
  }
  assert.throws(() => read({ ...pet, extra: true }), /unrecognized/);
  assert.throws(
    () => read({ ...pet, parts: [{ ...body, extra: true }] }),
    /only/,
  );
});

test("full fifteen-type masks and 1024 sparse regions fit the source budget", () => {
  const pixels = Array.from({ length: 1024 }, (_, i) => ({
    x: i % 32,
    y: Math.floor(i / 32),
    color: "#aBcDeF",
    z: 1_000_000_000,
  }));
  const parts = PART_KINDS.map((kind) => ({
    ...body,
    id: kind,
    kind,
    pixels,
    layer: 1_000_000_000,
  }));
  assert.deepEqual(read({ ...pet, parts }).parts, parts);
  assert.throws(
    () => read({ ...pet, parts: [...parts, { ...body, id: "overflow" }] }),
    /source-pixel budget/,
  );
  const sparse = Array.from({ length: 1024 }, (_, i) => ({
    ...body,
    id: `sparse-${i}`,
    pixels: [{ x: i % 32, y: Math.floor(i / 32), color: "#112233" }],
  }));
  assert.deepEqual(read({ ...pet, parts: sparse }).parts, sparse);
  assert.throws(
    () => read({ ...pet, parts: [...sparse, { ...body, id: "overflow" }] }),
    /1024 parts/,
  );
  assert.throws(
    () =>
      read({
        ...pet,
        parts: [{ ...body, pixels: Array(1025).fill(body.pixels[0]) }],
      }),
    /1024 pixels/,
  );
});

test("malformed and oversized codes are rejected before import", () => {
  for (const raw of ["{", "[]", "null", "{}", " ".repeat(16_777_217)])
    assert.throws(() => decodePet(raw), /Cannot open this pet/);
  assert.throws(() => decodePet("🦖".repeat(4_194_305)), /16 MB/);
});

test("care history roundtrips with pinned rules and catalog, including future edits", () => {
  const timeline = [
    { needId: "safety", tick: 5760, fulfillment: 1 },
    { needId: "trust", tick: 24, fulfillment: 0 },
    { needId: "safety", tick: 0, fulfillment: 0.1 },
    { needId: "safety", tick: 0, fulfillment: 0.2 },
  ];
  const result = read({ ...pet, needTimeline: timeline });
  assert.deepEqual(result.needTimeline, [
    timeline[3],
    timeline[1],
    timeline[0],
  ]);
  assert.equal(result.catalogVersion, NEEDS_CATALOG_VERSION);
  assert.equal(result.needsRulesVersion, 2);
  assert.throws(
    () => read({ ...pet, catalogVersion: "latest" }),
    /catalog version/,
  );
  for (const needsRulesVersion of [1, 3])
    assert.throws(() => read({ ...pet, needsRulesVersion }), /rules version/);
  for (const needTimeline of [
    undefined,
    null,
    [{ needId: "fitness", tick: 0, fulfillment: 1 }],
    [{ needId: "rest", tick: 0.5, fulfillment: 1 }],
    [{ needId: "rest", tick: MAX_NEED_TICK + 1, fulfillment: 1 }],
    [{ needId: "rest", tick: 0, fulfillment: -0.1 }],
    [{ needId: "rest", tick: 0, fulfillment: 1.1 }],
    [{ needId: "rest", tick: 0, fulfillment: null }],
    [{ needId: "rest", tick: 0, fulfillment: 1, hidden: true }],
    Array.from({ length: 8193 }, () => ({
      needId: "rest",
      tick: 0,
      fulfillment: 1,
    })),
  ])
    assert.throws(() => read({ ...pet, needTimeline }), /Cannot open this pet/);
});

const groomStroke = (overrides: Partial<GroomStroke> = {}): GroomStroke => ({
  id: "groom-a",
  sourceId: "body",
  tick: 365 * 24,
  materialAnchor: { x: 28.25, y: 27.5 },
  direction: { x: 3, y: 4 },
  strength: 0.75,
  ...overrides,
});

test("grooming records share and reload in canonical source coordinates without changing care", () => {
  const timeline = [
    groomStroke(),
    groomStroke({
      id: "future",
      sourceId: "removed-source",
      tick: 1_000_000 * 24,
      materialAnchor: { x: 63, y: 0 },
      direction: { x: -1, y: 0 },
      strength: 0.5,
    }),
  ];
  const sourceBefore = structuredClone(pet.parts),
    careBefore = structuredClone(pet.needTimeline);
  const encoded = shareCode({ ...pet, groomingTimeline: timeline });
  const document = decodePet(encoded);
  assert.deepEqual(document.groomingTimeline, normalizeGroomTimeline(timeline));
  assert.deepEqual(document.parts, sourceBefore);
  assert.deepEqual(document.needTimeline, careBefore);
  assert.equal(document.seed, pet.seed);
  for (const stroke of document.groomingTimeline!)
    assert.ok(
      Math.abs(Math.hypot(stroke.direction.x, stroke.direction.y) - 1) < 1e-8,
      "canonical nine-decimal direction remains a unit vector to its declared precision",
    );
  assert.equal(
    encodePet(document),
    encoded,
    "canonical grooming encoding is stable on reload",
  );
  const rerolledAndRewound = decodePet(
    shareCode({ ...document, seed: "another-genome", age: 0 }),
  );
  assert.deepEqual(
    rerolledAndRewound.groomingTimeline,
    document.groomingTimeline,
  );
  assert.equal(
    rerolledAndRewound.groomingTimeline!.at(-1)!.sourceId,
    "removed-source",
    "source edits may leave dormant history",
  );
  assert.deepEqual(read({ ...pet, groomingTimeline: [] }).groomingTimeline, []);
  assert.equal(
    read(pet).groomingTimeline,
    undefined,
    "the optional field can be absent; new app documents initialize it to[]",
  );
});

test("grooming validation rejects malformed material commands rather than silently dropping them", () => {
  const invalidStrokes: unknown[] = [
    { ...groomStroke(), tick: -1 },
    { ...groomStroke(), tick: 0.5 },
    { ...groomStroke(), tick: MAX_NEED_TICK + 1 },
    { ...groomStroke(), tick: "1" },
    { ...groomStroke(), sourceId: "" },
    { ...groomStroke(), sourceId: "x".repeat(65) },
    { ...groomStroke(), id: "" },
    { ...groomStroke(), id: "x".repeat(129) },
    { ...groomStroke(), materialAnchor: { x: -1, y: 1 } },
    { ...groomStroke(), materialAnchor: { x: 64, y: 1 } },
    { ...groomStroke(), materialAnchor: { x: NaN, y: 1 } },
    { ...groomStroke(), materialAnchor: { x: 1, y: 1, z: 2 } },
    { ...groomStroke(), direction: { x: 0, y: 0 } },
    { ...groomStroke(), direction: { x: Infinity, y: 1 } },
    { ...groomStroke(), direction: { x: 1, y: 1, z: 2 } },
    { ...groomStroke(), strength: 0 },
    { ...groomStroke(), strength: -1 },
    { ...groomStroke(), strength: 1.1 },
    { ...groomStroke(), strength: NaN },
    { ...groomStroke(), ignored: true },
  ];
  for (const stroke of invalidStrokes)
    assert.throws(
      () => read({ ...pet, groomingTimeline: [stroke] }),
      /Cannot open this pet/,
    );
  for (const groomingTimeline of [null, {}, "", [null]])
    assert.throws(
      () => read({ ...pet, groomingTimeline }),
      /Cannot open this pet/,
    );
  assert.throws(
    () =>
      read({
        ...pet,
        groomingTimeline: [groomStroke(), groomStroke({ tick: 9000 })],
      }),
    /duplicate gesture ID/,
  );
  assert.throws(
    () =>
      read({
        ...pet,
        groomingTimeline: [
          groomStroke(),
          groomStroke({ id: "different-id", direction: { x: 6, y: 8 } }),
        ],
      }),
    /same material gesture/,
  );
  const valid = [
    groomStroke(),
    groomStroke({ id: "different-place", materialAnchor: { x: 29, y: 28 } }),
  ];
  assert.equal(
    read({ ...pet, groomingTimeline: valid }).groomingTimeline!.length,
    2,
  );
});

test("off-axis grooming directions do not drift across repeated exports and reloads", () => {
  const angle = (149 * Math.PI * 2) / 10000;
  const timeline = [
    groomStroke({ direction: { x: Math.cos(angle), y: Math.sin(angle) } }),
  ];
  const canonical = normalizeGroomTimeline(timeline);
  assert.deepEqual(
    normalizeGroomTimeline(canonical),
    canonical,
    "backend normalization must be idempotent before persistence",
  );
  let document = read({ ...pet, groomingTimeline: timeline });
  for (let i = 0; i < 4; i++) {
    document = decodePet(encodePet(document));
    assert.deepEqual(
      document.groomingTimeline,
      canonical,
      "reloading cannot change the material direction previously simulated",
    );
  }
});

test("grooming has an8192-command budget, safe-hour timestamps, and deterministic input ordering", () => {
  const timeline = Array.from({ length: 8192 }, (_, i) =>
    groomStroke({
      id: undefined,
      tick: i,
      materialAnchor: { x: i % 64, y: Math.floor(i / 64) % 64 },
      direction: { x: 1, y: 0 },
      strength: 0.1,
    }),
  );
  const document = read({ ...pet, groomingTimeline: timeline });
  assert.equal(document.groomingTimeline!.length, 8192);
  assert.throws(
    () =>
      read({
        ...pet,
        groomingTimeline: [...timeline, groomStroke({ tick: 8192 })],
      }),
    /at most 8192/,
  );
  const boundary = read({
    ...pet,
    groomingTimeline: [groomStroke({ tick: MAX_NEED_TICK })],
  });
  assert.equal(boundary.groomingTimeline![0].tick, MAX_NEED_TICK);
  const small = [
    groomStroke(),
    groomStroke({ id: "unicode", sourceId: "🐾", tick: 100 }),
  ];
  assert.equal(
    encodePet(read({ ...pet, groomingTimeline: small })),
    encodePet(read({ ...pet, groomingTimeline: [...small].reverse() })),
  );
});

test("revision resets, same-revision reloads, and storage failures obey the disposable snapshot contract", async (context) => {
  const require = createRequire(`${process.cwd()}/tests/storage.test.ts`);
  const path = require.resolve("@react-native-async-storage/async-storage");
  const original = require.cache[path];
  const records = new Map<string, string>();
  const failedReads = new Set<string>();
  let failRemove = false,
    failSave = false,
    failInventory = false;
  const fake = {
    getItem: async (key: string) => {
      if (failedReads.has(key)) throw new Error("read unavailable");
      return records.get(key) ?? null;
    },
    getAllKeys: async () => {
      if (failInventory) throw new Error("inventory unavailable");
      return [...records.keys()];
    },
    multiRemove: async (keys: string[]) => {
      if (failRemove) throw new Error("reset unavailable");
      keys.forEach((key) => records.delete(key));
    },
    setItem: async (key: string, value: string) => {
      if (failSave) throw new Error("save unavailable");
      records.set(key, value);
    },
  };
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: { __esModule: true, default: fake },
  } as NodeModule;
  try {
    const storage = await import("../src/storage");
    await context.test(
      "a revision mismatch clears only owned keys and starts empty",
      async () => {
        records.set("infipet.revision", "life-v3");
        records.set("infipet.pet.v3", "old");
        records.set("infipet.draft.v1", "old draft");
        records.set("other.settings", "keep");
        assert.equal(await storage.loadEditablePet(), null);
        assert.deepEqual([...records.entries()].sort(), [
          ["infipet.revision", PROTOTYPE_REVISION],
          ["other.settings", "keep"],
        ]);
      },
    );
    await context.test(
      "same-revision saves reload exactly and ignore obsolete draft records",
      async () => {
        await storage.savePet(pet);
        records.set("infipet.draft.v3", "stale");
        assert.deepEqual(await storage.loadEditablePet(), pet);
        assert.equal(records.get("infipet.draft.v3"), "stale");
        assert.equal(storage.PROTOTYPE_REVISION, PROTOTYPE_REVISION);
      },
    );
    await context.test(
      "same-revision grooming snapshots retain past and future material commands",
      async () => {
        const document = {
          ...pet,
          groomingTimeline: normalizeGroomTimeline([
            groomStroke({ tick: 0 }),
            groomStroke({ id: "future-groom", tick: 3650 * 24 }),
          ]),
        };
        await storage.savePet(document);
        assert.deepEqual(await storage.loadEditablePet(), document);
        await storage.savePet({ ...document, age: 0, seed: "rerolled" });
        const reloaded = await storage.loadEditablePet();
        assert.deepEqual(reloaded?.groomingTimeline, document.groomingTimeline);
        assert.deepEqual(reloaded?.needTimeline, document.needTimeline);
        await storage.savePet(pet);
      },
    );
    await context.test(
      "read errors and corrupt current snapshots never trigger reset or overwrite",
      async () => {
        const raw = records.get("infipet.pet")!;
        failedReads.add("infipet.pet");
        await assert.rejects(storage.loadEditablePet(), /read unavailable/);
        failedReads.clear();
        assert.equal(records.get("infipet.pet"), raw);
        failedReads.add("infipet.revision");
        await assert.rejects(storage.loadEditablePet(), /read unavailable/);
        failedReads.clear();
        assert.equal(records.get("infipet.pet"), raw);
        records.set("infipet.pet", "invalid");
        await assert.rejects(storage.loadEditablePet(), /not valid JSON/);
        assert.equal(records.get("infipet.pet"), "invalid");
        records.set("infipet.pet", raw);
      },
    );
    await context.test(
      "failed saves preserve the current snapshot and the queue recovers",
      async () => {
        const raw = records.get("infipet.pet");
        failSave = true;
        await assert.rejects(
          storage.savePet({ ...pet, age: 50 }),
          /save unavailable/,
        );
        assert.equal(records.get("infipet.pet"), raw);
        failSave = false;
        await storage.savePet({ ...pet, age: 50 });
        assert.equal((await storage.loadEditablePet())?.age, 50);
      },
    );
    await context.test(
      "failed reset inventory/removal does not mark the new revision complete",
      async () => {
        records.set("infipet.revision", "older");
        const before = new Map(records);
        failInventory = true;
        await assert.rejects(
          storage.loadEditablePet(),
          /inventory unavailable/,
        );
        assert.deepEqual(records, before);
        failInventory = false;
        failRemove = true;
        await assert.rejects(storage.loadEditablePet(), /reset unavailable/);
        assert.deepEqual(records, before);
        failRemove = false;
      },
    );
    await context.test(
      "concurrent reset and save finish with the fresh pet, never a late reset",
      async () => {
        const [loaded] = await Promise.all([
          storage.loadEditablePet(),
          storage.savePet(pet),
        ]);
        assert.equal(loaded, null);
        assert.deepEqual(await storage.loadEditablePet(), pet);
        assert.equal(records.get("other.settings"), "keep");
      },
    );
    await context.test(
      "invalid saves are rejected before revision disposal",
      async () => {
        records.set("infipet.revision", "older");
        const before = new Map(records);
        await assert.rejects(
          storage.savePet({ ...pet, name: "" }),
          /Cannot open this pet/,
        );
        assert.deepEqual(records, before);
      },
    );
  } finally {
    if (original) require.cache[path] = original;
    else delete require.cache[path];
  }
});
