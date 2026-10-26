#!/usr/bin/env node
// Canonical machine-readable development contract. No third-party dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planFile = path.join(root, "roadmap/plan.json");
const statuses = new Set(["todo", "in_progress", "blocked", "done"]);
const validId = /^[A-Z]+-\d{3}$/;
const has = (x) => typeof x === "string" && x.trim().length > 0;
const file = (relative) => path.join(root, relative);
const safePath = (p) => has(p) && !path.isAbsolute(p) && !p.split("/").includes("..");
export function validateRoadmap(plan, options = {}) {
  const errors = [];
  const fail = (where, why) => errors.push(where + ": " + why);
  if (plan?.schemaVersion !== 1 || plan?.sourceOfTruth !== true) fail("root", "expected canonical schemaVersion 1");
  if (!Array.isArray(plan?.tasks) || !plan.tasks.length) return ["root: tasks must be a nonempty array"];
  const byId = new Map();
  for (const task of plan.tasks) {
    const id = task?.id;
    if (!has(id) || !validId.test(id)) { fail(String(id), "invalid task ID"); continue; }
    if (byId.has(id)) fail(id, "duplicate task ID");
    byId.set(id, task);
    if (!statuses.has(task.status)) fail(id, "invalid status");
    if (!Number.isInteger(task.phase) || task.phase < 0) fail(id, "invalid phase");
    if (!has(task.area) || !has(task.title)) fail(id, "area and title required");
    if (!Array.isArray(task.dependsOn) || new Set(task.dependsOn).size !== task.dependsOn.length) fail(id, "unique dependencies required");
    if (!Array.isArray(task.acceptance) || !task.acceptance.length) fail(id, "acceptance required");
    const tags = new Set();
    for (const a of task.acceptance ?? []) {
      if (!/^A\d+$/.test(a.id ?? "") || tags.has(a.id)) fail(id, "invalid or repeated acceptance ID");
      tags.add(a.id);
      if (!has(a.requirement) || a.oracle !== "focused-node-test") fail(id, "acceptance must state an automated observable claim");
    }
    const v = task.verification;
    if (v?.kind !== "node-test" || !safePath(v.testPath) || !/^tests\/[a-z0-9-]+\.test\.ts$/.test(v.testPath) ||
        v.command !== "pnpm exec tsx --test " + v.testPath || v.artifactPolicy !== "no-images-or-snapshots") fail(id, "unsafe or missing focused verification contract");
    if (!Array.isArray(task.implementationPaths) || !task.implementationPaths.length || !task.implementationPaths.every(safePath)) fail(id, "implementation paths required");
    if (task.status === "done" && options.checkFiles !== false && v?.testPath && safePath(v.testPath)) {
      if (!fs.existsSync(file(v.testPath))) fail(id, "completed task has no focused test file");
      else {
        const source = fs.readFileSync(file(v.testPath), "utf8");
        for (const a of task.acceptance ?? []) if (!source.includes("[" + id + "/" + a.id + "]")) fail(id, "missing independent acceptance marker " + a.id);
      }
      for (const p of task.implementationPaths) if (safePath(p) && !fs.existsSync(file(p))) fail(id, "missing implementation file " + p);
      for (const dep of task.dependsOn ?? []) if (byId.get(dep)?.status !== "done") {
        // Also checked after all IDs have been scanned below.
      }
    }
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { fail(id, "dependency cycle"); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const task = byId.get(id);
    for (const dep of task?.dependsOn ?? []) {
      if (!byId.has(dep)) fail(id, "unknown dependency " + dep);
      else {
        if (task.status === "done" && byId.get(dep).status !== "done") fail(id, "completed before dependency " + dep);
        visit(dep);
      }
    }
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  if (!has(plan.mandate) || !Array.isArray(plan.invariants) || plan.invariants.length < 4) fail("root", "mandate and invariants required");
  return errors;
}

function main() {
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  const errors = validateRoadmap(plan);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; return; }
  const argv = process.argv.slice(2);
  const requested = argv.find(a => a.startsWith("--task="))?.slice(7);
  if (argv.includes("--list")) {
    for (const task of plan.tasks) console.log([task.id, task.status, task.phase, task.title].join("\t"));
    return;
  }
  if (requested) {
    const task = plan.tasks.find(t => t.id === requested);
    if (!task) { console.error("Unknown task: " + requested); process.exitCode = 1; return; }
    console.log(JSON.stringify(task, null, 2));
    if (argv.includes("--run")) {
      if (!fs.existsSync(file(task.verification.testPath))) { console.error("Focused test not yet implemented"); process.exitCode = 1; return; }
      const r = spawnSync("pnpm", ["exec", "tsx", "--test", task.verification.testPath], {cwd:root, stdio:"inherit", shell:process.platform==="win32"});
      if (r.error) { console.error(r.error.message); process.exitCode = 1; }
      else process.exitCode = r.status ?? 1;
    }
    return;
  }
  if (argv.length && !argv.includes("--check")) { console.error("Use --check, --list, or --task=ID [--run]"); process.exitCode = 1; return; }
  const done = plan.tasks.filter(t => t.status === "done").length;
  console.log("Roadmap valid: " + done + "/" + plan.tasks.length + " tasks evidenced as done; " + (plan.tasks.length - done) + " not done.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
