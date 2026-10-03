# ADR 0005 — Money, quantities and document numbers

**Status:** Accepted · 2026-10-03

## Context

Floating-point money is wrong (`0.1 + 0.2 ≠ 0.3`). Procurement documents also need human
numbers (PR-000042) that are unique and, for invoices, ideally gap-free.

## Decision

- **Money:** integer **cents** — `BIGINT` in Postgres, `number` in TypeScript (checked to be
  a safe integer), `…Cents` field names in the API. Formatting to `€1,234.56` happens only
  in the UI.
- **Quantities:** `NUMERIC(14,3)` in Postgres (kg, m and l need decimals); in the API they
  are numbers with at most 3 decimals. Domain math works in integer thousandths.
- **Line totals:** `round_half_up(qty × unit price)`, computed with `BigInt`, so the result
  is exact.
- **Document numbers:** a `document_counters` row per type, incremented inside the same
  transaction that inserts the document. A rollback also rolls the counter back, so there
  are no gaps.

## Consequences

- One row lock per document type serializes creation. That's fine at this scale and is
  revisited in Phase 5 (Postgres sequences trade gap-freedom for throughput).
- The API exposes cents. Clients must not do float math on displayed values.
