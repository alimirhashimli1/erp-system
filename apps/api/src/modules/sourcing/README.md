# sourcing module (RFx)

Turns approved requisition lines into competitive sourcing events (RFI/RFP/RFQ) and awards
them on **total landed cost**. Background: [docs/modules/sourcing.md](../../../../../docs/modules/sourcing.md).

| Endpoint                                          | Roles                 |
| ------------------------------------------------- | --------------------- |
| `GET /api/sourcing/open-pr-lines`                 | BUYER                 |
| `GET /api/rfx`, `GET /api/rfx/:id`                | BUYER, FINANCE, ADMIN |
| `POST /api/rfx` (draft, claims PR lines)          | BUYER                 |
| `POST /api/rfx/:id/publish·close·evaluate·cancel` | BUYER                 |
| `POST /api/rfx/:id/bids` (record a bid)           | BUYER                 |
| `POST /api/rfx/:id/award`                         | BUYER                 |

## Layout

```
domain/rfx.ts                  state machine, competition, sealed bids, landed-cost ranking, award rules
domain/supplier-simulator.ts   DEMO: deterministic fake bids (RFX_SIMULATE_SUPPLIERS)
application/sourcing.service.ts  use cases + audit; emits `rfx.published` after commit
jobs/sourcing.jobs.ts          BullMQ queue `sourcing`: close-rfx (at deadline), simulate-bid (ADR 0008)
infrastructure/                Prisma adapter (PR-line claim = compare-and-set)
```

Audit: `RFX_CREATED`, `RFX_PUBLISHED`, `RFX_BID_RECORDED` (no prices — sealed),
`RFX_CLOSED` (actor null = deadline job), `RFX_EVALUATED`, `RFX_AWARDED` (with deviations
and justification), `RFX_CANCELLED`.
Tests: `domain/rfx.spec.ts`, `jobs/sourcing.jobs.spec.ts`, `test/integration/sourcing.int-spec.ts`.
