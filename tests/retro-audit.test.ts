import test from "node:test";
import assert from "node:assert/strict";
import {
  compareBitmaps,
  meetsNearExactGate,
  validateBitmap,
  pixelsToBitmap,
  bitmapTopology,
  compareRelativeDimensions,
} from "../tools/retro-audit/metrics";
import {
  buildPolicyWitness,
  replayWitness,
  validateWitness,
  sourceBirthExact,
  exactBirthPixelsMatch,
  witnessGameState,
  visibleFeatureContrast,
  validFaceTransport,
} from "../tools/retro-audit/engine";
import { scoreLifecycle } from "../tools/retro-audit/score";
import { cohortSeed, searchCase } from "../tools/retro-audit/search";
import { enumeratePaths, casesFromCatalog } from "../tools/retro-audit/catalog";
import {
  RETRO_AUDIT_SCHEDULE,
  diagnosticSchedule,
} from "../tools/retro-audit/schedule";
import { listNativeP1HistoryRoutes } from "../src/gameplay/native-p1";
import { searchStaged } from "../tools/retro-audit/staged";
import type {
  MonoBitmap,
  RetroCheckpoint,
  RetroSource,
  RetroCase,
  RetroCatalog,
} from "../tools/retro-audit/types";
import { replayGameRecipe, validateReplayRecipe } from "../src/retro/replay";
import { lifetimeEvidence } from "../tools/retro-audit/lifetime";
import {
  witnessPetDocument,
  rebaseWitnessClock,
} from "../tools/retro-audit/portable";

const source: RetroSource = {
  id: "plain-test-ink",
  mode: "infant",
  parts: [
    {
      id: "body",
      kind: "body",
      name: "Body",
      parentId: null,
      position: { x: 10, y: 10 },
      pixels: Array.from({ length: 36 }, (_, i) => ({
        x: i % 6,
        y: Math.floor(i / 6),
        color: "#FFFFFF",
      })),
    },
  ],
};
const point = (
  id: string,
  hour: number,
  stage: RetroCheckpoint["expectedStage"],
): RetroCheckpoint => ({
  id,
  characterId: id,
  name: id,
  atHour: hour,
  expectedStage: stage,
  referenceStatus: "observed",
  referenceTiming: "combined-clock-adaptation",
  careEvidence: "documented",
  animationTime: 0,
});
const mask = (rows: string[]): MonoBitmap => ({
  width: rows[0].length,
  height: rows.length,
  rows,
});

test("near-exact comparison allows translation/uniform scale while preserving holes and proportions", () => {
  const original = mask(["#####", "#...#", "#.#.#", "#...#", "#####"]);
  const translated = mask([
    ".........",
    "..#####..",
    "..#...#..",
    "..#.#.#..",
    "..#...#..",
    "..#####..",
    ".........",
  ]);
  const doubled = mask(
    original.rows.flatMap((row) =>
      [...Array(2)].map(() => [...row].map((c) => c + c).join("")),
    ),
  );
  assert.equal(compareBitmaps(original, translated).silhouetteIoU, 1);
  assert.ok(meetsNearExactGate(compareBitmaps(original, doubled)));
  const solid = mask(["#####", "#####", "#####", "#####", "#####"]);
  assert.equal(meetsNearExactGate(compareBitmaps(solid, original)), false);
  assert.notEqual(
    compareBitmaps(solid, original).holes.actual,
    compareBitmaps(solid, original).holes.target,
  );
});

test("large empty backgrounds and warped aspect ratios cannot create a near-match", () => {
  const upright = mask(["###", "###", "###", "###", "###", "###", "###"]);
  const flat = mask(["#######", "#######", "#######"]);
  assert.equal(meetsNearExactGate(compareBitmaps(upright, flat)), false);
  assert.ok(compareBitmaps(upright, flat).aspectSimilarity < 0.25);
  const empty = mask(["...", "...", "..."]);
  assert.equal(compareBitmaps(empty, upright).silhouetteIoU, 0);
  assert.equal(meetsNearExactGate(compareBitmaps(empty, upright)), false);
  assert.throws(() => validateBitmap(empty), /empty reference/);
});

