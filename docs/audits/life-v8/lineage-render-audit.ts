/** Developer rendering evidence only. No human acceptance is implied. */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { createSimulation } from "../../../src/simulation";
import { STARTER_PRESETS, clonePreset } from "../../../src/presets";
import {
  createGame,
  advanceGame,
  deriveDevelopmentContext,
  validateGameState,
  HOUR,
} from "../../../src/gameplay";
import {
  animalProfiles,
  datasetVersion,
  profileVersion,
  nearestSupportedProfile,
} from "../../../src/phylogeny";
import {
  writePng,
  rasterPixels,
  scaleRgba,
  blitRgba,
  drawBitmapText,
} from "../../../tools/audit/presentation";

async function main() {
  const seeds = ["life-v8-audit-01", "life-v8-audit-02", "life-v8-audit-03"];
  const hours = [0, 9, 57, 129, 201];
  const context = {
    hatchAtHours: 0,
    stageEndHours: [1, 49, 121, 193],
    stagePoints: [0, 1, 49, 121, 193].map((atHour, i) => ({
      id: ["hatchling", "infant", "juvenile", "adult", "advanced"][i],
      atHour,
      care: 0.75,
      training: 0.5,
      battle: 0.5,
    })),
  };
  const folder = resolve("docs/audits/life-v8");
  const sha = (v: unknown) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const rows: unknown[] = [];
  await mkdir(folder, { recursive: true });
  for (const [seedIndex, seed] of seeds.entries()) {
    const width = 960,
      height = 1140,
      sheet = rasterPixels([], width, height, "#171B22");
    drawBitmapText(
      sheet,
      width,
      height,
      `LIVE LINEAGE AUDIT - ${seed}`,
      14,
      12,
      { color: "#FFFFFF", scale: 2 },
    );
    drawBitmapText(
      sheet,
      width,
      height,
      "PRESCRIBED STAGE SUMMARIES / NEUTRAL NEEDS / IDLE TIME0 / NO HUMAN ACCEPTANCE",
      14,
      37,
      { color: "#C0C6CF" },
    );
    for (const [sourceIndex, preset] of STARTER_PRESETS.entries()) {
      const source = clonePreset(preset.id),
        sim = createSimulation(source, seed, "infant", {
          liveContext: context,
        });
      const top = 58 + sourceIndex * 178;
      drawBitmapText(sheet, width, height, preset.name, 12, top + 18, {
        color: "#FFFFFF",
        scale: 2,
      });
      drawBitmapText(sheet, width, height, preset.id, 12, top + 39, {
        color: "#B6C0CC",
      });
      const frames = hours.map((hour) =>
        sim.frameAt(hour / 24, { action: "idle", time: 0 }),
      );
      for (const [column, frame] of frames.entries()) {
        const left = 160 + column * 160;
        drawBitmapText(
          sheet,
          width,
          height,
          `HOUR ${hours[column]}`,
          left + 12,
          top,
          { color: "#D8E2EB" },
        );
        const raster = scaleRgba(
          rasterPixels(frame.pixels, 64, 64, "#C8CCD1"),
          64,
          64,
          2,
        );
        blitRgba(
          sheet,
          width,
          height,
          raster.rgba,
          128,
          128,
          left + 10,
          top + 15,
        );
        drawBitmapText(
          sheet,
          width,
          height,
          frame.evolution?.lineage?.name ?? "UNRESOLVED",
          left + 10,
          top + 150,
          { color: "#D4E7A1" },
        );
        const sourceIds = [
          ...new Set(
            frame.parts
              .flatMap((part) => [
                part.sourcePartId,
                ...(part.sourcePartIds ?? []),
              ])
              .filter(Boolean),
          ),
        ].sort();
        const finalColors = new Map(
          frame.pixels.map((pixel) => [
            `${pixel.x},${pixel.y}`,
            pixel.color.toUpperCase(),
          ]),
        );
        rows.push({
          source: preset.id,
          seed,
          hour: hours[column],
          pixelHash: sha(frame.pixels),
          pixels: frame.pixels.length,
          lineage: frame.evolution?.lineage,
          sourceIds,
          missingSourceIds: source
            .map((part) => part.id)
            .filter((id) => !sourceIds.includes(id)),
          facialParts: frame.parts
            .filter((part) => part.kind === "eye" || part.kind === "mouth")
            .map((part) => ({
              id: part.id,
              pixels: part.pixels.length,
              visiblePixels: part.pixels.filter(
                (pixel) =>
                  finalColors.get(`${pixel.x},${pixel.y}`) ===
                  pixel.color.toUpperCase(),
              ).length,
              colors: [...new Set(part.pixels.map((pixel) => pixel.color))],
            })),
          genomeFingerprint: frame.evolution?.genomeFingerprint,
          programFingerprint: frame.evolution?.programFingerprint,
        });
      }
      for (const index of [4, 1, 3, 0, 2])
        if (
          sha(sim.frameAt(hours[index] / 24).pixels) !==
          sha(frames[index].pixels)
        )
          throw new Error("Seek replay changed rendered pixels.");
    }
    await writePng(
      join(folder, `lineage-seed-${seedIndex + 1}.png`),
      width,
      height,
      sheet,
    );
  }

  const start = 12 * HOUR;
  const initial = createGame("lineage-persistence-audit", "infant", start);
  const initialJson = JSON.stringify(initial);
  const later = advanceGame(initial, start + HOUR, "active");
  const originalContext = deriveDevelopmentContext(later);
  const restored = validateGameState(JSON.parse(JSON.stringify(later)));
  if (JSON.stringify(initial) !== initialJson)
    throw new Error("Gameplay mutated the caller's initial state.");
  if (
    JSON.stringify(deriveDevelopmentContext(restored)) !==
    JSON.stringify(originalContext)
  )
    throw new Error("Stage context changed after JSON replay.");
  const laterJson = JSON.stringify(later);
  const exposed = deriveDevelopmentContext(later);
  if (exposed.stagePoints[0]) exposed.stagePoints[0].care = 0;
  exposed.stageEndHours[0] = 999;
  if (JSON.stringify(later) !== laterJson)
    throw new Error("Derived context aliases persisted game state.");
  const metadata = {
    createdAt: new Date().toISOString(),
    status: "developer-inspected-rendering-evidence",
    humanAcceptance: false,
    description:
      "Actual procedural renderer frames for six authored presets and three fixed unfiltered seeds. Prescribed reached-stage summaries isolate lineage rendering; this is not a simulated eight-day gameplay-care run.",
    datasetVersion,
    profileVersion,
    supportedProfiles: animalProfiles.map((profile) => profile.name),
    seeds,
    hours,
    context,
    replayChecks: {
      arbitraryPixelSeek: true,
      callerGameStateUnchanged: true,
      stageContextJsonReplay: true,
      derivedContextDoesNotAliasState: true,
      initialHatchlingAtHourZero: initial.stageCommitments.map(
        ({ id, atHour }) => ({ id, atHour }),
      ),
      initialLineageAtHourZero: createSimulation(
        clonePreset("canine-cub"),
        initial.seed,
        "infant",
        { liveContext: deriveDevelopmentContext(initial) },
      ).frameAt(0).evolution?.lineage,
    },
    runtimeCoverageCheck: {
      arbitraryUnbundledRawIdReturns: nearestSupportedProfile("ott42") ?? null,
      note: "The compact runtime API resolves only bundled ancestry nodes; full raw-node lookup requires the offline tree.",
    },
    frames: rows,
  };
  await writeFile(
    join(folder, "lineage-render-audit.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        images: seeds.length,
        frames: rows.length,
        replayChecks: metadata.replayChecks,
        coverage: metadata.runtimeCoverageCheck,
      },
      null,
      2,
    ),
  );
}
void main();
