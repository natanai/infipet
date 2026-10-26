import fs from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hash as pixelChecksum } from "../../src/simulation/model";
import { GAME_RULES, HOUR } from "../../src/gameplay";
import { RETRO_AUDIT_SCHEDULE } from "./schedule";
import { lifetimeEvidence } from "./lifetime";
import { auditDiagnostics } from "./diagnostics";
import { searchStaged } from "./staged";
import {
  loadCatalog,
  loadRetroSources,
  casesFromCatalog,
  enumeratePaths,
  catalogPaths,
} from "./catalog";
import {
  currentVersions,
  digest,
  engineSourceHash,
  engineSourceFiles,
  replayWitness,
  validateWitness,
} from "./engine";
import { CARE_POLICIES } from "./engine";
import { searchCase, type SearchCache } from "./search";
import { scoreLifecycle } from "./score";
import { safeStem, writeCaseSheet, writeHtml } from "./report";
import { METRIC_VERSION, NEAR_EXACT_THRESHOLDS } from "./metrics";
import type {
  RetroCase,
  RetroAuditSummary,
  SearchResult,
  WitnessRecipe,
  CapturedCheckpoint,
  PublishedWitnessData,
} from "./types";

const args = process.argv.slice(2);
const command = args[0] ?? "list";
const option = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : (args[at + 1] ?? fallback);
};
const integer = (name: string, fallback: number) => {
  const value = Number(option(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`Invalid ${name}`);
  return value;
};
const out = path.resolve(
  option("--out", `docs/audits/${currentVersions().prototype}/retro/latest`),
);
const catalogFile = path.resolve(
  option("--catalog", "data/retro-reference/catalog.json"),
);
const hashFile = (file: string) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const auditSourceFiles = () =>
  fs
    .readdirSync(path.resolve("tools/retro-audit"))
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map((file) => `tools/retro-audit/${file}`);
const auditSourceHash = () => {
  const hash = createHash("sha256");
  for (const file of auditSourceFiles()) {
    hash.update(file);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
};
async function publishApp(
  summary: RetroAuditSummary,
  witnesses: {
    caseId: string;
    recipe: WitnessRecipe;
    captures: CapturedCheckpoint[];
  }[],
) {
  const publication: PublishedWitnessData = {
    version: 1,
    recipes: {},
    byPath: {},
    checksums: {},
  };
  for (const witness of witnesses) {
    const hash = digest(witness.recipe);
    publication.recipes[hash] = witness.recipe;
    publication.byPath[witness.caseId] = hash;
    publication.checksums[witness.caseId] = Object.fromEntries(
      witness.captures.map((capture) => [
        capture.checkpoint.id,
        pixelChecksum(JSON.stringify(capture.pixels)).toString(16),
      ]),
    );
  }
  await writeFile(
    path.resolve("src/retro/audit-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  await writeFile(
    path.resolve("src/retro/witness-data.json"),
    JSON.stringify(publication, null, 2) + "\n",
  );
  console.log(
    `Published ${Object.keys(publication.recipes).length} deduplicated ordinary recipes and verified frame checksums for the app gallery.`,
  );
}
async function main() {
  if (command === "verify") {
    const manifest = JSON.parse(
      await readFile(path.join(out, "manifest.json"), "utf8"),
    );
    assert.equal(
      manifest.metricVersion,
      METRIC_VERSION,
      "Metric version changed",
    );
    for (const artifact of manifest.files ?? [])
      assert.equal(
        hashFile(path.join(out, artifact.file)),
        artifact.sha256,
        `Changed audit artifact ${artifact.file}`,
      );
    assert.equal(
      manifest.engineSourceHash,
      engineSourceHash(),
      "Engine source changed; an old witness cannot silently inherit new code",
    );
    if (manifest.auditSourceHash)
      assert.equal(
        manifest.auditSourceHash,
        auditSourceHash(),
        "The causal evaluator source changed",
      );
    if (manifest.sampleScheduleHash)
      assert.equal(
        manifest.sampleScheduleHash,
        digest(RETRO_AUDIT_SCHEDULE),
        "The predeclared sample schedule changed",
      );
    assert.deepEqual(
      manifest.versions,
      currentVersions(),
      "Prototype/catalog versions changed",
    );
    const cases = JSON.parse(
      await readFile(path.join(out, "cases.json"), "utf8"),
    ) as RetroCase[];
    const summary = JSON.parse(
      await readFile(path.join(out, "summary.json"), "utf8"),
    ) as RetroAuditSummary;
    assert.equal(manifest.casesHash, digest(cases));
    assert.equal(manifest.summaryHash, digest(summary));
    if (manifest.catalogSnapshot) {
      const frozenCatalog = JSON.parse(
        await readFile(path.join(out, manifest.catalogSnapshot), "utf8"),
      );
      assert.equal(
        manifest.catalogHash,
        digest(frozenCatalog),
        "Changed frozen reference provenance",
      );
    }
    let checked = 0;
    const witnesses: Parameters<typeof publishApp>[1] = [];
    for (const row of summary.paths)
      if (row.best) {
        const case_ = cases.find((item) => item.id === row.id)!;
        const recipe = validateWitness(
          JSON.parse(
            await readFile(path.join(out, row.best.witnessFile), "utf8"),
          ) as WitnessRecipe,
        );
        const captures = replayWitness(recipe, case_.checkpoints);
        const terminal = lifetimeEvidence(
          recipe,
          case_.checkpoints.at(-1)!.atHour,
          case_.checkpoints.at(-1)!.expectedStage,
          case_.checkpoints.at(-1)!.expectedBranch,
        );
        const diagnostics = auditDiagnostics(
          recipe,
          case_,
          terminal,
          captures[0],
        );
        const score = scoreLifecycle(
          recipe,
          captures,
          terminal,
          case_.nativeHistory,
          diagnostics,
        );
        assert.deepEqual(
          score.checkpoints,
          row.best.checkpoints,
          `Changed replay or scores for ${row.id}`,
        );
        assert.equal(score.status, row.status);
        assert.equal(score.worstIoU, row.best.worstIoU);
        if (row.best.terminal)
          assert.deepEqual(
            score.terminal,
            row.best.terminal,
            "Terminal/restart evidence changed",
          );
        if (row.best.diagnostics)
          assert.deepEqual(
            score.diagnostics,
            row.best.diagnostics,
            "Fixed-schedule diagnostic frames changed",
          );
        witnesses.push({ caseId: row.id, recipe, captures });
        checked++;
      }
    if (args.includes("--publish-app")) await publishApp(summary, witnesses);
    console.log(
      `Verified ${checked} replayable whole-path witnesses. Failed/unscored paths remain failed/unscored; no visual acceptance is implied.`,
    );
    return;
  }
  const catalog = loadCatalog(catalogFile),
    sources = await loadRetroSources();
  const capturedCatalogHash = digest(catalog);
  const characters = new Map(
    catalog.characters.map((character) => [character.id, character]),
  );
  const filter = option("--path", "");
  let allPaths = catalogPaths(catalog);
  if (filter) allPaths = allPaths.filter((item) => item.id.includes(filter));
  allPaths = allPaths.slice(0, integer("--limit", allPaths.length));
  if (!allPaths.length)
    throw new Error("No reference paths match this selection.");
  const selected = new Set(allPaths.map((item) => item.id));
  const cases = casesFromCatalog(catalog, sources, {
    skipMissingSources: true,
  }).filter((item) => selected.has(item.id));
  if (command === "list") {
    console.log(
      JSON.stringify(
        {
          forms: catalog.characters.length,
          paths: allPaths.map((item) => ({
            id: item.id,
            characters: item.characterIds,
            sourceAvailable: sources.has(item.rootCharacterId),
            referenceTargets: item.characterIds.filter(
              (id) => characters.get(id)!.target,
            ).length,
            totalStages: item.characterIds.length,
          })),
          carePolicies: CARE_POLICIES.map((policy) => ({
            id: policy.id,
            label: policy.label,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command !== "search") throw new Error("Use list, search or verify.");
  const seedCount = integer("--seed-count", 4),
    seedStart = integer("--seed-start", 0);
  const mode = option("--mode", "full");
  if (!["full", "staged"].includes(mode))
    throw new Error("Use --mode full or --mode staged.");
  if (mode === "staged" && args.includes("--publish-app"))
    throw new Error(
      "Staged prefix scans have separate reports; publish full-life witness cohorts from --mode full.",
    );
  if (
    mode === "full" &&
    (args.includes("--max-inputs") || args.includes("--max-seconds"))
  )
    throw new Error(
      "Input/time budgets require --mode staged; full witness cohorts use the declared seed/policy bound.",
    );
  const policySelection = option("--policies", "tended,trained,battle-trained");
  const policyIds =
    policySelection === "all"
      ? CARE_POLICIES.map((policy) => policy.id)
      : policySelection.split(",").filter(Boolean);
  if (
    seedCount < 1 ||
    seedCount > (mode === "staged" ? 1_000_000 : 1024) ||
    !policyIds.length ||
    policyIds.some((id) => !CARE_POLICIES.some((policy) => policy.id === id))
  )
    throw new Error("Invalid bounded seed/policy search budget.");
  const runId = option("--run-id", path.basename(out));
  await mkdir(path.join(out, "witnesses"), { recursive: true });
  await mkdir(path.join(out, "sheets"), { recursive: true });
  const capturedEngineSourceHash = engineSourceHash(),
    capturedAuditSourceHash = auditSourceHash();
  const scheduleFrozenAt = new Date().toISOString();
  await writeFile(
    path.join(out, "sample-schedule.json"),
    JSON.stringify(RETRO_AUDIT_SCHEDULE, null, 2) + "\n",
  );
  const nativeRulesFile = path.resolve(
    "data/retro-reference/native-rules-v1.json",
  );
  const nativeRulesBytes = await readFile(nativeRulesFile);
  await writeFile(path.join(out, "native-rules.json"), nativeRulesBytes);
  const summary: RetroAuditSummary = {
    version: 1,
    runId,
    generatedAt: new Date().toISOString(),
    versions: currentVersions(),
    searchMode: mode as "full" | "staged",
    counts: {
      paths: allPaths.length,
      candidates: 0,
      unscored: 0,
      failed: 0,
      machineCandidates: 0,
      visuallyAccepted: 0,
      gameEligible: 0,
      fullLifeEligible: 0,
      nativeHistoryUnverified: 0,
    },
    paths: [],
  };
  for (const entry of allPaths)
    if (!sources.has(entry.rootCharacterId)) {
      summary.paths.push({
        ...entry,
        status: "unscored",
        unavailableReason:
          "The original starting drawing is unavailable; no invented source is substituted.",
      });
      summary.counts.unscored++;
    }
  const cache: SearchCache = new Map();
  const results: SearchResult[] = [];
  // Sharing maximum run length within each root keeps the entire same-seed/care cohort identical across targets.
  const rootEnd = new Map<string, number>();
  for (const case_ of cases)
    rootEnd.set(
      case_.rootCharacterId,
      Math.max(
        rootEnd.get(case_.rootCharacterId) ?? 0,
        GAME_RULES.lifespanMs / HOUR +
          RETRO_AUDIT_SCHEDULE.terminalBoundExtraHours,
        ...case_.checkpoints.map((point) => point.atHour),
      ),
    );
  let lastStagedProgressAt = Date.now(),
    lastStagedInputs = 0;
  const staged =
    mode === "staged"
      ? searchStaged(cases, {
          seedCount,
          seedStart,
          policyIds,
          ...(args.includes("--max-inputs")
            ? { maxInputs: integer("--max-inputs", 1) }
            : {}),
          ...(args.includes("--max-seconds")
            ? { maxMs: integer("--max-seconds", 0) * 1000 }
            : {}),
          onProgress: (progress) => {
            if (
              Date.now() - lastStagedProgressAt >= 20_000 ||
              progress.uniqueInputCandidates - lastStagedInputs >= 1000 ||
              progress.budgetExhausted
            ) {
              fs.writeFileSync(
                path.join(out, "staged-progress.json"),
                JSON.stringify(
                  {
                    version: 1,
                    versions: currentVersions(),
                    engineSourceHash: capturedEngineSourceHash,
                    auditSourceHash: capturedAuditSourceHash,
                    catalogHash: capturedCatalogHash,
                    sampleScheduleHash: digest(RETRO_AUDIT_SCHEDULE),
                    seedStart,
                    seedCount,
                    policyIds,
                    progress,
                  },
                  null,
                  2,
                ) + "\n",
              );
              console.log(
                `Staged scan: ${progress.uniqueInputCandidates} distinct inputs; ${progress.prefixSimulations} prefixes; ${progress.fullLivesSimulated} full lives; ${(progress.elapsedMs / 1000).toFixed(1)}s.`,
              );
              lastStagedProgressAt = Date.now();
              lastStagedInputs = progress.uniqueInputCandidates;
            }
          },
        })
      : null;
  if (staged) {
    summary.stagedSearch = staged.progress;
    fs.writeFileSync(
      path.join(out, "staged-progress.json"),
      JSON.stringify(
        {
          version: 1,
          versions: currentVersions(),
          engineSourceHash: capturedEngineSourceHash,
          auditSourceHash: capturedAuditSourceHash,
          catalogHash: capturedCatalogHash,
          sampleScheduleHash: digest(RETRO_AUDIT_SCHEDULE),
          seedStart,
          seedCount,
          policyIds,
          progress: staged.progress,
        },
        null,
        2,
      ) + "\n",
    );
  }
  for (const [index, case_] of cases.entries()) {
    let lastProgressAt = Date.now();
    console.log(
      `${staged ? "Writing" : "Starting"} [${index + 1}/${cases.length}] ${case_.id}; ${seedCount} seeds × ${policyIds.length} care policies.`,
    );
    const result =
      staged?.results.find((result) => result.caseId === case_.id) ??
      searchCase(case_, {
        seedCount,
        seedStart,
        policyIds,
        cache,
        endHour: rootEnd.get(case_.rootCharacterId),
        onProgress: (progress) => {
          if (Date.now() - lastProgressAt >= 20_000) {
            console.log(
              `  ${progress.candidatesTried}/${progress.candidatesTotal} candidates; ${(progress.elapsedMs / 1000).toFixed(1)} seconds elapsed.`,
            );
            lastProgressAt = Date.now();
          }
        },
      });
    results.push(result);
    const best = result.winner,
      stem = safeStem(case_.id),
      witnessFile = `witnesses/${stem}.json`;
    summary.counts.candidates += result.candidatesTried;
    const status = best?.score.status ?? result.status ?? "unscored";
    if (best?.score.gameEligible) summary.counts.gameEligible!++;
    if (best?.score.fullLifeEligible) summary.counts.fullLifeEligible!++;
    if (
      case_.nativeHistory?.commandHistoryStatus ===
      "unverified-controller-mapping"
    )
      summary.counts.nativeHistoryUnverified!++;
    if (status === "failed") summary.counts.failed++;
    else if (status === "unscored") summary.counts.unscored++;
    else summary.counts.machineCandidates++;
    summary.paths.push({
      id: case_.id,
      deviceId: case_.deviceId,
      characterIds: case_.characterIds,
      rootCharacterId: case_.rootCharacterId,
      status,
      gameEligible: best?.score.gameEligible ?? null,
      fullLifeEligible: best?.score.fullLifeEligible ?? null,
      ...(case_.nativeHistory ? { nativeHistory: case_.nativeHistory } : {}),
      ...(result.prefixSearch ? { prefixSearch: result.prefixSearch } : {}),
      ...(best
        ? {
            best: {
              seed: best.recipe.seed,
              policyId: best.recipe.policyId,
              worstIoU: best.score.worstIoU,
              meanIoU: best.score.meanIoU,
              witnessFile,
              checkpoints: best.score.checkpoints,
              terminal: best.score.terminal,
              diagnostics: best.score.diagnostics,
              nativeHistoryStatus: best.score.nativeHistoryStatus,
              fullLifeComplete: best.score.fullLifeComplete,
            },
          }
        : {}),
    });
    if (best) {
      await writeFile(
        path.join(out, witnessFile),
        JSON.stringify(best.recipe, null, 2) + "\n",
      );
      await writeCaseSheet(
        path.join(out, "sheets", `${stem}.png`),
        case_,
        result,
      );
    }
    console.log(
      `[${index + 1}/${cases.length}] ${case_.id}: ${status}; weakest IoU ${best?.score.worstIoU?.toFixed(3) ?? "unscored"}`,
    );
  }
  await writeFile(
    path.join(out, "reference-catalog.json"),
    JSON.stringify(catalog, null, 2) + "\n",
  );
  await writeFile(
    path.join(out, "cases.json"),
    JSON.stringify(cases, null, 2) + "\n",
  );
  await writeFile(
    path.join(out, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  assert.equal(
    capturedEngineSourceHash,
    engineSourceHash(),
    "Runtime changed during the search",
  );
  assert.equal(
    capturedAuditSourceHash,
    auditSourceHash(),
    "Causal evaluator changed during the search",
  );
  if (args.includes("--publish-app")) {
    await publishApp(
      summary,
      results.flatMap((result) =>
        result.winner ? [{ caseId: result.caseId, ...result.winner }] : [],
      ),
    );
  }
  await writeHtml(out, summary);
  const files = [
    "index.html",
    "reference-catalog.json",
    "sample-schedule.json",
    "native-rules.json",
    ...(staged ? ["staged-progress.json"] : []),
    ...summary.paths.flatMap((row) =>
      row.best ? [row.best.witnessFile, `sheets/${safeStem(row.id)}.png`] : [],
    ),
  ].map((file) => ({ file, sha256: hashFile(path.join(out, file)) }));
  const manifest = {
    version: 1,
    runId,
    versions: currentVersions(),
    engineSourceHash: capturedEngineSourceHash,
    engineSourceFiles: engineSourceFiles(),
    auditSourceHash: capturedAuditSourceHash,
    auditSourceFiles: auditSourceFiles(),
    sampleScheduleHash: digest(RETRO_AUDIT_SCHEDULE),
    scheduleFrozenAt,
    nativeRulesSourceBytesSha256: createHash("sha256")
      .update(nativeRulesBytes)
      .digest("hex"),
    catalogFile: path
      .relative(process.cwd(), catalogFile)
      .replaceAll("\\", "/"),
    catalogHash: capturedCatalogHash,
    catalogSnapshot: "reference-catalog.json",
    referenceCoverage: {
      forms: catalog.characters.length,
      formsWithTargets: catalog.characters.filter(
        (character) => character.target,
      ).length,
      scoredReferenceForms: new Set(
        cases.flatMap((item) =>
          item.checkpoints
            .filter(
              (point) =>
                point.target &&
                !["provisional", "unavailable"].includes(point.referenceStatus),
            )
            .map((point) => point.characterId),
        ),
      ).size,
      provisionalReferenceForms: new Set(
        cases.flatMap((item) =>
          item.checkpoints
            .filter((point) => point.referenceStatus === "provisional")
            .map((point) => point.characterId),
        ),
      ).size,
      sourceAvailableRoots: new Set(cases.map((item) => item.rootCharacterId))
        .size,
      graphPaths: enumeratePaths(catalog).length,
      historyDistinguishedCases: allPaths.length,
      p1NativeHistoryCases: cases.filter((item) => item.nativeHistory).length,
    },
    sampling: {
      pathComparisons: summary.counts.candidates,
      uniqueSourceSeedCareRecipes:
        new Set([...cache.values()].map((entry) => digest(entry.recipe)))
          .size ||
        staged?.progress.uniqueInputCandidates ||
        0,
      searchMode: mode,
      ...(staged
        ? {
            prefixSimulations: staged.progress.prefixSimulations,
            fullLivesSimulated: staged.progress.fullLivesSimulated,
            budgetExhausted: staged.progress.budgetExhausted,
            maxInputs: args.includes("--max-inputs")
              ? integer("--max-inputs", 1)
              : null,
            maxMs: args.includes("--max-seconds")
              ? integer("--max-seconds", 0) * 1000
              : null,
          }
        : {}),
      candidatesAreIndependentForEveryPath: false,
      explanation:
        "The same source/seed/care recipes are compared with all compatible reference paths; repeated comparisons are not new independent seeds.",
    },
    candidateSelection:
      "full acceptance status, terminal full-life eligibility, eligible checkpoints, worst-stage IoU, mean IoU; diagnostic gates required before any candidate claim",
    casesHash: digest(cases),
    summaryHash: digest(summary),
    files,
    metricVersion: METRIC_VERSION,
    thresholds: NEAR_EXACT_THRESHOLDS,
    seedCohort: "shared-neutral-sha256-v1",
    seedStart,
    seedCount,
    policyIds,
    policySpecifications: CARE_POLICIES.filter((policy) =>
      policyIds.includes(policy.id),
    ),
    referenceArtUsedOnlyForScoring: true,
    visualAcceptance: false,
    limits: [
      "One monochrome neutral reference pose per available character; animation is unverified.",
      "A bounded search result does not establish reachability across the entire seed space.",
      "The combined game clock differs from original Tamagotchi timing.",
      "Unverified care predicates remain unscored and missing targets cannot pass.",
    ],
  };
  await writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary.counts, null, 2));
  console.log(`Report: ${path.join(out, "index.html")}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