test("native LCD topology joins diagonal outlines but preserves real separated fragments and holes", () => {
  const diamond = mask(["..#..", ".#.#.", "#...#", ".#.#.", "..#.."]);
  assert.deepEqual(bitmapTopology(diamond), { components: 1, holes: 1 });
  assert.deepEqual(bitmapTopology(mask(["#..", ".#.", "..#"])), {
    components: 1,
    holes: 0,
  });
  const separated = mask(["#...#", ".....", "#...#"]);
  assert.deepEqual(bitmapTopology(separated), { components: 4, holes: 0 });
  const scaled = mask(
    diamond.rows.flatMap((row) =>
      [...Array(2)].map(() => [...row].map((c) => c + c).join("")),
    ),
  );
  assert.deepEqual(bitmapTopology(scaled), bitmapTopology(diamond));
  assert.equal(meetsNearExactGate(compareBitmaps(separated, diamond)), false);
});

test("normalization cannot hide incorrect relative stage size or invisible facial features", () => {
  const baby = mask(["##", "##"]),
    adult = mask(["####", "####", "####", "####"]);
  assert.equal(meetsNearExactGate(compareBitmaps(adult, baby)), true);
  const dimensions = compareRelativeDimensions(adult, baby, baby, baby);
  assert.equal(dimensions.widthSimilarity, 0.5);
  assert.equal(dimensions.passed, false);
  const eye = [{ x: 2, y: 2, color: "#000000" }];
  const body = Array.from({ length: 25 }, (_, i) => ({
    x: i % 5,
    y: Math.floor(i / 5),
    color: "#FFFFFF",
  }));
  assert.ok(
    Math.abs(visibleFeatureContrast(eye, [...body, ...eye]) - 1) < 1e-12,
  );
  assert.equal(visibleFeatureContrast(eye, eye), 0);
});

test("birth identity requires exact pixels and colors at the fixed world translation", () => {
  const ink = [
    { x: 1, y: 2, color: "#AABBCC" },
    { x: 2, y: 2, color: "#000000" },
  ];
  const world = ink.map((pixel) => ({
    ...pixel,
    x: pixel.x + 16,
    y: pixel.y + 16,
  }));
  assert.equal(exactBirthPixelsMatch(ink, [...world].reverse()), true);
  assert.equal(
    exactBirthPixelsMatch(
      ink,
      world.map((pixel) => ({ ...pixel, x: pixel.x + 1 })),
    ),
    false,
  );
  assert.equal(
    exactBirthPixelsMatch(
      ink,
      world.map((pixel) => ({ ...pixel, color: "#FFFFFF" })),
    ),
    false,
  );
  assert.equal(
    exactBirthPixelsMatch(
      ink,
      world.map((pixel) => ({ ...pixel, x: pixel.x * 2, y: pixel.y * 2 })),
    ),
    false,
  );
  assert.equal(
    exactBirthPixelsMatch(ink, [...world, { ...world[0], color: "#aabbcc" }]),
    true,
  );
});

test("witnesses contain only ordinary source, seed, explicit clocks and concrete game commands", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: "ordinary-seed",
    policyId: "tended",
    endHour: 2,
  });
  assert.equal(sourceBirthExact(recipe), true);
  assert.deepEqual(validateWitness(JSON.parse(JSON.stringify(recipe))), recipe);
  assert.throws(
    () => validateWitness({ ...recipe, targetSprite: ["###"] }),
    /cannot contain targets/,
  );
  assert.throws(
    () =>
      validateWitness({ ...recipe, source: { ...source, futureForms: [] } }),
    /only an ID/,
  );
  assert.throws(
    () =>
      validateWitness({
        ...recipe,
        commands: [
          {
            id: "retro-input-1",
            atHour: 1,
            command: { type: "set-stage", stage: "adult" },
          },
        ],
      }),
    /ordinary gameplay/,
  );
  assert.throws(
    () =>
      validateWitness({
        ...recipe,
        commands: [
          {
            id: "retro-input-1",
            atHour: 1,
            command: { type: "feed", food: "meal", endpoint: "adult" },
          },
        ],
      }),
    /ordinary gameplay/,
  );
  assert.throws(
    () => validateReplayRecipe({ ...recipe, targetSprite: ["###"] }),
    /starting drawing/,
  );
  assert.throws(
    () =>
      validateReplayRecipe({
        ...recipe,
        commands: [
          {
            id: "override",
            atHour: 1,
            command: { type: "set-stage", stage: "adult" },
          },
        ],
      }),
    /non-gameplay/,
  );
  assert.throws(
    () =>
      validateReplayRecipe({
        ...recipe,
        commands: [{ id: "past", atHour: -0.5, command: { type: "clean" } }],
      }),
    /chronological/,
  );
});

