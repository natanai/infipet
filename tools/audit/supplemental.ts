import { join } from "node:path";
import {
  createSimulation,
  flattenAnatomy,
  type PetAction,
  type PetFrame,
  type PetPart,
} from "../../src/simulation";
import { NEED_IDS, type NeedKeyframe } from "../../src/needs";
import { GALLERY_FIXTURES, type GalleryFixture } from "../gallery";
import { stressFixtures } from "../benchmark";
import { exists, inspectFrame, loadJson, saveJson } from "./collection";
import { frameHash } from "./metrics";
import {
  blitRgba,
  drawBitmapText,
  rasterPixels,
  scaleRgba,
  writePng,
} from "./presentation";
import { MODELED_NEEDS, SMALL_REVIEW_SEEDS, digest, rate } from "./protocol";
import type { Manifest, Rate, Supplemental } from "./types";

export const CONTROL_AGES = [30, 120, 240];
export const MOTION_AGES = [30, 75, 120];
export const MOTION_PHASES = Array.from({ length: 8 }, (_, index) => index / 4);
export const MOTION_ACTIONS: PetAction[] = ["idle", "move", "play", "greet"];
export const UNMODELED_NEEDS = NEED_IDS.filter(
  (id) => !(MODELED_NEEDS as readonly string[]).includes(id),
);
export const BOUNDARY_AGES = [75 - 1 / 24, 75, 75 + 1 / 24];

type Failure = { id: string; message: string };
type Receipt<T> = { identity: string; complete: true; result: T };
type ControlFrame = {
  age: number;
  hash: string;
  neutralHash: string;
  unchanged: boolean;
  feelingsChanged: boolean;
  feelings: string[];
};
type ControlCase = {
  id: string;
  needId: string;
  fulfillment: number;
  seedIndex: number;
  frames: ControlFrame[];
  error?: string;
};
type ControlBatch = { cases: ControlCase[]; failures: Failure[] };
type BoundaryBatch = {
  frames: {
    id: string;
    age: number;
    hash: string;
    valid: boolean;
    fulfillment: number;
  }[];
  causality: { id: string; matches: boolean }[];
  failures: Failure[];
};
type MotionBatch = {
  frames: {
    id: string;
    valid: boolean;
    contactChecked: boolean;
    contactValid: boolean;
    hash: string;
  }[];
  clips: Supplemental["motion"]["clips"];
  failures: Failure[];
};
type RobustCase = {
  id: string;
  frames: number;
  valid: number;
  replayChecked: number;
  replayMatched: number;
  birthExact: boolean;
  hatchChecked: number;
  hatchPassed: number;
  errors: string[];
};

function message(error: unknown) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
function sourceHosts(parts: PetPart[]) {
  return Object.fromEntries(parts.map((part) => [part.id, part.parentId]));
}
function finiteFrame(
  frame: PetFrame,
  parts: PetPart[],
  hosts: Record<string, string | null>,
) {
  return (
    inspectFrame(frame, parts, hosts).valid &&
    [
      frame.age,
      frame.developmentalAge,
      frame.motionPace,
      frame.motionAmplitude,
      ...frame.parts.flatMap((part) => [
        part.scale,
        part.growth.x,
        part.growth.y,
        part.rotation,
      ]),
    ].every(Number.isFinite)
  );
}
function checkpointIdentity(manifest: Manifest, group: string, key: string) {
  return digest({
    protocol: manifest.protocolVersion,
    metric: manifest.metricVersion,
    engine: manifest.engineHash,
    sources: manifest.presets.map((preset) => preset.sourceHash),
    seeds: manifest.seeds,
    histories: manifest.histories,
    group,
    key,
  });
}
async function resumable<T>(
  runDir: string,
  manifest: Manifest,
  group: string,
  key: string,
  collect: () => Promise<T>,
): Promise<T> {
  const path = join(runDir, "data", "supplemental", `${group}--${key}.json.gz`);
  const identity = checkpointIdentity(manifest, group, key);
  if (await exists(path)) {
    const saved = await loadJson<Receipt<T>>(path);
    if (saved.identity !== identity || saved.complete !== true)
      throw new Error(`Supplemental checkpoint identity mismatch: ${path}`);
    return saved.result;
  }
  const result = await collect();
  await saveJson(path, {
    identity,
    complete: true,
    result,
  } satisfies Receipt<T>);
  process.stdout.write(`Supplemental ${group} / ${key} complete\n`);
  return result;
}

