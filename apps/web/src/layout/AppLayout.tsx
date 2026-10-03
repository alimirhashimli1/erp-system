import { ROLE_LABELS } from '@procurestack/shared';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { hasAnyRole, NAV_ITEMS } from '../nav';

/** Signed-in shell: top bar, role-filtered navigation, routed page. */
export function AppLayout() {
  const { state, logout } = useAuth();
  if (state.status !== 'authenticated') return null;
  const { user } = state;

  return (
    <div className="shell">
      <header className="topbar">
        <strong>ProcureStack</strong>
        <nav className="nav" aria-label="Main">
          {NAV_ITEMS.filter((item) => hasAnyRole(user.roles, item.roles)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <span className="muted">
          {user.fullName} · {user.roles.map((r) => ROLE_LABELS[r]).join(', ')}
        </span>
        <button className="secondary" onClick={() => void logout()}>
          Sign out
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
