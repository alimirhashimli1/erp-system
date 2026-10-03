import {
  approvalLevelsFor,
  type ApprovalDecision,
  type DoaLevel,
  lineTotalCents,
  type PrStatus,
  type Role,
  type Uom,
} from '@procurestack/shared';
import { assertTransition, DomainError } from '../../../common/domain-error';

/*
 * Purchase requisition domain: pure functions over plain data. No Nest, no Prisma —
 * every business rule here is unit-tested in isolation (requisition.spec.ts).
 */

/** A priced line before it is stored. */
export interface PricedLine {
  lineNo: number;
  itemId: string;
  sku: string;
  description: string;
  uom: Uom;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** A stored line; sourcing and POs reference it by id. */
export type RequisitionLine = PricedLine & { id: string };

export interface ApprovalRecord {
  round: number;
  level: number;
  approverId: string;
  approverName: string;
  decision: ApprovalDecision;
  comment: string | null;
  decidedAt: Date;
}

export interface Requisition {
  id: string;
  number: string;
  status: PrStatus;
  title: string;
  justification: string;
  requesterId: string;
  requesterName: string;
  costCenter: { id: string; code: string; name: string };
  /** ISO date (YYYY-MM-DD). */
  needByDate: string;
  totalCents: number;
  requiredLevels: number;
  approvalRound: number;
  version: number;
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  lines: RequisitionLine[];
  approvals: ApprovalRecord[];
}

/** Who is acting. `approvalLevel` is read fresh from the DB, never trusted from a token. */
export interface Actor {
  id: string;
  roles: readonly Role[];
  approvalLevel?: number | null;
}

// ---- state machine ----

export const PR_TRANSITIONS: Readonly<Record<PrStatus, readonly PrStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'],
  RETURNED: ['SUBMITTED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const EDITABLE_STATUSES: readonly PrStatus[] = ['DRAFT', 'RETURNED'];

export function assertPrTransition(from: PrStatus, to: PrStatus): void {
  assertTransition(PR_TRANSITIONS, from, to, 'Requisition');
}

// ---- lines & totals ----

export type LineDraft = Omit<PricedLine, 'lineNo' | 'lineTotalCents'>;

/** Numbers lines 1..n and prices them with the shared exact-cents helper (ADR 0005). */
export function priceLines(drafts: LineDraft[]): { lines: PricedLine[]; totalCents: number } {
  const lines = drafts.map((d, i) => ({
    ...d,
    lineNo: i + 1,
    lineTotalCents: lineTotalCents(d.quantity, d.unitPriceCents),
  }));
  const totalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  if (!Number.isSafeInteger(totalCents)) {
    throw new DomainError('rule', 'PR_TOTAL_TOO_LARGE', 'Requisition total is too large');
  }
  return { lines, totalCents };
}

/** The need-by date can't already be over when the PR enters approval. */
export function assertNeedByDate(needByDate: string, today: string): void {
  if (needByDate < today) {
    throw new DomainError('rule', 'PR_NEED_BY_IN_PAST', 'Need-by date is in the past');
  }
}

// ---- Delegation of Authority ----

/**
 * How many sequential approval levels a total needs: the first level whose limit covers
 * it. €4,000 → 1 (team lead); €30,000 → 2 (team lead, then head of department).
 */
export function requiredApprovalLevels(totalCents: number, matrix: readonly DoaLevel[]): number {
  const levels = approvalLevelsFor(totalCents, matrix);
  if (levels === null) {
    // A matrix without an unlimited top level is a configuration error, not a user error.
    throw new DomainError('rule', 'DOA_NO_LEVEL', 'No approval level covers this amount');
  }
  return levels;
}

const approvalsThisRound = (pr: Requisition) =>
  pr.approvals.filter((a) => a.round === pr.approvalRound && a.decision === 'APPROVED');

/** Level waiting for a decision right now, or null if the PR is not awaiting approval. */
export function pendingLevel(pr: Requisition): number | null {
  if (pr.status !== 'SUBMITTED') return null;
  return approvalsThisRound(pr).length + 1;
}

/**
 * Segregation-of-duties and authority checks for a decision on the pending level.
 * Returns the level being decided.
 */
export function assertCanDecide(pr: Requisition, actor: Actor): number {
  const level = pendingLevel(pr);
  if (level === null) {
    throw new DomainError('conflict', 'PR_NOT_PENDING', 'Requisition is not awaiting approval');
  }
  if (!actor.roles.includes('APPROVER')) {
    throw new DomainError('forbidden', 'PR_NOT_APPROVER', 'Only approvers can decide');
  }
  if (actor.id === pr.requesterId) {
    throw new DomainError(
      'forbidden',
      'PR_SELF_APPROVAL',
      'You cannot approve your own requisition',
    );
  }
  if (approvalsThisRound(pr).some((a) => a.approverId === actor.id)) {
    throw new DomainError(
      'forbidden',
      'PR_DUPLICATE_APPROVER',
      'You already approved a level of this requisition — another approver must decide',
    );
  }
  if ((actor.approvalLevel ?? 0) < level) {
    throw new DomainError(
      'forbidden',
      'PR_INSUFFICIENT_AUTHORITY',
      `Level ${String(level)} approval needs approval authority ${String(level)} or higher`,
    );
  }
  return level;
}

/** Outcome of a decision: the PR's next status (unchanged when more levels remain). */
export function statusAfterDecision(
  pr: Requisition,
  level: number,
  decision: ApprovalDecision,
): PrStatus {
  if (decision === 'APPROVED') return level >= pr.requiredLevels ? 'APPROVED' : 'SUBMITTED';
  return decision; // REJECTED or RETURNED
}

/** Can this actor act on decisions for the PR right now? (Used for the approver inbox.) */
export function isAwaitingDecisionBy(pr: Requisition, actor: Actor): boolean {
  try {
    assertCanDecide(pr, actor);
    return true;
  } catch {
    return false;
  }
}

// ---- row-level authorization ----

/** Roles that work across requisitions (approve, source, audit) and so see all of them. */
const SEE_ALL_ROLES: readonly Role[] = ['APPROVER', 'BUYER', 'FINANCE', 'ADMIN'];

export const canSeeAll = (actor: Actor) => actor.roles.some((r) => SEE_ALL_ROLES.includes(r));

export const canView = (pr: Requisition, actor: Actor) =>
  pr.requesterId === actor.id || canSeeAll(actor);

export function assertOwner(pr: Requisition, actor: Actor): void {
  if (pr.requesterId !== actor.id || !actor.roles.includes('REQUESTER')) {
    throw new DomainError(
      'forbidden',
      'PR_NOT_OWNER',
      'Only the requester can change this requisition',
    );
  }
}
