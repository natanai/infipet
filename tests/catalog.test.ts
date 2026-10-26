import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_NEED_IDS,
  NEED_IDS,
  catalogProvenance,
  feelingNeedEdges,
  feelingRuleFallbacks,
  feelings,
  feelingsById,
  fauxFeelings,
  needs,
  needsById,
  NEEDS_CATALOG_VERSION,
} from "../src/needs";

test("offline AllNeeds catalog is complete and pinned to its canonical compiler inputs", () => {
  assert.equal(
    NEEDS_CATALOG_VERSION,
    "0c5b73e19f6963a0d38332aafbdfb72149fb0ce5",
  );
  assert.equal(catalogProvenance.repository, "natanai/allneeds");
  assert.equal(catalogProvenance.commit, NEEDS_CATALOG_VERSION);
  assert.equal(needs.length, 67);
  assert.equal(feelings.length, 48);
  assert.equal(fauxFeelings.length, 56);
  assert.equal(new Set(needs.map((need) => need.id)).size, 67);
  assert.deepEqual(
    needs.map((need) => need.id),
    [...NEED_IDS],
  );
  assert.equal(new Set(feelings.map((feeling) => feeling.id)).size, 48);
  assert.equal(needs.filter((need) => need.definition.length > 0).length, 67);
  assert.equal(
    feelings.filter(
      (feeling) => feeling.definition && feeling.bodySignals.length,
    ).length,
    48,
  );
  assert.equal(
    feelings.filter((feeling) => feeling.satisfaction === "met").length,
    12,
  );
  assert.equal(
    feelings.filter((feeling) => feeling.satisfaction === "unmet").length,
    36,
  );
  assert.equal(new Set(needs.map((need) => need.category)).size, 9);
  assert.equal(needs[2].id, "connection");
  assert.equal(needs[9].id, "safety");
  assert.equal(needs[23].id, "accountability");
  assert.equal(needs[32].id, "understanding");
});

test("all 540 feeling/need union edges retain both directions without orphan IDs", () => {
  assert.equal(feelingNeedEdges.length, 540);
  assert.equal(feelingNeedEdges.filter((edge) => edge.fromFeeling).length, 528);
  assert.equal(feelingNeedEdges.filter((edge) => edge.fromNeed).length, 480);
  assert.equal(
    feelingNeedEdges.filter((edge) => edge.fromFeeling && edge.fromNeed).length,
    468,
  );
  assert.equal(
    feelingNeedEdges.filter((edge) => !edge.fromFeeling && edge.fromNeed)
      .length,
    12,
  );
  for (const edge of feelingNeedEdges) {
    assert.ok(feelingsById.has(edge.feelingId));
    assert.ok(needsById.has(edge.needId));
    assert.ok(edge.fromFeeling || edge.fromNeed);
    const need = needsById.get(edge.needId)!;
    const feeling = feelingsById.get(edge.feelingId)!;
    assert.equal(need.feelingIds.includes(edge.feelingId), edge.fromNeed);
    assert.equal(feeling.needIds.includes(edge.needId), edge.fromFeeling);
  }
  assert.ok(
    feelingNeedEdges.some(
      (edge) =>
        edge.feelingId === "anxious" &&
        edge.needId === "safety" &&
        !edge.fromFeeling,
    ),
  );
  for (const faux of fauxFeelings) {
    for (const needId of faux.needIds)
      assert.ok(needsById.get(needId)!.fauxFeelingIds.includes(faux.id));
    for (const id of faux.feelingIds) assert.ok(feelingsById.has(id));
  }
});

test("namespaces stay distinct and only the approved six have appearance profiles", () => {
  assert.ok(needsById.has("calm"));
  assert.ok(feelingsById.has("calm"));
  assert.ok(feelingsById.has("anxious"));
  assert.ok(feelingsById.has("anxiety"));
  assert.ok(needsById.has("mattering"));
  assert.ok(needsById.has("need-to-matter"));
  assert.deepEqual(
    needs
      .filter((need) => need.appearance === "modeled")
      .map((need) => need.id)
      .sort(),
    [...APPEARANCE_NEED_IDS].sort(),
  );
  assert.equal(
    needs.filter((need) => need.appearance === "not-yet-modeled").length,
    61,
  );
  assert.equal((needsById as unknown as { set?: unknown }).set, undefined);
  assert.throws(() => {
    (NEED_IDS as unknown as string[]).push("food");
  }, TypeError);
  assert.throws(() => {
    (APPEARANCE_NEED_IDS as unknown as string[]).pop();
  }, TypeError);
  assert.throws(() => {
    (needs[0] as { title: string }).title = "mutated";
  }, TypeError);
  assert.throws(() => {
    (feelings[0].needIds as string[]).push("unknown");
  }, TypeError);
  assert.equal(needsById.get(needs[0].id), needs[0]);
});

test("five unmapped needs use transparent prototype hypotheses without altering canonical edges", () => {
  const unmapped = needs.filter(
    (need) => !feelingNeedEdges.some((edge) => edge.needId === need.id),
  );
  assert.deepEqual(
    unmapped.map((need) => need.id).sort(),
    feelingRuleFallbacks.map((rule) => rule.needId).sort(),
  );
  for (const rule of feelingRuleFallbacks) {
    assert.equal(rule.provenance, "prototype-rule");
    for (const id of rule.feelingIds) assert.ok(feelingsById.has(id));
  }
  assert.equal(feelingNeedEdges.length, 540);
});
