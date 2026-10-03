import {
  compareFreightModes,
  FREIGHT_PROFILES,
  formatCents,
  type Incoterm,
  INCOTERM_RULES,
  INCOTERMS,
  landedCost,
  parseEuroToCents,
} from '@procurestack/shared';
import { useState } from 'react';

const yes = (v: boolean) => (v ? '✔ seller' : 'buyer');

export function LogisticsPage() {
  return (
    <>
      <IncotermsTable />
      <LandedCostCalculator />
      <FreightComparison />
    </>
  );
}

function IncotermsTable() {
  return (
    <section className="card">
      <h1>Incoterms® 2020</h1>
      <p className="muted">
        Where risk passes and who pays which leg. Costs not listed as “seller” are the buyer’s.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Mode</th>
              <th>Risk passes when…</th>
              <th>Main carriage</th>
              <th>Insurance</th>
              <th>Import duties</th>
            </tr>
          </thead>
          <tbody>
            {INCOTERMS.map((code) => {
              const r = INCOTERM_RULES[code];
              return (
                <tr key={code}>
                  <td title={r.note}>
                    <strong>{code}</strong> <span className="muted small">{r.name}</span>
                  </td>
                  <td>{r.mode === 'SEA' ? 'Sea only' : 'Any'}</td>
                  <td>{r.riskTransfer}</td>
                  <td>{yes(r.sellerPays.mainCarriage)}</td>
                  <td>{yes(r.sellerPays.insurance)}</td>
                  <td>{yes(r.sellerPays.importClearanceAndDuties)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Hover a rule for its practical note.</p>
    </section>
  );
}

/** Money text field → cents (empty or invalid counts as 0 for the live preview). */
const cents = (v: string) => parseEuroToCents(v) ?? 0;

function MoneyField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {props.label}
      <input
        inputMode="decimal"
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
      />
    </label>
  );
}

function LandedCostCalculator() {
  const [incoterm, setIncoterm] = useState<Incoterm>('FOB');
  const [f, setF] = useState({
    goods: '10000',
    origin: '200',
    freight: '1500',
    insurance: '100',
    dutyPct: '4',
    handling: '300',
  });
  const set = (k: keyof typeof f) => (v: string) => {
    setF({ ...f, [k]: v });
  };
  const dutyRateBps = Math.round(Number(f.dutyPct.replace(',', '.')) * 100);
  const r = landedCost({
    incoterm,
    goodsCents: cents(f.goods),
    originChargesCents: cents(f.origin),
    freightCents: cents(f.freight),
    insuranceCents: cents(f.insurance),
    dutyRateBps: Number.isFinite(dutyRateBps) ? Math.min(Math.max(dutyRateBps, 0), 100_000) : 0,
    destinationHandlingCents: cents(f.handling),
  });
  const rows: [string, number, boolean][] = [
    ['Goods (supplier price)', r.goodsCents, false],
    ['Origin charges', r.originChargesCents, r.includedInPrice.includes('originCharges')],
    ['Main carriage', r.freightCents, r.includedInPrice.includes('freight')],
    ['Insurance', r.insuranceCents, r.includedInPrice.includes('insurance')],
    [
      `Import duty (on customs value ${formatCents(r.customsValueCents)})`,
      r.dutyCents,
      r.includedInPrice.includes('duty'),
    ],
    ['Destination handling', r.destinationHandlingCents, r.includedInPrice.includes('unloading')],
  ];

  return (
    <section className="card">
      <h2>Landed cost calculator</h2>
      <div className="form-grid">
        <label>
          Incoterm
          <select
            value={incoterm}
            onChange={(e) => {
              setIncoterm(e.target.value as Incoterm);
            }}
          >
            {INCOTERMS.map((c) => (
              <option key={c} value={c}>
                {c} — {INCOTERM_RULES[c].name}
              </option>
            ))}
          </select>
        </label>
        <MoneyField label="Goods value (€)" value={f.goods} onChange={set('goods')} />
        <MoneyField label="Origin charges (€)" value={f.origin} onChange={set('origin')} />
        <MoneyField label="Freight quote (€)" value={f.freight} onChange={set('freight')} />
        <MoneyField label="Insurance (€)" value={f.insurance} onChange={set('insurance')} />
        <MoneyField label="Duty rate (%)" value={f.dutyPct} onChange={set('dutyPct')} />
        <MoneyField
          label="Destination handling (€)"
          value={f.handling}
          onChange={set('handling')}
        />
      </div>
      <table className="table breakdown">
        <tbody>
          {rows.map(([label, value, included]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">
                {included ? (
                  <span className="muted small">in supplier price</span>
                ) : (
                  formatCents(value)
                )}
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>Landed cost</td>
            <td className="num">{formatCents(r.totalCents)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function FreightComparison() {
  const [s, setS] = useState({ weightKg: '2000', volumeM3: '6', distanceKm: '9000' });
  const num = (v: string) => Number(v.replace(',', '.'));
  const valid = num(s.weightKg) > 0 && num(s.distanceKm) > 0 && num(s.volumeM3) >= 0;
  const estimates = valid
    ? compareFreightModes({
        weightKg: num(s.weightKg),
        volumeM3: num(s.volumeM3),
        distanceKm: num(s.distanceKm),
      })
    : [];

  const field = (key: keyof typeof s, label: string) => (
    <label>
      {label}
      <input
        inputMode="decimal"
        value={s[key]}
        onChange={(e) => {
          setS({ ...s, [key]: e.target.value });
        }}
      />
    </label>
  );

  return (
    <section className="card">
      <h2>Freight mode comparison</h2>
      <p className="muted small">
        Illustrative averages for learning — cost vs. lead time vs. CO₂e. Chargeable weight =
        max(actual, volume × mode factor).
      </p>
      <div className="form-grid">
        {field('weightKg', 'Weight (kg)')}
        {field('volumeM3', 'Volume (m³)')}
        {field('distanceKm', 'Distance (km)')}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Mode</th>
              <th className="num">Chargeable kg</th>
              <th className="num">Cost</th>
              <th className="num">Transit (days)</th>
              <th className="num">CO₂e (kg)</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((e) => (
              <tr key={e.mode}>
                <td>{FREIGHT_PROFILES[e.mode].label}</td>
                <td className="num">{e.chargeableKg.toLocaleString()}</td>
                <td className="num">{formatCents(e.costCents)}</td>
                <td className="num">{e.transitDays}</td>
                <td className="num">{e.co2Kg.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
