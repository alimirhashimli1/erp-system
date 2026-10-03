# ADR 0004 — Approval routing (DoA matrix) and single currency

**Status:** Accepted · 2026-10-03

## Context

A purchase requisition (PR) needs approval before money is committed. Real companies
use a _Delegation of Authority_ (DoA) matrix: the bigger the spend, the more senior
(and the more) approvers. Multi-currency would add FX rates, revaluation and rounding
rules, which are not what Phase 1 is meant to teach.

## Decision

- **DoA matrix as data:** table `doa_levels(level, name, max_amount_cents)`, seeded by a
  migration (L1 ≤ €5,000, L2 ≤ €50,000, L3 unlimited). A PR whose total falls into
  level _n_ needs **sequential** approvals at levels 1…_n_.
- **Approval authority** lives on the user: `users.approval_level` (null = cannot approve).
  A step at level _k_ needs a user with role `APPROVER` and `approval_level ≥ k`.
- **Segregation of duties:** the requester never approves their own PR, and one person
  cannot approve two levels of the same PR.
- **Outcomes:** approve (next level or `APPROVED`), reject (terminal), return (requester
  edits and resubmits, which starts a fresh approval round).
- **Currency:** every amount is EUR. There is no currency column; money is stored as
  integer cents (see ADR 0005).
- The DoA matrix is changed only via migration in Phase 1 (no admin UI yet).

## Consequences

- The level count is fixed at submit time, so editing a PR means returning it first.
- Adding currencies later means adding `currency` + FX snapshot columns to every money
  field. That is a deliberate, one-time migration cost.
