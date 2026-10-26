import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { planReviewAppend } from "./merge-reviews";
import type { Review } from "./types";
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const row = (
  reviewer: string | null,
  status: "reviewed" | "unreviewed" = "reviewed",
) =>
  ({
    id: "case__transition__0-30",
    reviewer,
    status,
    notes: "Retain this evidence exactly",
  }) as Review;
test("review merge only appends and preserves earlier templates and reviewed records", () => {
  const prior = [row(null, "unreviewed"), row("first")],
    raw = JSON.stringify(prior, null, 2) + "\n";
  const p = planReviewAppend(raw, [row("second")], hash(raw));
  assert.deepEqual(p.rows.slice(0, prior.length), prior);
  assert.equal(p.rows.length, 3);
  assert.ok(p.bytes.startsWith(raw.slice(0, raw.lastIndexOf("]"))));
  assert.equal(p.priorCount, 2);
});
test("duplicate reviewer/comparison pairs are rejected against old and incoming receipts", () => {
  const raw = JSON.stringify([row("first")]);
  assert.throws(
    () => planReviewAppend(raw, [row("first")], hash(raw)),
    /Duplicate reviewer/,
  );
  assert.throws(
    () => planReviewAppend(raw, [row("second"), row("second")], hash(raw)),
    /Duplicate reviewer/,
  );
});
test("stale state and unreviewed incoming records cannot produce an append plan", () => {
  const raw = "[]\n";
  assert.throws(
    () => planReviewAppend(raw, [row("first")], hash("[]")),
    /Stale/,
  );
  assert.throws(
    () => planReviewAppend(raw, [row(null, "unreviewed")], hash(raw)),
    /reviewed records/,
  );
  assert.equal(raw, "[]\n");
});
