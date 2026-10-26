import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import summaryData from "../retro/audit-summary.json";
import witnessData from "../retro/witness-data.json";
import { RETRO_PRESETS, RETRO_ROSTER } from "../retro";
import { replayGameRecipe } from "../retro/replay";
import { witnessPetDocument } from "../../tools/retro-audit/portable";
import { createSimulation, hash, type Pixel } from "../simulation";
import {
  deriveCareTimeline,
  deriveDevelopmentContext,
  DAY,
  GAME_RULES,
  GAME_RULES_VERSION,
} from "../gameplay";
import { drawingPixels } from "../drawing";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../needs";
import {
  PROTOTYPE_REVISION,
  LINEAGE_RECIPE_VERSION,
  type PetDocument,
} from "../pet-format";
import { PetPixels } from "./PetPixels";
import { T, terminal as s } from "../theme";
import type {
  RetroAuditSummary,
  WitnessRecipe,
} from "../../tools/retro-audit/types";

const report = summaryData as unknown as RetroAuditSummary;
const witnesses = witnessData as unknown as {
  version: number;
  byPath: Record<string, string>;
  recipes: Record<string, WitnessRecipe>;
  checksums?: Record<string, Record<string, string>>;
};
const labels = new Map(RETRO_ROSTER.map((p) => [p.referenceId, p.name]));
const sourcePresets = new Map(RETRO_PRESETS.map((p) => [p.referenceId, p]));
const percent = (v: number | null | undefined) =>
  v == null ? "unscored" : `${(v * 100).toFixed(1)}%`;

/** This framing is comparison-only: no transformed preview pixels enter the living simulation. */
function comparisonPixels(pixels: readonly Pixel[]): Pixel[] {
  const lit = pixels.filter((p) => {
    const color = p.color.replace("#", "");
    return (
      color.length === 6 &&
      (parseInt(color.slice(0, 2), 16) +
        parseInt(color.slice(2, 4), 16) +
        parseInt(color.slice(4, 6), 16)) /
        3 >=
        128
    );
  });
  if (!lit.length) return [];
  const x0 = Math.min(...lit.map((p) => p.x)),
    y0 = Math.min(...lit.map((p) => p.y));
  const w = Math.max(...lit.map((p) => p.x)) - x0 + 1,
    h = Math.max(...lit.map((p) => p.y)) - y0 + 1;
  const scale = Math.min(56 / w, 56 / h),
    left = (64 - w * scale) / 2,
    top = (64 - h * scale) / 2;
  const occupied = new Set(lit.map((p) => `${p.x},${p.y}`));
  const result: Pixel[] = [];
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      if (x < left || y < top || x >= left + w * scale || y >= top + h * scale)
        continue;
      const sourceX = x0 + Math.floor((x - left) / scale),
        sourceY = y0 + Math.floor((y - top) / scale);
      if (occupied.has(`${sourceX},${sourceY}`))
        result.push({ x, y, color: "#FFFFFF" });
    }
  return result;
}

function SmallButton({
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, selected && s.active, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.text, selected && { color: T.bg }]}>{label}</Text>
    </Pressable>
  );
}

