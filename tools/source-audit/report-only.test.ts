import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { refreshFrozenReport } from "./run";
import {
  digest,
  METRIC_VERSION,
  PROTOCOL_VERSION,
  stageCounts,
} from "./protocol";
import { reviewTemplates } from "./reviews";
import type { CaseResult, Manifest, View } from "./types";
const temporaryRoot = resolve(".audit-test-tmp");
async function testDirectory(prefix: string) {
  await mkdir(temporaryRoot, { recursive: true });
  return mkdtemp(join(temporaryRoot, prefix));
}
async function removeTestDirectory(dir: string) {
  assert.ok(resolve(dir).startsWith(temporaryRoot + sep));
  await rm(dir, { recursive: true, force: true });
}

test("report-only preserves frozen images, diagnostics, source drawings, checkpoint and review bytes", async () => {
  const dir = await testDirectory("report-only-");
  try {
    const descriptor: View["descriptor"] = {
      cells: 1,
      components: 1,
      holes: 0,
      size: { width: 1, height: 1, area: 1, diameter: 1 },
      posture: { angle: 0, anisotropy: 0 },
      movement: "drift",
      pace: 1,
      normalized16: Array(16).fill(0),
      normalized32: Array(32).fill(0),
      proportions: Array(18).fill(0),
      visible: { fullyOccludedParts: 0, ambiguousPixels: 0, testedParts: 1 },
    };
    const view: View = {
      id: "frozen-failure__d0",
      blindLabel: "TEST",
      kind: "endpoint",
      age: 0,
      time: 0,
      actualPhase: null,
      elapsedMs: 1,
      valid: true,
      hash: "fixture-image-hash",
      pixels: [{ x: 20, y: 20, color: "#FFFFFF" }],
      corePixels: [{ x: 20, y: 20, color: "#FFFFFF" }],
      coreHash: "fixture-core-hash",
      coreDescriptor: descriptor,
      regionalPixels: [{ x: 20, y: 20, color: "#99DDFF" }],
      regionalHash: "fixture-regional-hash",
      descriptor,
      development: {},
      wellbeing: {},
      lineage: [],
      sourceTracking: {
        expected: 1,
        represented: 1,
        contributing: 1,
        expectedHosts: 0,
        correctHosts: 0,
        missing: [],
        hostMismatches: [],
      },
      movement: "drift",
      motionPace: 1,
    };
    const result: CaseResult = {
      plan: {
        id: "frozen-failure",
        group: "primary",
        sourceId: "fixture",
        seed: "raw",
        seedIndex: 0,
        historyId: "neutral",
        keyframes: [],
        ages: [0, 30, 75, 120],
      },
      genome: null,
      program: null,
      genomeHash: "",
      inheritedHash: null,
      inheritedPath: null,
      birthFidelity: false,
      seekAgreement: false,
      futureEventCausality: false,
      views: [view],
      error:
        "Intentionally retained frozen failure; reporting must never retry it",
    };
    const manifest: Manifest = {
      protocolVersion: PROTOCOL_VERSION,
      metricVersion: METRIC_VERSION,
      runId: "test-frozen",
      stage: "proof",
      probes: "none",
      createdAt: "2026-10-24T00:00:00.000Z",
      sourceHashes: {},
      captureHash: "frozen",
      sources: [
        {
          id: "fixture",
          name: "Frozen source",
          parts: [],
          sourceHash: "source",
          expectations: [],
        },
      ],
      seeds: ["raw"],
      histories: [{ id: "neutral", label: "neutral", keyframes: [] }],
      cases: [result.plan],
      expected: { ...stageCounts("proof"), primaryCases: 1, cases: 1 },
      runtime: { node: process.version, platform: process.platform },
    };
    for (const folder of [
      "data",
      "images",
      "diagnostics",
      "sources",
      "core-diagnostics",
      "atlases",
    ])
      await mkdir(join(dir, folder));
    const protectedFiles = {
      "data/frozen-failure.json.gz": gzipSync(
        Buffer.from(JSON.stringify(result)),
      ),
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
      "images/frozen-failure__d0.png": Buffer.from(
        "frozen image bytes must not be read or replaced",
      ),
      "sources/fixture.png": Buffer.from("frozen authored source bytes"),
      "core-diagnostics/frozen-failure__d0__core.png": Buffer.from(
        "frozen diagnostic image bytes",
      ),
      "core-diagnostics/frozen-failure__d0__regions.png": Buffer.from(
        "frozen regional mask bytes",
      ),
      "diagnostics/frozen-failure__d0.json": Buffer.from('{"frozen":true}\n'),
      "atlases/endpoint-001.png": Buffer.from("frozen atlas bytes"),
      "checkpoint.json": Buffer.from('{"completedCases":1,"unchanged":true}\n'),
      "capture-source-verification.json": Buffer.from('{"unchanged":true}\n'),
      "view-index.json": Buffer.from("[]\n"),
      "review-template.json": Buffer.from(
        JSON.stringify(reviewTemplates([result])),
      ),
      "visual-reviews.json": Buffer.from(
        JSON.stringify(reviewTemplates([result]), null, 4) + "\n",
      ),
    };
    for (const [path, bytes] of Object.entries(protectedFiles))
      await writeFile(join(dir, path), bytes);
    const before = new Map(
      await Promise.all(
        Object.entries(protectedFiles).map(
          async ([path, bytes]) =>
            [
              path,
              {
                hash: digest(bytes),
                mtime: (await stat(join(dir, path))).mtimeMs,
              },
            ] as const,
        ),
      ),
    );
    const summary = await refreshFrozenReport(dir, manifest);
    assert.equal(summary.actual.cases, 1);
    assert.equal(summary.actual.failures, 1);
    assert.equal(summary.actual.views, 1);
    for (const [path, expected] of before) {
      assert.equal(
        digest(await readFile(join(dir, path))),
        expected.hash,
        `${path} bytes`,
      );
      assert.equal(
        (await stat(join(dir, path))).mtimeMs,
        expected.mtime,
        `${path} was rewritten`,
      );
    }
    assert.match(
      await readFile(join(dir, "REPORT.md"), "utf8"),
      /retained failures/,
    );
  } finally {
    await removeTestDirectory(dir);
  }
});
test("report-only rejects a missing frozen case without generating one or mutating its checkpoint", async () => {
  const dir = await testDirectory("report-missing-");
  try {
    const bytes = Buffer.from('{"completedCases":0}\n');
    await writeFile(join(dir, "checkpoint.json"), bytes);
    const manifest = { cases: [{ id: "missing" }] } as Manifest;
    await assert.rejects(
      refreshFrozenReport(dir, manifest),
      /Missing frozen case.*never collects/,
    );
    assert.deepEqual(await readFile(join(dir, "checkpoint.json")), bytes);
    await assert.rejects(stat(join(dir, "data", "missing.json.gz")), /ENOENT/);
  } finally {
    await removeTestDirectory(dir);
  }
});