async function collectControls(
  runDir: string,
  manifest: Manifest,
): Promise<Supplemental["controls"]> {
  let cases = 0,
    frames = 0,
    unchanged = 0,
    changed = 0;
  const emitted = new Set<string>(),
    failures: Failure[] = [];
  const byNeed: Record<
    string,
    {
      cases: number;
      frames: number;
      geometryUnchanged: Rate;
      feelingsChanged: Rate;
    }
  > = {};
  for (const preset of manifest.presets) {
    const batch = await resumable<ControlBatch>(
      runDir,
      manifest,
      "controls",
      preset.id,
      async () => {
        const result: ControlBatch = { cases: [], failures: [] };
        const neutral = new Map<
          number,
          { age: number; hash: string; feelings: string }[]
        >();
        for (const seedIndex of SMALL_REVIEW_SEEDS) {
          const sim = createSimulation(preset.parts, manifest.seeds[seedIndex]);
          neutral.set(
            seedIndex,
            CONTROL_AGES.map((age) => {
              const frame = sim.frameAt(age, manifest.render);
              return {
                age,
                hash: frameHash(frame),
                feelings: JSON.stringify(frame.wellbeing.feelings),
              };
            }),
          );
        }
        for (const needId of UNMODELED_NEEDS)
          for (const seedIndex of SMALL_REVIEW_SEEDS)
            for (const fulfillment of [0, 1]) {
              const id = `${preset.id}/s${seedIndex}/${needId}-${fulfillment * 100}`;
              const entry: ControlCase = {
                id,
                needId,
                fulfillment,
                seedIndex,
                frames: [],
              };
              try {
                const sim = createSimulation(
                  preset.parts,
                  manifest.seeds[seedIndex],
                  "infant",
                  { needTimeline: [{ needId, tick: 0, fulfillment }] },
                );
                for (const age of CONTROL_AGES) {
                  const frame = sim.frameAt(age, manifest.render),
                    baseline = neutral
                      .get(seedIndex)!
                      .find((item) => item.age === age)!;
                  const hash = frameHash(frame);
                  entry.frames.push({
                    age,
                    hash,
                    neutralHash: baseline.hash,
                    unchanged: hash === baseline.hash,
                    feelingsChanged:
                      JSON.stringify(frame.wellbeing.feelings) !==
                      baseline.feelings,
                    feelings: frame.wellbeing.feelings.map(
                      (feeling) => feeling.id,
                    ),
                  });
                  if (!finiteFrame(frame, preset.parts, preset.hosts))
                    result.failures.push({
                      id: `${id}/d${age}`,
                      message: "Non-finite or invalid rendered frame.",
                    });
                  if (hash !== baseline.hash)
                    result.failures.push({
                      id: `${id}/d${age}`,
                      message:
                        "A need without a structural profile changed rendered geometry or color.",
                    });
                }
              } catch (error) {
                entry.error = message(error);
                result.failures.push({ id, message: entry.error });
              }
              result.cases.push(entry);
            }
        return result;
      },
    );
    cases += batch.cases.length;
    failures.push(...batch.failures);
    for (const entry of batch.cases) {
      const row = (byNeed[entry.needId] ??= {
        cases: 0,
        frames: 0,
        geometryUnchanged: rate(0, 0),
        feelingsChanged: rate(0, 0),
      });
      row.cases++;
      for (const frame of entry.frames) {
        frames++;
        row.frames++;
        unchanged += +frame.unchanged;
        changed += +frame.feelingsChanged;
        row.geometryUnchanged.numerator += +frame.unchanged;
        row.feelingsChanged.numerator += +frame.feelingsChanged;
        frame.feelings.forEach((id) => emitted.add(id));
      }
    }
  }
  for (const row of Object.values(byNeed)) {
    row.geometryUnchanged = rate(row.geometryUnchanged.numerator, row.frames);
    row.feelingsChanged = rate(row.feelingsChanged.numerator, row.frames);
  }
  return {
    cases,
    frames,
    geometryUnchanged: rate(unchanged, frames),
    feelingsChanged: rate(changed, frames),
    emittedFeelings: [...emitted].sort(),
    failures,
    byNeed,
    expectedCases: manifest.presets.length * 4 * 2 * UNMODELED_NEEDS.length,
    expectedFrames:
      manifest.presets.length *
      4 *
      2 *
      UNMODELED_NEEDS.length *
      CONTROL_AGES.length,
  };
}

