import { digest } from "./protocol";
import type { AuditManifest, VisualReview } from "./types";

export type ReviewIndexRun = {
  id: string;
  manifest: AuditManifest;
  primaryReview: VisualReview[];
};

const pairKey = (review: Pick<VisualReview, "caseId" | "fromAge" | "toAge">) =>
  JSON.stringify([review.caseId, review.fromAge, review.toAge]);

/** Frozen cohort identity excludes engine hashes: engine revisions are compared. */
export function manifestCohortKey(manifest: AuditManifest): string {
  return digest({
    protocol: manifest.protocolVersion,
    metric: manifest.metricVersion,
    presets: manifest.presets.map((preset) => [preset.id, preset.sourceHash]),
    seeds: manifest.seeds,
    histories: manifest.histories,
    ages: manifest.ages,
  });
}

export function reviewPanel(run: ReviewIndexRun) {
  const expected = new Set<string>();
  for (const preset of run.manifest.presets)
    for (let seed = 0; seed < run.manifest.seeds.length; seed++)
      for (const history of run.manifest.histories)
        for (let age = 1; age < run.manifest.ages.length; age++)
          expected.add(
            pairKey({
              caseId: `${preset.id}__s${String(seed + 1).padStart(2, "0")}__${history.id}`,
              fromAge: run.manifest.ages[age - 1],
              toAge: run.manifest.ages[age],
            }),
          );
  const records = run.primaryReview.filter(
    (review) => review.status === "reviewed",
  );
  const actual = new Set(records.map(pairKey));
  const valid = [...actual].filter((key) => expected.has(key));
  const duplicates = records.length - actual.size;
  const unexpected = actual.size - valid.length;
  const invalidScores = records.filter(
    (review) =>
      review.distinctiveness === null ||
      !Number.isInteger(review.distinctiveness) ||
      review.distinctiveness < 0 ||
      review.distinctiveness > 3,
  ).length;
  const expectedCount = expected.size;
  const complete =
    expectedCount > 0 &&
    valid.length === expectedCount &&
    duplicates === 0 &&
    unexpected === 0 &&
    invalidScores === 0 &&
    expectedCount ===
      run.manifest.expected.cases * Math.max(0, run.manifest.ages.length - 1);
  const numerator = records.filter(
    (review) => (review.distinctiveness ?? -1) >= 2,
  ).length;
  return {
    cohortKey: manifestCohortKey(run.manifest),
    reviewedSetKey: digest([...actual].sort()),
    reviewedPairs: valid.length,
    expectedPairs: expectedCount,
    duplicateRecords: duplicates,
    unexpectedPairs: unexpected,
    invalidScores,
    complete,
    numerator,
    denominator: records.length,
    percent: records.length ? (100 * numerator) / records.length : null,
  };
}

/** A partial review can be displayed, but never supplies a pp comparison. */
export function compareReviewRuns(runs: readonly ReviewIndexRun[]) {
  const panels = runs.map((run) => ({ run, panel: reviewPanel(run) }));
  return panels.map(({ run, panel }) => {
    const baseline = panel.complete
      ? panels
          .filter(
            (candidate) =>
              candidate.panel.complete &&
              candidate.panel.cohortKey === panel.cohortKey &&
              candidate.panel.reviewedSetKey === panel.reviewedSetKey,
          )
          .sort(
            (a, b) =>
              a.run.manifest.createdAt.localeCompare(
                b.run.manifest.createdAt,
              ) || a.run.id.localeCompare(b.run.id),
          )[0]
      : undefined;
    return {
      run,
      panel,
      baselineId: baseline?.run.id ?? null,
      percentagePointChange:
        baseline && panel.percent !== null && baseline.panel.percent !== null
          ? panel.percent - baseline.panel.percent
          : null,
    };
  });
}
