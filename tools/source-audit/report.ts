import type { summarize } from "./metrics";
import type { reviewSummary } from "./reviews";
import type { Manifest, Rate, Review } from "./types";
import { digest } from "./protocol";
import {
  acceptanceBanner,
  acceptanceStatus,
  type HumanFeedback,
} from "./acceptance";
import { inventorySupportsEvolution } from "./reviews";
const pct = (r: Rate) =>
  r.percent === null
    ? `unavailable (${r.numerator}/${r.denominator})`
    : `${r.percent.toFixed(1)}% (${r.numerator}/${r.denominator})`;
export const captureStatus = (verification?: { unchanged: boolean }) =>
  verification?.unchanged === true
    ? "unchanged across capture"
    : verification?.unchanged === false
      ? "INVALID AS A FROZEN BASELINE — source files changed during capture; candidate images and findings retained"
      : "unavailable; do not claim a frozen final capture";
export function report(
  m: Manifest,
  s: ReturnType<typeof summarize>,
  r: ReturnType<typeof reviewSummary>,
  reviews: Review[],
  verification?: { unchanged: boolean },
  feedback?: HumanFeedback | null,
) {
  return `# Source-driven evolution — ${m.runId}

**Capture source verification: ${captureStatus(verification)}.** [Verification receipt](capture-source-verification.json)

${acceptanceBanner(feedback, m)}

Protocol **${m.protocolVersion}**, metrics **${m.metricVersion}**. Capture hash \`${m.captureHash}\`. Changed definitions are **incomparable with v6 and audits1/2** unless both cohorts are recomputed under the same definitions.

[Gallery](index.html) · [Frozen manifest and source hashes](manifest.json) · [Source drawings](sources.json) · [Metrics](metrics.json) · [CSV](frames.csv) · [Lineage alerts](lineage-audits.json) · [Review records](visual-reviews.json) · [Accounting](accounting.json)

## Accounting and reliability

${s.actual.cases}/${m.expected.cases} planned cases accounted for; ${s.actual.failures} retained failures. ${s.actual.views}/${m.expected.views} scheduled images captured: ${s.actual.endpoints} milestones, ${s.actual.interiors} intermediates, ${s.actual.poses} motion phases, ${s.actual.sourceViews} source-counterfactual views, ${s.actual.careViews} focused care views. These groups are counted separately.

${s.actual.coreDiagnosticViews}/${m.expected.coreDiagnosticViews} **additional core diagnostic images** are counted separately; they do not increase the primary204-frame proof sample. Core masks use actual body/head/enclosure occupied pixels recolored white, excluding facial marks/eyes/mouth, ears, tails, hair, limbs and ornaments. No hull, hole filling or smoothing is applied. Compare the core lifecycle with both the original authored drawing and its core mask in the gallery.

${s.actual.regionalMaskArtifacts}/${m.expected.regionalMaskArtifacts} regional mask variants show head blue, trunk white, enclosure purple and head/trunk overlap yellow. These are derived views of the same endpoint evaluations, not additional genomes or independent frames. Regional fractions use unique occupied2D pixels divided by the core union. They can overlap and do not sum to1; they are not physical mass estimates.

| Automated check | Percentage | Condition / age |
|---|---:|---|
${Object.values(s.reliability)
  .map((v) => `| ${v.condition} | ${pct(v)} | ${v.age} |`)
  .join("\n")}

Node frame-generation timing: p50 ${s.performance.p50Ms?.toFixed(2) ?? "unavailable"} ms; p95 ${s.performance.p95Ms?.toFixed(2) ?? "unavailable"} ms. Within 16 ms: ${pct(s.performance.within16Ms)}; within 50 ms: ${pct(s.performance.within50Ms)}. Excludes PNG I/O, UI, native rendering, and physical devices. Timing is not an iPhone performance claim.

## Three independent acceptance axes

Numerical shape change cannot substitute for descent from this drawing or care causality. Current agent gate: **${r.gatePassed ? "all recorded transition comparisons pass both reviewers under audit3" : "unreviewed or failed"}**. Overall acceptance: **${acceptanceStatus(r.gatePassed, feedback, m).status}**.

| Actual-image review measure | Percentage / count |
|---|---:|
| Primary transition coverage | ${pct(r.primaryComparisonCoverage)} |
| Primary dramatic evolution ≥2 | ${pct(r.primaryEvolution)} |
| Primary source descent ≥2 | ${pct(r.primaryDescent)} |
| Primary all four transition axes ≥2 | ${pct(r.primaryJointGate)} |
| Distinct primary/secondary identities both pass | ${pct(r.jointIndependentPass)} |
| Primary image coverage | ${pct(r.primaryImageCoverage)} |
| Secondary image coverage | ${pct(r.secondaryImageCoverage)} |
| Primary core diagnostic coverage (separate sample) | ${pct(r.primaryCoreDiagnosticCoverage)} |
| Secondary core diagnostic coverage (separate sample) | ${pct(r.secondaryCoreDiagnosticCoverage)} |
| Primary regional mask coverage (derived variants) | ${pct(r.primaryRegionalMaskCoverage)} |
| Secondary regional mask coverage (derived variants) | ${pct(r.secondaryRegionalMaskCoverage)} |
| Human review records | ${r.humanRecords} |

Scores are assigned only after actual-image inspection. Unreviewed entries carry null scores. Review identity, required image IDs, and pixel hashes are validated; bookkeeping cannot prove that a reviewer really looked at an image. Endpoint-only full-cohort continuity does not establish smooth intermediate motion.

### Anchored visual rubric

| Score | Evolution | Descent | Causal care |
|---|---|---|---|
| 0 | Unchanged | Unrelated replacement | No relevant response or incorrect causality |
| 1 | Scaling, longer appendages, global rotation or posture changes alone, even in combination | Identity largely pasted face/markings | Diagnostic-only, imperceptible, or weak/ambiguous visual response |
| 2 | Core organization plus a second independent anatomical change, with actual regional/core mask evidence | Authored anatomical properties develop into the new form | Relevant perceptible response after the documented lag with a supported mediator |
| 3 | Major coherent reorganization | Regional transformations remain understandable throughout | Distinct inherited response with convincing temporal and mediator evidence |

Continuity and feature coherence use 0 broken, 1 weak, 2 adequate, 3 strong. Sparse drawings have expectations appropriate to the information authored. Passing evolution cannot compensate for descent failure. Motion checks are separate records with all eight actual phases required.

Every reviewed transition records core organization and a SECOND independent anatomical change: regional occupied-area distribution, head/trunk organization, topology, functional role, or enclosure. A new capability is optional; it is not a per-stage quota. Rewording the same curvature/scale change twice is invalid. Regional area claims must match captured normalized mask measurements; they are projected occupancy, not physical mass. Disconnected islands, unusable hair-thin necks/supports, or an unreadable authored face cannot become favorable evidence just because silhouette distance is large. A cocoon disk alone is a lifecycle event, not sufficient metamorphosis: inspect the underlying and emerged core. Metadata/operation labels cannot replace actual visual evidence. Audits1/2 are incomparable with audit3 and are not retroactively rescored to create a pass.

### Core-only numerical diagnostics

| Source / interval | ≥5% core distance | ≥10% | ≥20% | Available / expected comparisons |
|---|---:|---:|---:|---:|
${s.coreTransitionSeparation.map((v) => `| ${v.sourceId} / ${v.fromAge}→${v.toAge} | ${pct(v.separation[0])} | ${pct(v.separation[1])} | ${pct(v.separation[2])} | ${v.availableComparisons}/${v.expectedComparisons} |`).join("\n")}

These compare core masks across ages within a source under the selected histories. They remove uniform scale and whole-creature rotation. Even ≥20% distance can be produced by deformation and never supplies a visual score automatically.

## Within-source numerical separation

Translation, uniform scale, whole-creature rotation, and recoloring are removed from normalized morphology distance. Aspect ratio and internal proportions remain. These are numerical classifications, not perceived distinctiveness.

| Source / age | ≥5% seed-pair distance | ≥10% | ≥20% | Seeds with near-twin (<10%) |
|---|---:|---:|---:|---:|
${s.geneticSeparation.map((v) => `| ${v.sourceId} / day ${v.age} | ${pct(v.separation[0])} | ${pct(v.separation[1])} | ${pct(v.separation[2])} | ${pct(v.nearTwins)} |`).join("\n")}

All rates compare raw seeds **within the same source at neutral care**. Source differences cannot inflate genetic separation. Correlated pair counts are descriptive, not independent population samples. Four-seed proof results do not support a uniqueness guarantee.

## Source and care counterfactuals

${s.sourceCounterfactuals.length} source-pair measurements; ${s.careResponses.length} care/control measurements. See complete per-region measurements and wellbeing/development traces in [metrics](metrics.json) and [diagnostics](diagnostics/). An ancestry label is not evidence of actual material continuity. Inspect both the source and its descendants.

Source interventions: body ratio, body bend, tail length, and eye spacing. Palette and source-order controls test irrelevant-input sensitivity. Inherited-gene equality is reported only when a dedicated inherited object is exposed; a source-conditioned full-genome hash is not treated as that evidence. Rasterized source area is recorded rather than assumed conserved.

Focused care uses ${m.careSeedCount ?? 2} fixed raw seeds, six individual needs, 0% and 100%, day 0/7/90/150 onsets, matched 75% controls, and offsets 0/0.25/1/7/14 days. Exact seed strings and per-case conditions are recorded in the frozen manifest. No immediate silhouette jump is expected at activation. Record fulfillment → mediator → developmental parameter/commitment → rendered result. Recovery of reversible adaptation must be distinguished from permanent branch choices. No care probe is claimed complete when omitted from this run.

Variance attribution is available only for a complete multi-history cohort. The four-history panel contains severe Safety shortage and must not be presented as a moderate-care genetic-dominance test. Complete raw sums of squares and the panel label are preserved.

## Motion and lineage

${s.cycles.filter((c) => c.complete).length}/${s.cycles.length} sampled endpoint cycles have eight distinct reported controller phases. This validates phase accounting, not gait quality or foot slip. Actual posed contacts, joint diagnostics, and camera diagnostics (where exposed) are saved per frame. A single common stable camera must be checked with the eight-pose images.

Source identity, contributor pixels, and expected-host mappings are recorded for every authored region. Legitimate absorption can reduce source-region visibility; protected features and source-specific regional continuity require inspection. Missing IDs/host alerts are diagnosis inputs rather than automatic rejection of legitimate anatomy changes.

## Findings and limitations

${s.limitations.map((v) => `- ${v}`).join("\n")}
- No preset, seed, or history was selected for looking better after growth.
- Expanded collection requires a separately authorized gate decision; default execution remains the small proof.
- No automatic score filling, automatic reviewer equivalence transfer, signed-device check, or physical-widget check occurs in this runner.

### Recorded defects and review notes

${
  reviews
    .filter((v) => v.status === "reviewed" && v.notes)
    .map(
      (v) =>
        `- ${v.caseId}, ${v.fromAge}→${v.toAge}, ${v.reviewer}: ${v.notes.replaceAll("\n", " ")}`,
    )
    .join("\n") ||
  "No actual-image review recorded yet. All visual claims remain unreviewed."
}

### Retained execution failures

${s.failures.map((v) => `- ${v.caseId}: ${v.error}`).join("\n") || "None."}
`;
}
/** Comparison requires exact cohorts. Partial or different reviewed sets never generate visual percentage-point claims. */
export function compareRuns(
  a: Manifest,
  b: Manifest,
  am: ReturnType<typeof summarize>,
  bm: ReturnType<typeof summarize>,
  ar: Review[],
  br: Review[],
) {
  const cohort = (m: Manifest) => ({
    protocolVersion: m.protocolVersion,
    metricVersion: m.metricVersion,
    stage: m.stage,
    probes: m.probes,
    sources: m.sources.map((s) => ({ id: s.id, hash: s.sourceHash })),
    cases: m.cases,
    expected: m.expected,
  });
  if (digest(cohort(a)) !== digest(cohort(b)))
    return {
      comparable: false,
      reason:
        "Different protocol, metric definitions, source drawings, seeds, histories, ages, or planned cases. Recompute both under matching definitions.",
    };
  const complete = (m: ReturnType<typeof summarize>) =>
    m.actual.views === m.expected.views && m.actual.failures === 0;
  const reviewed = (rows: Review[]) =>
      rows.filter(
        (r) =>
          r.status === "reviewed" &&
          r.role === "primary" &&
          r.kind === "transition",
      ),
    keys = (rows: Review[]) => rows.map((r) => `${r.id}/${r.reviewer}`).sort();
  const aa = reviewed(ar),
    bb = reviewed(br),
    expectedTransitions = a.expected.primaryCases * 3;
  const expectedIds = a.cases
    .filter((c) => c.group === "primary")
    .flatMap((c) =>
      [0, 1, 2].map(
        (i) => `${c.id}__transition__${c.ages[i]}-${c.ages[i + 1]}`,
      ),
    )
    .sort();
  const exactPanel = (rows: Review[]) =>
    rows.length === expectedTransitions &&
    new Set(rows.map((r) => r.id)).size === expectedTransitions &&
    digest(rows.map((r) => r.id).sort()) === digest(expectedIds) &&
    rows.every(
      (r) =>
        r.changeInventory !== null &&
        typeof r.changeInventory?.scalingAppendageRotationOrPostureOnly ===
          "boolean" &&
        ((r.evolution ?? 0) < 2 ||
          inventorySupportsEvolution(r.changeInventory)),
    );
  const reviewComparable =
    exactPanel(aa) && exactPanel(bb) && digest(keys(aa)) === digest(keys(bb));
  const ratio = (rows: Review[], axis: "evolution" | "descent") =>
    rows.length
      ? (100 * rows.filter((r) => (r[axis] ?? -1) >= 2).length) / rows.length
      : null;
  return {
    comparable: complete(am) && complete(bm),
    reason:
      complete(am) && complete(bm)
        ? "Matching complete structural cohort"
        : "Partial or failed collection; counts retained, no baseline improvement claim",
    from: a.runId,
    to: b.runId,
    visualComparable: reviewComparable,
    visualReason: reviewComparable
      ? "Exact complete primary reviewer/comparison sets match"
      : "Partial/different reviewer or comparison sets: visual percentage-point changes withheld",
    visualPercentagePoints: reviewComparable
      ? {
          evolution: ratio(bb, "evolution")! - ratio(aa, "evolution")!,
          descent: ratio(bb, "descent")! - ratio(aa, "descent")!,
        }
      : null,
    frameCounts: { from: am.actual, to: bm.actual },
    timing: { from: am.performance, to: bm.performance },
  };
}