export function RetroBenchmarks({
  onEditSource,
  onLoadLife,
}: {
  onEditSource: (id: string, seed?: string) => void;
  onLoadLife: (document: PetDocument) => void;
}) {
  const [selectedId, setSelectedId] = useState(""),
    [stageIndex, setStageIndex] = useState(0),
    [device, setDevice] = useState("all"),
    [loadError, setLoadError] = useState("");
  const paths = report.paths
    .filter((p) => device === "all" || p.deviceId === device)
    .sort(
      (a, b) =>
        ["dm1", "p1", "p2"].indexOf(a.deviceId) -
          ["dm1", "p1", "p2"].indexOf(b.deviceId) || a.id.localeCompare(b.id),
    );
  const selected = paths.find((p) => p.id === selectedId) ?? paths[0];
  const stages = selected?.best?.checkpoints ?? [];
  const checkpoint =
    stages[Math.min(stageIndex, Math.max(0, stages.length - 1))];
  const recipeId = selected && witnesses.byPath[selected.id],
    recipe = recipeId ? witnesses.recipes[recipeId] : undefined;
  const stale =
    report.versions.prototype !== PROTOTYPE_REVISION ||
    report.versions.lineage !== LINEAGE_RECIPE_VERSION ||
    report.versions.gameplay !== GAME_RULES_VERSION ||
    report.versions.rules !== GAME_RULES.id ||
    report.versions.needsCatalog !== NEEDS_CATALOG_VERSION ||
    report.versions.needsRules !== NEEDS_RULES_VERSION;
  const replay = useMemo(() => {
    if (!recipe || !checkpoint || stale) return null;
    try {
      const game = replayGameRecipe(recipe, checkpoint.atHour);
      const simulation = createSimulation(
        recipe.source.parts,
        recipe.seed,
        recipe.source.mode,
        {
          needTimeline: deriveCareTimeline(game),
          liveContext: deriveDevelopmentContext(game),
        },
      );
      const frame = simulation.frameAt(
        (game.clock.nowMs - game.clock.startedAtMs) / DAY,
        { time: checkpoint.animationTime, action: "idle" },
      );
      const expected =
        selected && witnesses.checksums?.[selected.id]?.[checkpoint.id];
      const verified =
        expected === hash(JSON.stringify(frame.pixels)).toString(16);
      return {
        game,
        pixels: comparisonPixels(frame.pixels),
        verified,
        error:
          expected && !verified
            ? "This generated frame differs from the measured run. Rerun the lifecycle benchmark before using its score."
            : null,
      };
    } catch (error) {
      return {
        game: null,
        verified: false,
        pixels: [],
        error:
          error instanceof Error
            ? error.message
            : "Could not replay this recipe.",
      };
    }
  }, [recipe, checkpoint, stale, selected?.id]);
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.bright}>
        Can ordinary growth reproduce a whole retro life?
      </Text>
      <Text style={s.muted}>
        One starting drawing, one seed and recorded care. Every later frame
        below is replayed through the normal game and growth engines. Reference
        art is used only for comparison.
      </Text>
      <Text style={s.text}>
        {stale ? `Historical ${report.versions.prototype}: ` : ""}
        {report.counts.paths} paths · {report.counts.candidates} comparisons ·{" "}
        {report.counts.visuallyAccepted} demonstrated matches
      </Text>
      {stale && (
        <Text style={[s.text, { color: T.warning }]}>
          The reference benchmark needs a run against this procedural revision.
          Historical scores below do not measure the current engine.
        </Text>
      )}
      {!report.paths.length && (
        <Text style={s.muted}>No measured lifecycle run is published yet.</Text>
      )}
      <View style={styles.row}>
        {[
          { id: "all", name: "All" },
          { id: "dm1", name: "Digimon V1" },
          { id: "p1", name: "Tama P1" },
          { id: "p2", name: "Tama P2" },
        ].map((d) => (
          <SmallButton
            key={d.id}
            label={d.name}
            selected={device === d.id}
            onPress={() => {
              setDevice(d.id);
              setStageIndex(0);
            }}
          />
        ))}
      </View>
      {paths.map((path) => (
        <View key={path.id} style={styles.case}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Inspect lifecycle ${path.id}`}
            onPress={() => {
              setSelectedId(path.id);
              setStageIndex(0);
            }}
            style={{ gap: 5 }}
          >
            <Text style={s.bright}>
              {path.characterIds.map((id) => labels.get(id) ?? id).join(" > ")}
            </Text>
            <Text
              style={[
                s.text,
                {
                  color:
                    path.status === "candidate-needs-visual-review"
                      ? T.cyan
                      : T.warning,
                },
              ]}
            >
              {path.status === "candidate-needs-visual-review"
                ? "Machine candidate; visual review needed"
                : path.status === "unscored"
                  ? "Incomplete reference evidence"
                  : "No whole-path match found"}{" "}
              · weakest stage {percent(path.best?.worstIoU)}
            </Text>
          </Pressable>
          {selected?.id === path.id && (
            <View style={{ gap: 10 }}>
              {path.best ? (
                <>
                  {path.gameEligible != null && (
                    <Text style={s.muted}>
                      {path.gameEligible
                        ? "The Infipet stage/care route was earned. Appearance is tested separately below."
                        : "This recipe did not earn every required Infipet stage/care branch."}
                    </Text>
                  )}
                  <Text selectable style={s.muted}>
                    Seed {path.best.seed} · care {path.best.policyId}
                  </Text>
                  <View style={styles.row}>
                    {stages.map((stage, i) => (
                      <SmallButton
                        key={stage.id}
                        label={stage.name}
                        selected={stageIndex === i}
                        onPress={() => setStageIndex(i)}
                      />
                    ))}
                  </View>
                  {checkpoint && (
                    <>
                      <Text style={s.text}>
                        {checkpoint.atHour.toFixed(1)}h after birth · shape
                        overlap{" "}
                        {replay?.verified
                          ? percent(checkpoint.metrics?.silhouetteIoU)
                          : "unverified replay"}
                      </Text>
                      <View style={styles.comparison}>
                        <View style={styles.panel}>
                          <Text style={s.muted}>Generated</Text>
                          <PetPixels
                            pixels={replay?.pixels ?? []}
                            size={120}
                            gridSize={64}
                          />
                          {replay?.game && (
                            <Text style={s.muted}>
                              {replay.game.dead
                                ? "Life ended"
                                : replay.game.stage}
                            </Text>
                          )}
                        </View>
                        <View style={styles.panel}>
                          <Text style={s.muted}>Reference</Text>
                          <PetPixels
                            pixels={
                              sourcePresets.has(checkpoint.characterId)
                                ? comparisonPixels(
                                    drawingPixels(
                                      sourcePresets.get(checkpoint.characterId)!
                                        .parts,
                                    ),
                                  )
                                : []
                            }
                            size={120}
                            gridSize={64}
                          />
                          <Text style={s.muted}>
                            {sourcePresets.has(checkpoint.characterId)
                              ? checkpoint.name
                              : "Image pending"}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.muted}>
                        Display is centered and uniformly scaled. The test also
                        checks holes, proportions, birth ink, survival and
                        reached stages.
                      </Text>
                      {!checkpoint.alive && (
                        <Text style={[s.text, { color: T.warning }]}>
                          This care recipe ended the life before the comparison
                          hour.
                        </Text>
                      )}
                      {checkpoint.alive && !checkpoint.stageReached && (
                        <Text style={[s.text, { color: T.warning }]}>
                          Reached {checkpoint.actualStage}; this checkpoint
                          requires {checkpoint.expectedStage}.
                        </Text>
                      )}
                      {checkpoint.referenceBranchMatched === false && (
                        <Text style={[s.text, { color: T.warning }]}>
                          A different care branch was earned:{" "}
                          {checkpoint.actualBranch ?? "none"}.
                        </Text>
                      )}
                      {!checkpoint.sourcePreserved && (
                        <Text style={[s.text, { color: T.warning }]}>
                          Source or facial continuity failed at this checkpoint.
                        </Text>
                      )}
                      {replay?.error && (
                        <Text style={[s.text, { color: T.warning }]}>
                          {replay.error}
                        </Text>
                      )}
                      {checkpoint.referenceTiming !== "documented" && (
                        <Text style={s.muted}>
                          Shown on Infipet's combined stage clock; original
                          device timing is not certified.
                        </Text>
                      )}
                      {checkpoint.careEvidence !== "documented" && (
                        <Text style={s.muted}>
                          The original care route remains provisional.
                        </Text>
                      )}
                    </>
                  )}
                  <SmallButton
                    label="Start recorded life in Live"
                    disabled={
                      !recipe || !checkpoint || stale || !replay?.verified
                    }
                    onPress={() => {
                      if (!recipe || !checkpoint || !replay?.verified) return;
                      try {
                        const document = witnessPetDocument(
                          recipe,
                          checkpoint.atHour,
                          {
                            name: "Recorded life",
                            rebaseToMs: Date.now(),
                          },
                        );
                        setLoadError("");
                        onLoadLife(document);
                      } catch (error) {
                        setLoadError(
                          error instanceof Error
                            ? error.message
                            : "The recorded life could not be replayed.",
                        );
                      }
                    }}
                  />
                  <Text style={s.muted}>
                    Replay the recorded care into the normal Live game at this
                    stage. This replaces your current life. Its clock is moved
                    to today while preserving age and the pet's sleep schedule.
                  </Text>
                  {!!loadError && (
                    <Text
                      accessibilityRole="alert"
                      style={[s.text, { color: T.warning }]}
                    >
                      {loadError}
                    </Text>
                  )}
                  <SmallButton
                    label="Edit this starting drawing"
                    disabled={!sourcePresets.has(path.rootCharacterId)}
                    onPress={() =>
                      onEditSource(
                        sourcePresets.get(path.rootCharacterId)!.id,
                        path.best!.seed,
                      )
                    }
                  />
                </>
              ) : (
                <Text style={s.muted}>
                  A complete observed starting drawing or stage reference is
                  still needed. This path has no demonstration recipe.
                </Text>
              )}
            </View>
          )}
        </View>
      ))}
      <Text style={s.muted}>
        A good final adult is insufficient: every stage must match under the
        same recipe. A limited search can fail to find a match without proving
        that no seed exists.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  case: { padding: 10, borderWidth: 1, borderColor: T.line, gap: 12 },
  comparison: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: 8,
  },
  panel: { alignItems: "center", gap: 5, minWidth: 120 },
});
