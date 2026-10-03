import {
  formatCents,
  PR_STATUSES,
  type PrStatus,
  type RequisitionListQuery,
} from '@procurestack/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorText } from '../../api/http';
import { useRequisitions } from '../../api/requisitions';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/StatusBadge';

type Scope = RequisitionListQuery['scope'];

const SCOPE_LABELS: Record<Scope, string> = {
  mine: 'My requisitions',
  'awaiting-my-approval': 'Awaiting my approval',
  all: 'All',
};

export function RequisitionsPage({ initialScope }: { initialScope?: Scope }) {
  const { state } = useAuth();
  const roles = state.status === 'authenticated' ? state.user.roles : [];
  const scopes: Scope[] = [
    ...(roles.includes('REQUESTER') ? (['mine'] as const) : []),
    ...(roles.includes('APPROVER') ? (['awaiting-my-approval'] as const) : []),
    'all',
  ];
  const [scope, setScope] = useState<Scope>(initialScope ?? scopes[0] ?? 'all');
  const [status, setStatus] = useState<PrStatus | ''>('');
  const list = useRequisitions(scope, status || undefined);

  return (
    <section className="card">
      <div className="page-head">
        <h1>Purchase requisitions</h1>
        {roles.includes('REQUESTER') && (
          <Link className="button" to="/requisitions/new">
            New requisition
          </Link>
        )}
      </div>

      <div className="toolbar">
        <div className="tabs compact" role="tablist">
          {scopes.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? 'tab active' : 'tab'}
              onClick={() => {
                setScope(s);
              }}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
        {scope !== 'awaiting-my-approval' && (
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PrStatus | '');
            }}
          >
            <option value="">Any status</option>
            {PR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
        )}
      </div>

      {list.isError && <p className="form-error">{errorText(list.error)}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Title</th>
              <th>Requester</th>
              <th>Cost center</th>
              <th>Need by</th>
              <th className="num">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((pr) => (
              <tr key={pr.id}>
                <td>
                  <Link to={`/requisitions/${pr.id}`}>{pr.number}</Link>
                </td>
                <td>{pr.title}</td>
                <td>{pr.requester.fullName}</td>
                <td>{pr.costCenter.code}</td>
                <td>{pr.needByDate}</td>
                <td className="num">{formatCents(pr.totalCents)}</td>
                <td>
                  <StatusBadge status={pr.status} />
                  {pr.pendingLevel !== null && (
                    <span className="muted small">
                      {' '}
                      L{pr.pendingLevel}/{pr.requiredLevels}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
