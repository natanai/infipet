# Incremental traditional-care operator expression — contract v1

**Owners:** `src/environment/operator-chronology.ts`; clients: Development (incremental graph transitions) and live runtime. This module is pure and does **not** apply material operators, create cells or update game rules.

## Inputs and units

`createCareOperatorChronology(program, history, genotype)` accepts:

- `MaterialDevelopmentProgram` compiled **once** from the player's drawing and fixed seed. Every `MaterialOperator` has stable `id`, `kind`, `tissueId`, onset `a` (developmental hours), duration `d>0` (hours) and inherited `strength=s` in `[0,1]`. The program's genotype fingerprint and channels must match `genotype`.
- `EnvironmentalHistory` from the **saved** `GameState`: accepted and rejected commands (with ordered timestamps) plus physiological care samples. `atHour(t)` is the existing care interpretation and `compileCareDevelopmentSignals` is the existing reaction norm. The environment module does not reconstruct or invent a second event log.
- Time is continuous in hours since hatching, with integer physiological samples and potentially fractional accepted commands. Prehatch events cannot earn posthatch progress.
- The legal query interval is `0 ≤ from ≤ to ≤ history.maxHour`. Commands strictly later than `to` never enter the integral.

## Numerical definition

For each existing operator, let `q_op(t)` be its expressed/genetic capability ratio from `compileCareDevelopmentSignals(genotype, history.atHour(t))`. `q` is bounded to `[0,1]`. An inherited potential of zero contributes zero permission.

Create a **fixed, query-independent grid** consisting of onset `a`, operator completion `a+d` (clipped to the recorded history end), integer hours, saved physiological sample hours, and saved command timestamps. Duplicate boundaries coalesce and all boundaries are sorted numerically. On `[bᵢ,bᵢ₊₁)`, the defined game-model response is **held constant** at `q_op(bᵢ)`. Events at `bᵢ` apply to the interval starting there; events at `bᵢ₊₁` do not affect the preceding interval. Simultaneous command receipts maintain their original recorded order in the history; reaction evaluation sees the valid state after that timestamp.

The earned, **cumulative** operator credit at developmental hour `t` is

```text
C_op(t) = s / d * Σ_i [ q_op(b_i) * length([a,min(t,a+d)] ∩ [b_i,b_(i+1))) ]
```

For a transaction taking an existing graph from `from` to `to`, the **only** expressible new progress is

```text
ΔC_op(from,to) = C_op(to) - C_op(from)
```

Reported units are `activeHours` (clock hours), `expressedHours` (integral of dimensionless permission, in hours), `strengthHours=s*expressedHours`, and `progressDelta=strengthHours/d` (dimensionless). `progressAtEnd=C_op(to)` is **diagnostics/checkpoint state only**, never a new strength to reapply. Because the fixed grid never changes with the requested evaluation interval, interval additivity is preserved up to ordinary floating-point rounding.

This is an **exact integral of an explicitly discretized zero-order-hold game response**. It is not an exact continuous-physiology integral, nor does it assume that all real physiological processes respond instantaneously. This choice avoids inventing a continuous law not supported by the saved evidence. No interpolation may peek at a future sample.

## Safe incremental consumption

`chronology.initial()` produces a JSON-safe cursor at hour zero. `advance(cursor,to)`:

1. Rejects a different permanent program/genotype, an invalid or nonfinite time, time travel, an altered previously consumed exposure, or a forged progress map.
2. Recomputes the expected cumulative credit at `cursor.throughHour` to validate historical consistency, including after save/reload or when fresh future events extend the saved history.
3. Returns **only the interval deltas** and an immutable `next` cursor. At `to === cursor.throughHour`, every delta is exactly zero; there is nothing to apply again.

Development must feed each `progressDelta` (not the cumulative `progressAtEnd`) into its own *incremental* structural transition API, maintaining its authoritative single `MaterialGraph` and previous cursor. An already-applied delta must not be replayed merely because runtime reconstructs the same historical view. The cursor is not an anatomical mutation log: structural events and cell ancestry remain Development's responsibility.

Consumer sketch:

```ts
const chronology = createCareOperatorChronology(program, history, genome.genotype);
let cursor = chronology.initial();
const { deltas, next } = chronology.advance(cursor, targetHour);
// Development: apply only these deltas to existing graph via its authoritative
// future incremental material transaction, not applyMaterialOperators
// with a cumulative weighted strength.
cursor = next;
```

To continue from a save with later appended gameplay, construct a new chronology using the extended `EnvironmentalHistory` and pass in the old serialized cursor. Old credits are checked against the new historical prefix; new credits are earned only after the cursor. Do **not** import provisional incremental Development APIs.

## Limits, causality and scope

- `maxHours=1,000,000`, `maxSamples=8192`, `maxCommands=100,000`, `maxBoundariesPerOperator=16,384`, and existing `MATERIAL_LIMITS.operators`. Invalid order, duplicates, nonfinite values, mismatched genotype, impossible pressure or backwards queries throw.
- `0 ≤ q ≤ 1`, `0 ≤ C_op(t) ≤ inherited strength ≤ 1`, `ΔC ≥ 0` (within machine precision), `C_op(t)` is nondecreasing, and identical source/history/genotype yield identical queried credit.
- The source drawing, original material ancestry, permanent genotype, source-derived schedule and seeded chaotic initial conditions remain untouched. Only environmental **permission** varies; no taxonomic destination or arbitrary anatomy is authored.
- In the existing game, a processed feed receipt is **not proof of ingestion**: nutrition changes when the next recorded hour's physiological sample supports it. An accepted training/battle can alter exercise pressure at its fractional timestamp.
- Only existing traditional care evidence is used. The broader nonfatal feelings-and-needs care expansion is deferred to issue #20.
