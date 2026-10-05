import { Link } from 'react-router';
import { errorText } from '../../api/http';
import { usePurchaseOrders } from '../../api/purchasing';
import { useGoodsReceipts } from '../../api/receiving';
import { StatusBadge } from '../../components/StatusBadge';

const OPEN_FOR_RECEIPT = ['ISSUED', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'];

/** Warehouse inbox: orders awaiting delivery, and the latest receipts. */
export function ReceivingPage() {
  const orders = usePurchaseOrders();
  const receipts = useGoodsReceipts();
  const open = orders.data?.filter((po) => OPEN_FOR_RECEIPT.includes(po.status));

  return (
    <section className="card">
      <h1>Receiving</h1>
      <h2>Awaiting delivery</h2>
      {orders.isError && <p className="form-error">{errorText(orders.error)}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>PO</th>
              <th>Supplier</th>
              <th>Expected delivery</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {open?.map((po) => (
              <tr key={po.id}>
                <td>
                  <Link to={`/purchase-orders/${po.id}`}>{po.number}</Link>
                </td>
                <td>{po.supplier.name}</td>
                <td>{po.expectedDeliveryDate ?? '—'}</td>
                <td>
                  <StatusBadge status={po.status} />
                </td>
              </tr>
            ))}
            {open?.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No open orders to receive.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Recent receipts</h2>
      {receipts.isError && <p className="form-error">{errorText(receipts.error)}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>GR</th>
              <th>PO</th>
              <th>Supplier</th>
              <th>Delivery note</th>
              <th>Received by</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {receipts.data?.map((gr) => (
              <tr key={gr.id}>
                <td>{gr.number}</td>
                <td>
                  <Link to={`/purchase-orders/${gr.po.id}`}>{gr.po.number}</Link>
                </td>
                <td>{gr.supplier.name}</td>
                <td>{gr.deliveryNote}</td>
                <td>{gr.receivedBy.fullName}</td>
                <td>{new Date(gr.receivedAt).toLocaleString()}</td>
              </tr>
            ))}
            {receipts.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No receipts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
