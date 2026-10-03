# Master data — the nouns of procurement

Transactional documents (requisitions, POs, invoices) are the _verbs_. Master data is the
_nouns_ they refer to. If the nouns are wrong, every verb is wrong too: a duplicate
supplier splits spend analytics, and a wrong unit of measure turns 100 kg into 100 pieces.

## The three records in Phase 1

| Record          | Owner (who may change it)    | Why that owner                                                  |
| --------------- | ---------------------------- | --------------------------------------------------------------- |
| **Supplier**    | Procurement (BUYER), ADMIN   | Supplier onboarding and qualification is a sourcing decision    |
| **Item**        | Procurement (BUYER), ADMIN   | Buyers know the catalog: specs, categories, reference prices    |
| **Cost center** | Controlling (FINANCE), ADMIN | Cost centers come from the chart of accounts / budget structure |

_Data ownership_ is a core governance idea: every field has exactly one team that is
accountable for it. Everyone else may read it but not change it.

## Concepts worth knowing

- **Unit of measure (UoM).** Every quantity is in the item's base UoM. The UoM cannot be
  changed after creation (the update schema drops it), because that would silently
  reinterpret every historical quantity. Real ERPs add _alternative UoMs_ with conversion
  factors (1 BOX = 25 EA), which is a later refinement.
- **Standard price.** A reference price, used to pre-fill requisition estimates. It is not
  a contract price. Actual prices come from RFx quotes and POs.
- **Cost center vs. GL account.** A cost center answers _who_ spends (Maintenance). A
  general-ledger account answers _what_ the money is for (spare parts expense). Phase 1
  only needs the cost center.
- **Deactivate, never delete.** Old POs must still show the supplier they were issued to.
  Inactive records disappear from pick-lists but stay readable.
- **Golden record.** One supplier should exist once. A unique `code` stops exact duplicates;
  fuzzy matching (same VAT ID, similar name) is a Phase 3 SRM topic.

## Why master-data changes are audited

Classic payment fraud: someone changes a supplier's bank details or contact e-mail, and
the next legitimate invoice is paid to the attacker. ProcureStack stores no bank details
yet, but every supplier change already writes who/when/before/after to `audit_logs`. When
bank data arrives it will also need **four-eyes approval**.

## Money in the API

`standardPriceCents` is an integer number of EUR cents (`BIGINT` in Postgres), per
[ADR 0005](../adr/0005-money-quantities-and-numbering.md). The UI converts "0,35" to `35`
before sending it.
