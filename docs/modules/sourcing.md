# Sourcing: RFI, RFP, RFQ and the award decision

An approved requisition says _what_ the business needs. Sourcing decides _from whom_ and
_on what terms_. A competitive event is the main tool for getting a fair price and an
auditable decision.

| Event   | Question to the market                    | Priced? | Awardable?                  |
| ------- | ----------------------------------------- | ------- | --------------------------- |
| **RFI** | "Who can do this, and how?" (market scan) | no      | no — follow with an RFP/RFQ |
| **RFP** | "Propose a solution and a price"          | yes     | yes                         |
| **RFQ** | "Price this exact spec"                   | yes     | yes                         |

## Lifecycle

```
DRAFT ──publish──▶ PUBLISHED ──close (deadline job or buyer)──▶ CLOSED ──▶ EVALUATED ──award──▶ AWARDED
  └──────────────────────────── cancel (releases PR lines) ─────────────────────────┘
```

## Rules that make it a fair process

- **Sourcing backlog.** Only lines of _approved_ PRs can be sourced. Creating an event
  claims them with a conditional `UPDATE … WHERE sourcingStatus = 'OPEN'` (compare-and-set),
  so two buyers can never source the same line twice. Cancelling releases the lines.
- **Competition.** An RFQ/RFP needs at least two invited suppliers before it can be
  published. Single sourcing needs its own justification process (not modelled).
- **Deadline.** Bids after the response deadline are rejected (`RFX_LATE_BID`). A delayed
  BullMQ job closes the event exactly at the deadline (ADR 0008).
- **Sealed bids.** While the event is open, the API returns no bid contents, not even to
  the buyer. This stops anyone leaking one supplier's price to a favoured competitor. The
  audit log records _that_ a bid arrived, never its prices.
- **Award on landed cost.** Bids are ranked per line by landed cost, using the shared
  `landedCost()` (see [Incoterms & landed cost](incoterms-landed-cost.md)). Bid-level
  freight, insurance, duty and handling are allocated to lines by goods value. EU
  suppliers pay no duty (customs union), whatever was quoted.
- **Documented deviations.** Awarding a line to anything other than rank 1 is allowed
  (for dual sourcing, quality history, capacity) but needs a written justification. The
  justification and the deviating ranks are stored and audited.
- **Expired bids** (past `validUntil`) cannot be awarded.

## Worked example (from the tests)

10,000 M8 bolts, two bids:

| Supplier | Incoterm | Unit price | Goods  | Freight + ins. + duty + handling | **Landed**    | Rank |
| -------- | -------- | ---------- | ------ | -------------------------------- | ------------- | ---- |
| DE       | DAP      | €0.12      | €1,200 | €0 (delivered, EU)               | **€1,200.00** | 1    |
| CN       | FOB      | €0.09      | €900   | €150 + €5 + €47.48 + €250        | **€1,352.48** | 2    |

The CN unit price is 25 % cheaper, yet the landed cost is 13 % higher.

## Simplifications (deliberate)

- No supplier portal: the buyer keys in bids received by e-mail. In demo mode,
  `RFX_SIMULATE_SUPPLIERS` lets fake suppliers answer within seconds: EU suppliers quote
  DAP, Asian suppliers FOB, US suppliers FCA.
- A split award (lines to different suppliers) does not recompute freight economics.
  Real tools re-run the scenario; here the allocation is proportional.
