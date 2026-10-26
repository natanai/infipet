import { AGES, PROTOCOL_VERSION } from "./protocol";
import { rate } from "./metrics";
import type { CaseResult, Review } from "./types";
import { coreDiagnosticId, regionalDiagnosticId } from "./core";
export function reviewTemplates(cases: CaseResult[]): Review[] {
  const rows: Review[] = [];
  const add = (
    c: CaseResult,
    kind: Review["kind"],
    fromAge: number,
    toAge: number,
    requiredViewIds: string[],
    controlCaseId?: string,
  ) =>
    rows.push({
      protocolVersion: PROTOCOL_VERSION,
      id: `${c.plan.id}__${kind}__${fromAge}-${toAge}`,
      caseId: c.plan.id,
      kind,
      fromAge,
      toAge,
      controlCaseId,
      requiredViewIds,
      requiredDiagnosticIds:
        kind === "transition"
          ? [fromAge, toAge].flatMap((age) => {
              const id =
                c.views.find((v) => v.kind === "endpoint" && v.age === age)
                  ?.id ?? `${c.plan.id}__d${age}`;
              return [coreDiagnosticId(id), regionalDiagnosticId(id)];
            })
          : [],
      reviewer: null,
      reviewerKind: null,
      role: null,
      status: "unreviewed",
      evolution: null,
      descent: null,
      causalCare: null,
      continuity: null,
      featureCoherence: null,
      inspectedViewIds: [],
      evidenceHashes: {},
      inspectedDiagnosticIds: [],
      diagnosticEvidenceHashes: {},
      changeInventory: null,
      notes:
        "Unreviewed. Scores require inspection of the actual rendered evidence; numerical morphology and ancestry IDs are insufficient.",
    });
  for (const c of cases) {
    if (c.plan.group === "primary") {
      for (let i = 0; i < 3; i++) {
        const views = c.views.filter(
          (v) =>
            (v.kind === "endpoint" &&
              [AGES[i], AGES[i + 1]].includes(v.age as never)) ||
            (v.kind === "interior" && v.fromAge === AGES[i]),
        );
        add(c, "transition", AGES[i], AGES[i + 1], [
          ...views.map((v) => v.id),
          ...[AGES[i], AGES[i + 1]]
            .filter(
              (age) =>
                !views.some((v) => v.kind === "endpoint" && v.age === age),
            )
            .map((age) => `${c.plan.id}__d${age}`),
        ]);
      }
      for (const age of AGES) {
        const views = c.views.filter((v) => v.kind === "pose" && v.age === age);
        if (views.length)
          add(
            c,
            "motion",
            age,
            age,
            views.map((v) => v.id),
          );
      }
    } else if (c.plan.group === "source") {
      const control = cases.find(
        (p) =>
          p.plan.group === "primary" &&
          p.plan.seed === c.plan.seed &&
          p.plan.historyId === "neutral" &&
          c.plan.sourceId.startsWith(p.plan.sourceId + "--"),
      );
      for (const v of c.views) {
        const a = control?.views.find(
          (a) => a.kind === "endpoint" && a.age === v.age,
        );
        if (a)
          add(
            c,
            "source-counterfactual",
            v.age,
            v.age,
            [a.id, v.id],
            control!.plan.id,
          );
      }
    } else if (c.plan.needId) {
      const control = cases.find(
        (p) =>
          p.plan.group === "care" &&
          !p.plan.needId &&
          p.plan.seed === c.plan.seed &&
          p.plan.onset === c.plan.onset,
      );
      if (control)
        add(
          c,
          "care-response",
          c.plan.onset!,
          c.plan.onset! + 14,
          [...control.views, ...c.views].map((v) => v.id),
          control.plan.id,
        );
    }
  }
  return rows;
}
const coreKinds = new Set([
  "mass-redistribution",
  "core-partition",
  "core-fusion",
  "axial-reorganization",
  "cavity-opening",
  "cavity-enclosure",
]);
const nonempty = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;
export function inventorySupportsEvolution(
  inventory: Review["changeInventory"],
) {
  if (!inventory || inventory.scalingAppendageRotationOrPostureOnly !== false)
    return false;
  const core =
    Array.isArray(inventory.coreOrganization) &&
    inventory.coreOrganization.some(
      (c) => coreKinds.has(c.kind) && nonempty(c.evidence),
    );
  const coreEvidence = new Set(
    (inventory.coreOrganization ?? []).map((c) =>
      c.evidence.trim().toLowerCase(),
    ),
  );
  const independent = (c: {
    evidence: string;
    independentOfCoreOrganization?: boolean;
  }) =>
    c.independentOfCoreOrganization === true &&
    nonempty(c.evidence) &&
    !coreEvidence.has(c.evidence.trim().toLowerCase());
  const role =
    Array.isArray(inventory.functionalRoles) &&
    inventory.functionalRoles.some(
      (c) =>
        nonempty(c.from) && nonempty(c.to) && c.from !== c.to && independent(c),
    );
  const enclosure =
    Array.isArray(inventory.enclosure) &&
    inventory.enclosure.some((c) => nonempty(c.change) && independent(c));
  const regional =
    Array.isArray(inventory.regionalAnatomy) &&
    inventory.regionalAnatomy.some(
      (c) =>
        ["regional-occupancy", "head-trunk-organization", "topology"].includes(
          c.kind,
        ) &&
        c.regions.length >= 2 &&
        independent(c) &&
        (c.kind !== "regional-occupancy" ||
          (c.normalizedEvidence &&
            Number.isFinite(c.normalizedEvidence.from) &&
            Number.isFinite(c.normalizedEvidence.to) &&
            ["fraction-of-core-union", "head/trunk-ratio"].includes(
              c.normalizedEvidence.unit,
            ))),
    );
  return (
    core &&
    (regional || role || enclosure) &&
    Array.isArray(inventory.sourceContinuity) &&
    inventory.sourceContinuity.some(nonempty)
  );
}
const requiredScores = (kind: Review["kind"]) =>
  kind === "transition"
    ? ["evolution", "descent", "continuity", "featureCoherence"]
    : kind === "care-response"
      ? ["causalCare", "featureCoherence"]
      : kind === "source-counterfactual"
        ? ["descent", "featureCoherence"]
        : ["continuity", "featureCoherence"];
