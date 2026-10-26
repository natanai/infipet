import { join, resolve } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { readBatch, saveJson, loadJson, exists, engineHashes } from "./collection";
import { shapeDistance, semanticDistance, varianceAttribution, PROPORTION_NAMES, type FrameDescriptor } from "./metrics";
import { digest, rate, MODELED_NEEDS } from "./protocol";
import type { CaseResult, Rate, PresetSummary, Manifest, Summary, FrameResult, Supplemental } from "./types";

const DEVELOPED_AGES = [7, 15, 30, 75, 90, 120, 180, 240];
const THRESHOLDS = [0.05, 0.1, 0.2];
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
function random(seed = 319713) { let state = seed >>> 0; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }; }
function percentile(values: number[], p: number) { return values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0; }
/** Whole-seed resampling, not independent-frame or independent-pair intervals. */
export function withSeedInterval(flags: boolean[]): Rate {
  const output = rate(flags.filter(Boolean).length, flags.length);
  if (!flags.length) return output;
  const rand = random(), estimates: number[] = [];
  for (let b = 0; b < 500; b++) {
    let sum = 0;
    for (let s = 0; s < flags.length; s++) sum += Number(flags[Math.floor(rand() * flags.length)]);
    estimates.push(sum / flags.length * 100);
  }
  estimates.sort((a, b) => a - b);
  output.ci95 = [percentile(estimates, 0.025), percentile(estimates, 0.975)];
  return output;
}
export function pairInterval(flags: boolean[], n: number): Rate {
  const output = rate(flags.filter(Boolean).length, flags.length);
  const rand = random(), estimates: number[] = [];
  for (let b = 0; b < 256; b++) {
    const weights = new Uint16Array(n);
    for (let s = 0; s < n; s++) weights[Math.floor(rand() * n)]++;
    let cursor = 0, sum = 0, denominator = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const weight = weights[i] * weights[j];
      denominator += weight;
      if (flags[cursor++]) sum += weight;
    }
    // The estimand is distinct ORIGINAL seed pairs; resampling a seed twice must not invent a collision.
    if (denominator) estimates.push(sum / denominator * 100);
  }
  estimates.sort((a, b) => a - b);
  output.ci95 = [percentile(estimates, 0.025), percentile(estimates, 0.975)];
  return output;
}
const at = (result: CaseResult, age: number) => result.frames.find((f) => f.age === age)!;
function collisions(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return values.map((value) => counts.get(value)! > 1);
}
function developedPair(a: CaseResult, b: CaseResult) {
  const distances: number[] = [], semantic: number[] = [];
  for (const age of DEVELOPED_AGES) {
    distances.push(shapeDistance(at(a, age).descriptor, at(b, age).descriptor));
    semantic.push(semanticDistance(at(a, age).descriptor, at(b, age).descriptor).changed);
  }
  return { distances, semantic, average: mean(distances) };
}
function genetics(cases: CaseResult[], intervals: boolean) {
  const flags = THRESHOLDS.map(() => [] as boolean[]), semantic: boolean[] = [];
  const nearTwin = cases.map(() => false), nearest = cases.map((_, seedIndex) => ({ seedIndex, otherSeedIndex: -1, distance: Infinity }));
  const ageCounts = DEVELOPED_AGES.map(() => THRESHOLDS.map(() => 0));
  for (let i = 0; i < cases.length; i++) for (let j = i + 1; j < cases.length; j++) {
    const pair = developedPair(cases[i], cases[j]);
    for (let threshold = 0; threshold < THRESHOLDS.length; threshold++) flags[threshold].push(pair.distances.filter((d) => d >= THRESHOLDS[threshold]).length >= 2);
    semantic.push(pair.semantic.filter((d) => d >= 2).length >= 2);
    if (pair.distances.filter((d) => d >= 0.1).length < 2) { nearTwin[i] = true; nearTwin[j] = true; }
    if (pair.average < nearest[i].distance) nearest[i] = { seedIndex: i, otherSeedIndex: j, distance: pair.average };
    if (pair.average < nearest[j].distance) nearest[j] = { seedIndex: j, otherSeedIndex: i, distance: pair.average };
    pair.distances.forEach((distance, ageIndex) => THRESHOLDS.forEach((threshold, thresholdIndex) => { if (distance >= threshold) ageCounts[ageIndex][thresholdIndex]++; }));
  }
  const make = (values: boolean[]) => intervals ? withSeedInterval(values) : rate(values.filter(Boolean).length, values.length);
  const rates: Record<string, Rate> = {
    shape5: intervals ? pairInterval(flags[0], cases.length) : rate(flags[0].filter(Boolean).length, flags[0].length),
    shape10: intervals ? pairInterval(flags[1], cases.length) : rate(flags[1].filter(Boolean).length, flags[1].length),
    shape20: intervals ? pairInterval(flags[2], cases.length) : rate(flags[2].filter(Boolean).length, flags[2].length),
    semantic20: intervals ? pairInterval(semantic, cases.length) : rate(semantic.filter(Boolean).length, semantic.length),
    nearTwin10: make(nearTwin),
    exactLifecycleCollision: make(collisions(cases.map((c) => digest(DEVELOPED_AGES.map((age) => at(c, age).hash))))),
    silhouetteLifecycleCollision: make(collisions(cases.map((c) => digest(DEVELOPED_AGES.map((age) => at(c, age).silhouetteHash))))),
  };
  return {
    rates, nearest,
    byAge: DEVELOPED_AGES.map((age, index) => ({ age, rates: {
      shape5: rate(ageCounts[index][0], flags[0].length), shape10: rate(ageCounts[index][1], flags[1].length), shape20: rate(ageCounts[index][2], flags[2].length),
      exactFrameCollision: rate(collisions(cases.map((c) => at(c, age).hash)).filter(Boolean).length, cases.length),
    } })),
  };
}
function angleDifference(a: number, b: number) {
  const delta = Math.abs(a - b) % Math.PI;
  return Math.min(delta, Math.PI - delta);
}
function substantial(a: FrameDescriptor, b: FrameDescriptor) {
  const shape = shapeDistance(a, b) >= 0.1;
  const semantic = semanticDistance(a, b).changed >= 2;
  const posture = angleDifference(a.posture.angle, b.posture.angle) >= Math.PI / 36;
  const size = Math.abs(Math.log(Math.max(1e-9, a.size.diameter) / Math.max(1e-9, b.size.diameter))) >= Math.log(1.1);
  return { shape, semantic, posture, size, any: shape || semantic || posture || size };
}
function careComparison(cases: CaseResult[], neutral: CaseResult[], fullControl?: CaseResult[]) {
  const flags: Record<string, boolean[]> = { shapeResponse: [], semanticResponse: [], postureResponse: [], sizeResponse: [], anyVisualResponse: [], rawImageChanged: [], ownBaselineCloser: [] };
  const averageDistances: number[] = [], recoveryFractions: number[] = [];
  const late = cases[0].historyId === "safety-late";
  const convergenceKey = late ? "convergenceTowardChronicControl" : "recoveryTowardControl";
  if (fullControl) { flags.historySensitivityDay90 = []; flags.residualAt240 = []; flags[convergenceKey] = []; }
  for (let i = 0; i < cases.length; i++) {
    const all = DEVELOPED_AGES.map((age) => substantial(at(cases[i], age).descriptor, at(neutral[i], age).descriptor));
    flags.shapeResponse.push(all.filter((f) => f.shape).length >= 2);
    flags.semanticResponse.push(all.filter((f) => f.semantic).length >= 2);
    flags.postureResponse.push(all.filter((f) => f.posture).length >= 2);
    flags.sizeResponse.push(all.filter((f) => f.size).length >= 2);
    flags.anyVisualResponse.push(all.filter((f) => f.any).length >= 2);
    flags.rawImageChanged.push(DEVELOPED_AGES.filter((age) => at(cases[i], age).hash !== at(neutral[i], age).hash).length >= 2);
    const candidate = at(cases[i], 120).descriptor, own = at(neutral[i], 120).descriptor, other = at(neutral[(i + 1) % cases.length], 120).descriptor;
    const distance = (a: FrameDescriptor, b: FrameDescriptor) => 0.6 * shapeDistance(a, b) + 0.4 * semanticDistance(a, b).distance;
    flags.ownBaselineCloser.push(distance(candidate, own) < distance(candidate, other));
    averageDistances.push(mean(DEVELOPED_AGES.map((age) => shapeDistance(at(cases[i], age).descriptor, at(neutral[i], age).descriptor))));
    if (fullControl) {
      const early = shapeDistance(at(cases[i], 75).descriptor, at(fullControl[i], 75).descriptor);
      const remaining = shapeDistance(at(cases[i], 240).descriptor, at(fullControl[i], 240).descriptor);
      flags.historySensitivityDay90.push(substantial(at(cases[i], 90).descriptor, at(fullControl[i], 90).descriptor).any);
      flags.residualAt240.push(substantial(at(cases[i], 240).descriptor, at(fullControl[i], 240).descriptor).any);
      if (early > 0.001) { recoveryFractions.push((early - remaining) / early * 100); flags[convergenceKey].push(remaining < early); }
    }
  }
  return { historyId: cases[0].historyId, rates: Object.fromEntries(Object.entries(flags).map(([key, values]) => [key, withSeedInterval(values)])), meanDistance: mean(averageDistances), ...(fullControl ? { [late ? "convergencePercent" : "recoveryPercent"]: recoveryFractions.length ? mean(recoveryFractions) : null } : {}) };
}
function addRate(target: Record<string, Rate>, key: string, numerator: number, denominator: number) {
  const old = target[key] ?? rate(0, 0);
  target[key] = rate(old.numerator + numerator, old.denominator + denominator);
}
export async function analyze(runDir: string, manifest: Manifest, comparisonId?: string): Promise<Summary> {
  const presets: PresetSummary[] = [], totals: Record<string, Rate> = {};
  const timings: number[] = [];
  let completedCases = 0, frames = 0, failedCases = 0;
  const analysisKey = digest([manifest.metricVersion, await readFile("tools/audit/analysis.ts", "utf8"), await readFile("tools/audit/metrics.ts", "utf8"), await readFile("tools/audit/protocol.ts", "utf8")]);
  for (const preset of manifest.presets) {
    if (!(await exists(join(runDir, "data", `${preset.id}--tended-resources.json.gz`)))) continue;
    const cachePath = join(runDir, "data", `analysis--${preset.id}.json.gz`);
    if (await exists(cachePath)) {
      const cached = await loadJson<{ key: string; preset: PresetSummary; timings: number[]; cases: number; failed: number }>(cachePath);
      if (cached.key === analysisKey) {
        presets.push(cached.preset); timings.push(...cached.timings); frames += cached.timings.length; completedCases += cached.cases; failedCases += cached.failed;
        for (const [key, value] of Object.entries(cached.preset.rates)) addRate(totals, key, value.numerator, value.denominator);
        process.stdout.write(`Resumed analysis ${preset.id}\n`); continue;
      }
    }
    const batches = new Map<string, CaseResult[]>();
    for (const history of manifest.histories) batches.set(history.id, await readBatch(runDir, preset.id, history.id));
    const all = [...batches.values()].flat(), neutral = batches.get("neutral")!;
    completedCases += all.length; failedCases += all.filter((c) => c.errors.length > 0 || c.frames.length !== manifest.ages.length).length;
    const allFrames = all.flatMap((c) => c.frames);
    frames += allFrames.length; timings.push(...allFrames.map((f) => f.milliseconds));
    if (all.some((c) => c.frames.length !== manifest.ages.length)) throw new Error(`${preset.id}: incomplete cases retained in data; resolve errors before diversity analysis.`);
    const rates: Record<string, Rate> = {};
    addRate(rates, "birthExact", all.filter((c) => c.birthExact).length, all.length);
    addRate(rates, "geneticsIndependent", all.filter((c) => c.genomeStable).length, all.length);
    addRate(rates, "validFrames", allFrames.filter((f) => f.integrity.valid).length, allFrames.length);
    addRate(rates, "authoredPartsRetained", allFrames.reduce((n, f) => n + f.integrity.retained, 0), allFrames.reduce((n, f) => n + f.integrity.expected, 0));
    addRate(rates, "expectedHostsCorrect", allFrames.reduce((n, f) => n + f.integrity.hostsCorrect, 0), allFrames.reduce((n, f) => n + f.integrity.hostsTested, 0));
    addRate(rates, "jointIntegrity", allFrames.reduce((n, f) => n + f.integrity.jointsValid, 0), allFrames.reduce((n, f) => n + f.integrity.jointsTested, 0));
    addRate(rates, "faceContainment", allFrames.reduce((n, f) => n + f.integrity.facesInside, 0), allFrames.reduce((n, f) => n + f.integrity.facesTested, 0));
    addRate(rates, "edgeContactFrames", allFrames.filter((f) => f.integrity.edgePixels > 0).length, allFrames.length);
    addRate(rates, "occlusionAlertFrames", allFrames.filter((f) => f.descriptor.visible.fullyOccludedParts > 0).length, allFrames.length);
    addRate(rates, "rareEligibility", neutral.filter((c) => c.noveltyEligible).length, neutral.length);
    addRate(rates, "rareExpression", neutral.filter((c, i) => [...batches.values()].some((batch) => batch[i].frames.some((f) => f.integrity.generatedIds.length > 0))).length, neutral.length);
    addRate(rates, "rareLimitCompliance", all.filter((c) => new Set(c.frames.flatMap((f) => f.integrity.generatedIds)).size <= 1 && (c.noveltyEligible || c.frames.every((f) => !f.integrity.generatedIds.length))).length, all.length);
    addRate(rates, "forbiddenOrganCompliance", allFrames.filter((f) => f.integrity.forbiddenGenerated === 0).length, allFrames.length);
    addRate(rates, "seekReplay", all.reduce((n, c) => n + c.replay.matched, 0), all.reduce((n, c) => n + c.replay.checked, 0));
    addRate(rates, "topologyChange", neutral.filter((c) => DEVELOPED_AGES.some((age) => at(c, age).descriptor.components !== at(c, 0).descriptor.components || at(c, age).descriptor.holes !== at(c, 0).descriptor.holes)).length, neutral.length);
    addRate(rates, "neutralElderlyChange", neutral.filter((c) => at(c, 120).hash !== at(c, 240).hash).length, neutral.length);
    addRate(rates, "careElderlyRemodeling", all.filter((c) => at(c, 120).hash !== at(c, 240).hash).length, all.length);
    const neutralGenetics = genetics(neutral, true);
    Object.assign(rates, neutralGenetics.rates);
    const geneticsByHistory = [{ historyId: "neutral", rates: neutralGenetics.rates }];
    for (const history of manifest.histories.filter((h) => h.id !== "neutral")) {
      geneticsByHistory.push({ historyId: history.id, rates: genetics(batches.get(history.id)!, false).rates });
    }
    const movements: Record<string, number> = {}, structures: Record<string, number> = {};
    for (const c of neutral) { const mode = at(c, 75).descriptor.movement; movements[mode] = (movements[mode] ?? 0) + 1; }
    for (const c of all) for (const kind of new Set(c.frames.flatMap((f) => f.integrity.generatedKinds))) structures[kind] = (structures[kind] ?? 0) + 1;
    const featureChanges = Object.fromEntries(PROPORTION_NAMES.map((name, index) => [name, withSeedInterval(neutral.filter((c) => Math.max(at(c, 0).descriptor.proportions[index], at(c, 75).descriptor.proportions[index]) > 0).map((c) => {
      const a = at(c, 0).descriptor.proportions[index], b = at(c, 75).descriptor.proportions[index];
      return Math.max(a, b) > 0 && (Math.min(a, b) === 0 || Math.max(a, b) / Math.min(a, b) >= 1.2);
    }))]));
    const variance: PresetSummary["variance"] = [];
    for (const panel of ["moderate", "severe"] as const) {
      const histories = manifest.histories.filter((h) => panel === "moderate" ? ["neutral", "moderate"].includes(h.group) : h.group !== "moderate");
      for (const age of [30, 75, 120, 240]) {
        const value = varianceAttribution(neutral.map((_, i) => histories.map((h) => at(batches.get(h.id)![i], age).descriptor)));
        const percentage = (x: number) => value.total > 1e-15 ? x / value.total * 100 : null;
        variance.push({ age, panel, seedPercent: percentage(value.seed), historyPercent: percentage(value.history), interactionPercent: percentage(value.interaction), seedDominates: value.total > 1e-15 ? value.seed > value.history : null });
      }
    }
    const care = manifest.histories.filter((h) => h.id !== "neutral").map((h) => careComparison(batches.get(h.id)!, neutral, h.group === "recovery" ? batches.get(h.id.replace("-recovery", "-100")) : h.id === "safety-late" ? batches.get("safety-0") : undefined));
    const presetSummary = { id: preset.id, name: preset.name, rates, byAge: neutralGenetics.byAge, care, variance, movements, structures, featureChanges, nearest: neutralGenetics.nearest, geneticsByHistory };
    presets.push(presetSummary);
    await saveJson(cachePath, { key: analysisKey, preset: presetSummary, timings: allFrames.map((f) => f.milliseconds), cases: all.length, failed: all.filter((c) => c.errors.length > 0).length });
    for (const [key, value] of Object.entries(rates)) addRate(totals, key, value.numerator, value.denominator);
    process.stdout.write(`Analyzed ${preset.id}: neutral shape10 ${rates.shape10.percent?.toFixed(1)}%, near-twin ${rates.nearTwin10.percent?.toFixed(1)}%\n`);
  }
  timings.sort((a, b) => a - b);
  const supplemental = await exists(join(runDir, "supplemental.json")) ? await loadJson<Supplemental>(join(runDir, "supplemental.json")) : undefined;
  const findings: Summary["findings"] = [];
  for (const p of presets) {
    if ((p.rates.nearTwin10.percent ?? 0) > 5) findings.push({ severity: "high", title: `${p.name}: common near-twins`, detail: `${p.rates.nearTwin10.numerator}/${p.rates.nearTwin10.denominator} seeds have a partner below lifecycle shape separation. This is a numerical similarity alert, requiring visual interpretation.`, examples: p.nearest.sort((a, b) => a.distance - b.distance).slice(0, 2).map((n) => `${p.id}/s${n.seedIndex}/neutral ~ s${n.otherSeedIndex}`) });
    if (p.variance.some((v) => v.panel === "moderate" && v.seedDominates === false)) findings.push({ severity: "high", title: `${p.name}: care outweighs seed in moderate panel`, detail: "History main-effect variance exceeds seed main-effect variance at one or more declared ages. Interaction is reported independently." });
    if ((p.rates.occlusionAlertFrames.percent ?? 0) > 0) findings.push({ severity: "medium", title: `${p.name}: occluded tissue alerts`, detail: `${p.rates.occlusionAlertFrames.numerator}/${p.rates.occlusionAlertFrames.denominator} frames contain at least one nonempty part with no winning composite pixels. Some overlaps are intentional; inspect before calling them defects.` });
  }
  findings.push({ severity: "limitation", title: "Generic movement and anatomy semantics", detail: "Current locomotion has no swimming mode, rigid shell model, or species-specific quadruped gait. Source presets do not manufacture those capabilities by mislabeling fins or shells." });
  const summary: Summary = {
    runId: manifest.runId, generatedAt: new Date().toISOString(), engineUnchanged: digest(await engineHashes()) === manifest.engineHash,
    counts: { completedCases, expectedCases: manifest.expected.cases, frames, expectedFrames: manifest.expected.frames, failedCases }, rates: totals, presets,
    performance: { samples: timings.length, p50: percentile(timings, 0.5), p95: percentile(timings, 0.95), maximum: timings[timings.length - 1] ?? 0, under16: rate(timings.filter((t) => t <= 16.667).length, timings.length), under33: rate(timings.filter((t) => t <= 33.333).length, timings.length), under100: rate(timings.filter((t) => t <= 100).length, timings.length), note: "Windows Node evaluation wall time, excluding descriptor/image encoding; includes cold structural frames. Concurrent audit processes and desktop load may affect timings. This is not an iPhone or signed-widget benchmark." },
    supplemental, findings,
  };
  await saveJson(join(runDir, "summary.json"), summary);
  const csv = ["preset,metric,numerator,denominator,percent,ci95_low,ci95_high", ...presets.flatMap((p) => Object.entries(p.rates).map(([name, r]) => [p.id, name, r.numerator, r.denominator, r.percent ?? "", r.ci95?.[0] ?? "", r.ci95?.[1] ?? ""].join(",")))].join("\n") + "\n";
  await writeFile(join(runDir, "metrics.csv"), csv);
  await saveJson(join(runDir, "metric-definitions.json"), {
    version: manifest.metricVersion,
    normalization: "Center; uniform size; rigid PCA/harmonic rotation with quarter-turn ambiguity minimization. No reflection or independent axis stretch. 16/32 masks retain aspect ratio.",
    shapeDistance: "0.75 * tolerant32 + 0.15 * tolerant16 + 0.10 * exact32 Jaccard; tolerant unmatched cells use one-cell Chebyshev envelope. Thresholds .05/.10/.20, headline .10.",
    lifecycle: ">=2 developed ages exceed threshold; developed ages7,15,30,75,90,120,180,240; infant0 excluded.",
    semantic: ">=2 proportions differ by symmetric ratio >=1.20 at >=2 ages. Presence/absence counts; dimensions are not independent anatomical features.",
    proportions: PROPORTION_NAMES,
    nearTwin: "At least one other raw cohort seed fails lifecycle shape10 separation. It is not a claim of identical artwork or perceived indistinguishability.",
    confidence: "500 fixed-seed bootstrap resamples of whole-seed boolean outcomes; pair rates use256 weighted whole-seed resamples normalized by distinct-original-seed pair weights (duplicate draws do not invent collisions). Near-twin intervals condition on this fixed comparison cohort; paired frames are never treated as independent. CIs apply to this protocol, not a measured player population.",
    variance: "Balanced within-preset vector SS: seed/history/interaction percentages; radial+semantic bounded descriptor channels; excludes size,color,posture. Moderate=neutral+six50%+six100%; severe=neutral+six0%+sixrecovery+late+combined+tended resources.",
    care: "Matched same-seed neutral comparison at>=2 ages. shape>=.10, semantic>=2 ratios20%, posture>=5degrees modulo180, size>=10% diameter. Raw image change also reported independently.",
    recovery: "Recovery compares need restored100% with need100% from birth. Late Safety compares with Safety0% from birth and is labeled convergence toward chronic control, never recovery. Gap reduction%=(distance at75-distance at240)/distance at75 for initial distance>.001; may be negative. Recovery/convergence rates exclude initial zero-distance cases.",
    composite: "Occlusion reconstructed with engine paint ordering; ambiguous same-color contribution is not proof of feature visibility. Face containment uses the actual host tissue plus filled enclosed holes; floating features excluded. Edge contact is an alert, not proof of clipping.",
    summary: "Global rates include pooled numerator/denominator. Per-preset tables and arithmetic equally weighted preset averages are presented separately. No readiness or infinite-possibility percentage is computed.",
  });
  if (comparisonId) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(comparisonId)) throw new Error("Invalid --compare audit ID");
    const baselineDir = resolve("docs/audits", comparisonId), baselineManifest = await loadJson<Manifest>(join(baselineDir, "manifest.json"));
    const baseline = await loadJson<Summary>(join(baselineDir, "summary.json"));
    const comparable = baselineManifest.metricVersion === manifest.metricVersion && digest([baselineManifest.seeds, baselineManifest.histories, baselineManifest.ages, baselineManifest.presets.map((p) => p.sourceHash)]) === digest([manifest.seeds, manifest.histories, manifest.ages, manifest.presets.map((p) => p.sourceHash)]);
    await saveJson(join(runDir, "comparison.json"), { baseline: comparisonId, candidate: manifest.runId, comparable, reason: comparable ? "Unchanged source/seed/history/age cohort and metric version" : "Metric definition or cohort differs; deltas withheld", deltasPercentagePoints: comparable ? presets.map((p) => ({ preset: p.id, metrics: Object.fromEntries(Object.entries(p.rates).map(([key, value]) => { const old = baseline.presets.find((b) => b.id === p.id)?.rates[key]?.percent; return [key, value.percent !== null && old != null ? value.percent - old : null]; })) })) : [] });
  }
  return summary;
}
