import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const text = (path: string): string =>
  readFileSync(resolve(root, path), "utf8");
const plan = JSON.parse(text("roadmap/plan.json"));
const canonical = text("docs/ARCHITECTURE.md");
const agents = text("AGENTS.md");
const readme = text("README.md");

test("[GUIDE/A1] current production rules are explicit and mutually aligned", () => {
  for (const document of [canonical, agents, readme]) {
    assert.match(document, /365/,"daily limit must be explicit");
    assert.match(document, /seed/i, "permanent genetics must be explicit");
    assert.match(document, /Body/, "default source kind must be explicit");
    assert.match(document, /care/i, "chronological care must be explicit");
    assert.match(document, /determin/i, "exact replay must be explicit");
  }
  assert.match(canonical, /pluripotent/);
  assert.match(canonical, /No semantic anatomy/i);
  assert.match(canonical, /No new chaos/i);
  assert.match(readme, /New chaotic equations are postponed/);
  assert.match(agents, /New chaotic equations are deferred/);
  assert.ok(plan.invariants.some((rule: string) =>
    rule.includes("pluripotent potential")));
  assert.ok(plan.invariants.some((rule: string) =>
    rule.includes("Fixed original state") || rule.includes("byte-for-byte")));
  assert.ok(!plan.invariants.some((rule: string) =>
    /variety must emerge.*chaotic processes/i.test(rule)));
  assert.match(plan.anatomicalDevelopment.checkOperation, /selected PartKinds/);
  assert.match(plan.anatomicalDevelopment.checkOperation, /no fractional physical operations/);
});

test("[GUIDE/A2] no deprecated stand-alone guidance or duplicate benchmark wrappers", () => {
  for (const removed of [
    "docs/morphology/integration-status.md",
    "src/environment/OPERATOR-CHRONOLOGY.md",
    "scripts/profile-runtime.ts",
    "scripts/benchmark-unified.ts",
  ]) assert.equal(existsSync(resolve(root, removed)), false, removed);
  assert.ok(existsSync(resolve(root, "scripts/daily-benchmark.ts")));
  assert.ok(existsSync(resolve(root, "docs/morphology/README.md")),
    "historical regression evidence must not be destroyed");
  assert.match(text("docs/morphology/README.md"), /RESEARCH ARCHIVE/);
  const classifier = text("src/lineage/source-classifier.ts");
  assert.match(classifier, /ONLY authority for anatomical meaning/);
  assert.match(classifier, /EXPLICIT authored brush labels/);
  assert.doesNotMatch(text("src/seed-sort.ts"), /docs\/REFERENCE\.md/);
});

test("[GUIDE/A3] every relative Markdown link in current authoritative docs resolves", () => {
  const files = [
    "README.md", "AGENTS.md", "docs/ARCHITECTURE.md",
    "docs/genetics/readable-seed.md",
  ];
  for (const path of files) {
    const body = text(path);
    for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0].split("?")[0];
      if (!target || target.startsWith("/") || /^[a-z]+:/i.test(target)) continue;
      const local = resolve(root, dirname(path), decodeURIComponent(target));
      assert.ok(existsSync(local), path + " has a broken link: " + target);
    }
  }
});

test("[GUIDE/A4] physical compatibility is not confused with a second active growth engine", () => {
  assert.match(canonical, /COMPATIBILITY|Compatibility|compatibility/);
  assert.match(canonical, /src\/simulation\/development\.ts/);
  assert.match(canonical, /365/);
  assert.match(agents, /No geometry-based semantic fallback/);
  assert.match(readme, /not[\\s\\S]{0,50}deployed/i);
  assert.ok(plan.tasks.find((task: {id:string}) => task.id==="PHY-004")?.status!=="done",
    "unqualified tree/seed genetics must not be marked complete");
});