async function collectBoundaries(
  runDir: string,
  manifest: Manifest,
): Promise<Supplemental["boundaries"]> {
  const histories = manifest.histories.filter(
    (history) => history.group === "recovery" || history.id === "safety-late",
  );
  let checked = 0,
    valid = 0,
    causalChecked = 0,
    causal = 0;
  const failures: Failure[] = [];
  for (const preset of manifest.presets) {
    const batch = await resumable<BoundaryBatch>(
      runDir,
      manifest,
      "boundaries",
      preset.id,
      async () => {
        const result: BoundaryBatch = {
          frames: [],
          causality: [],
          failures: [],
        };
        for (let seedIndex = 0; seedIndex < manifest.seedCount; seedIndex++)
          for (const history of histories) {
            const id = `${preset.id}/s${seedIndex}/${history.id}`;
            try {
              const sim = createSimulation(
                preset.parts,
                manifest.seeds[seedIndex],
                "infant",
                { needTimeline: history.timeline },
              );
              const previous = createSimulation(
                preset.parts,
                manifest.seeds[seedIndex],
                "infant",
                {
                  needTimeline: history.timeline.filter(
                    (keyframe) => keyframe.tick < 1800,
                  ),
                },
              );
              const needId = history.timeline.at(-1)!.needId;
              for (const age of BOUNDARY_AGES) {
                const frame = sim.frameAt(age, manifest.render),
                  hash = frameHash(frame),
                  finite = finiteFrame(frame, preset.parts, preset.hosts);
                result.frames.push({
                  id,
                  age,
                  hash,
                  valid: finite,
                  fulfillment: frame.wellbeing.needs[needId].fulfillment,
                });
                if (!finite)
                  result.failures.push({
                    id: `${id}/d${age}`,
                    message: "Invalid intervention-boundary frame.",
                  });
                if (age < 75) {
                  const prior = previous.frameAt(age, manifest.render);
                  const matches =
                    hash === frameHash(prior) &&
                    JSON.stringify(frame.wellbeing) ===
                      JSON.stringify(prior.wellbeing);
                  result.causality.push({ id, matches });
                  if (!matches)
                    result.failures.push({
                      id,
                      message:
                        "A future need event altered an earlier rendered frame or wellbeing state.",
                    });
                }
              }
            } catch (error) {
              result.failures.push({ id, message: message(error) });
            }
          }
        return result;
      },
    );
    checked += batch.frames.length;
    valid += batch.frames.filter((frame) => frame.valid).length;
    causalChecked += batch.causality.length;
    causal += batch.causality.filter((item) => item.matches).length;
    failures.push(...batch.failures);
  }
  return {
    checked,
    causal: rate(causal, causalChecked),
    finite: rate(valid, checked),
    failures,
    expectedFrames:
      manifest.presets.length *
      manifest.seedCount *
      histories.length *
      BOUNDARY_AGES.length,
    expectedCausal:
      manifest.presets.length * manifest.seedCount * histories.length,
  };
}

