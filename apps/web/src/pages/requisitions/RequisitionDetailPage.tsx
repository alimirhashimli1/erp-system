import { type ApprovalDecision, formatCents, type Requisition } from '@procurestack/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorText } from '../../api/http';
import { useDecision, useDoaMatrix, usePrAction, useRequisition } from '../../api/requisitions';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/StatusBadge';

export function RequisitionDetailPage() {
  const { id = '' } = useParams();
  const pr = useRequisition(id);

  if (pr.isPending) return <p className="muted">Loading…</p>;
  if (pr.isError) return <p className="form-error">{errorText(pr.error)}</p>;
  return <RequisitionView pr={pr.data} />;
}

function RequisitionView({ pr }: { pr: Requisition }) {
  const { state } = useAuth();
  const me = state.status === 'authenticated' ? state.user : null;
  const isOwner = me?.id === pr.requester.id && me.roles.includes('REQUESTER');
  // UX hint only — the API re-checks authority, self-approval and duplicate approvers.
  const mayDecide =
    pr.pendingLevel !== null &&
    me?.roles.includes('APPROVER') === true &&
    me.id !== pr.requester.id;

  return (
    <>
      <section className="card">
        <div className="page-head">
          <h1>
            {pr.number} · {pr.title}
          </h1>
          <StatusBadge status={pr.status} />
        </div>
        <dl className="facts">
          <div>
            <dt>Requester</dt>
            <dd>{pr.requester.fullName}</dd>
          </div>
          <div>
            <dt>Cost center</dt>
            <dd>
              {pr.costCenter.code} — {pr.costCenter.name}
            </dd>
          </div>
          <div>
            <dt>Need by</dt>
            <dd>{pr.needByDate}</dd>
          </div>
          <div>
            <dt>Total (estimate)</dt>
            <dd>{formatCents(pr.totalCents)}</dd>
          </div>
        </dl>
        <p className="prewrap">{pr.justification}</p>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Est. unit price</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {pr.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td>
                    {l.sku} — {l.description}
                  </td>
                  <td className="num">
                    {l.quantity} {l.uom}
                  </td>
                  <td className="num">{formatCents(l.unitPriceCents)}</td>
                  <td className="num">{formatCents(l.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isOwner && <OwnerActions pr={pr} />}
      </section>

      <ApprovalPanel pr={pr} />
      {mayDecide && <DecisionForm pr={pr} />}
    </>
  );
}

function OwnerActions({ pr }: { pr: Requisition }) {
  const action = usePrAction(pr.id);
  const editable = pr.status === 'DRAFT' || pr.status === 'RETURNED';
  const cancellable = editable || pr.status === 'SUBMITTED';
  if (!cancellable) return null;
  return (
    <div className="form-actions">
      {editable && (
        <>
          <button
            disabled={action.isPending}
            onClick={() => {
              action.mutate('submit');
            }}
          >
            Submit for approval
          </button>
          <Link className="button secondary" to={`/requisitions/${pr.id}/edit`}>
            Edit
          </Link>
        </>
      )}
      <button
        className="secondary"
        disabled={action.isPending}
        onClick={() => {
          if (window.confirm(`Cancel ${pr.number}? This cannot be undone.`))
            action.mutate('cancel');
        }}
      >
        Cancel requisition
      </button>
      {action.error && (
        <p className="form-error" role="alert">
          {errorText(action.error)}
        </p>
      )}
    </div>
  );
}

/** DoA progress for the current round, plus the full decision history. */
function ApprovalPanel({ pr }: { pr: Requisition }) {
  const doa = useDoaMatrix();
  if (pr.requiredLevels === 0) return null;
  const current = pr.approvals.filter((a) => a.round === pr.approvalRound);
  const levels = (doa.data ?? []).filter((l) => l.level <= pr.requiredLevels);

  return (
    <section className="card">
      <h2>Approval (round {pr.approvalRound})</h2>
      <ol className="steps">
        {levels.map((l) => {
          const decision = current.find((a) => a.level === l.level);
          const isPending = pr.pendingLevel === l.level;
          return (
            <li key={l.level} className={decision ? 'done' : isPending ? 'current' : undefined}>
              <strong>
                L{l.level} · {l.name}
              </strong>
              <span className="muted small">
                {decision
                  ? `${decision.decision.toLowerCase()} by ${decision.approver.fullName}`
                  : isPending
                    ? 'waiting for decision'
                    : 'not reached'}
              </span>
            </li>
          );
        })}
      </ol>
      {pr.approvals.some((a) => a.comment) && (
        <ul className="history">
          {pr.approvals
            .filter((a) => a.comment)
            .map((a) => (
              <li key={`${String(a.round)}-${String(a.level)}`}>
                <span className="muted small">
                  Round {a.round}, L{a.level} · {a.approver.fullName} ·{' '}
                  {new Date(a.decidedAt).toLocaleString()}
                </span>
                <p>
                  <StatusBadge status={a.decision} /> {a.comment}
                </p>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function DecisionForm({ pr }: { pr: Requisition }) {
  const decide = useDecision(pr.id);
  const [comment, setComment] = useState('');
  const send = (decision: ApprovalDecision) => {
    decide.mutate({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) });
  };
  return (
    <section className="card">
      <h2>Your decision — level {pr.pendingLevel}</h2>
      <label htmlFor="decision-comment">Comment (required to reject or return)</label>
      <textarea
        id="decision-comment"
        rows={2}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
        }}
      />
      <div className="form-actions">
        <button
          disabled={decide.isPending}
          onClick={() => {
            send('APPROVED');
          }}
        >
          Approve
        </button>
        <button
          className="secondary"
          disabled={decide.isPending || !comment.trim()}
          onClick={() => {
            send('RETURNED');
          }}
        >
          Return for rework
        </button>
        <button
          className="danger"
          disabled={decide.isPending || !comment.trim()}
          onClick={() => {
            send('REJECTED');
          }}
        >
          Reject
        </button>
        {decide.error && (
          <p className="form-error" role="alert">
            {errorText(decide.error)}
          </p>
        )}
      </div>
    </section>
  );
}
