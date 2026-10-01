import { z } from 'zod';

/**
 * Roles mirror a real procurement org's segregation of duties (SoD):
 * the person who asks for something, approves it, buys it, receives it
 * and pays for it should not all be the same person.
 */
export const ROLES = ['REQUESTER', 'APPROVER', 'BUYER', 'WAREHOUSE', 'FINANCE', 'ADMIN'] as const;

export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  REQUESTER: 'Requester',
  APPROVER: 'Approver',
  BUYER: 'Buyer / Sourcing',
  WAREHOUSE: 'Warehouse / Receiving',
  FINANCE: 'Finance / AP',
  ADMIN: 'Admin',
};
