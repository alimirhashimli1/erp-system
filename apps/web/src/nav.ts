import type { Role } from '@procurestack/shared';

export interface NavItem {
  to: string;
  label: string;
  /** Who sees the link. UX only — the API authorizes every request on its own. */
  roles?: readonly Role[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard' },
  {
    to: '/requisitions',
    label: 'Requisitions',
    roles: ['REQUESTER', 'APPROVER', 'BUYER', 'FINANCE', 'ADMIN'],
  },
  { to: '/approvals', label: 'Approvals', roles: ['APPROVER'] },
  { to: '/sourcing', label: 'Sourcing', roles: ['BUYER', 'FINANCE', 'ADMIN'] },
  {
    to: '/purchase-orders',
    label: 'Purchase orders',
    roles: ['BUYER', 'WAREHOUSE', 'FINANCE', 'ADMIN'],
  },
  { to: '/receiving', label: 'Receiving', roles: ['WAREHOUSE', 'BUYER', 'FINANCE', 'ADMIN'] },
  { to: '/master-data', label: 'Master data' },
  { to: '/logistics', label: 'Incoterms & freight' },
];

export const hasAnyRole = (userRoles: readonly Role[], allowed?: readonly Role[]): boolean =>
  !allowed || allowed.some((r) => userRoles.includes(r));
