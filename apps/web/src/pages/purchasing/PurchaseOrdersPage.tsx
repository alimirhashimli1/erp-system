import { formatCents, PO_STATUSES, type PoStatus } from '@procurestack/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorText } from '../../api/http';
import { usePurchaseOrders } from '../../api/purchasing';
import { StatusBadge } from '../../components/StatusBadge';

export function PurchaseOrdersPage() {
  const [status, setStatus] = useState<PoStatus | ''>('');
  const list = usePurchaseOrders(status || undefined);

  return (
    <section className="card">
      <div className="page-head">
        <h1>Purchase orders</h1>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PoStatus | '');
          }}
        >
          <option value="">Any status</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase().replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      {list.isError && <p className="form-error">{errorText(list.error)}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Supplier</th>
              <th>Incoterm</th>
              <th>Expected delivery</th>
              <th className="num">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((po) => (
              <tr key={po.id}>
                <td>
                  <Link to={`/purchase-orders/${po.id}`}>{po.number}</Link>
                </td>
                <td>
                  {po.supplier.name} ({po.supplier.countryCode})
                </td>
                <td>
                  {po.incoterm} {po.namedPlace}
                </td>
                <td>{po.expectedDeliveryDate ?? '—'}</td>
                <td className="num">{formatCents(po.totalCents)}</td>
                <td>
                  <StatusBadge status={po.status} />
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No purchase orders yet — create them from an awarded sourcing event.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
