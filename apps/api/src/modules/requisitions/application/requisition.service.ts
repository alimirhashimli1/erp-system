import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateRequisition,
  Decision,
  DoaLevel,
  RequisitionListQuery,
  UpdateRequisition,
} from '@procurestack/shared';
import { CLOCK, type Clock } from '../../../common/clock';
import {
  DOCUMENT_NUMBERS,
  type DocumentNumberGenerator,
} from '../../../common/document-number.port';
import { DomainError, notFound, staleWrite } from '../../../common/domain-error';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/unit-of-work';
import { AuditService } from '../../audit/audit.service';
import {
  COST_CENTER_REPOSITORY,
  type CostCenterRepository,
  ITEM_REPOSITORY,
  type ItemRepository,
} from '../../master-data/application/ports';
import {
  type Actor,
  assertCanDecide,
  assertNeedByDate,
  assertOwner,
  assertPrTransition,
  canSeeAll,
  canView,
  EDITABLE_STATUSES,
  isAwaitingDecisionBy,
  type LineDraft,
  priceLines,
  type Requisition,
  requiredApprovalLevels,
  statusAfterDecision,
} from '../domain/requisition';
import {
  APPROVER_DIRECTORY,
  type ApproverDirectory,
  DOA_MATRIX,
  type DoaMatrix,
  REQUISITION_REPOSITORY,
  type RequisitionContent,
  type RequisitionRepository,
} from './ports';

const ENTITY = 'PurchaseRequisition';

