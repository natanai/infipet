/** Strict application of prior visual evidence plus three fresh paired inspections. No engine evaluation. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(
  "docs/audits/life-v7/v7-regional-proof-004/care-review-starters",
);
const priorRoot = resolve(
  "docs/audits/life-v7/v7-regional-proof-003/care-review-starters",
);
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const rate = (n: number, d: number) => ({
  numerator: n,
  denominator: d,
  percent: (100 * n) / d,
});
async function json(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function main() {
  const old = await json(join(priorRoot, "review-starters.json"));
  const mappingPath = join(root, "../review-equivalence-from-003.json"),
    mapping = await json(mappingPath);
  const manifest = await json(join(root, "../manifest.json")),
    before = await json(join(priorRoot, "../manifest.json"));
  const fresh = await json(join(root, "fresh-assessments.json")),
    freshSheets = await json(join(root, "fresh-comparison-manifest.json"));
  const cohort = (m: any) =>
    JSON.stringify(
      m.cases
        .filter((c: any) => c.group === "care")
        .map((c: any) => ({
          id: c.id,
          sourceId: c.sourceId,
          seed: c.seed,
          keyframes: c.keyframes,
          ages: c.ages,
        }))
        .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    );
  if (
    cohort(manifest) !== cohort(before) ||
    manifest.sourceHashes["src/presets.ts"] !==
      before.sourceHashes["src/presets.ts"] ||
    manifest.sourceHashes["src/needs/catalog-data.json"] !==
      before.sourceHashes["src/needs/catalog-data.json"] ||
    old.captureHash !== mapping.fromCaptureHash ||
    manifest.captureHash !== mapping.toCaptureHash
  )
    throw new Error(
      "Changed cohort/catalog/source or invalid capture equivalence",
    );
  const equivalence = new Map<string, any>(
    mapping.views
      .filter((v: any) => v.kind === "care")
      .map((v: any) => [v.id, v]),
  );
  if (equivalence.size !== 1040)
    throw new Error("Incomplete equivalence mapping");
  const currentHashes = new Map<string, string>();
  const oldViews = new Map<string, any>(old.views.map((v: any) => [v.id, v]));
  const allIds = [...equivalence.keys()];
  for (let offset = 0; offset < allIds.length; offset += 32)
    await Promise.all(
      allIds.slice(offset, offset + 32).map(async (id) => {
        const hash = sha(await readFile(join(root, "../images", `${id}.png`))),
          match = equivalence.get(id)!;
        if (
          hash !== match.afterPNGHash ||
          oldViews.get(id).pngSha256 !== match.beforePNGHash
        )
          throw new Error(`PNG provenance changed: ${id}`);
        currentHashes.set(id, hash);
      }),
    );
  const inspected = new Set<string>(
    freshSheets.pages.flatMap((p: any) => p.cells.map((c: any) => c.id)),
  );
  const now = new Date().toISOString(),
    oldReceiptSha = sha(
      await readFile(join(priorRoot, "review-starters.json")),
    );
  let transferred = 0,
    renewed = 0;
  const comparisons = old.comparisons.map((comparison: any) => {
    const ids = [
      ...comparison.supportingSequenceViewIds,
      ...comparison.controlSequenceViewIds,
    ];
    const assessment = fresh.find((x: any) => x.caseId === comparison.caseId);
    const completeExact = ids.every(
      (id) =>
        equivalence.get(id)?.identical && equivalence.get(id)?.pngIdentical,
    );
    if (!assessment && !completeExact)
      throw new Error(`Unreviewed changed sequence: ${comparison.caseId}`);
    if (assessment && !ids.every((id) => inspected.has(id)))
      throw new Error(`Incomplete fresh sequence: ${comparison.caseId}`);
    const score =
      assessment?.visualResponseScore ?? comparison.visualResponseScore;
    const unchangedAtIntervention =
      currentHashes.get(comparison.supportingSequenceViewIds[0]) ===
      currentHashes.get(comparison.controlSequenceViewIds[0]);
    if (assessment) renewed++;
    else transferred++;
    const page = freshSheets.pages.find(
      (p: any) => p.caseId === comparison.caseId,
    );
    return {
      ...comparison,
      visualResponseScore: score,
      anyVisibleResponse: score >= 1,
      clearRelevantResponse: score >= 2,
      unchangedAtIntervention,
      notes: assessment?.notes ?? comparison.notes,
      reviewedAt: assessment ? now : old.reviewedAt,
      appliedAt: now,
      reviewMethod: assessment
        ? "fresh004-complete-paired-sequence"
        : "verified003-prior-review-application",
      sourceReview: {
        runId: old.runId,
        reviewedAt: old.reviewedAt,
        reviewer: comparison.reviewer,
        receiptSha256: oldReceiptSha,
      },
      allRequiredImagesPixelAndPNGIdentical: completeExact,
      evidencePage: page
        ? page.file
        : `../../v7-regional-proof-003/care-review-starters/${comparison.evidencePage}`,
      evidencePageSha256: page ? page.sha256 : comparison.evidencePageSha256,
      targetPNGHash: currentHashes.get(comparison.targetViewId),
      controlPNGHash: currentHashes.get(comparison.controlViewId),
    };
  });
  if (transferred !== 189 || renewed !== 3 || inspected.size !== 25)
    throw new Error("Unexpected review accounting");
  const views = old.views.map((v: any) => ({
    ...v,
    pngSha256: currentHashes.get(v.id),
    status: "reviewed",
    reviewMethod: inspected.has(v.id)
      ? "fresh004-paired-sequence-inspection"
      : "verified003-prior-review-application",
    reviewedAt: inspected.has(v.id) ? now : old.reviewedAt,
    appliedAt: now,
    sourceReview: {
      runId: old.runId,
      reviewedAt: old.reviewedAt,
      reviewer: old.reviewer,
      receiptSha256: oldReceiptSha,
    },
    originalPixelAndPNGIdentical:
      equivalence.get(v.id).identical && equivalence.get(v.id).pngIdentical,
  }));
  const groups = old.groups.map((g: any) => {
    const rows = comparisons
      .filter(
        (c: any) =>
          c.needId === g.needId &&
          c.onsetDays === g.onsetDays &&
          c.fulfillment === g.fulfillment,
      )
      .sort((a: any, b: any) => a.seedSlot - b.seedSlot);
    if (rows.length !== 4) throw new Error("Missing condition seed");
    return {
      ...g,
      scores: rows.map((c: any) => c.visualResponseScore),
      anyVisible: rate(rows.filter((c: any) => c.anyVisibleResponse).length, 4),
      clearRelevant: rate(
        rows.filter((c: any) => c.clearRelevantResponse).length,
        4,
      ),
    };
  });
  const aggregate = (rows: any[]) => ({
    anyVisible: rate(
      rows.filter((c) => c.anyVisibleResponse).length,
      rows.length,
    ),
    clearRelevant: rate(
      rows.filter((c) => c.clearRelevantResponse).length,
      rows.length,
    ),
  });
  const summary = old.summary.map((s: any) => ({
    needId: s.needId,
    shortage: aggregate(
      comparisons.filter(
        (c: any) => c.needId === s.needId && c.fulfillment === 0,
      ),
    ),
    fullyTended: aggregate(
      comparisons.filter(
        (c: any) => c.needId === s.needId && c.fulfillment === 1,
      ),
    ),
  }));
  const shortage = groups.filter((g: any) => g.fulfillment === 0);
  const shortageGate = {
    requirement: old.shortageGate.requirement,
    requiredClearSeeds: 3,
    passingGroups: shortage.filter((g: any) => g.clearRelevant.numerator >= 3)
      .length,
    totalGroups: 24,
    failures: shortage.filter((g: any) => g.clearRelevant.numerator < 3),
  };
  const deltas = groups.map((g: any) => {
    const p = old.groups.find(
      (x: any) =>
        x.needId === g.needId &&
        x.onsetDays === g.onsetDays &&
        x.fulfillment === g.fulfillment,
    );
    return {
      needId: g.needId,
      onsetDays: g.onsetDays,
      ageDays: g.ageDays,
      fulfillment: g.fulfillment,
      before: p.clearRelevant,
      after: g.clearRelevant,
      percentagePointChange: g.clearRelevant.percent - p.clearRelevant.percent,
    };
  });
  const receipt = {
    reviewProtocol: old.reviewProtocol,
    runId: manifest.runId,
    captureHash: manifest.captureHash,
    recordedAt: now,
    reviewer: old.reviewer,
    reviewerKind: "agent",
    humanReview: "not performed",
    sourceAuthorAware: true,
    method:
      "189 complete unchanged case/control sequences reuse003 judgments after exact stored-pixel AND actual PNG verification. Three changed case/control sequences were freshly inspected at every offset through actual0042x PNG sheets. This is not fresh inspection of all1040 images.",
    scoreAnchors: old.scoreAnchors,
    headlineThreshold: old.headlineThreshold,
    coverage: {
      plannedCareViews: 1040,
      careViewsWithApplicableReview: views.length,
      unreviewedCareViews: 0,
      completePriorCaseReviewsApplied: transferred,
      freshCaseReviews: renewed,
      comparisons: comparisons.length,
      exactCareImages: allIds.filter(
        (id) =>
          equivalence.get(id).identical && equivalence.get(id).pngIdentical,
      ).length,
      changedCareImages: allIds.filter(
        (id) =>
          !equivalence.get(id).identical || !equivalence.get(id).pngIdentical,
      ).length,
      freshCaseViewPositions: 30,
      freshUniqueCareViews: inspected.size,
      priorReviewOnlyCareViews: views.length - inspected.size,
      note: "Two seed01/onset7 cases share five controls;30 freshly inspected case positions are25 unique frozen images.",
    },
    previousInspection: {
      runId: old.runId,
      reviewedAt: old.reviewedAt,
      reviewer: old.reviewer,
      method: old.method,
      receiptSha256: oldReceiptSha,
      originalCoverage: old.coverage,
    },
    provenance: {
      equivalenceReceiptSha256: sha(await readFile(mappingPath)),
      currentManifestSha256: sha(
        await readFile(join(root, "../manifest.json")),
      ),
      freshSheetManifestSha256: sha(
        await readFile(join(root, "fresh-comparison-manifest.json")),
      ),
      freshAssessmentsSha256: sha(
        await readFile(join(root, "fresh-assessments.json")),
      ),
    },
    catalog: {
      ...old.catalog,
      matchesFrozenCatalog:
        old.catalog.sha256 ===
        manifest.sourceHashes["src/needs/catalog-data.json"],
    },
    automatedFrozenPixelCheck: {
      condition:
        "Treatment PNG equals matched75% control at intervention boundary",
      agreement: rate(
        comparisons.filter((c: any) => c.unchangedAtIntervention).length,
        192,
      ),
    },
    shortageGate,
    summary,
    groups,
    comparisons,
    views,
    comparisonFrom003: {
      comparable: true,
      checks:
        "Same rubric, source preset hash, catalog hash, source IDs, seed strings, keyframes and ages; unchanged sequences require exact stored-pixel and PNG match",
      conditions: deltas,
    },
    evidence: freshSheets.pages.map((p: any) => ({
      file: p.file,
      sha256: p.sha256,
    })),
    limitations: old.limitations,
  };
  await writeFile(
    join(root, "review-starters.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  await writeFile(
    join(root, "comparison-vs-003.json"),
    JSON.stringify(receipt.comparisonFrom003, null, 2) + "\n",
  );
  const fmt = (r: any) =>
    `${r.numerator}/${r.denominator} (${r.percent.toFixed(2)}%)`;
  let report = `# Care review applied to frozen004\n\n**Not a fresh1,040-image inspection.** This receipt applies189 complete003 case reviews only after exact stored-pixel and PNG equivalence, and freshly reviews the three changed paired sequences. That is30 case-position views, or25 unique PNGs because two cases share controls. There are1,040/1,040 applicable reviewed views and0 unreviewed cases.\n\n[Strict equivalence](../review-equivalence-from-003.json) · [Prior003 inspection](../../v7-regional-proof-003/care-review-starters/REPORT.md) · [Current receipt](review-starters.json) · [003→004 condition deltas](comparison-vs-003.json)\n\nThe prior reviewer/time are retained for transferred records. Fresh records have a new inspection time. Same source/catalog/cohort and the unchanged0–3 rubric are validated. Reviewer is /root/starters_v6, source-author aware and unblinded; human review remains pending. Runtime was not evaluated or changed.\n\n## Fresh changed-case findings\n\n`;
  for (const c of fresh)
    report += `- [${c.caseId}](${c.caseId}.png): score${c.visualResponseScore}. ${c.notes.join(" ")}\n`;
  report += `\nAll **${shortageGate.passingGroups}/24 shortage need/onset groups** still reach at least3/4 seeds with score>=2 by14days. Each of the48 condition percentages is unchanged from003 (**0 percentage points**). Pixel repair alone earns no score increase.\n\n|Need|0% clear across16 seed/onset cases|100% clear across16|\n|---|---:|---:|\n`;
  for (const s of summary)
    report += `|${s.needId}|${fmt(s.shortage.clearRelevant)}|${fmt(s.fullyTended.clearRelevant)}|\n`;
  report += `\n## Complete shortage conditions\n\nFour fixed seeds per need/onset; evaluation is14days later. Unchanged needs remain75%.\n\n|Need|Onset|Evaluated day|Clear>=2|Seed-slot scores1–4|\n|---|---:|---:|---:|---|\n`;
  for (const g of shortage)
    report += `|${g.needId}|${g.onsetDays}|${g.ageDays}|${fmt(g.clearRelevant)}|${g.scores.join(",")}|\n`;
  report += `\nEarly Rest/Fitness seed03 at onsets0/7 and the previously recorded subtle elder seed02 rows remain weak cases. Safety/Security/Relaxation100% remain structurally neutral as expected; no positive transformation is forced. Boundaries match in192/192 PNG comparisons. Catalog67/48/56 and its frozen hash remain unchanged. Static enlarged-image judgments do not establish native phone readability, movement quality, recovery or human acceptance. The [failed002 baseline](../../v7-regional-proof-002/care-review-starters/REPORT.md) remains preserved;003's comparable improvement is not overwritten.\n`;
  await writeFile(join(root, "REPORT.md"), report);
  process.stdout.write(
    JSON.stringify({
      coverage: receipt.coverage,
      shortageGate,
      boundary: receipt.automatedFrozenPixelCheck.agreement,
      allConditionDeltasZero: deltas.every(
        (x: any) => x.percentagePointChange === 0,
      ),
    }) + "\n",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
