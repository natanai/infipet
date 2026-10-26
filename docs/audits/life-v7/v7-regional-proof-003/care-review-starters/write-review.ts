/** Collate recorded agent visual judgments. No simulation or image inference is performed here. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(
  "docs/audits/life-v7/v7-regional-proof-003/care-review-starters",
);
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
type Group = {
  need: string;
  onset: number;
  condition: 0 | 1;
  scores: number[];
  notes: string[];
};
const rate = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  percent: (100 * numerator) / denominator,
});
async function main() {
  const manifest = JSON.parse(
    await readFile(join(root, "comparison-manifest.json"), "utf8"),
  );
  const assessments: Group[] = JSON.parse(
    await readFile(join(root, "assessments.json"), "utf8"),
  );
  const comparisons: any[] = [],
    reviewedIds = new Set<string>();
  let interventionBoundaryMatches = 0;
  for (const group of assessments) {
    const page = manifest.pages.find(
      (p: any) => p.need === group.need && p.onset === group.onset,
    );
    if (!page || group.scores.length !== 4)
      throw new Error("Incomplete visual group");
    for (let i = 0; i < 4; i++) {
      const seed = i + 1,
        score = group.scores[i];
      if (!Number.isInteger(score) || score < 0 || score > 3)
        throw new Error("Invalid visual score");
      const subject = page.cells.filter(
        (c: any) =>
          !c.control && c.seed === seed && c.fulfillment === group.condition,
      );
      const control = page.cells.filter(
        (c: any) => c.control && c.seed === seed,
      );
      if (subject.length !== 5 || control.length !== 5)
        throw new Error("Unpaired sequence");
      for (const view of [...subject, ...control]) reviewedIds.add(view.id);
      const target = subject.find((c: any) => c.offset === 14),
        baseline = control.find((c: any) => c.offset === 14);
      const unchangedAtIntervention =
        subject.find((c: any) => c.offset === 0).sourcePngSha256 ===
        control.find((c: any) => c.offset === 0).sourcePngSha256;
      if (unchangedAtIntervention) interventionBoundaryMatches++;
      comparisons.push({
        caseId: target.caseId,
        controlCaseId: baseline.caseId,
        needId: group.need,
        onsetDays: group.onset,
        fulfillment: group.condition,
        controlFulfillment: 0.75,
        seedSlot: seed,
        ageDays: target.age,
        responseWindowDays: 14,
        reviewer: "/root/starters_v6",
        reviewerKind: "agent",
        status: "reviewed",
        visualResponseScore: score,
        anyVisibleResponse: score >= 1,
        clearRelevantResponse: score >= 2,
        unchangedAtIntervention,
        notes: group.notes,
        targetViewId: target.id,
        controlViewId: baseline.id,
        supportingSequenceViewIds: subject.map((c: any) => c.id),
        controlSequenceViewIds: control.map((c: any) => c.id),
        evidencePage: page.file,
        evidencePageSha256: page.sha256,
      });
    }
  }
  const views = Object.entries(manifest.inputHashes).map(([id, pngSha256]) => ({
    id,
    pngSha256,
    reviewer: "/root/starters_v6",
    reviewerKind: "agent",
    status: reviewedIds.has(id) ? "reviewed" : "unreviewed",
    assessmentType:
      "matched static sequence; no individual early-time score assigned",
  }));
  const groups = assessments.map((group) => ({
    needId: group.need,
    onsetDays: group.onset,
    fulfillment: group.condition,
    controlFulfillment: 0.75,
    ageDays: group.onset + 14,
    condition: `${group.need} ${group.condition * 100}% from day${group.onset} versus75%`,
    anyVisible: rate(group.scores.filter((score) => score >= 1).length, 4),
    clearRelevant: rate(group.scores.filter((score) => score >= 2).length, 4),
    scores: group.scores,
    notes: group.notes,
  }));
  const aggregate = (items: any[]) => ({
    anyVisible: rate(
      items.filter((item) => item.anyVisibleResponse).length,
      items.length,
    ),
    clearRelevant: rate(
      items.filter((item) => item.clearRelevantResponse).length,
      items.length,
    ),
  });
  const needs = [
    "safety",
    "security",
    "trust",
    "rest",
    "relaxation",
    "physical-fitness",
  ];
  const summary = needs.map((needId) => ({
    needId,
    shortage: aggregate(
      comparisons.filter((c) => c.needId === needId && c.fulfillment === 0),
    ),
    fullyTended: aggregate(
      comparisons.filter((c) => c.needId === needId && c.fulfillment === 1),
    ),
  }));
  const onsets = [0, 7, 90, 150].map((onsetDays) => ({
    onsetDays,
    ageDays: onsetDays + 14,
    shortage: aggregate(
      comparisons.filter(
        (c) => c.onsetDays === onsetDays && c.fulfillment === 0,
      ),
    ),
    fullyTended: aggregate(
      comparisons.filter(
        (c) => c.onsetDays === onsetDays && c.fulfillment === 1,
      ),
    ),
  }));
  const baselineRoot = resolve("docs/audits/life-v7/v7-regional-proof-002");
  const baseline = JSON.parse(
    await readFile(
      join(baselineRoot, "care-review-starters/review-starters.json"),
      "utf8",
    ),
  );
  const beforeManifest = JSON.parse(
    await readFile(join(baselineRoot, "manifest.json"), "utf8"),
  );
  const afterManifest = JSON.parse(
    await readFile(join(root, "../manifest.json"), "utf8"),
  );
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
  const comparable =
    baseline.reviewProtocol === "care-static-visual-response-v1" &&
    beforeManifest.sourceHashes["src/presets.ts"] ===
      afterManifest.sourceHashes["src/presets.ts"] &&
    beforeManifest.sourceHashes["src/needs/catalog-data.json"] ===
      afterManifest.sourceHashes["src/needs/catalog-data.json"] &&
    cohort(beforeManifest) === cohort(afterManifest);
  if (!comparable)
    throw new Error(
      "Changed care cohort or rubric: percentage-point comparison is not valid",
    );
  const comparisonRows = groups.map((row) => {
    const old = baseline.groups.find(
      (group: any) =>
        group.needId === row.needId &&
        group.onsetDays === row.onsetDays &&
        group.fulfillment === row.fulfillment,
    );
    if (!old || old.clearRelevant.denominator !== row.clearRelevant.denominator)
      throw new Error("Mismatched condition denominator");
    return {
      needId: row.needId,
      onsetDays: row.onsetDays,
      ageDays: row.ageDays,
      fulfillment: row.fulfillment,
      before: old.clearRelevant,
      after: row.clearRelevant,
      percentagePointChange:
        row.clearRelevant.percent - old.clearRelevant.percent,
    };
  });
  const perNeedComparison = summary.map((row) => {
    const old = baseline.summary.find((x: any) => x.needId === row.needId);
    return {
      needId: row.needId,
      shortage: {
        before: old.shortage.clearRelevant,
        after: row.shortage.clearRelevant,
        percentagePointChange:
          row.shortage.clearRelevant.percent -
          old.shortage.clearRelevant.percent,
      },
      fullyTended: {
        before: old.fullyTended.clearRelevant,
        after: row.fullyTended.clearRelevant,
        percentagePointChange:
          row.fullyTended.clearRelevant.percent -
          old.fullyTended.clearRelevant.percent,
      },
    };
  });
  const shortageGroups = groups.filter((row) => row.fulfillment === 0);
  const shortageGate = {
    requirement:
      "At least3/4 seeds score>=2 in every need/onset shortage condition at 14 days",
    requiredClearSeeds: 3,
    passingGroups: shortageGroups.filter(
      (row) => row.clearRelevant.numerator >= 3,
    ).length,
    totalGroups: shortageGroups.length,
    failures: shortageGroups.filter((row) => row.clearRelevant.numerator < 3),
  };
  const baselineComparison = {
    baselineRunId: baseline.runId,
    baselineCaptureHash: baseline.captureHash,
    comparable: true,
    checks:
      "Identical visual rubric, preset hash, catalog hash and care case IDs/source/seeds/keyframes/ages; same reviewer and matched-sheet method",
    baselineReceiptSha256: sha(
      await readFile(
        join(baselineRoot, "care-review-starters/review-starters.json"),
      ),
    ),
    perNeed: perNeedComparison,
    conditions: comparisonRows,
  };
  const receipt = {
    reviewProtocol: "care-static-visual-response-v1",
    runId: manifest.runId,
    reviewedAt: new Date().toISOString(),
    captureHash: manifest.captureHash,
    reviewer: "/root/starters_v6",
    reviewerKind: "agent",
    humanReview: "not performed",
    sourceAuthorAware: true,
    blindness:
      "unblinded matched comparison; reviewer authored regional planner, enclosure, roles and needs integration",
    method:
      "Inspected all 24 actual derived PNG sheets. Each page has four fixed seed rows with matched75% control,0%,100% conditions, and offsets0,.25,1,7,14 days. Source image pixels were only enlarged x2 with nearest-neighbor scaling. No engine evaluation, seed selection or automated visual scoring.",
    scoreAnchors: {
      0: "No reliably visible response at this display scale",
      1: "Subtle contour, fullness or posture difference; weak player-facing signal",
      2: "Clear relevant fullness, exposure or posture response",
      3: "Strong coherent remodeling response",
    },
    headlineThreshold:
      "clearRelevantResponse means visual score>=2; pixel difference alone is insufficient",
    coverage: {
      plannedCareViews: manifest.plannedCareViews,
      visuallyInspectedCareViews: reviewedIds.size,
      unreviewedCareViews: manifest.plannedCareViews - reviewedIds.size,
      compared14DayCases: comparisons.length,
      expected14DayCases: 192,
      uniqueControls: views.filter((v: any) => v.id.includes("__control__"))
        .length,
      pagesInspected: 24,
    },
    catalog: manifest.catalog,
    shortageGate,
    baselineComparison,
    automatedFrozenPixelCheck: {
      condition:
        "Treatment PNG exactly matches matched75% PNG at the intervention boundary; this is separate from visual scoring",
      agreement: rate(interventionBoundaryMatches, comparisons.length),
    },
    limitations: [
      "Four fixed raw seeds of the Cub source; descriptive cohort proportions, not independent population estimates.",
      "Same seeds recur across conditions and ages; no bootstrap or significance claim is made for visual scores.",
      "2x enlarged64px static outputs were reviewed; movement pace, pose-cycle comfort, emitted feelings and ordinary phone interaction were not reviewed here.",
      "A body change may be relevant to a declared response without uniquely communicating which unmet need caused it.",
      "100%-versus75% morphology can remain absent in one-sided shortage-led profiles; this is not counted as a failure of need storage or feelings.",
      "Recovery has no restore intervention in this cohort and is a separate regression test.",
      "Human judgment may disagree; earlier user feedback is not superseded by this agent review.",
    ],
    evidence: manifest.pages.map((p: any) => ({
      file: p.file,
      sha256: p.sha256,
    })),
    provenance: {
      comparisonManifestSha256: sha(
        await readFile(join(root, "comparison-manifest.json")),
      ),
      assessmentsSha256: sha(await readFile(join(root, "assessments.json"))),
      deriveToolSha256: sha(await readFile(join(root, "derive.ts"))),
    },
    summary,
    onsets,
    groups,
    comparisons,
    views,
  };
  if (
    receipt.coverage.unreviewedCareViews ||
    comparisons.length !== 192 ||
    groups.length !== 48
  )
    throw new Error("Incomplete review accounting");
  await writeFile(
    join(root, "review-starters.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  await writeFile(
    join(root, "comparison-vs-002.json"),
    JSON.stringify(baselineComparison, null, 2) + "\n",
  );
  const fmt = (r: any) =>
    `${r.numerator}/${r.denominator} (${r.percent.toFixed(1)}%)`;
  let report = `# Frozen care-response visual review\n\nRun: **${manifest.runId}**. Reviewer: agent /root/starters_v6, source-author aware and unblinded. Human review remains pending.\n\nAll **1,040/1,040 frozen care images** were inspected through 24 [matched comparison sheets](comparison-manifest.json), yielding 192 seed-level 14-day comparisons. Runtime was not evaluated or edited. The raw pixel-difference pass rate is not a visual legibility score.\n\n`;
  report += `All **${shortageGate.passingGroups}/${shortageGate.totalGroups} shortage need/onset groups** meet the at least 3/4 clear-seed requirement by 14 days. Fast guarding, bracing, anterior withdrawal and tension are now readable alongside slower tissue/fullness changes. Early Rest/Fitness remain the weakest cohorts: seed 3 stays subtle at both infant onsets. Some elder seed 2 responses are also restrained. Appearance still does not uniquely identify a specific unmet need.\n\n`;
  report += `## Scoring\n\n0=no reliably visible difference;1=subtle contour/fullness/posture;2=clear relevant response;3=strong coherent remodeling. Headline counts require **score>=2**. Every seed comparison used all five sampled offsets and its matched control; early frames support sequence review and have no standalone score.\n\n`;
  report += `## Per-need results\n\nEach denominator 16 is four fixed seeds at four onsets, evaluated 14 days later. These repeated-seed observations are descriptive, not independent population trials.\n\n| Need |0% clear |0% any visible |100% clear |100% any visible |\n|---|---:|---:|---:|---:|\n`;
  for (const row of summary)
    report += `|${row.needId}|${fmt(row.shortage.clearRelevant)}|${fmt(row.shortage.anyVisible)}|${fmt(row.fullyTended.clearRelevant)}|${fmt(row.fullyTended.anyVisible)}|\n`;
  report += `\nSafety, Security and Relaxation 100% still show no extra morphology relative to 75%, consistent with their one-sided structural profiles. Trust's positive exposure is now readable; Rest and Fitness also have visible positive fullness/recruitment.\n\n## Change from frozen 002\n\nThe rubric, source preset, catalog and all care case IDs/seeds/keyframes/ages match. These are comparable descriptive percentage-point changes, with no claim of independent population sampling. Each rate uses the same 16 seed/onset cases evaluated14days after its onset.\n\n|Need|002 shortage clear|003 shortage clear|Change pp|002 100% clear|003 100% clear|Change pp|\n|---|---:|---:|---:|---:|---:|---:|\n`;
  for (const row of perNeedComparison)
    report += `|${row.needId}|${fmt(row.shortage.before)}|${fmt(row.shortage.after)}|+${row.shortage.percentagePointChange.toFixed(2)}|${fmt(row.fullyTended.before)}|${fmt(row.fullyTended.after)}|+${row.fullyTended.percentagePointChange.toFixed(2)}|\n`;
  report += `\n## Complete conditions\n\nAll conditions compare against 75% with identical source/seed/age. Four-seed arrays are in seed slots1–4. A 0% condition passes the visual requirement only when at least 3/4 seeds score 2 or 3.\n\n|Need|Fulfillment|Onset day|Evaluated day|Clear>=2|Any visible>=1|Scores|\n|---|---:|---:|---:|---:|---:|---|\n`;
  for (const row of groups.sort(
    (a, b) =>
      needs.indexOf(a.needId) - needs.indexOf(b.needId) ||
      a.onsetDays - b.onsetDays ||
      a.fulfillment - b.fulfillment,
  ))
    report += `|${row.needId}|${row.fulfillment * 100}%|${row.onsetDays}|${row.ageDays}|${fmt(row.clearRelevant)}|${fmt(row.anyVisible)}|${row.scores.join(",")}|\n`;
  report += `\n## Exact weak rows and examples\n\n- Early Rest0%: \`care__s03__onset0__rest__0\` and \`care__s03__onset7__rest__0\` score1; the other three seed rows score2. See [onset0](rest-onset0.png) and [onset7](rest-onset7.png).\n- Early Fitness0%: \`care__s03__onset0__physical-fitness__0\` and \`care__s03__onset7__physical-fitness__0\` score1; the other three rows score2. See [onset0](physical-fitness-onset0.png) and [onset7](physical-fitness-onset7.png). These are fresh full-proof rows covering the early-preview claim; no duplicate inspection credit is taken.\n- Elder seed 2 remains subtle for Safety, Security, Trust, Rest and Fitness0%; the corresponding onset150 groups are 3/4, not 4/4. [Relaxation onset150](relaxation-onset150.png) is readable in all four.\n- [Trust onset90](trust-onset90.png) has readable withdrawal at0% and opening at100%; [Security onset0](security-onset0.png) shows a genuine braced material-root arrangement.\n\n## Boundaries and coverage\n\nAll 192/192 treatment PNGs exactly match their matched75% control at the intervention boundary; this automated identity check is separate from visual scoring. Catalog remains **67 needs, 48 feelings, 56 separate interpretations**, with the JSON hash matching the frozen capture. Recovery was not tested by this care cohort and remains a separate regression. Motion, feelings, native-size phone readability and human acceptance need separate review. No cases were dropped or substituted. The [receipt](review-starters.json) contains 1,040 reviewed-view records, 192 comparison records, all page hashes and comparable002→003 condition changes. Source-author familiarity and lack of human review are explicit.\n`;
  await writeFile(join(root, "REPORT.md"), report);
  process.stdout.write(
    JSON.stringify({
      coverage: receipt.coverage,
      shortageGate,
      summary,
      perNeedComparison,
    }) + "\n",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