test("replay is deterministic and future target bitmaps cannot influence generated frames", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: "replay-seed",
    policyId: "tended",
    endHour: 2,
  });
  const points = [point("birth", 0, "hatchling"), point("child", 1, "infant")];
  const first = replayWitness(recipe, points);
  const changed = points.map((p) => ({
    ...p,
    characterId: "an-unrelated-audit-only-reference",
    name: "Future target metadata",
    expectedStage: "advanced" as const,
    expectedBranch: "not-earned-or-supplied-to-renderer",
    target: mask(["#####", "#####", "#####"]),
  }));
  const second = replayWitness(recipe, changed);
  assert.deepEqual(
    first.map((c) => c.frameHash),
    second.map((c) => c.frameHash),
  );
  assert.deepEqual(
    first.map((c) => c.game),
    second.map((c) => c.game),
  );
  assert.deepEqual(
    replayWitness(recipe, points).map((c) => c.pixels),
    first.map((c) => c.pixels),
  );
  assert.equal(first[1].game.stage, "infant");
  assert.equal(first[0].genomeFingerprint, first[1].genomeFingerprint);
  assert.deepEqual(
    replayGameRecipe(recipe, 1),
    first[1].game,
    "the app replay must use the same genuine gameplay state",
  );
});

test("a matching silhouette cannot hide the wrong original V1 branch", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: "wrong-branch",
    policyId: "tended",
    endHour: 0,
  });
  const captures = replayWitness(recipe, [
    {
      ...point("birth", 0, "hatchling"),
      expectedBranch: "different-original-form",
    },
  ]);
  captures[0].checkpoint.target = pixelsToBitmap(captures[0].pixels);
  const score = scoreLifecycle(recipe, captures);
  assert.equal(score.checkpoints[0].metrics!.silhouetteIoU, 1);
  assert.equal(score.checkpoints[0].referenceBranchMatched, false);
  assert.equal(score.status, "failed");
});

test("care/training policy earns actual counters without reading hidden minigame answers", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: "training-policy",
    policyId: "trained",
    endHour: 3,
  });
  assert.ok(
    recipe.commands.some((event) => event.command.type === "start-game"),
  );
  // The current policy completes training with the same blind "high"
  // choice each round. It never reads the hidden targets to pick answers.
  const choices = recipe.commands.filter(
    (event) => event.command.type === "choose",
  );
  assert.ok(choices.length >= 5, "the policy plays ordinary training rounds");
  assert.ok(
    choices.every(
      (event) =>
        event.command.type === "choose" && event.command.choice === "high",
    ),
    "no target-aware choices enter the witness",
  );
  assert.ok(
    recipe.commands.some((event) => event.command.type === "dismiss"),
    "completed training is dismissed through a player command",
  );
  const captured = replayWitness(recipe, [point("later", 3, "infant")])[0];
  assert.ok(captured.game.stats.training > 0);
  assert.equal(captured.game.dead, false);
  assert.deepEqual(
    buildPolicyWitness({
      source,
      seed: "training-policy",
      policyId: "trained",
      endHour: 3,
    }),
    recipe,
  );
});

