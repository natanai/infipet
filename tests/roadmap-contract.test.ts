import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateRoadmap } from "../scripts/roadmap.mjs";

const plan = JSON.parse(readFileSync(new URL("../roadmap/plan.json", import.meta.url), "utf8"));

test("[SYS-001/A1] canonical roadmap rejects duplicate IDs, missing dependencies and cycles", () => {
  assert.deepEqual(validateRoadmap(plan), []);
  // Single-creature game semantics must remain explicit in the canonical plan.
  assert.equal(plan.singleCreatureLifecycle.unitOfSimulation, "one continuously identifiable organism across its entire lifetime");
  assert.match(plan.singleCreatureLifecycle.progression, /same pet/);
  assert.match(plan.singleCreatureLifecycle.phylogeny, /developmental trajectories/);
  assert.ok(plan.singleCreatureLifecycle.explicitlyOutOfScope.includes("breeding"));
  assert.ok(plan.singleCreatureLifecycle.explicitlyOutOfScope.includes("parent-offspring inheritance"));
  const duplicate = structuredClone(plan);
  duplicate.tasks.push(structuredClone(duplicate.tasks[0]));
  assert.ok(validateRoadmap(duplicate, { checkFiles:false }).some(x => x.includes("duplicate task ID")));
  const unknown = structuredClone(plan);
  unknown.tasks[1].dependsOn = ["DOES-NOT-EXIST"];
  assert.ok(validateRoadmap(unknown, { checkFiles:false }).some(x => x.includes("unknown dependency")));
  const cyclic = structuredClone(plan);
  cyclic.tasks[0].dependsOn = [cyclic.tasks[1].id];
  assert.ok(validateRoadmap(cyclic, { checkFiles:false }).some(x => x.includes("dependency cycle")));
});

test("[SYS-001/A2] a completed task cannot lack evidence and task-level runner validates", () => {
  const invented = structuredClone(plan);
  const todo = invented.tasks.find((t: {status:string}) => t.status === "todo");
  assert.ok(todo);
  todo.status = "done";
  assert.ok(validateRoadmap(invented).some(x => x.includes("completed task has no focused test file")));
  const command = spawnSync(process.execPath, ["scripts/roadmap.mjs", "--check"], { encoding:"utf8" });
  assert.equal(command.status, 0, command.stderr);
  assert.match(command.stdout, /Roadmap valid:/);
});

test("[SYS-002/A1] only the four narrow prototype acceptance tests are retained", () => {
  assert.deepEqual(readdirSync(new URL(".", import.meta.url)).filter(p=>p.endsWith(".test.ts")).sort(),[
    "development-cohort.test.ts","ink-signature.test.ts",
    "retro-reference-score.test.ts","roadmap-contract.test.ts"
  ]);
});

test("[SYS-002/A2] CI only validates roadmap, types and focused tests, not redundant web/iOS exports", () => {
  const yml = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url),"utf8");
  assert.match(yml,/node scripts\/roadmap\.mjs --check/);
  assert.match(yml,/pnpm typecheck/);
  assert.match(yml,/pnpm test/);
  assert.doesNotMatch(yml,/build:web|build:ios/);
});

test("[SYS-002/A3] every algorithm task has exactly one write owner and a published interface", () => {
  assert.ok(Array.isArray(plan.algorithms) && plan.algorithms.length >= 6);
  const all: string[] = [];
  const scopes: string[] = [];
  for(const owner of plan.algorithms) {
    assert.ok(owner.id && owner.purpose && owner.name);
    assert.ok(owner.inputs.length > 0 || owner.id === "contracts");
    assert.ok(owner.outputs.length > 0);
    for(const id of owner.taskIds) {
      const task = plan.tasks.find((t:{id:string})=>t.id===id);
      assert.ok(task, "unrecognized owned task: "+id);
      assert.equal(task.algorithmId,owner.id);
      all.push(id);
    }
    for(const p of owner.ownedPaths) scopes.push(p);
  }
  assert.equal(new Set(all).size,plan.tasks.length);
  assert.equal(new Set(scopes).size,scopes.length);
  assert.deepEqual(all.sort(),plan.tasks.map((t:{id:string})=>t.id).sort());
  for(let i=0;i<scopes.length;i++) for(let j=i+1;j<scopes.length;j++) {
    assert.ok(!scopes[i].startsWith(scopes[j]) && !scopes[j].startsWith(scopes[i]), "overlapping write scopes");
  }
});

test("[SYS-002/A4] completed tasks automatically register their focused tests without a second checklist", () => {
  const p = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(p.scripts.test, "node scripts/roadmap.mjs --verify-done");
  const expected = [...new Set([
    ...plan.tasks.filter((t:{status:string})=>t.status==="done").map((t:{verification:{testPath:string}})=>t.verification.testPath),
    ...plan.baselineTests
  ])].sort();
  const result = spawnSync(process.execPath, ["scripts/roadmap.mjs","--verify-done","--dry-run"], {encoding:"utf8"});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"),expected);
  assert.equal(expected.length,4, "prototyping baseline should remain small");
});
