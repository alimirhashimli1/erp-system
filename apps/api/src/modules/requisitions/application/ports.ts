import type { ApprovalDecision, DoaLevel, PrStatus } from '@procurestack/shared';
import type { PricedLine, Requisition } from '../domain/requisition';

export interface RequisitionContent {
  costCenterId: string;
  title: string;
  justification: string;
  needByDate: string;
  totalCents: number;
  lines: PricedLine[];
}

export interface StatusPatch {
  status: PrStatus;
  requiredLevels?: number;
  approvalRound?: number;
  submittedAt?: Date;
  decidedAt?: Date | null;
}

/**
 * Writes take the version the caller read and fail with `staleWrite` (409) if someone
 * changed the PR in between (ADR 0006). Call them inside `UnitOfWork.run`.
 */
export interface RequisitionRepository {
  findById(id: string): Promise<Requisition | null>;
  list(filter: { requesterId?: string; status?: PrStatus }): Promise<Requisition[]>;
  create(input: RequisitionContent & { number: string; requesterId: string }): Promise<string>;
  replaceContent(id: string, expectedVersion: number, content: RequisitionContent): Promise<void>;
  /** Sets status fields and bumps the version (also used to serialize approvals). */
  transition(id: string, expectedVersion: number, patch: StatusPatch): Promise<void>;
  /** Fails with 409 if this (round, level) was already decided by someone else. */
  addApproval(
    id: string,
    approval: {
      round: number;
      level: number;
      approverId: string;
      decision: ApprovalDecision;
      comment: string | null;
    },
  ): Promise<void>;
}

export interface DoaMatrix {
  load(): Promise<DoaLevel[]>;
}

/** Approval authority is looked up per request — a token issued before a demotion must not grant it. */
export interface ApproverDirectory {
  approvalLevelOf(userId: string): Promise<number | null>;
}

export const REQUISITION_REPOSITORY = Symbol('REQUISITION_REPOSITORY');
export const DOA_MATRIX = Symbol('DOA_MATRIX');
export const APPROVER_DIRECTORY = Symbol('APPROVER_DIRECTORY');
