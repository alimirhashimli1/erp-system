# Incoterms, landed cost & freight modes

Code: `packages/shared/src/logistics/` (pure functions, used by both the API and the UI).
Screen: **Incoterms & freight** in the web app.

## Incoterms® 2020 in one page

An Incoterm on a quote or PO answers two questions: **where does risk pass** from seller
to buyer, and **who pays for which leg**. It says nothing about ownership, payment terms
or customs value.

| Group | Rules              | Idea                                                               |
| ----- | ------------------ | ------------------------------------------------------------------ |
| E     | EXW                | Buyer collects at the seller's door and does everything            |
| F     | FCA, FAS, FOB      | Seller hands over to the buyer's carrier; buyer pays main carriage |
| C     | CPT, CIP, CFR, CIF | Seller **pays** main carriage, but **risk** passes at origin       |
| D     | DAP, DPU, DDP      | Seller delivers to the destination and carries the risk until then |

Traps worth remembering:

- **C-terms split cost and risk.** Under CFR the seller pays the ship, but if the ship sinks
  the loss is the buyer's. Buyers on C-terms (except CIF/CIP) insure the cargo themselves.
- **FOB/CFR/CIF/FAS are sea-only.** Containers are handed over at a terminal, not "on
  board", so FCA/CPT/CIP fit them better. Using FOB for a container is a classic mistake.
- **DDP** makes the seller pay import duties and VAT in the buyer's country. That needs a
  local tax registration, so many sellers can't really offer it.
- **CIP vs CIF insurance:** in 2020 CIP was raised to all-risks cover (ICC A); CIF stays at
  minimum cover (ICC C).

## Landed cost

**Landed cost = goods + origin charges + main carriage + insurance + import duty +
destination handling**, counting only the components the buyer actually pays.

`landedCost()` reads the Incoterm's `sellerPays` flags and zeroes out what is already
inside the supplier's price. Duty is charged on the **customs value**. In the EU that is
the CIF value at the border (goods + freight + insurance), so an FOB quote pays duty on
freight too. Inside the EU customs union duty is 0 (`isEuCountry`).

Why it matters, from the tests:

| Quote | Supplier price | + freight/ins. | + duty 4 % | + handling | **Landed**  |
| ----- | -------------- | -------------- | ---------- | ---------- | ----------- |
| FOB   | €10,000        | €1,600         | €464       | €300       | **€12,364** |
| CIF   | €11,200        | in price       | €448       | €300       | **€11,948** |

The quote that _looks_ cheaper (€10,000) lands **€416 dearer**. Sourcing (RFx) therefore
ranks bids on landed cost, not unit price.

## Freight modes: cost vs. time vs. CO₂e

| Mode | Relative cost | Speed            | CO₂e g/tkm (illustrative) |
| ---- | ------------- | ---------------- | ------------------------- |
| Sea  | lowest        | weeks            | ~10                       |
| Rail | low           | ~2 weeks Asia→EU | ~22                       |
| Road | medium        | days             | ~80                       |
| Air  | highest       | 1–3 days         | ~600                      |

- **Chargeable weight** = max(actual weight, volume × mode factor). Air uses 1:6000 cm³/kg
  (≈167 kg/m³), so light, bulky goods pay for the space they take.
- Emissions are computed on the **actual** weight moved (GLEC method). They feed the
  Phase 4 ESG work.
- The numbers are teaching averages. Real rates depend on lane, season and capacity.