export function validateReviews(
  rows: Review[],
  templates: Review[],
  cases: CaseResult[],
) {
  if (!Array.isArray(rows)) throw new Error("Review records must be an array");
  const expected = new Map(templates.map((t) => [t.id, t])),
    views = new Map(cases.flatMap((c) => c.views).map((v) => [v.id, v])),
    diagnostics = new Map(
      cases
        .flatMap((c) =>
          c.views.filter(
            (v) => v.kind === "endpoint" && v.coreHash !== undefined,
          ),
        )
        .flatMap((v) => [
          ...(v.coreHash
            ? [[coreDiagnosticId(v.id), v.coreHash] as const]
            : []),
          ...(v.regionalHash
            ? [[regionalDiagnosticId(v.id), v.regionalHash] as const]
            : []),
        ]),
    ),
    seen = new Set<string>();
  for (const row of rows) {
    const template = expected.get(row.id);
    if (
      !template ||
      row.protocolVersion !== template.protocolVersion ||
      row.caseId !== template.caseId ||
      row.kind !== template.kind ||
      row.fromAge !== template.fromAge ||
      row.toAge !== template.toAge ||
      row.controlCaseId !== template.controlCaseId
    )
      throw new Error(`Unknown or altered review comparison ${row.id}`);
    if (!["reviewed", "unreviewed"].includes(row.status))
      throw new Error(`Explicit status required: ${row.id}`);
    if (row.status !== "reviewed") continue;
    const key = `${row.id}/${row.reviewer}`;
    if (seen.has(key)) throw new Error(`Duplicate reviewer/comparison ${key}`);
    seen.add(key);
    if (row.role === "primary") {
      const primaryKey = `primary/${row.id}`;
      if (seen.has(primaryKey))
        throw new Error(`Multiple primary records for ${row.id}`);
      seen.add(primaryKey);
    }
    if (
      !row.reviewer?.trim() ||
      !["agent", "human"].includes(row.reviewerKind ?? "") ||
      !["primary", "secondary"].includes(row.role ?? "")
    )
      throw new Error(
        `Reviewed record needs reviewer identity, kind, and role: ${row.id}`,
      );
    for (const field of requiredScores(row.kind)) {
      const value = row[field as keyof Review];
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 3
      )
        throw new Error(`Reviewed ${row.id} needs 0–3 ${field}`);
    }
    if (
      template.requiredViewIds.some((id) => !row.inspectedViewIds?.includes(id))
    )
      throw new Error(`Reviewed ${row.id} omits required actual images`);
    for (const id of row.inspectedViewIds) {
      if (!views.has(id) || row.evidenceHashes?.[id] !== views.get(id)!.hash)
        throw new Error(`Missing/mismatched inspected-image hash ${id}`);
    }
    if (row.kind === "transition") {
      if (
        !row.changeInventory ||
        typeof row.changeInventory.scalingAppendageRotationOrPostureOnly !==
          "boolean"
      )
        throw new Error(
          `Reviewed transition requires an actual visual change inventory: ${row.id}`,
        );
      if (
        (row.evolution ?? 0) >= 2 &&
        !inventorySupportsEvolution(row.changeInventory)
      )
        throw new Error(
          `Evolution>=2 requires core reorganization plus a second independent anatomical change with masked evidence; scale/appendage length/rotation/posture alone score<=1: ${row.id}`,
        );
      if (
        template.requiredDiagnosticIds.some(
          (id) => !row.inspectedDiagnosticIds?.includes(id),
        )
      )
        throw new Error(
          `Reviewed transition omits required core diagnostic images: ${row.id}`,
        );
      for (const id of row.inspectedDiagnosticIds)
        if (
          !diagnostics.has(id) ||
          row.diagnosticEvidenceHashes?.[id] !== diagnostics.get(id)
        )
          throw new Error(`Missing/mismatched core diagnostic hash ${id}`);
      for (const change of row.changeInventory.regionalAnatomy ?? []) {
        if (change.kind !== "regional-occupancy" || !change.normalizedEvidence)
          continue;
        const endpoints = [row.fromAge, row.toAge].map(
          (age) =>
            cases
              .find((c) => c.plan.id === row.caseId)
              ?.views.find((v) => v.kind === "endpoint" && v.age === age)
              ?.regionalOccupancy,
        );
        const key = (
          {
            head: "headFraction",
            trunk: "trunkFraction",
            enclosure: "enclosureFraction",
          } as const
        )[change.regions[0] as "head" | "trunk" | "enclosure"];
        const actual = endpoints.map((p) =>
          change.normalizedEvidence!.unit === "head/trunk-ratio"
            ? p?.headToTrunk
            : key
              ? p?.[key]
              : undefined,
        );
        if (
          actual.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
          Math.abs(actual[0]! - change.normalizedEvidence.from) > 1e-9 ||
          Math.abs(actual[1]! - change.normalizedEvidence.to) > 1e-9
        )
          throw new Error(
            `Normalized regional evidence must match actual occupied mask statistics: ${row.id}`,
          );
      }
    }
  }
}
export function reviewSummary(
  rows: Review[],
  templates: Review[],
  viewCount: number,
  diagnosticCount?: number,
) {
  const reviewed = rows.filter((r) => r.status === "reviewed"),
    primary = reviewed.filter((r) => r.role === "primary"),
    secondary = reviewed.filter((r) => r.role === "secondary"),
    transitions = templates.filter((r) => r.kind === "transition");
  const distinct = (rows: Review[]) => new Set(rows.map((r) => r.id));
  const pass = (r: Review) =>
    r.evolution !== null &&
    r.evolution >= 2 &&
    r.descent !== null &&
    r.descent >= 2 &&
    r.continuity !== null &&
    r.continuity >= 2 &&
    r.featureCoherence !== null &&
    r.featureCoherence >= 2 &&
    inventorySupportsEvolution(r.changeInventory) &&
    Array.isArray(r.inspectedDiagnosticIds) &&
    r.inspectedDiagnosticIds.length >= 4;
  const pt = primary.filter((r) => r.kind === "transition"),
    st = secondary.filter((r) => r.kind === "transition");
  const jointly = transitions.filter(
    (t) =>
      pt.some((r) => r.id === t.id && pass(r)) &&
      st.some(
        (r) =>
          r.id === t.id &&
          pass(r) &&
          !pt.some((p) => p.id === t.id && p.reviewer === r.reviewer),
      ),
  );
  const disagreements = pt.flatMap((p) =>
    st
      .filter((s) => s.id === p.id && s.reviewer !== p.reviewer)
      .map((s) => ({
        id: p.id,
        primaryReviewer: p.reviewer,
        secondaryReviewer: s.reviewer,
        evolution: p.evolution !== s.evolution,
        descent: p.descent !== s.descent,
        thresholdPassDisagreement: pass(p) !== pass(s),
      })),
  );
  return {
    primaryComparisonCoverage: rate(
      distinct(pt).size,
      transitions.length,
      "primary actual-image transition review",
      "adjacent milestones",
    ),
    secondaryComparisonCoverage: rate(
      distinct(st).size,
      transitions.length,
      "secondary actual-image transition review",
      "adjacent milestones",
    ),
    primaryEvolution: rate(
      pt.filter((r) => r.evolution! >= 2).length,
      pt.length,
      "primary reviewed transitions; evolution score >=2",
      "adjacent milestones",
    ),
    primaryDescent: rate(
      pt.filter((r) => r.descent! >= 2).length,
      pt.length,
      "primary reviewed transitions; descent score >=2",
      "adjacent milestones",
    ),
    primaryJointGate: rate(
      pt.filter(pass).length,
      pt.length,
      "primary reviewed transitions; all four independent axes >=2",
      "adjacent milestones",
    ),
    jointIndependentPass: rate(
      jointly.length,
      transitions.length,
      "both distinct reviewer identities pass all four axes",
      "adjacent milestones",
    ),
    primaryImageCoverage: rate(
      new Set(primary.flatMap((r) => r.inspectedViewIds)).size,
      viewCount,
      "primary declared inspected image hashes",
      "all",
    ),
    secondaryImageCoverage: rate(
      new Set(secondary.flatMap((r) => r.inspectedViewIds)).size,
      viewCount,
      "secondary declared inspected image hashes",
      "all",
    ),
    primaryCoreDiagnosticCoverage: rate(
      new Set(
        primary
          .flatMap((r) => r.inspectedDiagnosticIds ?? [])
          .filter((id) => id.endsWith("__core")),
      ).size,
      diagnosticCount ??
        new Set(
          templates
            .flatMap((t) => t.requiredDiagnosticIds ?? [])
            .filter((id) => id.endsWith("__core")),
        ).size,
      "primary separately inspected core diagnostic images",
      "milestones",
    ),
    secondaryCoreDiagnosticCoverage: rate(
      new Set(
        secondary
          .flatMap((r) => r.inspectedDiagnosticIds ?? [])
          .filter((id) => id.endsWith("__core")),
      ).size,
      diagnosticCount ??
        new Set(
          templates
            .flatMap((t) => t.requiredDiagnosticIds ?? [])
            .filter((id) => id.endsWith("__core")),
        ).size,
      "secondary separately inspected core diagnostic images",
      "milestones",
    ),
    primaryRegionalMaskCoverage: rate(
      new Set(
        primary
          .flatMap((r) => r.inspectedDiagnosticIds ?? [])
          .filter((id) => id.endsWith("__regions")),
      ).size,
      diagnosticCount ??
        new Set(
          templates
            .flatMap((t) => t.requiredDiagnosticIds ?? [])
            .filter((id) => id.endsWith("__regions")),
        ).size,
      "primary separately inspected regional mask variants",
      "milestones",
    ),
    secondaryRegionalMaskCoverage: rate(
      new Set(
        secondary
          .flatMap((r) => r.inspectedDiagnosticIds ?? [])
          .filter((id) => id.endsWith("__regions")),
      ).size,
      diagnosticCount ??
        new Set(
          templates
            .flatMap((t) => t.requiredDiagnosticIds ?? [])
            .filter((id) => id.endsWith("__regions")),
        ).size,
      "secondary separately inspected regional mask variants",
      "milestones",
    ),
    humanRecords: reviewed.filter((r) => r.reviewerKind === "human").length,
    unreviewedComparisons: templates
      .filter((t) => !reviewed.some((r) => r.id === t.id))
      .map((t) => t.id),
    disagreements,
    gatePassed: transitions.length > 0 && jointly.length === transitions.length,
  };
}