test("clock-based care routines can earn distinct ordinary V1 paths without stage overrides", () => {
  const interrupted = buildPolicyWitness({
    source,
    seed: cohortSeed(0),
    policyId: "rest-interrupted",
    endHour: 121,
  });
  const nocturnal = replayGameRecipe(interrupted, 121);
  assert.equal(nocturnal.dead, false);
  assert.equal(nocturnal.stageCommitments.at(-1)?.branch, "airdramon");
  const branch = nocturnal.stageCommitments.at(-1)!;
  assert.ok(branch.metrics.sleepDisturbances >= 9);
  assert.ok(branch.metrics.training >= 8 && branch.metrics.training <= 31);
  assert.ok(
    interrupted.commands.some((event) => event.command.type === "lights"),
  );

  const changing = buildPolicyWitness({
    source,
    seed: cohortSeed(0),
    policyId: "early-tended-then-strenuous",
    endHour: 193,
  });
  const mature = replayGameRecipe(changing, 193);
  assert.equal(mature.dead, false);
  assert.deepEqual(
    mature.stageCommitments.map((commitment) => commitment.branch),
    ["botamon", "koromon", "agumon", "meramon", "mamemon"],
  );
  assert.ok(mature.stats.battles >= 15);
  assert.ok(
    changing.commands.every(
      (event) => event.command.type !== ("set-stage" as string),
    ),
  );
});

test("whole-path grading uses the weakest stage and never upgrades machine gates to human acceptance", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: "whole-path",
    policyId: "tended",
    endHour: 2,
  });
  const captures = replayWitness(recipe, [
    point("birth", 0, "hatchling"),
    point("child", 1, "infant"),
    point("later", 2, "infant"),
  ]);
  for (const capture of captures)
    capture.checkpoint.target = pixelsToBitmap(capture.pixels);
  const perfect = scoreLifecycle(recipe, captures);
  assert.equal(
    perfect.status,
    "unscored",
    "short snapshots cannot certify an entire life",
  );
  assert.equal(perfect.fullLifeComplete, false);
  assert.equal(perfect.visualReview, "unreviewed");
  assert.equal(perfect.referenceParityEstablished, false);
  captures[1].checkpoint.target = mask([
    "#....",
    "#....",
    "#....",
    "#....",
    "#####",
  ]);
  const failed = scoreLifecycle(recipe, captures);
  assert.equal(failed.status, "failed");
  assert.equal(failed.worstIoU, failed.checkpoints[1].metrics!.silhouetteIoU);
  assert.ok(failed.meanIoU! > failed.worstIoU!);
});

test("missing references and undocumented care cannot pass by borrowing other stage scores", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: "unavailable",
    policyId: "tended",
    endHour: 1,
  });
  const captures = replayWitness(recipe, [
    point("birth", 0, "hatchling"),
    point("child", 1, "infant"),
  ]);
  for (const capture of captures)
    capture.checkpoint.target = pixelsToBitmap(capture.pixels);
  captures[1].checkpoint.referenceStatus = "unavailable";
  const unavailable = scoreLifecycle(recipe, captures);
  assert.equal(unavailable.status, "unscored");
  assert.equal(unavailable.scoredStages, 1);
  assert.equal(unavailable.totalStages, 2);
  assert.equal(unavailable.checkpoints[1].metrics, null);
  captures[1].checkpoint.referenceStatus = "provisional";
  const uncertainEdition = scoreLifecycle(recipe, captures);
  assert.equal(uncertainEdition.status, "unscored");
  assert.equal(uncertainEdition.checkpoints[1].metrics, null);
  captures[1].checkpoint.referenceStatus = "observed";
  captures[1].checkpoint.careEvidence = "provisional";
  const careUnknown = scoreLifecycle(recipe, captures);
  assert.equal(careUnknown.status, "unscored");
  assert.equal(careUnknown.checkpoints[1].metrics!.silhouetteIoU, 1);
});

test("bounded seed search uses the same neutral cohort and records complete failed paths", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: cohortSeed(0),
    policyId: "tended",
    endHour: 1,
  });
  const captures = replayWitness(recipe, [
    point("birth", 0, "hatchling"),
    point("child", 1, "infant"),
  ]);
  const case_: RetroCase = {
    id: "test-path",
    deviceId: "test",
    rootCharacterId: "birth",
    characterIds: ["birth", "child"],
    source,
    checkpoints: captures.map((c) => ({
      ...c.checkpoint,
      target: pixelsToBitmap(c.pixels),
    })),
  };
  const result = searchCase(case_, {
    seedCount: 2,
    policyIds: ["tended"],
    endHour: 1,
  });
  assert.equal(result.candidatesTried, 2);
  assert.equal(result.winner!.recipe.seed, cohortSeed(0));
  assert.equal(result.winner!.score.checkpoints.length, 2);
  assert.equal(result.winner!.recipe.seed.includes("test-path"), false);
  assert.throws(() => searchCase(case_, { seedCount: 0 }), /budget/);
});