function robustnessFixtures(): GalleryFixture[] {
  const atom = (
    id: string,
    kind: PetPart["kind"],
    x: number,
    y: number,
  ): PetPart => ({
    id,
    kind,
    name: id,
    position: { x: 0, y: 0 },
    parentId: null,
    pixels: [{ x, y, color: "#DDDDDD" }],
  });
  return [
    ...GALLERY_FIXTURES,
    ...stressFixtures(),
    {
      name: "Single source pixel",
      seed: "audit-one-pixel",
      mode: "infant",
      parts: [atom("single", "body", 16, 16)],
    },
    {
      name: "Empty shared reference",
      seed: "audit-empty",
      mode: "infant",
      parts: [],
    },
    {
      name: "Only optional floating features",
      seed: "audit-feature-only",
      mode: "infant",
      parts: [
        atom("eye", "eye", 8, 8),
        atom("hair", "hair", 22, 5),
        atom("mouth", "mouth", 12, 17),
      ],
    },
    {
      name: "Multiple disconnected heads",
      seed: "audit-two-heads",
      mode: "infant",
      parts: [
        atom("head-left", "head", 7, 14),
        atom("head-right", "head", 24, 14),
        { ...atom("eye-left", "eye", 7, 14), parentId: "head-left" },
        { ...atom("eye-right", "eye", 24, 14), parentId: "head-right" },
      ],
    },
  ];
}

