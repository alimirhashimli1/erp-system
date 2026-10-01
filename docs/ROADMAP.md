# ProcureStack Roadmap

Each phase ends with a review checkpoint. Each module is one vertical slice:
**migration → domain logic (pure, tested) → service → controller → tests → docs → screen**,
committed separately with a conventional-commit message.

Legend: ✅ done · ⏳ next · ☐ planned

---

## Phase 0 — Foundation ✅

| Item                        | Notes                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Turborepo + pnpm workspaces | `apps/api`, `apps/web`, `packages/shared`                                                  |
| Docker Compose              | postgres, redis, one-shot `migrate` (migrations + seed), api, web (nginx)                  |
| Prisma 7 + first migration  | `users`, `refresh_tokens`, `audit_logs` (DB-enforced append-only)                          |
| NestJS base                 | Zod env validation, Pino logging, Terminus `/health/live` + `/health/ready`, Swagger       |
| Auth + RBAC                 | JWT access (15 min) + rotating refresh cookie, global default-deny guards, 6 seeded roles  |
| Audit log                   | `AuditService` port; login/logout/token-reuse events recorded                              |
| React app                   | login, session restore, role-aware dashboard, React Query                                  |
| CI                          | audit, format, lint, typecheck, test, build, migration check on real Postgres, image build |
| Docs                        | this file, ADRs 0001–0003, `SECURITY.md`, per-package READMEs                              |

## Phase 1 — Core P2P spine ⏳

Goal: click through **PR → approval → RFQ → award → PO → GR → invoice → 3-way match → payment release**
as different users.

1. **Master data (thin)** — `Supplier`, `Item` (with unit of measure), `CostCenter`, `Currency`.
   Just enough for the P2P documents to reference real records, not free text.
2. **Purchase Requisition** — line items, estimated value, cost center, need-by date.
   State machine: `DRAFT → SUBMITTED → APPROVED | REJECTED | RETURNED → CANCELLED`.
   Approval routing via a **Delegation of Authority (DoA) matrix**: value thresholds pick the
   required approval level(s); requester can never approve their own PR (SoD).
3. **Sourcing / RFx** — RFI/RFP/RFQ event types; invite suppliers, collect quotes
   (BullMQ job simulates supplier responses), bid comparison on total cost, not unit price.
   State machine: `DRAFT → PUBLISHED → CLOSED → EVALUATED → AWARDED | CANCELLED`.
4. **Purchase Order** — created only from an awarded RFx line referencing an approved PR line
   (FK-enforced). Issuing a PO is audited. State machine:
   `DRAFT → ISSUED → ACKNOWLEDGED → PARTIALLY_RECEIVED → RECEIVED → CLOSED | CANCELLED`.
5. **Incoterms & freight** — Incoterms 2020 table (risk/cost transfer point, who pays freight,
   insurance, duties) + freight modes (sea/air/road/rail: cost vs lead-time vs CO₂).
   **Landed cost** = price + freight + insurance + duties + handling, computed per Incoterm.
6. **Goods Receipt & 3-way match** — GR against PO lines (partial deliveries, rejected qty);
   supplier invoice capture; match PO price × GR qty × invoice with configurable
   **price and quantity tolerances**. State machine:
   `PENDING → MATCHED | EXCEPTION → RESOLVED → APPROVED_FOR_PAYMENT → PAID`.

## Phase 2 — Inventory & analytics ☐

- Stock ledger (movements, not a mutable "quantity" column).
- **Safety stock** `SS = Z × σ_d × √LT` (plus the variant with lead-time variability),
  **ROP** `= d̄ × LT + SS`, service-level → Z lookup.
- **ABC analysis** by annual spend (Pareto 80/15/5), recalculated by a scheduled job.
- Spend dashboards: by supplier, category, cost center; PO cycle time.

## Phase 3 — Supplier management ☐

- **SRM scorecards**: OTIF, fill rate, quality (PPM / rejection rate), price variance, responsiveness.
- Weighted score → tiering **Strategic / Preferred / Transactional / Watchlist**, recomputed by BullMQ.
- **Kraljic matrix**: profit impact × supply risk → Strategic / Leverage / Bottleneck / Non-critical,
  each mapped to a sourcing strategy that drives defaults in RFx.

## Phase 4 — Compliance ☐

- **LkSG** (German Supply Chain Due Diligence Act): risk analysis per supplier/country/sector,
  preventive & remedial measures, complaints channel, annual report data.
- ESG risk scoring; due-diligence checklist with evidence uploads and an audit trail.
- Audit-log review screen (filter by actor, entity, action, date).

## Phase 5 — Hardening & scale lessons ☐

- Cursor pagination everywhere; Redis caching for read-heavy reference data.
- Redis-backed rate-limit storage (multi-instance), throttling review.
- Observability: metrics + traces (OpenTelemetry), log shipping.
- Teaching doc: what changes at enterprise scale — read replicas, partitioning the audit log,
  outbox pattern, event sourcing/CQRS for the document chain, multi-tenancy.

---

## Open decisions to confirm before Phase 1

1. **Approval routing:** multi-level, value-based DoA matrix (proposed) vs single approver.
2. **Currency:** single base currency (EUR) with FX rates stored on documents (proposed)
   vs full multi-currency ledger.
