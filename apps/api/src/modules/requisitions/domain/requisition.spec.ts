import type { DoaLevel } from '@procurestack/shared';
import { DomainError } from '../../../common/domain-error';
import {
  type Actor,
  assertCanDecide,
  assertNeedByDate,
  assertPrTransition,
  canView,
  isAwaitingDecisionBy,
  pendingLevel,
  priceLines,
  type Requisition,
  requiredApprovalLevels,
  statusAfterDecision,
} from './requisition';

const MATRIX: DoaLevel[] = [
  { level: 2, name: 'Head', maxAmountCents: 5_000_000 },
  { level: 1, name: 'Lead', maxAmountCents: 500_000 },
  { level: 3, name: 'CFO', maxAmountCents: null },
];

const pr = (overrides: Partial<Requisition> = {}): Requisition => ({
  id: 'pr-1',
  number: 'PR-000001',
  status: 'SUBMITTED',
  title: 'Spare pumps',
  justification: 'Line 3 down',
  requesterId: 'rita',
  requesterName: 'Rita',
  costCenter: { id: 'cc', code: 'CC-2000', name: 'Maintenance' },
  needByDate: '2026-12-01',
  totalCents: 3_000_000,
  requiredLevels: 2,
  approvalRound: 1,
  version: 2,
  submittedAt: new Date(),
  decidedAt: null,
  createdAt: new Date(),
  lines: [],
  approvals: [],
  ...overrides,
});

const approver = (id: string, approvalLevel: number): Actor => ({
  id,
  roles: ['APPROVER'],
  approvalLevel,
});

const approvedBy = (approverId: string, level: number, round = 1) => ({
  round,
  level,
  approverId,
  approverName: approverId,
  decision: 'APPROVED' as const,
  comment: null,
  decidedAt: new Date(),
});

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof DomainError ? e.code : 'NOT_A_DOMAIN_ERROR';
  }
};

describe('requiredApprovalLevels (DoA matrix)', () => {
  it.each([
    [0, 1],
    [500_000, 1], // exactly €5,000 is still level 1 (limits are inclusive)
    [500_001, 2],
    [5_000_000, 2],
    [5_000_001, 3],
    [999_999_999_999, 3],
  ])('%i cents needs %i level(s)', (total, levels) => {
    expect(requiredApprovalLevels(total, MATRIX)).toBe(levels);
  });

  it('treats a matrix without an unlimited top level as a configuration error', () => {
    expect(codeOf(() => requiredApprovalLevels(10_000_000, MATRIX.slice(0, 2)))).toBe(
      'DOA_NO_LEVEL',
    );
  });
});

describe('approval rules', () => {
  it('starts at level 1 and moves up as levels approve', () => {
    expect(pendingLevel(pr())).toBe(1);
    expect(pendingLevel(pr({ approvals: [approvedBy('lead', 1)] }))).toBe(2);
    expect(pendingLevel(pr({ status: 'DRAFT' }))).toBeNull();
  });

  it('ignores approvals from an earlier (returned) round', () => {
    expect(pendingLevel(pr({ approvalRound: 2, approvals: [approvedBy('lead', 1, 1)] }))).toBe(1);
  });

  it('forbids self-approval even with enough authority', () => {
    expect(codeOf(() => assertCanDecide(pr(), approver('rita', 3)))).toBe('PR_SELF_APPROVAL');
  });

  it('forbids one person approving two levels of the same PR', () => {
    const p = pr({ approvals: [approvedBy('boss', 1)] });
    expect(codeOf(() => assertCanDecide(p, approver('boss', 3)))).toBe('PR_DUPLICATE_APPROVER');
  });

  it('requires authority at or above the pending level', () => {
    const p = pr({ approvals: [approvedBy('lead', 1)] });
    expect(codeOf(() => assertCanDecide(p, approver('lead2', 1)))).toBe(
      'PR_INSUFFICIENT_AUTHORITY',
    );
    expect(assertCanDecide(p, approver('head', 2))).toBe(2);
  });

  it('lets a higher-level approver take a lower step', () => {
    expect(assertCanDecide(pr(), approver('cfo', 3))).toBe(1);
  });

  it('requires the APPROVER role regardless of authority level', () => {
    const buyer: Actor = { id: 'bea', roles: ['BUYER'], approvalLevel: 3 };
    expect(codeOf(() => assertCanDecide(pr(), buyer))).toBe('PR_NOT_APPROVER');
  });

  it('only accepts decisions while submitted', () => {
    expect(codeOf(() => assertCanDecide(pr({ status: 'APPROVED' }), approver('a', 3)))).toBe(
      'PR_NOT_PENDING',
    );
  });

  it('approves fully only at the last required level', () => {
    expect(statusAfterDecision(pr(), 1, 'APPROVED')).toBe('SUBMITTED');
    expect(statusAfterDecision(pr(), 2, 'APPROVED')).toBe('APPROVED');
    expect(statusAfterDecision(pr(), 1, 'REJECTED')).toBe('REJECTED');
    expect(statusAfterDecision(pr(), 2, 'RETURNED')).toBe('RETURNED');
  });

  it('builds the approver inbox from the same rules', () => {
    expect(isAwaitingDecisionBy(pr(), approver('lead', 1))).toBe(true);
    expect(isAwaitingDecisionBy(pr(), approver('rita', 3))).toBe(false);
  });
});

describe('state machine', () => {
  it('allows the documented transitions only', () => {
    expect(() => {
      assertPrTransition('RETURNED', 'SUBMITTED');
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertPrTransition('APPROVED', 'CANCELLED');
      }),
    ).toBe('INVALID_TRANSITION');
    expect(
      codeOf(() => {
        assertPrTransition('REJECTED', 'SUBMITTED');
      }),
    ).toBe('INVALID_TRANSITION');
  });
});

describe('lines and dates', () => {
  it('numbers lines and totals them in exact cents', () => {
    const { lines, totalCents } = priceLines([
      { itemId: 'i1', sku: 'A', description: 'a', uom: 'KG', quantity: 12.5, unitPriceCents: 95 },
      { itemId: 'i2', sku: 'B', description: 'b', uom: 'EA', quantity: 3, unitPriceCents: 1999 },
    ]);
    expect(lines.map((l) => [l.lineNo, l.lineTotalCents])).toEqual([
      [1, 1188], // 1187.5 → 1188 (half up)
      [2, 5997],
    ]);
    expect(totalCents).toBe(7185);
  });

  it('rejects a need-by date in the past', () => {
    expect(
      codeOf(() => {
        assertNeedByDate('2026-01-01', '2026-01-02');
      }),
    ).toBe('PR_NEED_BY_IN_PAST');
    expect(
      codeOf(() => {
        assertNeedByDate('2026-01-02', '2026-01-02');
      }),
    ).toBeUndefined();
  });
});

describe('row-level visibility', () => {
  it('shows a requester only their own PRs, cross-functional roles all of them', () => {
    expect(canView(pr(), { id: 'rita', roles: ['REQUESTER'] })).toBe(true);
    expect(canView(pr(), { id: 'other', roles: ['REQUESTER'] })).toBe(false);
    expect(canView(pr(), { id: 'other', roles: ['FINANCE'] })).toBe(true);
    expect(canView(pr(), { id: 'other', roles: ['WAREHOUSE'] })).toBe(false);
  });
});
