import { formatCents, INCOTERM_RULES, type PurchaseOrder } from '@procurestack/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorText } from '../../api/http';
import { usePoAction, usePurchaseOrder } from '../../api/purchasing';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/StatusBadge';
import { ReceiptsSection } from '../receiving/ReceiptsSection';

export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const po = usePurchaseOrder(id);
  const { state } = useAuth();
  const roles = state.status === 'authenticated' ? state.user.roles : [];
  const isBuyer = roles.includes('BUYER');

  if (po.isPending) return <p className="muted">Loading…</p>;
  if (po.isError) return <p className="form-error">{errorText(po.error)}</p>;
  const p = po.data;

  return (
    <section className="card">
      <div className="page-head">
        <h1>
          {p.number} · {p.supplier.name}
        </h1>
        <StatusBadge status={p.status} />
      </div>
      <dl className="facts">
        <div>
          <dt>Supplier</dt>
          <dd>
            {p.supplier.code} ({p.supplier.countryCode})
          </dd>
        </div>
        <div>
          <dt>Incoterm</dt>
          <dd title={INCOTERM_RULES[p.incoterm].riskTransfer}>
            {p.incoterm} {p.namedPlace}
          </dd>
        </div>
        <div>
          <dt>Expected delivery</dt>
          <dd>{p.expectedDeliveryDate ?? `${String(p.leadTimeDays)} days after issue`}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatCents(p.totalCents)}</dd>
        </div>
        <div>
          <dt>Sourced in</dt>
          <dd>
            <Link to={`/sourcing/rfx/${p.rfx.id}`}>{p.rfx.number}</Link>
          </dd>
        </div>
        <div>
          <dt>Buyer</dt>
          <dd>{p.buyer.fullName}</dd>
        </div>
      </dl>
      {p.cancelReason && (
        <p>
          <strong>Cancelled:</strong> {p.cancelReason}
        </p>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>PR</th>
              <th className="num">Ordered</th>
              <th className="num">Received</th>
              <th className="num">Invoiced</th>
              <th className="num">Unit price</th>
              <th className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.lineNo}</td>
                <td>
                  {l.sku} — {l.description}
                </td>
                <td>{l.prNumber}</td>
                <td className="num">
                  {l.quantity} {l.uom}
                </td>
                <td className="num">{l.receivedQuantity}</td>
                <td className="num">{l.invoicedQuantity}</td>
                <td className="num">{formatCents(l.unitPriceCents)}</td>
                <td className="num">{formatCents(l.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isBuyer && <BuyerActions po={p} />}

      {p.status !== 'DRAFT' && <ReceiptsSection po={p} canReceive={roles.includes('WAREHOUSE')} />}
    </section>
  );
}

function BuyerActions({ po }: { po: PurchaseOrder }) {
  const action = usePoAction(po.id);
  const [confirmedDate, setConfirmedDate] = useState('');
  const [reason, setReason] = useState('');
  const cancellable =
    ['DRAFT', 'ISSUED', 'ACKNOWLEDGED'].includes(po.status) &&
    po.lines.every((l) => l.receivedQuantity === 0);

  return (
    <div className="actions-stack">
      {po.status === 'DRAFT' && (
        <div className="form-actions">
          <button
            disabled={action.isPending}
            onClick={() => {
              action.mutate({ action: 'issue' });
            }}
          >
            Issue to supplier
          </button>
          <span className="muted small">Issuing commits the spend and is audited.</span>
        </div>
      )}
      {po.status === 'ISSUED' && (
        <div className="form-actions">
          <label className="inline">
            Confirmed delivery
            <input
              type="date"
              value={confirmedDate}
              onChange={(e) => {
                setConfirmedDate(e.target.value);
              }}
            />
          </label>
          <button
            disabled={action.isPending || !confirmedDate}
            onClick={() => {
              action.mutate({
                action: 'acknowledge',
                body: { confirmedDeliveryDate: confirmedDate },
              });
            }}
          >
            Record order confirmation
          </button>
        </div>
      )}
      {(po.status === 'PARTIALLY_RECEIVED' || po.status === 'RECEIVED') && (
        <div className="form-actions">
          <button
            className="secondary"
            disabled={action.isPending}
            onClick={() => {
              action.mutate({ action: 'close' });
            }}
          >
            {po.status === 'RECEIVED' ? 'Close PO' : 'Short-close (rest will not be delivered)'}
          </button>
        </div>
      )}
      {cancellable && (
        <div className="form-actions">
          <input
            aria-label="Cancellation reason"
            placeholder="Reason for cancelling"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
          <button
            className="danger"
            disabled={action.isPending || reason.trim().length < 5}
            onClick={() => {
              action.mutate({ action: 'cancel', body: { reason: reason.trim() } });
            }}
          >
            Cancel PO
          </button>
        </div>
      )}
      {action.error && (
        <p className="form-error" role="alert">
          {errorText(action.error)}
        </p>
      )}
    </div>
  );
}
