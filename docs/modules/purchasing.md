# Purchase orders

A **purchase order (PO)** is the buyer's legally binding offer to buy specific goods at
specific terms. When the supplier confirms it, it becomes a contract. Issuing a PO is
the moment the company **commits money**, so this is where controls concentrate.

## Traceability: every PO line has a pedigree

```
PR line (approved)  ──▶  RFx line  ──▶  awarded bid line  ──▶  PO line  ──▶  GR / invoice
```

The database enforces it, so a PO can't be invented out of thin air:

- `po_lines.prLineId` is an FK to the requisition line it fulfils.
- `po_lines.rfxBidLineId` is an FK, **unique**, to the winning bid line. One bid line
  becomes at most one PO line, ever.
- `po_lines.activePrLineId` is **unique**. It equals `prLineId` while the PO is live and
  becomes `NULL` on cancellation. Postgres allows many NULLs in a unique column, so a PR
  line is on at most one _live_ PO but can be re-sourced after a cancellation. This is a
  partial-unique-index effect without raw SQL.
- A CHECK constraint keeps `receivedQuantity` between 0 and the ordered quantity.

## Lifecycle

```
DRAFT ─issue─▶ ISSUED ─acknowledge─▶ ACKNOWLEDGED ─(goods receipt)─▶ PARTIALLY_RECEIVED ─▶ RECEIVED ─close─▶ CLOSED
  └─────────── cancel (only before any receipt; PR lines return to the backlog) ───────┘
                                                     PARTIALLY_RECEIVED ─short-close─▶ CLOSED
```

- **Order confirmation (acknowledge).** The supplier confirms and gives a delivery date.
  The PO keeps the _confirmed_ date, not just "issue date + quoted lead time". A
  difference between the two is the first warning sign of a late delivery (OTIF, Phase 3).
- **Short-close.** If the supplier will never ship the rest, the buyer closes a partially
  received PO, so the open quantity stops showing up as an open commitment.

## Controls when issuing

| Control               | Rule                                                                         | Why                                                             |
| --------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Segregation of duties | The issuer must not be the requester of any line (`PO_SOD_REQUESTER_ISSUER`) | Nobody both asks for goods and commits the money                |
| Budget tolerance      | PO total ≤ approved PR value + 10 % (`PO_EXCEEDS_APPROVED_BUDGET`)           | Approval was for an amount; a dearer order needs a new approval |
| State machine         | Only DRAFT can be issued                                                     | No double issuing                                               |
| Audit                 | `PO_ISSUED` with supplier, total and delivery date                           | Who committed what, when                                        |

"Approved PR value" means quantity × the requester's _estimated_ unit price. That's why
estimates matter: a careless estimate either blocks the PO or hides overspending.

## One PO per supplier

An RFx can be awarded line by line to different suppliers. `planPurchaseOrders` groups
the awarded lines by supplier and copies the bid's Incoterm and lead time onto each PO.
Running it again only orders lines that are still `AWARDED` (not `ORDERED`), so it is
safe to retry.