test("reference path enumeration preserves coherent branches and rejects cycles", () => {
  const catalog: RetroCatalog = {
    schemaVersion: 1,
    devices: [
      {
        id: "x",
        name: "Test",
        edition: "test",
        rootCharacterId: "x.root",
        characterIds: ["x.root", "x.a", "x.b"],
      },
    ],
    characters: [],
    edges: [
      { deviceId: "x", from: "x.root", to: "x.a" },
      { deviceId: "x", from: "x.root", to: "x.b" },
    ],
  };
  assert.deepEqual(enumeratePaths(catalog), [
    ["x.root", "x.a"],
    ["x.root", "x.b"],
  ]);
  assert.throws(
    () =>
      enumeratePaths({
        ...catalog,
        edges: [...catalog.edges, { deviceId: "x", from: "x.a", to: "x.root" }],
      }),
    /cycle/,
  );
});

test("full-life witnesses reach real death and export an input-replayed portable pet with complete history", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: cohortSeed(0),
    policyId: "tended",
    endHour: 721,
  });
  const terminal = lifetimeEvidence(recipe, 122, "adult");
  assert.equal(terminal.complete, true);
  assert.equal(terminal.terminal?.cause, "old age");
  assert.equal(terminal.terminal?.atHour, 720);
  assert.equal(terminal.restart.emptyCommandHistory, true);
  assert.equal(terminal.restart.creationUI, "requires-visual-review");
  const state = witnessGameState(recipe, recipe.endHour);
  assert.ok(recipe.commands.length > 256);
  assert.equal(state.commandHistory.length, recipe.commands.length);
  const nowMs = 1_800_000_000_019;
  const rebased = rebaseWitnessClock(recipe, 122, nowMs);
  const portable = witnessPetDocument(recipe, 122, {
    name: "Ordinary exported life",
    rebaseToMs: nowMs,
  });
  assert.ok(portable.life);
  assert.equal(
    portable.life.game.commandHistory.length,
    recipe.commands.filter((event) => event.atHour <= 122).length,
  );
  assert.ok(
    portable.life.game.clock.nowMs <= nowMs &&
      nowMs - portable.life.game.clock.nowMs < 60_000,
  );
  const a = replayWitness(recipe, [point("native-time", 122, "adult")])[0];
  const b = replayWitness(rebased.recipe, [
    point("rebased-time", 122, "adult"),
  ])[0];
  assert.deepEqual(a.pixels, b.pixels);
  assert.deepEqual(a.game.stats, b.game.stats);
  assert.deepEqual(a.game.stageCommitments, b.game.stageCommitments);
  assert.equal(a.genomeFingerprint, b.genomeFingerprint);
  assert.equal("target" in portable, false);
});

test("arbitrary IDs, fine timing and ignored input padding cannot enter an audited witness", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: cohortSeed(0),
    policyId: "tended",
    endHour: 1,
  });
  assert.throws(
    () =>
      validateWitness({
        ...recipe,
        commands: [
          {
            id: "chosen-endpoint-nonce",
            atHour: 0,
            command: { type: "clean" },
          },
        ],
      }),
    /canonical/,
  );
  assert.throws(
    () =>
      validateWitness({
        ...recipe,
        commands: [
          { id: "retro-input-1", atHour: 0.001, command: { type: "clean" } },
        ],
      }),
    /input grid/,
  );
  const padded = validateWitness({
    ...recipe,
    commands: [{ id: "retro-input-1", atHour: 0, command: { type: "clean" } }],
  });
  assert.throws(
    () => replayWitness(padded, [point("birth", 0, "hatchling")]),
    /no-op padding/,
  );
});

