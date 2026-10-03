import { formatCents, lineTotalCents, RFX_TYPES, type RfxType } from '@procurestack/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorText } from '../../api/http';
import { useCatalogList } from '../../api/master-data';
import { useCreateRfx, useOpenPrLines, useRfxList } from '../../api/sourcing';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/StatusBadge';

export function SourcingPage() {
  const { state } = useAuth();
  const isBuyer = state.status === 'authenticated' && state.user.roles.includes('BUYER');
  return (
    <>
      {isBuyer && <Backlog />}
      <RfxList />
    </>
  );
}

/** Local datetime-input value for "now + days" (the input has no time zone). */
const inDays = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function Backlog() {
  const lines = useOpenPrLines(true);
  const suppliers = useCatalogList('suppliers');
  const create = useCreateRfx();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [type, setType] = useState<RfxType>('RFQ');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(inDays(7));

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const submit = async () => {
    const rfx = await create.mutateAsync({
      type,
      title,
      responseDeadline: new Date(deadline).toISOString(),
      prLineIds: selected,
      supplierIds: invited,
    });
    void navigate(`/sourcing/rfx/${rfx.id}`);
  };

  return (
    <section className="card">
      <h1>Sourcing backlog</h1>
      <p className="muted small">Lines of approved requisitions that nobody is sourcing yet.</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>PR</th>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Est. value</th>
              <th>Need by</th>
            </tr>
          </thead>
          <tbody>
            {lines.data?.map((l) => (
              <tr key={l.prLineId}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${l.prNumber} line ${String(l.lineNo)}`}
                    checked={selected.includes(l.prLineId)}
                    onChange={() => {
                      toggle(selected, setSelected, l.prLineId);
                    }}
                  />
                </td>
                <td>
                  <Link to={`/requisitions/${l.requisitionId}`}>{l.prNumber}</Link> / {l.lineNo}
                </td>
                <td>
                  {l.sku} — {l.description}
                </td>
                <td className="num">
                  {l.quantity} {l.uom}
                </td>
                <td className="num">
                  {formatCents(lineTotalCents(l.quantity, l.estimatedUnitPriceCents))}
                </td>
                <td>{l.needByDate}</td>
              </tr>
            ))}
            {lines.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Backlog is empty — approved requisitions show up here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected.length > 0 && (
        <div className="create-rfx">
          <h2 className="section-title">New sourcing event ({selected.length} lines)</h2>
          <div className="form-grid">
            <label>
              Type
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as RfxType);
                }}
              >
                {RFX_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </label>
            <label>
              Response deadline
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => {
                  setDeadline(e.target.value);
                }}
              />
            </label>
          </div>
          <fieldset className="checklist">
            <legend>Invite suppliers (RFQ/RFP need at least two)</legend>
            {suppliers.data?.map((s) => (
              <label key={s.id} className="inline">
                <input
                  type="checkbox"
                  checked={invited.includes(s.id)}
                  onChange={() => {
                    toggle(invited, setInvited, s.id);
                  }}
                />
                {s.code} {s.name} ({s.countryCode})
              </label>
            ))}
          </fieldset>
          <div className="form-actions">
            <button
              disabled={create.isPending || title.trim().length < 3 || invited.length === 0}
              onClick={() => void submit()}
            >
              Create draft event
            </button>
            {create.error && (
              <p className="form-error" role="alert">
                {errorText(create.error)}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function RfxList() {
  const list = useRfxList();
  return (
    <section className="card">
      <h2>Sourcing events</h2>
      {list.isError && <p className="form-error">{errorText(list.error)}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Type</th>
              <th>Title</th>
              <th>Deadline</th>
              <th className="num">Responses</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/sourcing/rfx/${r.id}`}>{r.number}</Link>
                </td>
                <td>{r.type}</td>
                <td>{r.title}</td>
                <td>{new Date(r.responseDeadline).toLocaleString()}</td>
                <td className="num">
                  {r.respondedCount}/{r.invitedCount}
                </td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
