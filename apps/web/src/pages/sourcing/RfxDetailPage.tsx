import {
  formatCents,
  type Incoterm,
  INCOTERMS,
  parseEuroToCents,
  type Rfx,
} from '@procurestack/shared';
import { useState } from 'react';
import { useParams } from 'react-router';
import { errorText } from '../../api/http';
import { useAward, useRfx, useRfxAction, useSubmitBid } from '../../api/sourcing';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/StatusBadge';

export function RfxDetailPage() {
  const { id = '' } = useParams();
  const rfx = useRfx(id);
  const { state } = useAuth();
  const isBuyer = state.status === 'authenticated' && state.user.roles.includes('BUYER');

  if (rfx.isPending) return <p className="muted">Loading…</p>;
  if (rfx.isError) return <p className="form-error">{errorText(rfx.error)}</p>;
  const r = rfx.data;

  return (
    <>
      <section className="card">
        <div className="page-head">
          <h1>
            {r.number} · {r.title}
          </h1>
          <StatusBadge status={r.status} />
        </div>
        <dl className="facts">
          <div>
            <dt>Type</dt>
            <dd>{r.type}</dd>
          </div>
          <div>
            <dt>Buyer</dt>
            <dd>{r.buyer.fullName}</dd>
          </div>
          <div>
            <dt>Response deadline</dt>
            <dd>{new Date(r.responseDeadline).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Responses</dt>
            <dd>
              {r.respondedCount}/{r.invitedCount}
            </dd>
          </div>
        </dl>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th className="num">Qty</th>
                <th>From</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td>
                    {l.sku} — {l.description}
                  </td>
                  <td className="num">
                    {l.quantity} {l.uom}
                  </td>
                  <td>{l.prNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="section-title">Invited suppliers</h2>
        <ul className="history">
          {r.invitations.map((i) => (
            <li key={i.supplier.id}>
              {i.supplier.code} {i.supplier.name} ({i.supplier.countryCode}) —{' '}
              <StatusBadge status={i.status} />
            </li>
          ))}
        </ul>
        {r.sealed && r.status === 'PUBLISHED' && (
          <p className="muted small">
            Bids are sealed until the event closes — prices stay hidden, even from the buyer.
          </p>
        )}
        {r.awardJustification && (
          <p>
            <strong>Award justification:</strong> {r.awardJustification}
          </p>
        )}
        {isBuyer && <Actions rfx={r} />}
      </section>

      {isBuyer && r.status === 'PUBLISHED' && r.type !== 'RFI' && <BidForm rfx={r} />}
      {r.evaluation && <Evaluation rfx={r} canAward={isBuyer && r.status === 'EVALUATED'} />}
    </>
  );
}

function Actions({ rfx }: { rfx: Rfx }) {
  const action = useRfxAction(rfx.id);
  const buttons: { label: string; action: 'publish' | 'close' | 'evaluate' | 'cancel' }[] = [];
  if (rfx.status === 'DRAFT') buttons.push({ label: 'Publish to suppliers', action: 'publish' });
  if (rfx.status === 'PUBLISHED') buttons.push({ label: 'Close now', action: 'close' });
  if (rfx.status === 'CLOSED') buttons.push({ label: 'Mark evaluated', action: 'evaluate' });
  if (!['AWARDED', 'CANCELLED'].includes(rfx.status))
    buttons.push({ label: 'Cancel event', action: 'cancel' });
  return (
    <div className="form-actions">
      {buttons.map((b) => (
        <button
          key={b.action}
          className={b.action === 'cancel' ? 'secondary' : undefined}
          disabled={action.isPending}
          onClick={() => {
            action.mutate(b.action);
          }}
        >
          {b.label}
        </button>
      ))}
      {action.error && (
        <p className="form-error" role="alert">
          {errorText(action.error)}
        </p>
      )}
    </div>
  );
}

interface BidFormState {
  supplierId: string;
  incoterm: Incoterm;
  leadTimeDays: string;
  validUntil: string;
  freight: string;
  insurance: string;
  dutyPct: string;
  handling: string;
}

/** Buyer keys in a bid received from a supplier (no supplier portal in Phase 1). */
function BidForm({ rfx }: { rfx: Rfx }) {
  const submit = useSubmitBid(rfx.id);
  const invitable = rfx.invitations.filter((i) => i.status !== 'DECLINED');
  // Lazy initializer: the default validity date is computed once, not on every render.
  const [f, setF] = useState<BidFormState>(() => ({
    supplierId: invitable[0]?.supplier.id ?? '',
    incoterm: 'DAP',
    leadTimeDays: '14',
    validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    freight: '0',
    insurance: '0',
    dutyPct: '0',
    handling: '0',
  }));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value });
  };

  const send = () => {
    submit.mutate({
      supplierId: f.supplierId,
      incoterm: f.incoterm,
      leadTimeDays: Number(f.leadTimeDays),
      validUntil: f.validUntil,
      freightCents: parseEuroToCents(f.freight) ?? 0,
      insuranceCents: parseEuroToCents(f.insurance) ?? 0,
      dutyRateBps: Math.round(Number(f.dutyPct.replace(',', '.')) * 100),
      destinationHandlingCents: parseEuroToCents(f.handling) ?? 0,
      lines: rfx.lines.flatMap((l) => {
        const cents = parseEuroToCents(prices[l.id] ?? '');
        return cents === undefined ? [] : [{ rfxLineId: l.id, unitPriceCents: cents }];
      }),
    });
  };

  return (
    <section className="card">
      <h2>Record a supplier bid</h2>
      <div className="form-grid">
        <label>
          Supplier
          <select value={f.supplierId} onChange={set('supplierId')}>
            {invitable.map((i) => (
              <option key={i.supplier.id} value={i.supplier.id}>
                {i.supplier.code} {i.supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Incoterm
          <select value={f.incoterm} onChange={set('incoterm')}>
            {INCOTERMS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Lead time (days){' '}
          <input inputMode="numeric" value={f.leadTimeDays} onChange={set('leadTimeDays')} />
        </label>
        <label>
          Valid until <input type="date" value={f.validUntil} onChange={set('validUntil')} />
        </label>
        <label>
          Freight (€) <input inputMode="decimal" value={f.freight} onChange={set('freight')} />
        </label>
        <label>
          Insurance (€){' '}
          <input inputMode="decimal" value={f.insurance} onChange={set('insurance')} />
        </label>
        <label>
          Import duty (%) <input inputMode="decimal" value={f.dutyPct} onChange={set('dutyPct')} />
        </label>
        <label>
          Destination handling (€){' '}
          <input inputMode="decimal" value={f.handling} onChange={set('handling')} />
        </label>
        {rfx.lines.map((l) => (
          <label key={l.id}>
            Unit price {l.sku} (€)
            <input
              inputMode="decimal"
              value={prices[l.id] ?? ''}
              onChange={(e) => {
                setPrices({ ...prices, [l.id]: e.target.value });
              }}
            />
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button disabled={submit.isPending} onClick={send}>
          Record bid
        </button>
        {submit.isSuccess && <span className="muted">Bid recorded (sealed).</span>}
        {submit.error && (
          <p className="form-error" role="alert">
            {errorText(submit.error)}
          </p>
        )}
      </div>
    </section>
  );
}

function Evaluation({ rfx, canAward }: { rfx: Rfx; canAward: boolean }) {
  const award = useAward(rfx.id);
  const evaluation = rfx.evaluation;
  // Default choice per line: the best (rank 1) offer.
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (evaluation?.lines ?? []).flatMap((l) =>
        l.offers[0] ? [[l.rfxLineId, l.offers[0].bidLineId]] : [],
      ),
    ),
  );
  const [justification, setJustification] = useState('');
  if (!evaluation) return null;

  const deviates = evaluation.lines.some((l) => {
    const chosen = l.offers.find((o) => o.bidLineId === choice[l.rfxLineId]);
    return chosen !== undefined && chosen.rank !== 1;
  });

  return (
    <section className="card">
      <h2>Bid comparison — ranked by landed cost</h2>
      {evaluation.lines.map((line) => {
        const rfxLine = rfx.lines.find((l) => l.id === line.rfxLineId);
        return (
          <div key={line.rfxLineId} className="table-wrap">
            <h3 className="small">
              Line {rfxLine?.lineNo} · {rfxLine?.sku} · {rfxLine?.quantity} {rfxLine?.uom}
            </h3>
            <table className="table">
              <thead>
                <tr>
                  {canAward && <th>Award</th>}
                  <th>#</th>
                  <th>Supplier</th>
                  <th>Incoterm</th>
                  <th className="num">Unit price</th>
                  <th className="num">Goods</th>
                  <th className="num">+ Freight/duty/…</th>
                  <th className="num">Landed</th>
                  <th className="num">Landed / unit</th>
                  <th className="num">Lead time</th>
                </tr>
              </thead>
              <tbody>
                {line.offers.map((o) => (
                  <tr
                    key={o.bidLineId}
                    className={
                      rfxLine?.awardedBidLineId === o.bidLineId
                        ? 'winner'
                        : o.expired
                          ? 'inactive'
                          : undefined
                    }
                  >
                    {canAward && (
                      <td>
                        <input
                          type="radio"
                          name={`award-${line.rfxLineId}`}
                          aria-label={`Award to ${o.supplier.name}`}
                          checked={choice[line.rfxLineId] === o.bidLineId}
                          disabled={o.expired}
                          onChange={() => {
                            setChoice({ ...choice, [line.rfxLineId]: o.bidLineId });
                          }}
                        />
                      </td>
                    )}
                    <td>{o.rank}</td>
                    <td>
                      {o.supplier.name} ({o.supplier.countryCode})
                    </td>
                    <td>{o.incoterm}</td>
                    <td className="num">{formatCents(o.unitPriceCents)}</td>
                    <td className="num">{formatCents(o.goodsCents)}</td>
                    <td className="num">{formatCents(o.extrasCents)}</td>
                    <td className="num">
                      <strong>{formatCents(o.landedCents)}</strong>
                    </td>
                    <td className="num">{formatCents(o.landedPerUnitCents)}</td>
                    <td className="num">{o.leadTimeDays} d</td>
                  </tr>
                ))}
                {line.offers.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted">
                      No offers for this line.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      {canAward && (
        <>
          {deviates && (
            <>
              <label htmlFor="justification">
                Justification (required: not every line goes to the lowest landed cost)
              </label>
              <textarea
                id="justification"
                rows={2}
                value={justification}
                onChange={(e) => {
                  setJustification(e.target.value);
                }}
              />
            </>
          )}
          <div className="form-actions">
            <button
              disabled={award.isPending || Object.keys(choice).length === 0}
              onClick={() => {
                award.mutate({
                  awards: Object.entries(choice).map(([rfxLineId, bidLineId]) => ({
                    rfxLineId,
                    bidLineId,
                  })),
                  ...(deviates ? { justification } : {}),
                });
              }}
            >
              Award
            </button>
            {award.error && (
              <p className="form-error" role="alert">
                {errorText(award.error)}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
