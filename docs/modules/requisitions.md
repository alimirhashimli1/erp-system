# Purchase requisitions & Delegation of Authority

A **purchase requisition (PR)** is an _internal_ request: "my department needs this, here
is why, here is roughly what it costs". It commits no money and no supplier sees it.
Only once it is approved may procurement start sourcing it. That gate is the first
spend control in Procure-to-Pay.

## Lifecycle

```
          submit                 approve (last level)
 DRAFT ───────────▶ SUBMITTED ─────────────────────────▶ APPROVED ──▶ (sourcing)
   │                 │   │  ▲ approve (more levels left: stays SUBMITTED)
   │ cancel          │   │  └──┘
   ▼                 │   ├── reject ──▶ REJECTED   (terminal)
 CANCELLED ◀─────────┘   └── return ──▶ RETURNED ── edit + submit ──▶ SUBMITTED (new round)
```

`PR_TRANSITIONS` in `domain/requisition.ts` is the single source of truth. Every
state change goes through `assertPrTransition`, so an illegal jump (e.g. REJECTED →
SUBMITTED) is a `409 INVALID_TRANSITION`, not a silent update.

## Delegation of Authority (DoA)

Who may approve how much is company policy, so it is stored as data (`doa_levels`):

| Level | Role               | Approves up to |
| ----- | ------------------ | -------------- |
| L1    | Team lead          | €5,000         |
| L2    | Head of department | €50,000        |
| L3    | CFO                | unlimited      |

A PR needs **every level up to the first one that covers its total, in sequence**:
€29,100 → L1 then L2. Approvers have an `approvalLevel`. A step at level _k_ needs
someone with level ≥ _k_, so the CFO may take an L1 step.

The level count is fixed **at submit time**. Changing the amount means returning the
PR, editing it and resubmitting, which starts a new **approval round**. Approvals from
older rounds no longer count, because the approver signed off on different content.

## Segregation of duties (SoD)

SoD splits a transaction across people so that no single person can commit fraud alone:

- **No self-approval:** the requester cannot approve their own PR, even if they also hold
  APPROVER with enough authority.
- **No double approval:** one person cannot approve two levels of the same PR (round).
  Otherwise a CFO could "be" both levels.
- **Authority is read from the database** on every decision, not from the JWT. Revoking
  someone's approval level takes effect immediately, not when their token expires.

## Concurrency: two approvers, one click

Two L1 approvers open the same PR and both click _Approve_. Two guards stop a double
approval:

1. `pr_approvals` has a unique key `(requisition, round, level)`. The second insert fails,
   which surfaces as `409 PR_LEVEL_ALREADY_DECIDED`.
2. Each write carries the `version` the user read (optimistic locking). A write against a
   stale version is `409 STALE_WRITE`.

Edits use the same mechanism: the form sends `version`, so two tabs can't silently
overwrite each other.

## Row-level authorization

| Who                             | Sees                           |
| ------------------------------- | ------------------------------ |
| Requester (no other role)       | only their own PRs             |
| Approver, Buyer, Finance, Admin | all PRs (needed for their job) |
| Warehouse                       | none (no PR endpoint access)   |

A PR you may not see answers **404, not 403**, so its existence doesn't leak. The rule
lives in the domain (`canView`) and is applied by the service. The UI hiding buttons is
only a convenience.

## Snapshots

Each line copies the item's description and UoM when the PR is created. If someone later
renames the item in master data, the approved PR still shows what the approver actually
saw.

## Audit trail

`PR_SUBMITTED`, `PR_LEVEL_APPROVED`, `PR_APPROVED`, `PR_REJECTED`, `PR_RETURNED`, `PR_CANCELLED`
record the actor, the before/after status, and (for decisions) the level, round, the
approver's authority at that moment, and the comment. They are written in the same
transaction as the change itself.
