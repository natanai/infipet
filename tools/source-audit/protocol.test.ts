import assert from "node:assert/strict";
import test from "node:test";
import { flattenAnatomy } from "../../src/simulation";
import { canonicalPixels, inheritedIdentity } from "./metrics";
import { primarySources, counterfactualSources } from "./fixtures";
import { SEEDS, parseCareSeeds, stageCounts } from "./protocol";
import { plans } from "./run";
import { reviewSummary, reviewTemplates, validateReviews } from "./reviews";
import { compareRuns, captureStatus } from "./report";
import type { CaseResult, Manifest, Review, View } from "./types";
import { coreDiagnosticId, regionalDiagnosticId } from "./core";

test("proof accounting stays 204; focused probes are separately counted and preserve matched controls", () => {
  assert.equal(stageCounts("proof").views, 204);
  assert.equal(stageCounts("proof").coreDiagnosticViews, 16);
  assert.equal(stageCounts("three").views, 612);
  assert.equal(stageCounts("full").endpoints, 1536);
  const source = primarySources("proof"),
    variants = counterfactualSources(source[0]),
    p = plans("proof", "all", [...source, ...variants]);
  assert.equal(p.length, stageCounts("proof", "all").cases);
  assert.equal(p.filter((c) => c.group === "source").length, 12);
  assert.equal(p.filter((c) => c.group === "care").length, 104);
  assert.equal(
    p.filter((c) => c.group === "care").reduce((n, c) => n + c.ages.length, 0),
    520,
  );
  for (const c of p.filter((c) => c.needId)) {
    assert.deepEqual(c.keyframes, [
      { needId: c.needId, tick: c.onset! * 24, fulfillment: c.fulfillment },
    ]);
    assert.ok(
      p.some(
        (n) =>
          n.group === "care" &&
          !n.needId &&
          n.seed === c.seed &&
          n.onset === c.onset,
      ),
    );
    assert.deepEqual(
      c.ages.map((age) => age - c.onset!),
      [0, 0.25, 1, 7, 14],
    );
  }
});
test("four-seed focused care is an explicit cohort option without changing the default panel", () => {
  assert.deepEqual(stageCounts("proof", "all"), stageCounts("proof", "all", 2));
  assert.equal(stageCounts("proof", "all").careCases, 104);
  assert.equal(stageCounts("proof", "all").careViews, 520);
  const counts = stageCounts("proof", "all", 4),
    sources = primarySources("proof");
  const expanded = plans(
    "proof",
    "all",
    [...sources, ...counterfactualSources(sources[0])],
    4,
  );
  assert.equal(counts.careCases, 208);
  assert.equal(counts.careViews, 1040);
  assert.equal(counts.views, 1292);
  assert.equal(counts.cases, 224);
  assert.equal(expanded.length, counts.cases);
  const care = expanded.filter((c) => c.group === "care");
  assert.equal(care.length, 208);
  assert.equal(
    care.reduce((n, c) => n + c.ages.length, 0),
    1040,
  );
  assert.deepEqual([...new Set(care.map((c) => c.seed))], SEEDS.slice(0, 4));
  for (const c of care.filter((c) => c.needId)) {
    assert.deepEqual(c.keyframes, [
      { needId: c.needId, tick: c.onset! * 24, fulfillment: c.fulfillment },
    ]);
    assert.ok(
      care.some((n) => !n.needId && n.seed === c.seed && n.onset === c.onset),
    );
  }
  assert.deepEqual(
    expanded.filter((c) => c.group !== "care"),
    plans("proof", "all", [
      ...sources,
      ...counterfactualSources(sources[0]),
    ]).filter((c) => c.group !== "care"),
  );
  assert.equal(parseCareSeeds(), 2);
  assert.equal(parseCareSeeds("4"), 4);
  for (const v of ["", "3", "04", "invalid", 0, 5])
    assert.throws(() => parseCareSeeds(v), /must be 2 or 4/);
});
test("counterfactuals preserve source identities and canvas bounds; null ordering control preserves all painted pixels", () => {
  const base = primarySources("proof")[0],
    frozen = JSON.stringify(base),
    variants = counterfactualSources(base);
  assert.equal(JSON.stringify(base), frozen);
  assert.equal(variants.length, 6);
  for (const v of variants) {
    assert.deepEqual(
      v.parts.map((p) => p.id).sort(),
      base.parts.map((p) => p.id).sort(),
    );
    assert.ok(
      v.parts
        .flatMap((p) =>
          p.pixels.map((c) => ({
            x: c.x + p.position.x,
            y: c.y + p.position.y,
          })),
        )
        .every((p) => p.x >= 0 && p.y >= 0 && p.x < 32 && p.y < 32),
    );
  }
  assert.deepEqual(
    canonicalPixels(
      flattenAnatomy(
        variants.find((v) => v.variant === "ordering-control")!.parts,
      ),
    ),
    canonicalPixels(flattenAnatomy(base.parts)),
  );
  assert.notDeepEqual(
    canonicalPixels(
      flattenAnatomy(
        variants.find((v) => v.variant === "attachment-length")!.parts,
      ),
    ),
    canonicalPixels(flattenAnatomy(base.parts)),
  );
});
test("inherited equality never falls back to a source-conditioned full program fingerprint", () => {
  assert.deepEqual(inheritedIdentity({ fingerprint: "source-conditioned" }), {
    hash: null,
    path: null,
  });
  const a = inheritedIdentity(
      { fingerprint: "sourceA" },
      { inheritedGenome: { seed: "same", shape: 7 } },
    ),
    b = inheritedIdentity(
      { fingerprint: "sourceB" },
      { inheritedGenome: { seed: "same", shape: 7 } },
    );
  assert.equal(a.hash, b.hash);
  assert.equal(a.path, "program.inheritedGenome");
});
const fakeCase = (): CaseResult => ({
  plan: {
    id: "fixture",
    group: "primary",
    sourceId: "cub",
    seed: "s",
    seedIndex: 0,
    historyId: "neutral",
    keyframes: [],
    ages: [0, 30, 75, 120],
  },
  genome: {},
  program: {},
  genomeHash: "g",
  inheritedHash: "g",
  inheritedPath: "declared",
  birthFidelity: true,
  seekAgreement: true,
  futureEventCausality: true,
  views: [0, 30, 75, 120].map(
    (age) =>
      ({
        id: `v${age}`,
        kind: "endpoint",
        age,
        hash: `h${age}`,
        coreHash: `core${age}`,
        regionalHash: `regional${age}`,
      }) as View,
  ),
});
function scored(
  t: Review,
  c: CaseResult,
  role: "primary" | "secondary",
  descent: 0 | 1 | 2 | 3 = 2,
): Review {
  return {
    ...t,
    reviewer: role,
    reviewerKind: "agent",
    role,
    status: "reviewed",
    evolution: 3,
    descent,
    continuity: 2,
    featureCoherence: 2,
    inspectedViewIds: t.requiredViewIds,
    evidenceHashes: Object.fromEntries(
      c.views
        .filter((v) => t.requiredViewIds.includes(v.id))
        .map((v) => [v.id, v.hash]),
    ),
    inspectedDiagnosticIds: t.requiredDiagnosticIds,
    diagnosticEvidenceHashes: Object.fromEntries(
      c.views.flatMap((v) => [
        [coreDiagnosticId(v.id), v.coreHash!],
        [regionalDiagnosticId(v.id), v.regionalHash!],
      ]),
    ),
    changeInventory: {
      coreOrganization: [
        {
          kind: "core-fusion",
          evidence:
            "Synthetic test: two torso masses merge into a new core arrangement.",
        },
      ],
      functionalRoles: [
        {
          from: "fore support",
          to: "effector",
          evidence:
            "Synthetic test: fore tips leave the contact row and become manipulators.",
          independentOfCoreOrganization: true,
        },
      ],
      enclosure: [],
      sourceContinuity: [
        "Synthetic test: authored saddle and head relation stay traceable.",
      ],
      scalingAppendageRotationOrPostureOnly: false,
    },
    notes: "Synthetic test fixture; never emitted into audit records.",
  };
}
test("large evolution scores cannot pass the gate when descent is weak or the second reviewer is absent", () => {
  const c = fakeCase(),
    templates = reviewTemplates([c]),
    primary = templates.map((t) => scored(t, c, "primary", 1));
  validateReviews(primary, templates, [c]);
  const summary = reviewSummary(primary, templates, 4);
  assert.equal(summary.primaryEvolution.percent, 100);
  assert.equal(summary.primaryDescent.percent, 0);
  assert.equal(summary.gatePassed, false);
  const good = templates.map((t) => scored(t, c, "primary"));
  assert.equal(reviewSummary(good, templates, 4).gatePassed, false);
  const both = [...good, ...templates.map((t) => scored(t, c, "secondary"))];
  validateReviews(both, templates, [c]);
  assert.equal(reviewSummary(both, templates, 4).gatePassed, true);
});
test("visual records require real known image IDs, matching hashes and distinct primary records", () => {
  const c = fakeCase(),
    templates = reviewTemplates([c]),
    row = scored(templates[0], c, "primary");
  assert.throws(
    () => validateReviews([{ ...row, inspectedViewIds: [] }], templates, [c]),
    /omits required/,
  );
  assert.throws(
    () => validateReviews([{ ...row, evidenceHashes: {} }], templates, [c]),
    /hash/,
  );
  assert.throws(
    () => validateReviews([row, { ...row, reviewer: "other" }], templates, [c]),
    /Multiple primary/,
  );
  assert.deepEqual(
    templates.map((t) => [t.evolution, t.descent, t.causalCare, t.status]),
    Array.from({ length: 3 }, () => [null, null, null, "unreviewed"]),
  );
});
test("partial and duplicate comparison panels cannot create baseline percentage-point claims", () => {
  const c = fakeCase(),
    m = {
      runId: "a",
      protocolVersion: "v7",
      metricVersion: "v7",
      stage: "proof",
      probes: "none",
      sources: [{ id: "cub", sourceHash: "same" }],
      cases: [c.plan],
      expected: { ...stageCounts("proof"), primaryCases: 1, views: 4 },
    } as Manifest;
  const metrics = {
    actual: { views: 4, failures: 0 },
    expected: { views: 4 },
    performance: {},
  } as Parameters<typeof compareRuns>[2];
  const rows = reviewTemplates([c]).map((t) => scored(t, c, "primary")),
    b = { ...m, runId: "b" };
  assert.equal(
    compareRuns(m, b, metrics, metrics, rows.slice(0, 2), rows)
      .visualComparable,
    false,
  );
  const bad = [rows[0], { ...rows[0], reviewer: "other" }, rows[2]];
  assert.equal(
    compareRuns(m, b, metrics, metrics, bad, bad).visualComparable,
    false,
  );
  assert.equal(
    compareRuns(m, b, metrics, metrics, rows, rows).visualComparable,
    true,
  );
  assert.equal(
    compareRuns(
      m,
      { ...b, metricVersion: "changed" },
      metrics,
      metrics,
      rows,
      rows,
    ).comparable,
    false,
  );
});
test("changed or unavailable capture provenance cannot be labeled a verified frozen baseline", () => {
  assert.match(
    captureStatus({ unchanged: false }),
    /INVALID AS A FROZEN BASELINE/,
  );
  assert.match(captureStatus(), /do not claim/);
  assert.equal(captureStatus({ unchanged: true }), "unchanged across capture");
});