/** PR use cases. Domain rules come from ../domain; this class orchestrates and audits. */
@Injectable()
export class RequisitionService {
  constructor(
    @Inject(REQUISITION_REPOSITORY) private readonly repo: RequisitionRepository,
    @Inject(DOA_MATRIX) private readonly doa: DoaMatrix,
    @Inject(APPROVER_DIRECTORY) private readonly approvers: ApproverDirectory,
    @Inject(ITEM_REPOSITORY) private readonly items: ItemRepository,
    @Inject(COST_CENTER_REPOSITORY) private readonly costCenters: CostCenterRepository,
    @Inject(DOCUMENT_NUMBERS) private readonly numbers: DocumentNumberGenerator,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  doaMatrix(): Promise<DoaLevel[]> {
    return this.doa.load();
  }

  async list(actor: Actor, query: RequisitionListQuery): Promise<Requisition[]> {
    if (query.scope === 'awaiting-my-approval') {
      const me = { ...actor, approvalLevel: await this.approvers.approvalLevelOf(actor.id) };
      const submitted = await this.repo.list({ status: 'SUBMITTED' });
      return submitted.filter((pr) => isAwaitingDecisionBy(pr, me));
    }
    // Row-level rule: without a cross-functional role, "all" silently means "mine".
    const onlyMine = query.scope === 'mine' || !canSeeAll(actor);
    return this.repo.list({
      ...(onlyMine ? { requesterId: actor.id } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  /** 404 (not 403) for PRs the actor may not see, so IDs can't be probed (ADR 0006). */
  async get(actor: Actor, id: string): Promise<Requisition> {
    const pr = await this.repo.findById(id);
    if (!pr || !canView(pr, actor)) throw notFound('Requisition');
    return pr;
  }

  async create(actor: Actor, input: CreateRequisition): Promise<Requisition> {
    const content = await this.buildContent(input);
    const id = await this.uow.run(async () =>
      this.repo.create({
        ...content,
        number: await this.numbers.next('PR'),
        requesterId: actor.id,
      }),
    );
    return this.get(actor, id);
  }

  async update(actor: Actor, id: string, input: UpdateRequisition): Promise<Requisition> {
    const pr = await this.get(actor, id);
    assertOwner(pr, actor);
    if (!EDITABLE_STATUSES.includes(pr.status)) {
      throw new DomainError(
        'conflict',
        'PR_NOT_EDITABLE',
        `A ${pr.status} requisition can't be edited`,
      );
    }
    if (input.version !== pr.version) throw staleWrite('Requisition');
    const content = await this.buildContent(input);
    await this.uow.run(() => this.repo.replaceContent(id, input.version, content));
    return this.get(actor, id);
  }

  async submit(actor: Actor, id: string): Promise<Requisition> {
    const pr = await this.get(actor, id);
    assertOwner(pr, actor);
    assertPrTransition(pr.status, 'SUBMITTED');
    assertNeedByDate(pr.needByDate, this.clock.today());
    // Re-validate references: an item may have been deactivated while the PR sat in draft.
    await this.buildContent({ ...pr, costCenterId: pr.costCenter.id });
    const requiredLevels = requiredApprovalLevels(pr.totalCents, await this.doa.load());
    const approvalRound = pr.approvalRound + 1;

    await this.uow.run(async () => {
      await this.repo.transition(id, pr.version, {
        status: 'SUBMITTED',
        requiredLevels,
        approvalRound,
        submittedAt: this.clock.now(),
        decidedAt: null,
      });
      await this.audit.record({
        actorId: actor.id,
        action: 'PR_SUBMITTED',
        entityType: ENTITY,
        entityId: id,
        before: { status: pr.status },
        after: { status: 'SUBMITTED', totalCents: pr.totalCents, requiredLevels, approvalRound },
      });
    });
    return this.get(actor, id);
  }

  async decide(actor: Actor, id: string, { decision, comment }: Decision): Promise<Requisition> {
    const pr = await this.get(actor, id);
    const approvalLevel = await this.approvers.approvalLevelOf(actor.id);
    const level = assertCanDecide(pr, { ...actor, approvalLevel });
    const next = statusAfterDecision(pr, level, decision);
    if (next !== pr.status) assertPrTransition(pr.status, next);

    await this.uow.run(async () => {
      await this.repo.addApproval(id, {
        round: pr.approvalRound,
        level,
        approverId: actor.id,
        decision,
        comment: comment ?? null,
      });
      // Version bump even when the status stays SUBMITTED: serializes concurrent approvers.
      await this.repo.transition(id, pr.version, {
        status: next,
        ...(next === 'SUBMITTED' ? {} : { decidedAt: this.clock.now() }),
      });
      await this.audit.record({
        actorId: actor.id,
        action: next === 'SUBMITTED' ? 'PR_LEVEL_APPROVED' : `PR_${next}`,
        entityType: ENTITY,
        entityId: id,
        before: { status: pr.status },
        after: { status: next },
        metadata: { level, round: pr.approvalRound, approvalLevel, comment: comment ?? null },
      });
    });
    return this.get(actor, id);
  }

  async cancel(actor: Actor, id: string): Promise<Requisition> {
    const pr = await this.get(actor, id);
    assertOwner(pr, actor);
    assertPrTransition(pr.status, 'CANCELLED');
    await this.uow.run(async () => {
      await this.repo.transition(id, pr.version, { status: 'CANCELLED' });
      await this.audit.record({
        actorId: actor.id,
        action: 'PR_CANCELLED',
        entityType: ENTITY,
        entityId: id,
        before: { status: pr.status },
        after: { status: 'CANCELLED' },
      });
    });
    return this.get(actor, id);
  }

  /**
   * Resolves master data and snapshots it onto the lines: only active cost centers and
   * items can be requested, and later master-data edits don't rewrite this PR.
   */
  private async buildContent(input: {
    costCenterId: string;
    title: string;
    justification: string;
    needByDate: string;
    lines: { itemId: string; quantity: number; unitPriceCents: number }[];
  }): Promise<RequisitionContent> {
    const costCenter = await this.costCenters.findById(input.costCenterId);
    if (!costCenter?.isActive) {
      throw new DomainError('rule', 'PR_COST_CENTER_INVALID', 'Cost center is unknown or inactive');
    }
    const drafts: LineDraft[] = [];
    for (const line of input.lines) {
      const item = await this.items.findById(line.itemId);
      if (!item?.isActive) {
        throw new DomainError('rule', 'PR_ITEM_INVALID', 'An item is unknown or inactive');
      }
      drafts.push({
        itemId: item.id,
        sku: item.sku,
        description: item.description,
        uom: item.uom,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      });
    }
    const { lines, totalCents } = priceLines(drafts);
    return {
      costCenterId: costCenter.id,
      title: input.title,
      justification: input.justification,
      needByDate: input.needByDate,
      totalCents,
      lines,
    };
  }
}