async function collectRobustness(
  runDir: string,
  manifest: Manifest,
): Promise<Supplemental["robustness"]> {
  const rows = await resumable<RobustCase[]>(
    runDir,
    manifest,
    "robustness",
    "fixtures",
    async () => {
      const results: RobustCase[] = [];
      for (const [fixtureIndex, fixture] of robustnessFixtures().entries())
        for (const history of [
          [],
          [{ needId: "safety", tick: 0, fulfillment: 0 }],
        ] as NeedKeyframe[][]) {
          const id = `fixture-${fixtureIndex}/${history.length ? "safety-0" : "neutral"}`;
          const row: RobustCase = {
            id,
            frames: 0,
            valid: 0,
            replayChecked: 0,
            replayMatched: 0,
            birthExact: false,
            hatchChecked: 0,
            hatchPassed: 0,
            errors: [],
          };
          try {
            const sim = createSimulation(
              fixture.parts,
              fixture.seed,
              fixture.mode,
              { needTimeline: history },
            );
            const ages = [
              ...new Set([
                0,
                ...manifest.ages.map((age) => sim.hatchAt + age),
                ...(fixture.mode === "egg"
                  ? [sim.hatchAt - 1 / 24, sim.hatchAt + 1 / 24]
                  : []),
              ]),
            ].sort((a, b) => a - b);
            const baseline = new Map<number, { hash: string; state: string }>();
            const hosts = sourceHosts(fixture.parts);
            for (const age of ages) {
              const frame = sim.frameAt(age, manifest.render);
              row.frames++;
              row.valid += +finiteFrame(frame, fixture.parts, hosts);
              baseline.set(age, {
                hash: frameHash(frame),
                state: JSON.stringify(frame.wellbeing),
              });
              if (age === 0)
                row.birthExact =
                  frameHash(frame) ===
                  frameHash({
                    pixels: flattenAnatomy(fixture.parts).map((pixel) => ({
                      ...pixel,
                      x: pixel.x + 16,
                      y: pixel.y + 16,
                    })),
                  } as PetFrame);
              if (
                fixture.mode === "egg" &&
                [
                  sim.hatchAt - 1 / 24,
                  sim.hatchAt,
                  sim.hatchAt + 1 / 24,
                ].includes(age)
              ) {
                row.hatchChecked++;
                row.hatchPassed += +(age < sim.hatchAt
                  ? frame.stage === "egg"
                  : frame.stage === "infant");
              }
            }
            const replay = createSimulation(
              fixture.parts,
              fixture.seed,
              fixture.mode,
              { needTimeline: history },
            );
            for (const age of [...ages].reverse()) {
              const frame = replay.frameAt(age, manifest.render),
                expected = baseline.get(age)!;
              row.replayChecked++;
              row.replayMatched += +(
                frameHash(frame) === expected.hash &&
                JSON.stringify(frame.wellbeing) === expected.state
              );
            }
          } catch (error) {
            row.errors.push(message(error));
          }
          results.push(row);
        }
      const oscillating: NeedKeyframe[] = Array.from(
        { length: 17 },
        (_, index) => ({
          needId: "safety",
          tick: index * 14 * 24,
          fulfillment: index % 2 === 0 ? 0 : 1,
        }),
      );
      for (const preset of manifest.presets) {
        const row: RobustCase = {
          id: `${preset.id}/oscillating-safety`,
          frames: 0,
          valid: 0,
          replayChecked: 0,
          replayMatched: 0,
          birthExact: false,
          hatchChecked: 0,
          hatchPassed: 0,
          errors: [],
        };
        try {
          const sim = createSimulation(
            preset.parts,
            manifest.seeds[0],
            "infant",
            { needTimeline: oscillating },
          );
          const before = new Map<number, string>();
          for (const age of [
            0,
            14 - 1 / 24,
            14,
            14 + 1 / 24,
            28,
            75,
            120,
            180,
            240,
          ]) {
            const frame = sim.frameAt(age, manifest.render);
            row.frames++;
            row.valid += +finiteFrame(frame, preset.parts, preset.hosts);
            before.set(
              age,
              digest({ hash: frameHash(frame), wellbeing: frame.wellbeing }),
            );
            if (age === 0)
              row.birthExact =
                frameHash(frame) ===
                frameHash({
                  pixels: flattenAnatomy(preset.parts).map((pixel) => ({
                    ...pixel,
                    x: pixel.x + 16,
                    y: pixel.y + 16,
                  })),
                } as PetFrame);
          }
          const replay = createSimulation(
            preset.parts,
            manifest.seeds[0],
            "infant",
            { needTimeline: oscillating },
          );
          for (const age of [
            240,
            14,
            0,
            120,
            14 + 1 / 24,
            75,
            28,
            180,
            14 - 1 / 24,
          ]) {
            const frame = replay.frameAt(age, manifest.render);
            row.replayChecked++;
            row.replayMatched += +(
              digest({ hash: frameHash(frame), wellbeing: frame.wellbeing }) ===
              before.get(age)
            );
          }
        } catch (error) {
          row.errors.push(message(error));
        }
        results.push(row);
      }
      return results;
    },
  );
  const sum = (
    field:
      | "frames"
      | "valid"
      | "replayChecked"
      | "replayMatched"
      | "hatchChecked"
      | "hatchPassed",
  ) => rows.reduce((total, row) => total + row[field], 0);
  return {
    checked: sum("frames"),
    valid: rate(sum("valid"), sum("frames")),
    replay: rate(sum("replayMatched"), sum("replayChecked")),
    cases: rows,
    birthExact: rate(rows.filter((row) => row.birthExact).length, rows.length),
    hatchBoundaries: rate(sum("hatchPassed"), sum("hatchChecked")),
    failedCases: rows.filter((row) => row.errors.length).length,
  };
}

