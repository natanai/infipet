import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateRoadmap } from "../scripts/roadmap.mjs";

const plan = JSON.parse(readFileSync(new URL("../roadmap/plan.json", import.meta.url), "utf8"));

test("[SYS-001/A1] canonical roadmap rejects duplicate IDs, missing dependencies and cycles", () => {
  assert.deepEqual(validateRoadmap(plan), []);
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
