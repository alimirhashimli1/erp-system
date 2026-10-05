# Goods receipt (GR)

A **goods receipt** is the warehouse's record that a delivery arrived: which PO, which
lines, how much, and what was rejected. It is the second document of the **3-way match**
(PO ↔ GR ↔ invoice). Finance pays only for what was ordered _and_ received.

## What gets recorded

| Field             | Meaning                                                           |
| ----------------- | ----------------------------------------------------------------- |
| Delivery note     | The supplier's paper (or EDI DESADV) number. It's the audit trail |
| Received quantity | What was counted at the dock                                      |
| Rejected quantity | Damaged, wrong, or failed inspection. Goes back to the supplier   |
| Accepted quantity | received − rejected; only this counts towards the PO              |
| Rejection reason  | Mandatory when something is rejected                              |

Quantities are compared in thousandths (`toMilli`) so `2.3 − 0.1` is exactly `2.2`.

## Rules

- **Only open POs** (ISSUED, ACKNOWLEDGED, PARTIALLY_RECEIVED) can be received.
- **No silent over-delivery.** Accepted quantity can't exceed what is still open. The
  excess must be rejected (sent back) or the buyer orders more. Real ERPs allow a
  configurable over-delivery tolerance; ours is 0%.
- **SoD: the buyer can't receive their own order.** Otherwise one person could order
  fictitious goods, "receive" them, and trigger payment.
- **PO status follows receipts:** partial → `PARTIALLY_RECEIVED`, complete → `RECEIVED`.
  The PO version is bumped on every receipt, so two concurrent receipts can't both pass
  the over-delivery check (the second gets 409 and retries).
- **Receipts are immutable.** A DB trigger blocks UPDATE/DELETE on `goods_receipts` and
  `gr_lines`. In real systems a mistake is fixed with a _reversal_ document (SAP movement
  type 102), never by editing history. Reversals are out of scope for Phase 1.

## Not modelled (yet)

Stock/inventory postings, quality inspection lots, returns-to-vendor documents, and
receipt reversals.