test("the frozen sampling schedule is independent of target pixels, names and seed winners", () => {
  const original: RetroCase = {
    id: "one",
    deviceId: "fixture",
    rootCharacterId: "birth",
    characterIds: ["birth", "child"],
    source,
    checkpoints: [point("birth", 0, "hatchling"), point("child", 2, "infant")],
  };
  const altered = {
    ...original,
    id: "different",
    checkpoints: original.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      name: "Other target",
      target: mask(["#####"]),
    })),
  };
  const schedule = (case_: RetroCase) =>
    diagnosticSchedule(case_, 720).map(
      ({ atHour, animationTime, action, sampleKind }) => ({
        atHour,
        animationTime,
        action,
        sampleKind,
      }),
    );
  assert.deepEqual(schedule(original), schedule(altered));
  assert.ok(Object.isFrozen(RETRO_AUDIT_SCHEDULE.transitionOffsetsHours));
  assert.ok(
    schedule(original).some(
      (sample) => sample.sampleKind === "transition" && sample.atHour === 1.5,
    ),
  );
  assert.ok(
    schedule(original).some(
      (sample) => sample.sampleKind === "retention" && sample.atHour === 719,
    ),
  );
});

test("P1 history-distinct native routes remain separate and cannot borrow combined-stage eligibility", () => {
  const native = listNativeP1HistoryRoutes(),
    ids = [...new Set(native.flatMap((route) => route.characters))];
  const catalog: RetroCatalog = {
    schemaVersion: 1,
    devices: [
      {
        id: "p1",
        name: "Fixture",
        edition: "World",
        rootCharacterId: "p1.babytchi",
        characterIds: ids,
      },
    ],
    characters: ids.map((id) => ({
      id,
      deviceId: "p1",
      name: id,
      stage: "fixture",
      root: id === "p1.babytchi",
    })),
    edges: [],
  };
  const cases = casesFromCatalog(catalog, new Map([["p1.babytchi", source]]));
  assert.equal(cases.length, 14);
  assert.equal(new Set(cases.map((case_) => case_.id)).size, 14);
  assert.ok(
    cases.every(
      (case_) =>
        case_.nativeHistory?.commandHistoryStatus ===
        "unverified-controller-mapping",
    ),
  );
  const taras = cases.filter(
    (case_) => case_.characterIds.at(-1) === "p1.tarakotchi",
  );
  assert.equal(taras.length, 4);
  assert.equal(
    new Set(taras.map((case_) => case_.nativeHistory!.teenHistoryKind)).size,
    4,
  );
});

test("generic declared facial contrast transport preserves source features without weakening birth identity", () => {
  const faceSource: RetroSource = {
    id: "square-with-three-features",
    mode: "infant",
    parts: [
      {
        id: "body",
        kind: "body",
        name: "Body",
        position: { x: 10, y: 10 },
        parentId: null,
        pixels: Array.from({ length: 64 }, (_, i) => ({
          x: i % 8,
          y: Math.floor(i / 8),
          color: "#FFFFFF",
        })),
      },
      ...(["eye-1", "eye-2", "mouth"] as const).map((id, index) => ({
        id,
        kind: index < 2 ? ("eye" as const) : ("mouth" as const),
        name: id,
        parentId: "body",
        position: { x: 10 + [2, 5, 3][index], y: 10 + [2, 2, 5][index] },
        pixels: [{ x: 0, y: 0, color: "#000000" }],
      })),
    ],
  };
  const original = structuredClone(faceSource.parts);
  const recipe = buildPolicyWitness({
    source: faceSource,
    seed: cohortSeed(51),
    policyId: "tended",
    endHour: 2,
  });
  assert.equal(sourceBirthExact(recipe), true);
  const capture = replayWitness(recipe, [point("expressed", 2, "infant")])[0];
  const eye = capture.parts!.find((part) => part.id === "eye-1")!;
  assert.equal(eye.surfaceExpression?.operation, "facial-contrast");
  assert.ok(eye.surfaceExpression!.changedPixelCount > 0);
  assert.equal(validFaceTransport(recipe.source, capture.parts!, eye), true);
  assert.equal(
    validFaceTransport(recipe.source, capture.parts!, {
      ...eye,
      surfaceExpression: undefined,
    }),
    false,
  );
  assert.equal(
    validFaceTransport(recipe.source, capture.parts!, {
      ...eye,
      surfaceExpression: {
        ...eye.surfaceExpression!,
        carrierId: "invented-carrier",
      },
    }),
    false,
  );
  assert.deepEqual(capture.sourceIntegrity.unverifiedFaceTransportIds, []);
  assert.deepEqual(capture.sourceIntegrity.lowContrastFaceIds, []);
  assert.deepEqual(faceSource.parts, original);
});

