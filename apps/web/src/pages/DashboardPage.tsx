import { ROLE_LABELS, type Role } from '@procurestack/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../auth/auth-context';

const ReadinessSchema = z.object({
  status: z.string(),
  details: z.record(z.string(), z.object({ status: z.string() })),
});

// /health/ready answers 503 with the same body when a dependency is down, so read both.
async function fetchReadiness() {
  const res = await fetch('/api/health/ready');
  return ReadinessSchema.parse(await res.json());
}

/** The P2P chain this system is being built around, and who acts at each step. */
const P2P_STEPS: { step: string; role: Role }[] = [
  { step: 'Purchase Requisition', role: 'REQUESTER' },
  { step: 'Approval', role: 'APPROVER' },
  { step: 'Sourcing / RFQ → PO', role: 'BUYER' },
  { step: 'Goods Receipt', role: 'WAREHOUSE' },
  { step: '3-Way Match → Payment', role: 'FINANCE' },
];

export function DashboardPage() {
  const { state } = useAuth();
  const readiness = useQuery({ queryKey: ['health', 'ready'], queryFn: fetchReadiness });

  if (state.status !== 'authenticated') return null;
  const { user } = state;

  return (
    <>
      <section className="card">
        <h2>Procure-to-Pay chain</h2>
        <ol className="p2p">
          {P2P_STEPS.map(({ step, role }) => (
            <li key={step} className={user.roles.includes(role) ? 'mine' : undefined}>
              <span>{step}</span>
              <span className="badge">{ROLE_LABELS[role]}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">Highlighted steps are yours.</p>
      </section>

      <section className="card">
        <h2>System status</h2>
        {readiness.isPending && <p className="muted">Checking…</p>}
        {readiness.isError && <p className="field-error">API unreachable</p>}
        {readiness.data && (
          <ul className="status">
            {Object.entries(readiness.data.details).map(([name, { status }]) => (
              <li key={name}>
                <span className={`dot ${status === 'up' ? 'up' : 'down'}`} /> {name}: {status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
