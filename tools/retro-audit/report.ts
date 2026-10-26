import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  rasterPixels,
  writePng,
  drawBitmapText,
  scaleRgba,
  blitRgba,
} from "../audit/presentation";
import { bitmapPoints, pixelsToBitmap, normalizedBitmap } from "./metrics";
import type { RetroCase, SearchResult, RetroAuditSummary } from "./types";

export const safeStem = (id: string) =>
  id.replace(/[^a-z0-9_.-]/gi, "-").slice(0, 180);
const escape = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
export async function writeCaseSheet(
  file: string,
  case_: RetroCase,
  result: SearchResult,
): Promise<void> {
  const winner = result.winner;
  if (!winner) return;
  const cell = 220,
    width = Math.max(660, case_.checkpoints.length * cell),
    height = 602;
  const rgba = rasterPixels([], width, height, "#151A1D");
  drawBitmapText(
    rgba,
    width,
    height,
    `${case_.deviceId.toUpperCase()} / ${winner.score.status.toUpperCase()}`,
    12,
    10,
    { scale: 2, color: "#FFFFFF" },
  );
  drawBitmapText(
    rgba,
    width,
    height,
    `SEED ${winner.recipe.seed} / CARE ${winner.recipe.policyId} / NO VISUAL ACCEPTANCE`,
    12,
    34,
    { color: "#D5D5D5" },
  );
  for (let i = 0; i < case_.checkpoints.length; i++) {
    const point = case_.checkpoints[i],
      capture = winner.captures[i],
      score = winner.score.checkpoints[i],
      left = i * cell + 10;
    drawBitmapText(rgba, width, height, point.name.toUpperCase(), left, 58, {
      scale: 2,
      color: "#F1F1F1",
    });
    drawBitmapText(
      rgba,
      width,
      height,
      `HOUR ${point.atHour} / ${point.expectedStage.toUpperCase()}`,
      left,
      80,
      { color: "#BBC2C7" },
    );
    drawBitmapText(
      rgba,
      width,
      height,
      point.referenceStatus === "provisional"
        ? "UNVERIFIED / UNIFORM FIT"
        : "REFERENCE / UNIFORM FIT",
      left,
      100,
      {
        color: point.referenceStatus === "provisional" ? "#DBBA79" : "#D5D5D5",
      },
    );
    if (point.target) {
      const normalized = normalizedBitmap(point.target);
      const target = rasterPixels(
        bitmapPoints(normalized).map((p) => ({ ...p, color: "#FFFFFF" })),
        normalized.width,
        normalized.height,
        "#000000",
      );
      const scaled = scaleRgba(target, normalized.width, normalized.height, 4);
      blitRgba(
        rgba,
        width,
        height,
        scaled.rgba,
        scaled.width,
        scaled.height,
        left,
        116,
      );
    } else
      drawBitmapText(rgba, width, height, "TARGET UNAVAILABLE", left, 155, {
        color: "#DBBA79",
      });
    drawBitmapText(rgba, width, height, "GENERATED / UNIFORM FIT", left, 258, {
      color: "#D5D5D5",
    });
    const bitmap = pixelsToBitmap(capture.pixels),
      normalized = normalizedBitmap(bitmap),
      actual = rasterPixels(
        normalized.rows.flatMap((row, y) =>
          [...row].flatMap((ink, x) =>
            ink === "#" ? [{ x, y, color: "#FFFFFF" }] : [],
          ),
        ),
        32,
        32,
        "#000000",
      );
    const scaled = scaleRgba(actual, 32, 32, 4);
    blitRgba(rgba, width, height, scaled.rgba, 128, 128, left, 276);
    drawBitmapText(
      rgba,
      width,
      height,
      score.metrics
        ? `IOU ${(score.metrics.silhouetteIoU * 100).toFixed(1)}%`
        : "IOU UNSCORED",
      left,
      420,
      { color: "#D2DF94" },
    );
    drawBitmapText(
      rgba,
      width,
      height,
      `${score.actualStage.toUpperCase()} / ${score.alive ? "ALIVE" : "DEAD"}`,
      left,
      438,
      { color: "#BBC2C7" },
    );
    drawBitmapText(
      rgba,
      width,
      height,
      score.sourcePreserved
        ? "SOURCE / FACE RETAINED"
        : "SOURCE INTEGRITY FAILED",
      left,
      456,
      { color: score.sourcePreserved ? "#BBC2C7" : "#F59D87" },
    );
    drawBitmapText(
      rgba,
      width,
      height,
      `CARE ${score.careEvidence.toUpperCase()}`,
      left,
      474,
      { color: "#DBBA79" },
    );
    drawBitmapText(rgba, width, height, "UNSCALED 64-CELL WORLD", left, 494, {
      color: "#BBC2C7",
    });
    const native = rasterPixels(capture.pixels, 64, 64, "#000000");
    blitRgba(rgba, width, height, native, 64, 64, left, 510);
  }
  await writePng(file, width, height, rgba);
}
function lifeDetails(row: RetroAuditSummary["paths"][number]): string {
  const best = row.best;
  if (!best) return "";
  const terminal = best.terminal,
    diagnostics = best.diagnostics;
  return `<p>Whole-life eligibility: <strong>${row.fullLifeEligible ? "earned final form through terminal death" : "not established"}</strong>. ${terminal?.terminal ? `Actual death at ${terminal.terminal.atHour.toFixed(2)}h: ${escape(terminal.terminal.cause)}; final form retained ${terminal.finalFormRetained ? "yes" : "no"}; ${terminal.finalFormLivedHours?.toFixed(2)}h after final reference checkpoint. Fresh-game history reset ${terminal.restart.emptyCommandHistory ? "verified" : "failed"}; blank untimed creation UI requires human review.` : "No terminal death was witnessed."}</p>
  <p>Original native history: <strong>${escape(best.nativeHistoryStatus ?? "unverified")}</strong>${row.nativeHistory ? `; edition ${escape(row.nativeHistory.editionId)}, route ${escape(row.nativeHistory.routeId)}, teen history kind ${row.nativeHistory.teenHistoryKind}. Raw selector counters are not ordinary-command proof.` : ""}.</p>
  ${diagnostics ? `<details><summary>Fixed-schedule transition/action/lifetime samples: ${escape(diagnostics.status)} (${diagnostics.samples.length})</summary><p>Maximum material step ${diagnostics.maximumMaterialStep}; source-feature step ${diagnostics.maximumFeatureStep}. Schedule <code>${escape(diagnostics.scheduleVersion)}</code>; thresholds were fixed before search.</p>${diagnostics.failures.length ? `<ul>${diagnostics.failures.map((failure) => `<li>${escape(failure)}</li>`).join("")}</ul>` : ""}<table><thead><tr><th>Hour</th><th>Sample</th><th>Action / phase</th><th>Source features</th><th>Raw ink bounds</th><th>Retained-form IoU</th></tr></thead><tbody>${diagnostics.samples.map((sample) => `<tr><td>${sample.atHour.toFixed(3)}</td><td>${escape(sample.kind)}</td><td>${escape(sample.action)} / ${sample.animationTime}</td><td>${sample.sourcePreserved ? "retained" : "failed"}</td><td>${sample.bounds.width} × ${sample.bounds.height}</td><td>${sample.referenceMetrics ? (sample.referenceMetrics.silhouetteIoU * 100).toFixed(1) + "%" : "unscored"}</td></tr>`).join("")}</tbody></table></details>` : "<p>Transition/action/lifetime sample acceptance is unscored.</p>"}`;
}
export async function writeHtml(
  out: string,
  summary: RetroAuditSummary,
): Promise<void> {
  const cards = summary.paths
    .map(
      (row) =>
        `<section><h2>${escape(row.characterIds.join(" → "))}</h2><p class="status">${escape(row.status)}</p>${lifeDetails(row)}${row.best ? `<p>Seed <code>${escape(row.best.seed)}</code>; care <code>${escape(row.best.policyId)}</code>; worst-stage silhouette IoU ${row.best.worstIoU === null ? "unscored" : (row.best.worstIoU * 100).toFixed(1) + "%"}.</p><img loading="lazy" src="sheets/${escape(safeStem(row.id))}.png" alt="All reference and generated stages side by side"><p><a href="${escape(row.best.witnessFile)}">Replayable witness recipe</a></p><table><thead><tr><th>Stage</th><th>Actual game</th><th>IoU</th><th>Care evidence</th><th>Gate</th></tr></thead><tbody>${row.best.checkpoints.map((c) => `<tr><td>${escape(c.name)}</td><td>${escape(c.actualStage)}${c.alive ? "" : " (dead)"}</td><td>${c.metrics ? (c.metrics.silhouetteIoU * 100).toFixed(1) + "%" : "unscored"}</td><td>${escape(c.careEvidence)}</td><td>${escape(c.status)}</td></tr>`).join("")}</tbody></table>` : "<p>No generated candidate was available.</p>"}</section>`,
    )
    .join("\n");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Infipet causal retro lifecycle audit</title><style>body{background:#0b1013;color:#dde2e7;font:16px/1.5 system-ui;max-width:1500px;margin:auto;padding:24px}a{color:#8fd8ef}section{border-top:1px solid #53616b;margin:30px 0;padding-top:20px}h1,h2{line-height:1.25}.status{color:#f0cc89}img{max-width:100%;image-rendering:pixelated}table{border-collapse:collapse}td,th{padding:5px 12px;border:1px solid #53616b;text-align:left}code{overflow-wrap:anywhere}</style><h1>Infipet causal retro lifecycle audit</h1><p>Run <code>${escape(summary.runId)}</code>. ${summary.counts.paths} history-distinguished reference cases; ${summary.counts.candidates} bounded seed/care path comparisons. ${summary.counts.failed} failed, ${summary.counts.unscored} unscored, ${summary.counts.machineCandidates} machine candidates, <strong>0 visually accepted</strong>. ${summary.counts.gameEligible === undefined ? "" : summary.counts.gameEligible + " paths reached every combined-game checkpoint alive with source/face retention and matching V1 branch slots where known."}</p><p>Each generated row uses one starting drawing, ordinary seed and concrete gameplay commands. Future reference bitmaps are used only for scoring. Alignment permits translation and uniform scale; it does not rotate, mirror, warp or independently reshape stages. The weakest stage controls the path score.</p><p>Targets can expose existing engine limitations. A failed bounded search is not a proof that no possible seed exists. Missing targets, uncertain editions and undocumented care remain unverified. Reused source/seed/care recipes are comparisons with multiple paths, not independent samples. Native P1 history variants are separate cases. Every sampled ordinary policy continues with shared basic care after194h to actual death; native care scheduling and original timing remain separate unresolved gates. Current gameplay uses the combined V1-style clock; original Tamagotchi timing is not reproduced by these labels. Even a machine candidate requires actual-image review and cannot establish hardware parity.</p><p><a href="manifest.json">Versioned manifest</a> · <a href="cases.json">Audit-only reference cases</a> · <a href="sample-schedule.json">Predeclared sample schedule</a> · <a href="native-rules.json">Native reference rules</a> · <a href="summary.json">Machine summary</a></p>${cards}</html>`;
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "index.html"), html);
}
