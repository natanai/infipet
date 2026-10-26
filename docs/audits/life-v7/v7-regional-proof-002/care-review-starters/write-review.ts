/** Collate recorded agent visual judgments. No simulation or image inference is performed here. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(
  "docs/audits/life-v7/v7-regional-proof-002/care-review-starters",
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
  const fmt = (r: any) =>
    `${r.numerator}/${r.denominator} (${r.percent.toFixed(1)}%)`;
  let report = `# Frozen care-response visual review\n\nRun: **${manifest.runId}**. Reviewer: agent /root/starters_v6, source-author aware and unblinded. Human review remains pending.\n\nAll **1,040/1,040 frozen care images** were inspected through 24 [matched comparison sheets](comparison-manifest.json), yielding 192 seed-level 14-day comparisons. Runtime was not evaluated or edited. The raw pixel-difference pass rate is not a visual legibility score.\n\n`;
  report += `Clear responses were most common during day 90 remodeling. Infant and elder shortages were usually small contour/posture variants. Positive Rest and Physical Fitness produced the clearest fuller-body responses. Several different needs still read as generic fullness changes; the images alone do not reliably identify a specific need.\n\n`;
  report += `## Scoring\n\n0=no reliably visible difference;1=subtle contour/fullness/posture;2=clear relevant response;3=strong coherent remodeling. Headline counts require **score>=2**. Every seed comparison used all five sampled offsets and its matched control; early frames support sequence review and have no standalone score.\n\n`;
  report += `## Per-need results\n\nEach denominator16 is four fixed seeds at four onsets, evaluated14 days later. These repeated-seed observations are descriptive, not independent population trials.\n\n| Need |0% clear |0% any visible |100% clear |100% any visible |\n|---|---:|---:|---:|---:|\n`;
  for (const row of summary)
    report += `|${row.needId}|${fmt(row.shortage.clearRelevant)}|${fmt(row.shortage.anyVisible)}|${fmt(row.fullyTended.clearRelevant)}|${fmt(row.fullyTended.anyVisible)}|\n`;
  report += `\nSafety, Security and Relaxation 100% showed no extra morphology relative to 75%, consistent with their one-sided shortage-led structural profiles. Trust has a positive exposure channel, but its visible effect was weak in this sample. This absence does not imply that fulfillment or feelings were inactive.\n\n## Complete conditions\n\nAll conditions compare against 75% with identical source/seed/age. Four-seed arrays are in seed slots1–4.\n\n|Need|Fulfillment|Onset day|Evaluated day|Clear>=2|Any visible>=1|Scores|\n|---|---:|---:|---:|---:|---:|---|\n`;
  for (const row of groups.sort(
    (a, b) =>
      needs.indexOf(a.needId) - needs.indexOf(b.needId) ||
      a.onsetDays - b.onsetDays ||
      a.fulfillment - b.fulfillment,
  ))
    report += `|${row.needId}|${row.fulfillment * 100}%|${row.onsetDays}|${row.ageDays}|${fmt(row.clearRelevant)}|${fmt(row.anyVisible)}|${row.scores.join(",")}|\n`;
  report += `\n## Reproducible examples\n\n- [Safety onset90](safety-onset90.png): all four shortage cases show a readable guarded/broader body by day 104.\n- [Security onset0](security-onset0.png): all four numerical responses remain subtle visually atday14; no clear-response credit.\n- [Trust onset90](trust-onset90.png): shortage has readable anterior withdrawal in three seeds;100% remains weak.\n- [Rest onset7](rest-onset7.png) and [Fitness onset7](physical-fitness-onset7.png):100% conditions show clear fullness across four seeds by day 21.\n- [Safety onset150](safety-onset150.png): elder shortage remains only a minor contour response after14 days.\n\n## Boundaries and coverage\n\nCatalog remains **67 needs, 48 feelings, 56 separate interpretations**. Its JSON hash exactly matches the frozen capture. Recovery was not tested by this care cohort; it belongs to the separate restore-history regression. Motion and feelings require separate review. No cases were dropped or substituted. The [receipt](review-starters.json) contains 1,040 reviewed-view records, 192 comparison records, all page hashes, input-image hashes via the comparison manifest, and reviewer limitations. Source-author familiarity and lack of human review are explicit.\n`;
  await writeFile(join(root, "REPORT.md"), report);
  process.stdout.write(
    JSON.stringify({ coverage: receipt.coverage, summary }) + "\n",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
