import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './auth-context';

/**
 * UX only: hides pages from signed-out users. It is NOT a security boundary —
 * the API enforces authentication and roles on every request regardless.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <p className="muted center">Loading…</p>;
  if (state.status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
