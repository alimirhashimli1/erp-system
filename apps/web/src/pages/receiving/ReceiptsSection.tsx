import { type PurchaseOrder, toMilli } from '@procurestack/shared';
import { useState } from 'react';
import { errorText } from '../../api/http';
import { useGoodsReceipts, usePostGoodsReceipt } from '../../api/receiving';

const OPEN_FOR_RECEIPT = ['ISSUED', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'];

const openQuantity = (l: PurchaseOrder['lines'][number]) =>
  (toMilli(l.quantity) - toMilli(l.receivedQuantity)) / 1000;

/** Receipt history for a PO, plus the posting form for the warehouse. */
export function ReceiptsSection({ po, canReceive }: { po: PurchaseOrder; canReceive: boolean }) {
  const receipts = useGoodsReceipts(po.id);
  const showForm = canReceive && OPEN_FOR_RECEIPT.includes(po.status);

  return (
    <>
      <h2>Goods receipts</h2>
      {receipts.isError && <p className="form-error">{errorText(receipts.error)}</p>}
      {receipts.data?.length === 0 && <p className="muted">Nothing received yet.</p>}
      {receipts.data?.map((gr) => (
        <div key={gr.id} className="table-wrap">
          <p className="small">
            <strong>{gr.number}</strong> · delivery note {gr.deliveryNote} ·{' '}
            {gr.receivedBy.fullName} · {new Date(gr.receivedAt).toLocaleString()}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th className="num">Received</th>
                <th className="num">Rejected</th>
                <th className="num">Accepted</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {gr.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td>{l.sku}</td>
                  <td className="num">{l.receivedQuantity}</td>
                  <td className="num">{l.rejectedQuantity}</td>
                  <td className="num">
                    {l.acceptedQuantity} {l.uom}
                  </td>
                  <td>{l.rejectionReason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {showForm && <ReceiptForm po={po} />}
    </>
  );
}

interface LineState {
  received: string;
  rejected: string;
  reason: string;
}
const BLANK: LineState = { received: '0', rejected: '0', reason: '' };

function ReceiptForm({ po }: { po: PurchaseOrder }) {
  const post = usePostGoodsReceipt();
  const openLines = po.lines.filter((l) => openQuantity(l) > 0);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      openLines.map((l) => [
        l.id,
        { received: String(openQuantity(l)), rejected: '0', reason: '' },
      ]),
    ),
  );
  const setLine = (id: string, patch: Partial<LineState>) => {
    setLines((prev) => ({ ...prev, [id]: { ...(prev[id] ?? BLANK), ...patch } }));
  };

  const submit = () => {
    post.mutate(
      {
        poId: po.id,
        deliveryNote: deliveryNote.trim(),
        lines: openLines
          .map((l) => ({ l, s: lines[l.id] ?? BLANK }))
          .filter(({ s }) => Number(s.received) > 0)
          .map(({ l, s }) => ({
            poLineId: l.id,
            receivedQuantity: Number(s.received),
            rejectedQuantity: Number(s.rejected || 0),
            ...(s.reason.trim() ? { rejectionReason: s.reason.trim() } : {}),
          })),
      },
      {
        onSuccess: () => {
          setDeliveryNote('');
        },
      },
    );
  };

  return (
    <div className="actions-stack">
      <h3>Post goods receipt</h3>
      <label>
        Delivery note
        <input
          value={deliveryNote}
          onChange={(e) => {
            setDeliveryNote(e.target.value);
          }}
        />
      </label>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th className="num">Open</th>
              <th>Received</th>
              <th>Rejected</th>
              <th>Rejection reason</th>
            </tr>
          </thead>
          <tbody>
            {openLines.map((l) => {
              const s = lines[l.id] ?? BLANK;
              return (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td>{l.sku}</td>
                  <td className="num">
                    {openQuantity(l)} {l.uom}
                  </td>
                  <td>
                    <input
                      aria-label={`Received line ${String(l.lineNo)}`}
                      type="number"
                      min="0"
                      step="0.001"
                      value={s.received}
                      onChange={(e) => {
                        setLine(l.id, { received: e.target.value });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Rejected line ${String(l.lineNo)}`}
                      type="number"
                      min="0"
                      step="0.001"
                      value={s.rejected}
                      onChange={(e) => {
                        setLine(l.id, { rejected: e.target.value });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Rejection reason line ${String(l.lineNo)}`}
                      value={s.reason}
                      onChange={(e) => {
                        setLine(l.id, { reason: e.target.value });
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button disabled={post.isPending || !deliveryNote.trim()} onClick={submit}>
          Post goods receipt
        </button>
        <span className="muted small">Receipts are final — corrections need a new document.</span>
      </div>
      {post.error && (
        <p className="form-error" role="alert">
          {errorText(post.error)}
        </p>
      )}
    </div>
  );
}