async function collectMotion(
  runDir: string,
  manifest: Manifest,
): Promise<Supplemental["motion"]> {
  let frames = 0,
    valid = 0,
    contacts = 0,
    validContacts = 0;
  const clips: Supplemental["motion"]["clips"] = [],
    failures: Failure[] = [];
  const histories = manifest.histories.filter((history) =>
    ["neutral", "safety-0"].includes(history.id),
  );
  for (const preset of manifest.presets) {
    const batch = await resumable<MotionBatch>(
      runDir,
      manifest,
      "motion",
      preset.id,
      async () => {
        const result: MotionBatch = { frames: [], clips: [], failures: [] };
        for (const seedIndex of SMALL_REVIEW_SEEDS)
          for (const history of histories) {
            const sim = createSimulation(
              preset.parts,
              manifest.seeds[seedIndex],
              "infant",
              { needTimeline: history.timeline },
            );
            const clipId = `${preset.id}--s${String(seedIndex).padStart(3, "0")}--${history.id}`;
            const width = 1024,
              height = 576,
              atlas = new Uint8Array(width * height * 4),
              frameIds: string[] = [];
            for (let offset = 3; offset < atlas.length; offset += 4)
              atlas[offset] = 255;
            for (const age of MOTION_AGES)
              for (const [actionIndex, action] of MOTION_ACTIONS.entries())
                for (const [phaseIndex, time] of MOTION_PHASES.entries()) {
                  const id = `${preset.id}/s${seedIndex}/${history.id}/d${age}/${action}/t${time}`;
                  try {
                    const frame = sim.frameAt(age, {
                      action,
                      time,
                      ...(action === "play"
                        ? { target: { x: 48, y: 38 } }
                        : {}),
                    });
                    const isValid = finiteFrame(
                        frame,
                        preset.parts,
                        preset.hosts,
                      ),
                      contact = frame.interaction.contactPoint;
                    const effector = frame.parts.find(
                      (part) => part.id === frame.interaction.effectorId,
                    );
                    const contactValid =
                      !contact ||
                      Boolean(
                        effector?.pixels.some(
                          (pixel) =>
                            pixel.x === contact.x && pixel.y === contact.y,
                        ),
                      );
                    result.frames.push({
                      id,
                      valid: isValid,
                      contactChecked: Boolean(contact),
                      contactValid,
                      hash: frameHash(frame),
                    });
                    if (!isValid || !contactValid)
                      result.failures.push({
                        id,
                        message: !isValid
                          ? "Invalid motion frame."
                          : "Interaction contact is not a pixel of the declared effector.",
                      });
                    if (age === 75) {
                      frameIds.push(id);
                      if (isValid) {
                        const source = scaleRgba(
                          rasterPixels(frame.pixels),
                          64,
                          64,
                          2,
                        );
                        blitRgba(
                          atlas,
                          width,
                          height,
                          source.rgba,
                          128,
                          128,
                          phaseIndex * 128,
                          actionIndex * 144 + 16,
                        );
                      }
                    }
                  } catch (error) {
                    result.failures.push({ id, message: message(error) });
                  }
                }
            for (const [index, action] of MOTION_ACTIONS.entries())
              drawBitmapText(
                atlas,
                width,
                height,
                `${action} - day 75 - phase 0 to 1.75`,
                4,
                index * 144 + 4,
                { color: "#DDDDDD" },
              );
            const path = `motion/${clipId}.png`;
            await writePng(join(runDir, path), width, height, atlas);
            result.clips.push({ id: clipId, path, frameIds });
          }
        return result;
      },
    );
    frames += batch.frames.length;
    valid += batch.frames.filter((frame) => frame.valid).length;
    contacts += batch.frames.filter((frame) => frame.contactChecked).length;
    validContacts += batch.frames.filter(
      (frame) => frame.contactChecked && frame.contactValid,
    ).length;
    clips.push(...batch.clips);
    failures.push(...batch.failures);
  }
  return {
    frames,
    valid: rate(valid, frames),
    contactValid: rate(validContacts, contacts),
    clips,
    failures,
    expectedFrames:
      manifest.presets.length *
      SMALL_REVIEW_SEEDS.length *
      histories.length *
      MOTION_AGES.length *
      MOTION_ACTIONS.length *
      MOTION_PHASES.length,
    options: {
      ages: MOTION_AGES,
      phases: MOTION_PHASES,
      actions: MOTION_ACTIONS,
      playTarget: { x: 48, y: 38 },
    },
  };
}

/** Supplemental cohorts are independent from the primary denominator and resume per preset. */
export async function collectSupplemental(
  runDir: string,
  manifest: Manifest,
): Promise<Supplemental> {
  const controls = await collectControls(runDir, manifest);
  const boundaries = await collectBoundaries(runDir, manifest);
  const robustness = await collectRobustness(runDir, manifest);
  const motion = await collectMotion(runDir, manifest);
  const result = { controls, boundaries, robustness, motion };
  await saveJson(join(runDir, "supplemental.json"), result);
  return result;
}
