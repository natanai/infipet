#!/usr/bin/env node
// Prevent accidental recommit of tens of thousands of generated audit artifacts.
import { execFileSync } from "node:child_process";
import { statSync, existsSync } from "node:fs";

const MB = 1_000_000;
const files = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
}).split("\0").filter(Boolean);
const required = [
  "App.tsx",
  "src/components/DrawingCanvas.tsx",
  "src/simulation/growth.ts",
  "src/gameplay/index.ts",
  "src/storage.ts",
  "src/phylogeny/catalog-data.json",
  "tests/simulation.test.ts",
  "package.json",
  "pnpm-lock.yaml",
];
const errors = required.filter((name) => !files.includes(name)).map((name) => "Missing: " + name);
let total = 0, auditBytes = 0, auditCount = 0;
for (const file of files) {
  if (!existsSync(file)) {
    errors.push("Tracked file missing from checkout: " + file);
    continue;
  }
  const size = statSync(file).size;
  total += size;
  if (size >= 100 * MB) errors.push("GitHub size limit: " + file + " (" + (size / MB).toFixed(1) + " MB)");
  if (file.startsWith("docs/audits/")) {
    auditCount++;
    auditBytes += size;
  }
}
if (auditCount > 350) errors.push("Too many tracked audit artifacts (" + auditCount + " > 350)");
if (auditBytes > 20 * MB) errors.push("Tracked audit artifacts exceed 20 MB (" + (auditBytes / MB).toFixed(1) + " MB)");
console.log(JSON.stringify({
  trackedFiles: files.length,
  trackedMB: +(total / MB).toFixed(2),
  auditFiles: auditCount,
  auditMB: +(auditBytes / MB).toFixed(2),
  warnings: errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
