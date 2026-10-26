import assert from "node:assert/strict";
import test from "node:test";
import {
  compareReviewRuns,
  reviewPanel,
  type ReviewIndexRun,
} from "./comparison";
import type { AuditManifest, VisualReview } from "./types";

function fixture(id: string, createdAt: string, clear = 6): ReviewIndexRun {
  const manifest: AuditManifest = {
    protocolVersion: "evolution-v6-audit1",
    metricVersion: "morphology-v6-audit1",
    runId: id,
    stage: "proof",
    createdAt,
    engineHash: "engine-" + id,
    engineHashes: {},
    expected: {
      presets: 1,
      seeds: 2,
      histories: 1,
      cases: 2,
      endpoints: 8,
      interiors: 0,
      poses: 0,
      views: 8,
    },
    presets: [
      { id: "bean", name: "Bean", parts: [], sourceHash: "same-drawing" },
    ],
    seeds: ["fixed-seed-one", "fixed-seed-two"],
    histories: [{ id: "neutral", label: "75%", keyframes: [] }],
    ages: [0, 30, 75, 120],
    runtime: { node: "test", platform: "test" },
  };
  const primaryReview: VisualReview[] = [];
  for (let seed = 1; seed <= 2; seed++)
    for (let stage = 0; stage < 3; stage++)
      primaryReview.push({
        caseId: `bean__s0${seed}__neutral`,
        fromAge: manifest.ages[stage],
        toAge: manifest.ages[stage + 1],
        reviewer: "/root/audit_v6",
        reviewerKind: "agent",
        status: "reviewed",
        distinctiveness: primaryReview.length < clear ? 2 : 1,
        featureCoherence: 2,
        transformationRichness: 2,
        continuity: 2,
        notes: "Synthetic comparison-index regression fixture.",
      });
  return { id, manifest, primaryReview };
}

test("an earlier partial 100% panel cannot baseline a complete 50% panel", () => {
  const partial = fixture("partial", "2026-01-01T00:00:00Z");
  partial.primaryReview = partial.primaryReview.slice(0, 3);
  const complete = fixture("complete", "2026-01-02T00:00:00Z", 3);
  const later = fixture("later", "2026-01-03T00:00:00Z", 4);
  const rows = compareReviewRuns([partial, complete, later]);
  assert.equal(rows[0].panel.percent, 100);
  assert.equal(rows[0].panel.complete, false);
  assert.equal(rows[0].baselineId, null);
  assert.equal(rows[0].percentagePointChange, null);
  assert.equal(rows[1].baselineId, "complete");
  assert.equal(rows[1].percentagePointChange, 0);
  assert.equal(rows[2].baselineId, "complete");
  assert.ok(Math.abs(rows[2].percentagePointChange! - 100 / 6) < 1e-9);
});

test("same-size partial sets retain distinct keys and never get pp comparisons", () => {
  const first = fixture("partial-a", "2026-01-01T00:00:00Z");
  const second = fixture("partial-b", "2026-01-02T00:00:00Z");
  first.primaryReview = first.primaryReview.slice(0, 3);
  second.primaryReview = second.primaryReview.slice(3);
  const rows = compareReviewRuns([first, second]);
  assert.equal(rows[0].panel.cohortKey, rows[1].panel.cohortKey);
  assert.notEqual(rows[0].panel.reviewedSetKey, rows[1].panel.reviewedSetKey);
  assert.ok(
    rows.every(
      (row) => row.baselineId === null && row.percentagePointChange === null,
    ),
  );
});

test("duplicate or unexpected comparisons cannot masquerade as a complete count", () => {
  const duplicate = fixture("duplicate", "2026-01-01T00:00:00Z");
  duplicate.primaryReview[5] = { ...duplicate.primaryReview[0] };
  const wrongCase = fixture("wrong-case", "2026-01-01T00:00:00Z");
  wrongCase.primaryReview[5] = {
    ...wrongCase.primaryReview[5],
    caseId: "not-in-manifest",
  };
  assert.equal(reviewPanel(duplicate).complete, false);
  assert.equal(reviewPanel(duplicate).duplicateRecords, 1);
  assert.equal(reviewPanel(wrongCase).complete, false);
  assert.equal(reviewPanel(wrongCase).unexpectedPairs, 1);
});

test("changed metric definitions start a separate baseline despite identical review IDs", () => {
  const first = fixture("metric-one", "2026-01-01T00:00:00Z", 3);
  const changed = fixture("metric-two", "2026-01-02T00:00:00Z", 6);
  changed.manifest.metricVersion = "morphology-v6-audit2";
  const rows = compareReviewRuns([first, changed]);
  assert.notEqual(rows[0].panel.cohortKey, rows[1].panel.cohortKey);
  assert.equal(rows[1].baselineId, "metric-two");
  assert.equal(rows[1].percentagePointChange, 0);
});

test("review order does not change the reviewed-set key or comparison", () => {
  const first = fixture("first", "2026-01-01T00:00:00Z", 3);
  const reordered = fixture("reordered", "2026-01-02T00:00:00Z", 4);
  reordered.primaryReview.reverse();
  const rows = compareReviewRuns([first, reordered]);
  assert.equal(rows[0].panel.reviewedSetKey, rows[1].panel.reviewedSetKey);
  assert.equal(rows[1].baselineId, "first");
  assert.ok(Math.abs(rows[1].percentagePointChange! - 100 / 6) < 1e-9);
});

test("the first captured complete run is baseline even when names sort differently", () => {
  const older = fixture("z-old", "2026-01-01T00:00:00Z", 3);
  const newer = fixture("a-new", "2026-01-02T00:00:00Z", 6);
  const rows = compareReviewRuns([newer, older]);
  assert.equal(rows[0].baselineId, "z-old");
  assert.equal(rows[0].percentagePointChange, 50);
});
