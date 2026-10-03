import { z } from 'zod';
import { CentsSchema, QuantitySchema } from '../common/money';
import { UomSchema } from '../master-data/master-data.schemas';

/** Lifecycle of a purchase requisition (PR). Transitions live in the API domain layer. */
export const PR_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
] as const;
export const PrStatusSchema = z.enum(PR_STATUSES);
export type PrStatus = z.infer<typeof PrStatusSchema>;

export const APPROVAL_DECISIONS = ['APPROVED', 'REJECTED', 'RETURNED'] as const;
export const ApprovalDecisionSchema = z.enum(APPROVAL_DECISIONS);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/** One row of the Delegation of Authority matrix (ADR 0004). `null` max = unlimited. */
export const DoaLevelSchema = z.object({
  level: z.number().int().positive(),
  name: z.string(),
  maxAmountCents: CentsSchema.nullable(),
});
export type DoaLevel = z.infer<typeof DoaLevelSchema>;
export const DoaMatrixSchema = z.array(DoaLevelSchema);

// ---- inputs ----

export const RequisitionLineInputSchema = z.object({
  itemId: z.uuid(),
  quantity: QuantitySchema,
  /** Requester's estimate; the real price comes from sourcing. */
  unitPriceCents: CentsSchema,
});
export type RequisitionLineInput = z.infer<typeof RequisitionLineInputSchema>;

export const CreateRequisitionSchema = z.object({
  title: z.string().trim().min(3).max(200),
  justification: z.string().trim().min(1, 'Explain the business need').max(2000),
  costCenterId: z.uuid(),
  needByDate: z.iso.date(),
  lines: z.array(RequisitionLineInputSchema).min(1, 'Add at least one line').max(50),
});
export type CreateRequisition = z.infer<typeof CreateRequisitionSchema>;

/** Edits carry the version the user saw: a stale edit is rejected (optimistic lock). */
export const UpdateRequisitionSchema = CreateRequisitionSchema.extend({
  version: z.number().int().positive(),
});
export type UpdateRequisition = z.infer<typeof UpdateRequisitionSchema>;

export const DecisionSchema = z
  .object({
    decision: ApprovalDecisionSchema,
    comment: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.decision === 'APPROVED' || (d.comment?.length ?? 0) > 0, {
    message: 'A comment is required when rejecting or returning',
    path: ['comment'],
  });
export type Decision = z.infer<typeof DecisionSchema>;

export const REQUISITION_SCOPES = ['mine', 'awaiting-my-approval', 'all'] as const;
export const RequisitionListQuerySchema = z.object({
  scope: z.enum(REQUISITION_SCOPES).default('all'),
  status: PrStatusSchema.optional(),
});
export type RequisitionListQuery = z.infer<typeof RequisitionListQuerySchema>;

// ---- outputs ----

const PersonRef = z.object({ id: z.uuid(), fullName: z.string() });
const CostCenterRef = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const RequisitionLineSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  itemId: z.uuid(),
  sku: z.string(),
  /** Snapshot of the item at creation time: later master-data edits don't rewrite history. */
  description: z.string(),
  uom: UomSchema,
  quantity: z.number(),
  unitPriceCents: CentsSchema,
  lineTotalCents: CentsSchema,
});
export type RequisitionLine = z.infer<typeof RequisitionLineSchema>;

export const ApprovalSchema = z.object({
  round: z.number().int(),
  level: z.number().int(),
  decision: ApprovalDecisionSchema,
  comment: z.string().nullable(),
  approver: PersonRef,
  decidedAt: z.iso.datetime(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const RequisitionSummarySchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: PrStatusSchema,
  title: z.string(),
  requester: PersonRef,
  costCenter: CostCenterRef,
  needByDate: z.iso.date(),
  totalCents: CentsSchema,
  /** Levels this PR needs (0 until submitted). */
  requiredLevels: z.number().int(),
  /** Level waiting for a decision, or null when nothing is pending. */
  pendingLevel: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
export type RequisitionSummary = z.infer<typeof RequisitionSummarySchema>;
export const RequisitionSummaryListSchema = z.array(RequisitionSummarySchema);

export const RequisitionSchema = RequisitionSummarySchema.extend({
  justification: z.string(),
  approvalRound: z.number().int(),
  version: z.number().int(),
  submittedAt: z.iso.datetime().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  lines: z.array(RequisitionLineSchema),
  approvals: z.array(ApprovalSchema),
});
export type Requisition = z.infer<typeof RequisitionSchema>;
