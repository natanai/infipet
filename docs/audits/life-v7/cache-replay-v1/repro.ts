/** Read-only runtime reproduction. Run: node --import tsx docs/audits/life-v7/cache-replay-v1/repro.ts */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clonePreset } from "../../../../src/presets";
import { createSimulation, type Pixel } from "../../../../src/simulation";
import { frameHash } from "../../../../tools/audit/metrics";

const seed = "life-v7-genome-01";
const make = () => createSimulation(clonePreset("canine-cub"), seed);
const options = { action: "move" as const, time: 1e-8 };
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const pixelHash = (pixels: readonly Pixel[]) => hash(JSON.stringify(pixels));
const ages = [
  0, 5, 10, 15, 20, 25, 30, 37.5, 45, 52.5, 60, 67.5, 75, 82.5, 90, 105, 120,
  240, 1000,
];
const rows = ages.map((age) => {
  const coldSim = make(),
    warmSim = make();
  const cold = coldSim.frameAt(age, options);
  warmSim.frameAt(age, { action: "move", time: 0 });
  const warm = warmSim.frameAt(age, options);
  // Evict the bounded whole-frame cache using unrelated future ages, then ask
  // for exactly the same epsilon-time input again on the same instance.
  for (let i = 1; i <= 20; i++) warmSim.frameAt(age + 100 + i, options);
  const afterEviction = warmSim.frameAt(age, options);
  const coldHash = frameHash(cold),
    warmHash = frameHash(warm),
    afterEvictionHash = frameHash(afterEviction);
  return {
    age,
    coldHash,
    warmHash,
    afterEvictionHash,
    equal: coldHash === warmHash && warmHash === afterEvictionHash,
    changedParts: cold.parts
      .filter(
        (part) =>
          pixelHash(part.pixels) !==
          pixelHash(warm.parts.find((p) => p.id === part.id)!.pixels),
      )
      .map((part) => part.id),
  };
});
const idleCold = make().frameAt(0, { action: "idle", time: 1e-8 });
const idleWarmSim = make();
idleWarmSim.frameAt(0, { action: "idle", time: 0 });
const idleWarm = idleWarmSim.frameAt(0, { action: "idle", time: 1e-8 });
const report = {
  seed,
  source: "canine-cub",
  options,
  createdAt: new Date().toISOString(),
  sourceHash: hash(JSON.stringify(clonePreset("canine-cub"))),
  runtimeFiles: Object.fromEntries(
    ["growth.ts", "locomotion.ts", "development.ts"].map((name) => [
      name,
      hash(
        readFileSync(
          fileURLToPath(
            new URL(`../../../../src/simulation/${name}`, import.meta.url),
          ),
        ),
      ),
    ]),
  ),
  rows,
  idleBirth: {
    coldHash: frameHash(idleCold),
    warmHash: frameHash(idleWarm),
    equal: frameHash(idleCold) === frameHash(idleWarm),
  },
  historicalCause: [
    "growth.frameKey buckets time0 and time1e-8 together, while the blink branch distinguishes time>0 and birth distinguishes time===0.",
    "Seed1 blink bucket is0. The warmed epsilon request returns the previously cached unblinked time0 image; cold epsilon renders blinked eyes.",
    "After unrelated future requests evict the whole-frame entry, the identical epsilon request changes to the cold result.",
    "Additional boundary risk: frame key held epsilon1e-8 differs from locomotion held epsilon1e-9; use a key matching all rendering inputs/branches.",
  ],
};
writeFileSync(
  fileURLToPath(new URL(process.argv[2] ?? "report.json", import.meta.url)),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