test("staged policy prefixes are byte-identical actual inputs of the uninterrupted policy", () => {
  for (const policyId of ["early-tended-then-stout", "rest-battles"]) {
    const full = buildPolicyWitness({
      source,
      seed: cohortSeed(0),
      policyId,
      endHour: 200,
    });
    for (const endHour of [2, 50, 194]) {
      const prefix = buildPolicyWitness({
        source,
        seed: cohortSeed(0),
        policyId,
        endHour,
      });
      assert.deepEqual(
        prefix.commands,
        full.commands.filter((input) => input.atHour <= endHour),
      );
      assert.deepEqual(
        witnessGameState(prefix, endHour),
        witnessGameState(full, endHour),
      );
    }
  }
});

test("staged rejection shares one coherent input prefix across paths and respects its explicit budget", () => {
  const recipe = buildPolicyWitness({
    source,
    seed: cohortSeed(0),
    policyId: "tended",
    endHour: 2,
  });
  const captured = replayWitness(recipe, [
    point("birth", 0, "hatchling"),
    point("child", 2, "infant"),
  ]);
  const root: RetroCase = {
    id: "bad-child-one",
    deviceId: "fixture",
    rootCharacterId: "birth",
    characterIds: ["birth", "child"],
    source,
    checkpoints: captured.map((capture, index) => ({
      ...capture.checkpoint,
      target: index
        ? mask(["###############################"])
        : pixelsToBitmap(capture.pixels),
    })),
  };
  const second = { ...root, id: "bad-child-two" };
  const result = searchStaged([root, second], {
    seedCount: 1_000_000,
    policyIds: ["tended"],
    maxInputs: 1,
  });
  assert.equal(result.progress.uniqueInputCandidates, 1);
  assert.equal(result.progress.prefixSimulations, 2);
  assert.equal(result.progress.fullLivesSimulated, 0);
  assert.equal(result.progress.budgetExhausted, true);
  assert.deepEqual(result.progress.nextByRoot.birth, {
    seedIndex: 1,
    policyIndex: 0,
  });
  assert.ok(
    result.results.every(
      (row) =>
        row.winner === null && row.prefixSearch!.rejectedAt["infant@2"] === 1,
    ),
  );
});

test("a staged stage-passer continues the same source and inputs to ordinary terminal death", () => {
  const prefix = buildPolicyWitness({
    source,
    seed: cohortSeed(0),
    policyId: "tended",
    endHour: 122,
  });
  const snapshots = replayWitness(prefix, [
    point("birth", 0, "hatchling"),
    point("infant", 2, "infant"),
    point("juvenile", 50, "juvenile"),
    point("adult", 122, "adult"),
  ]);
  const case_: RetroCase = {
    id: "synthetic-self-replay",
    deviceId: "fixture",
    rootCharacterId: "birth",
    characterIds: snapshots.map((capture) => capture.checkpoint.characterId),
    source,
    checkpoints: snapshots.map((capture) => ({
      ...capture.checkpoint,
      target: pixelsToBitmap(capture.pixels),
    })),
  };
  const result = searchStaged([case_], { seedCount: 1, policyIds: ["tended"] });
  assert.equal(result.progress.fullLivesSimulated, 1);
  const winner = result.results[0].winner!;
  assert.ok(winner);
  assert.equal(winner.recipe.seed, cohortSeed(0));
  assert.deepEqual(winner.recipe.source, source);
  assert.deepEqual(
    winner.recipe.commands.filter((input) => input.atHour <= 122),
    prefix.commands,
  );
  assert.equal(winner.score.terminal?.terminal?.cause, "old age");
  assert.equal(winner.score.fullLifeEligible, true);
  assert.ok(winner.score.diagnostics!.samples.length > 0);
});
