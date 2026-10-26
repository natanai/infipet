import {
  describeFrame,
  frameHash,
  shapeDistance,
  semanticDistance,
  visibleContributions,
  varianceAttribution,
} from "../audit/metrics";
import type { PetFrame, PetPart, PetSimulation } from "../../src/simulation";
import { performance } from "node:perf_hooks";
import { AGES, digest, textOrder } from "./protocol";
import type { CaseResult, Manifest, Rate, View } from "./types";
import { describeCore } from "./core";
export { shapeDistance, semanticDistance };
export function rate(
  numerator: number,
  denominator: number,
  condition: string,
  age: number | string,
): Rate {
  return {
    numerator,
    denominator,
    percent: denominator ? (100 * numerator) / denominator : null,
    condition,
    age,
  };
}
export const canonicalPixels = (
  pixels: { x: number; y: number; color: string }[],
) =>
  pixels
    .map((p) => [p.x, p.y, p.color.toLowerCase()])
    .sort(
      (a, b) =>
        Number(a[1]) - Number(b[1]) ||
        Number(a[0]) - Number(b[0]) ||
        textOrder(String(a[2]), String(b[2])),
    );
/** Never treat a source-conditioned program hash as proof of inherited gene equality. */
export function inheritedIdentity(
  genome: unknown,
  program?: unknown,
): { hash: string | null; path: string | null } {
  const declared = (program as Record<string, unknown> | undefined)
    ?.inheritedGenome;
  if (declared && typeof declared === "object")
    return { hash: digest(declared), path: "program.inheritedGenome" };
  if (!genome || typeof genome !== "object") return { hash: null, path: null };
  const record = genome as Record<string, unknown>;
  for (const path of ["inheritedGenes", "seedGenes", "inherited", "genes"])
    if (record[path] && typeof record[path] === "object")
      return { hash: digest(record[path]), path: `genome.${path}` };
  return { hash: null, path: null };
}
export function sample(
  sim: PetSimulation,
  parts: PetPart[],
  id: string,
  kind: View["kind"],
  age: number,
  time: number,
  blindIndex: number,
  extra: Partial<View> = {},
): View {
  const start = performance.now(),
    frame = sim.frameAt(age, {
      time,
      action: kind === "pose" ? "move" : "idle",
    }),
    elapsedMs = performance.now() - start;
  const visibility = visibleContributions(frame),
    byId = new Map(frame.parts.map((p) => [p.id, p]));
  const sourceIds = (p: PetFrame["parts"][number]) => [
    ...new Set([
      ...(p.sourcePartIds ?? []),
      ...(p.sourcePartId ? [p.sourcePartId] : []),
      ...(parts.some((s) => s.id === p.id) ? [p.id] : []),
    ]),
  ];
  const matching = (id: string) =>
    frame.parts.filter((p) => sourceIds(p).includes(id));
  const present = parts.filter((p) => p.pixels.length),
    missing: string[] = [],
    hostMismatches: string[] = [];
  let represented = 0,
    contributing = 0,
    expectedHosts = 0,
    correctHosts = 0;
  for (const part of present) {
    const matches = matching(part.id).filter((p) => p.pixels.length);
    if (matches.length) represented++;
    else missing.push(part.id);
    if (
      matches.some(
        (p) => visibility.parts.find((v) => v.id === p.id)?.winningPixels,
      )
    )
      contributing++;
    if (part.parentId) {
      expectedHosts++;
      if (
        matches.some(
          (p) =>
            p.parentId === part.parentId ||
            (p.parentId &&
              byId.has(p.parentId) &&
              sourceIds(byId.get(p.parentId)!).includes(part.parentId!)),
        )
      )
        correctHosts++;
      else hostMismatches.push(part.id);
    }
  }
  const diagnostics = frame.interaction.diagnostics as
    Record<string, unknown> | undefined;
  const core = describeCore(frame);
  return {
    id,
    blindLabel: `V${String(blindIndex).padStart(5, "0")}`,
    kind,
    age,
    time,
    actualPhase:
      typeof diagnostics?.phase === "number" ? diagnostics.phase : null,
    poseDiagnostics: kind === "pose" ? diagnostics : undefined,
    elapsedMs,
    valid: frame.pixels.every(
      (p) =>
        Number.isInteger(p.x) &&
        Number.isInteger(p.y) &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < 64 &&
        p.y < 64 &&
        /^#[\da-f]{6}$/i.test(p.color),
    ),
    hash: frameHash(frame),
    pixels: frame.pixels,
    corePixels: core.pixels,
    coreHash: core.hash,
    coreDescriptor: core.descriptor,
    regionalPixels: core.regionalPixels,
    regionalHash: core.regionalHash,
    regionalOccupancy: core.regionalOccupancy,
    descriptor: describeFrame(frame),
    development: sim.developmentAt(age),
    wellbeing: sim.stateAt(age),
    lineage: frame.parts.map((p) => ({
      id: p.id,
      kind: p.kind,
      parentId: p.parentId,
      sourceIds: sourceIds(p),
      relationship: p.relationship,
      count: p.pixels.length,
      visible: visibility.parts.find((v) => v.id === p.id)?.winningPixels ?? 0,
      center: {
        x: p.bounds.x + p.bounds.width / 2,
        y: p.bounds.y + p.bounds.height / 2,
      },
      width: p.bounds.width,
      height: p.bounds.height,
      readiness: p.readiness ?? 1,
    })),
    sourceTracking: {
      expected: present.length,
      represented,
      contributing,
      expectedHosts,
      correctHosts,
      missing,
      hostMismatches,
    },
    movement: frame.movementMode,
    motionPace: frame.motionPace,
    camera: diagnostics?.camera,
    ...extra,
  };
}
export function sourceRegionDifference(a: View, b: View) {
  const ids = [
    ...new Set([...a.lineage, ...b.lineage].flatMap((p) => p.sourceIds)),
  ].sort(textOrder);
  return ids.map((sourceId) => {
    const describe = (v: View) => {
      const parts = v.lineage.filter((p) => p.sourceIds.includes(sourceId)),
        denom = Math.max(1, v.descriptor.size.diameter);
      return {
        parts: parts.length,
        pixels: parts.reduce((n, p) => n + p.count, 0),
        visible: parts.reduce((n, p) => n + p.visible, 0),
        width: Math.max(0, ...parts.map((p) => p.width)) / denom,
        height: Math.max(0, ...parts.map((p) => p.height)) / denom,
        x: parts.length
          ? parts.reduce((n, p) => n + p.center.x, 0) / parts.length / denom
          : 0,
        y: parts.length
          ? parts.reduce((n, p) => n + p.center.y, 0) / parts.length / denom
          : 0,
      };
    };
    return { sourceId, control: describe(a), counterfactual: describe(b) };
  });
}
function delta(a: View, b: View) {
  return {
    shape: shapeDistance(a.descriptor, b.descriptor),
    semantic: semanticDistance(a.descriptor, b.descriptor),
    samePixels: a.hash === b.hash,
    paceDifference: b.motionPace - a.motionPace,
    sourceRegions: sourceRegionDifference(a, b),
    regionalOccupancy: {
      from: a.regionalOccupancy ?? null,
      to: b.regionalOccupancy ?? null,
    },
    coreShape:
      a.coreDescriptor && b.coreDescriptor
        ? shapeDistance(a.coreDescriptor, b.coreDescriptor)
        : null,
    coreSemantic:
      a.coreDescriptor && b.coreDescriptor
        ? semanticDistance(a.coreDescriptor, b.coreDescriptor)
        : null,
  };
}
export function summarize(manifest: Manifest, cases: CaseResult[]) {
  const primary = cases.filter((c) => c.plan.group === "primary"),
    all = cases.flatMap((c) => c.views),
    endpoints = primary.flatMap((c) =>
      c.views.filter((v) => v.kind === "endpoint"),
    );
  const transitions = primary.flatMap((c) =>
    AGES.slice(1).flatMap((age, i) => {
      const a = c.views.find((v) => v.kind === "endpoint" && v.age === AGES[i]),
        b = c.views.find((v) => v.kind === "endpoint" && v.age === age);
      return a && b
        ? [
            {
              caseId: c.plan.id,
              sourceId: c.plan.sourceId,
              seedIndex: c.plan.seedIndex,
              historyId: c.plan.historyId,
              fromAge: a.age,
              toAge: b.age,
              ...delta(a, b),
            },
          ]
        : [];
    }),
  );
  const geneticSeparation = manifest.sources
    .filter((s) => !s.variant)
    .flatMap((s) =>
      AGES.slice(1).map((age) => {
        const cohort = primary
          .filter(
            (c) => c.plan.sourceId === s.id && c.plan.historyId === "neutral",
          )
          .map((c) =>
            c.views.find((v) => v.kind === "endpoint" && v.age === age),
          )
          .filter((v): v is View => Boolean(v));
        const pairs: number[] = [];
        const twins = new Set<number>();
        for (let i = 0; i < cohort.length; i++)
          for (let j = i + 1; j < cohort.length; j++) {
            const d = shapeDistance(cohort[i].descriptor, cohort[j].descriptor);
            pairs.push(d);
            if (d < 0.1) {
              twins.add(i);
              twins.add(j);
            }
          }
        return {
          sourceId: s.id,
          age,
          separation: [0.05, 0.1, 0.2].map((threshold) => ({
            threshold,
            ...rate(
              pairs.filter((d) => d >= threshold).length,
              pairs.length,
              "raw neutral seed pairs within source",
              age,
            ),
          })),
          nearTwins: rate(
            twins.size,
            cohort.length,
            "seeds with another seed <10% normalized shape distance",
            age,
          ),
        };
      }),
    );
  const coreTransitionSeparation = manifest.sources
    .filter((s) => !s.variant)
    .flatMap((s) =>
      AGES.slice(1).map((age, i) => {
        const cohort = transitions.filter(
            (t) =>
              t.sourceId === s.id && t.fromAge === AGES[i] && t.toAge === age,
          ),
          available = cohort.filter((t) => t.coreShape !== null);
        return {
          sourceId: s.id,
          fromAge: AGES[i],
          toAge: age,
          expectedComparisons: cohort.length,
          availableComparisons: available.length,
          separation: [0.05, 0.1, 0.2].map((threshold) => ({
            threshold,
            ...rate(
              available.filter((t) => t.coreShape! >= threshold).length,
              available.length,
              "core-only normalized shape classification; selected histories; not a visual pass",
              age,
            ),
          })),
        };
      }),
    );
  const sourceCounterfactuals = cases
    .filter((c) => c.plan.group === "source")
    .flatMap((c) => {
      const source = manifest.sources.find((s) => s.id === c.plan.sourceId)!,
        control = primary.find(
          (p) =>
            p.plan.sourceId === source.parentSourceId &&
            p.plan.seed === c.plan.seed &&
            p.plan.historyId === "neutral",
        );
      return c.views.flatMap((v) => {
        const a = control?.views.find(
          (a) => a.age === v.age && a.kind === "endpoint",
        );
        return a
          ? [
              {
                caseId: c.plan.id,
                controlCaseId: control!.plan.id,
                variant: source.variant,
                age: v.age,
                inheritedEqual:
                  c.inheritedHash && control!.inheritedHash
                    ? c.inheritedHash === control!.inheritedHash
                    : null,
                inheritedPath: c.inheritedPath,
                ...delta(a, v),
              },
            ]
          : [];
      });
    });
  const careResponses = cases
    .filter((c) => c.plan.group === "care" && c.plan.needId)
    .flatMap((c) => {
      const control = cases.find(
        (p) =>
          p.plan.group === "care" &&
          !p.plan.needId &&
          p.plan.seed === c.plan.seed &&
          p.plan.onset === c.plan.onset,
      );
      return c.views.flatMap((v) => {
        const a = control?.views.find((a) => a.age === v.age);
        return a
          ? [
              {
                caseId: c.plan.id,
                controlCaseId: control!.plan.id,
                needId: c.plan.needId,
                fulfillment: c.plan.fulfillment,
                onset: c.plan.onset,
                age: v.age,
                offset: v.age - c.plan.onset!,
                genomeEqual: c.genomeHash === control!.genomeHash,
                wellbeing: v.wellbeing,
                controlWellbeing: a.wellbeing,
                ...delta(a, v),
              },
            ]
          : [];
      });
    });
  const variance = manifest.sources
    .filter((s) => !s.variant)
    .flatMap((s) =>
      AGES.slice(1).flatMap((age) => {
        const histories = manifest.histories,
          seeds = manifest.seeds;
        if (histories.length < 2) return [];
        const grid = seeds.map((seed) =>
          histories.map(
            (h) =>
              primary
                .find(
                  (c) =>
                    c.plan.sourceId === s.id &&
                    c.plan.seed === seed &&
                    c.plan.historyId === h.id,
                )
                ?.views.find((v) => v.kind === "endpoint" && v.age === age)
                ?.descriptor,
          ),
        );
        if (grid.some((row) => row.some((v) => !v))) return [];
        return [
          {
            sourceId: s.id,
            age,
            panel:
              "Four histories include severe Safety; descriptive sum-of-squares, not a moderate-care dominance gate",
            ...varianceAttribution(grid as View["descriptor"][][]),
          },
        ];
      }),
    );
  const timings = all.map((v) => v.elapsedMs).sort((a, b) => a - b),
    percentile = (p: number) =>
      timings.length
        ? timings[
            Math.min(timings.length - 1, Math.floor((timings.length - 1) * p))
          ]
        : null;
  const cycles = primary
    .flatMap((c) =>
      AGES.map((age) => {
        const poses = c.views.filter((v) => v.kind === "pose" && v.age === age);
        return {
          caseId: c.plan.id,
          age,
          count: poses.length,
          phases: [...new Set(poses.map((p) => p.actualPhase))].sort(),
          complete:
            poses.length === 8 &&
            new Set(poses.map((p) => p.actualPhase)).size === 8 &&
            !poses.some((p) => p.actualPhase === null),
          diagnosticsAvailable: poses.every(
            (p) => p.poseDiagnostics !== undefined,
          ),
        };
      }),
    )
    .filter((c) => c.count);
  const visualClaims =
    "Automated lineage IDs/ownership and normalized shape differences do not establish perceived descent, anatomical coherence, or dramatic evolution. These require actual-image review.";
  return {
    protocolVersion: manifest.protocolVersion,
    metricVersion: manifest.metricVersion,
    captureHash: manifest.captureHash,
    expected: manifest.expected,
    actual: {
      cases: cases.length,
      failures: cases.filter((c) => c.error).length,
      views: all.length,
      primaryViews: primary.reduce((n, c) => n + c.views.length, 0),
      endpoints: endpoints.length,
      interiors: all.filter((v) => v.kind === "interior").length,
      poses: all.filter((v) => v.kind === "pose").length,
      sourceViews: all.filter((v) => v.kind === "source").length,
      careViews: all.filter((v) => v.kind === "care").length,
      coreDiagnosticViews: endpoints.filter((v) => v.coreHash !== undefined)
        .length,
      regionalMaskArtifacts: endpoints.filter(
        (v) => v.regionalHash !== undefined,
      ).length,
    },
    reliability: {
      birthFidelity: rate(
        cases.filter((c) => c.birthFidelity).length,
        cases.length,
        "all planned cases, failures retained",
        "birth",
      ),
      seekAgreement: rate(
        cases.filter((c) => c.seekAgreement).length,
        cases.length,
        "all planned cases, failures retained",
        "17.375",
      ),
      futureEventCausality: rate(
        cases.filter((c) => c.futureEventCausality).length,
        cases.length,
        "before first nonzero-time event; no-event histories checked against identical timeline",
        "pre-event",
      ),
      validFrames: rate(
        all.filter((v) => v.valid).length,
        all.length,
        "all collected frames",
        "all",
      ),
      completion: rate(
        all.length,
        manifest.expected.views,
        "scheduled views",
        "all",
      ),
    },
    performance: {
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      within16Ms: rate(
        timings.filter((t) => t <= 16).length,
        timings.length,
        "Node frameAt generation excluding I/O/UI/device",
        "all",
      ),
      within50Ms: rate(
        timings.filter((t) => t <= 50).length,
        timings.length,
        "Node frameAt generation excluding I/O/UI/device",
        "all",
      ),
    },
    cycles,
    transitions,
    geneticSeparation,
    coreTransitionSeparation,
    sourceCounterfactuals,
    careResponses,
    variance,
    lineage: all.map((v) => ({
      viewId: v.id,
      age: v.age,
      ...v.sourceTracking,
    })),
    failures: cases
      .filter((c) => c.error)
      .map((c) => ({
        caseId: c.plan.id,
        error: c.error,
        capturedViews: c.views.length,
      })),
    limitations: [
      visualClaims,
      "V7 protocol is incomparable with the v6 broad-shape gate until both are recomputed using the same source, cohort and definitions.",
      "Audit3 independent-anatomy/core-mask definitions are incomparable with audits1/2. Old agent12/12 scores are not transferred as new acceptance; prior runs are not retroactively rescored to force a pass.",
      "No population confidence claims from the four-seed proof. Raw pair counts are correlated, not independent people.",
      "Restoring care need not undo committed body-plan decisions. Evaluate reversible adaptation separately.",
      "Exact inherited-parameter equality is unavailable unless the engine exposes a dedicated inherited-genes object.",
      "Physical iPhone performance, signed widgets, and human review are separate checks.",
    ],
  };
}
