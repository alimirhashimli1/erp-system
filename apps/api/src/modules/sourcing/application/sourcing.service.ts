import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Award, CreateRfx, RfxEvaluation, RfxStatus, SubmitBid } from '@procurestack/shared';
import { CLOCK, type Clock } from '../../../common/clock';
import {
  DOCUMENT_NUMBERS,
  type DocumentNumberGenerator,
} from '../../../common/document-number.port';
import { DomainError, notFound } from '../../../common/domain-error';
import { DomainEvents } from '../../../common/domain-events';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/unit-of-work';
import { AuditService } from '../../audit/audit.service';
import {
  ITEM_REPOSITORY,
  type ItemRepository,
  SUPPLIER_REPOSITORY,
  type SupplierRepository,
} from '../../master-data/application/ports';
import {
  assertCanBid,
  assertCanPublish,
  assertRfxTransition,
  decideAward,
  evaluate,
  type RfxEvent,
} from '../domain/rfx';
import { simulateBid } from '../domain/supplier-simulator';
import { type PrLineForSourcing, RFX_REPOSITORY, type RfxRepository } from './ports';

const ENTITY = 'RfxEvent';

/** Who acts: a user id, or null for the system (scheduled close, simulator). */
type ActorId = string | null;

@Injectable()
export class SourcingService {
  private readonly logger = new Logger(SourcingService.name);

  constructor(
    @Inject(RFX_REPOSITORY) private readonly repo: RfxRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    @Inject(ITEM_REPOSITORY) private readonly items: ItemRepository,
    @Inject(DOCUMENT_NUMBERS) private readonly numbers: DocumentNumberGenerator,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
  ) {}

  openPrLines(): Promise<PrLineForSourcing[]> {
    return this.repo.openPrLines();
  }

  list(status?: RfxStatus): Promise<RfxEvent[]> {
    return this.repo.list(status ? { status } : {});
  }

  async get(id: string): Promise<RfxEvent> {
    const rfx = await this.repo.findById(id);
    if (!rfx) throw notFound('RFx');
    return rfx;
  }

  /** Live landed-cost ranking; only once bids are unsealed. */
  evaluation(rfx: RfxEvent): RfxEvaluation | null {
    return ['CLOSED', 'EVALUATED', 'AWARDED'].includes(rfx.status)
      ? evaluate(rfx, this.clock.today())
      : null;
  }

  async create(actorId: string, input: CreateRfx): Promise<RfxEvent> {
    const deadline = new Date(input.responseDeadline);
    if (deadline <= this.clock.now()) {
      throw new DomainError(
        'rule',
        'RFX_DEADLINE_PASSED',
        'The response deadline must be in the future',
      );
    }
    for (const id of input.supplierIds) {
      const s = await this.suppliers.findById(id);
      if (!s?.isActive) {
        throw new DomainError('rule', 'RFX_SUPPLIER_INVALID', 'A supplier is unknown or inactive');
      }
    }
    const prLines = await this.repo.findPrLines(input.prLineIds);
    const byId = new Map(prLines.map((l) => [l.prLineId, l]));
    const ordered = input.prLineIds.map((id) => byId.get(id));
    if (ordered.some((l) => l?.prStatus !== 'APPROVED' || l.sourcingStatus !== 'OPEN')) {
      throw new DomainError(
        'rule',
        'RFX_PR_LINE_UNAVAILABLE',
        'Only open lines of approved requisitions can be sourced',
      );
    }

    const id = await this.uow.run(async () => {
      if (!(await this.repo.claimPrLines(input.prLineIds))) {
        throw new DomainError(
          'conflict',
          'RFX_PR_LINE_TAKEN',
          'A line was just claimed by another event',
        );
      }
      const rfxId = await this.repo.create({
        number: await this.numbers.next('RFX'),
        type: input.type,
        title: input.title,
        buyerId: actorId,
        responseDeadline: deadline,
        lines: ordered.flatMap((l) =>
          l ? [{ prLineId: l.prLineId, itemId: l.itemId, quantity: l.quantity, uom: l.uom }] : [],
        ),
        supplierIds: input.supplierIds,
      });
      await this.record(actorId, 'RFX_CREATED', rfxId, null, {
        type: input.type,
        prLineIds: input.prLineIds,
        supplierIds: input.supplierIds,
      });
      return rfxId;
    });
    return this.get(id);
  }

  async publish(actorId: string, id: string): Promise<RfxEvent> {
    const rfx = await this.get(id);
    assertCanPublish(rfx, this.clock.now());
    await this.uow.run(async () => {
      await this.repo.transition(id, rfx.version, {
        status: 'PUBLISHED',
        publishedAt: this.clock.now(),
      });
      await this.record(
        actorId,
        'RFX_PUBLISHED',
        id,
        { status: rfx.status },
        { status: 'PUBLISHED' },
      );
    });
    // After commit: schedule the deadline close and (demo) supplier responses.
    await this.events.emit('rfx.published', {
      rfxId: id,
      responseDeadline: rfx.responseDeadline,
      supplierIds: rfx.invitations.map((i) => i.supplier.id),
    });
    return this.get(id);
  }

  /** Buyer records a bid received from a supplier (or the simulator submits one). */
  async submitBid(
    actorId: ActorId,
    id: string,
    bid: SubmitBid,
    source: 'MANUAL' | 'SIMULATED' = 'MANUAL',
  ): Promise<RfxEvent> {
    const rfx = await this.get(id);
    const now = this.clock.now();
    assertCanBid(rfx, bid, now);
    await this.uow.run(async () => {
      // Version bump serializes a bid against a concurrent close.
      await this.repo.transition(id, rfx.version, { status: 'PUBLISHED' });
      await this.repo.saveBid(id, bid, source, now);
      // Sealed bid: the audit trail records THAT a bid arrived, not its prices.
      await this.record(actorId, 'RFX_BID_RECORDED', id, null, null, {
        supplierId: bid.supplierId,
        source,
        lines: bid.lines.length,
      });
    });
    return this.get(id);
  }

  /** Job handler (demo): one invited supplier answers. Idempotent and state-checked. */
  async simulateSupplierResponse(id: string, supplierId: string): Promise<void> {
    const rfx = await this.repo.findById(id);
    const invitation = rfx?.invitations.find((i) => i.supplier.id === supplierId);
    if (
      !rfx ||
      rfx.type === 'RFI' ||
      rfx.status !== 'PUBLISHED' ||
      invitation?.status !== 'INVITED' ||
      this.clock.now() > rfx.responseDeadline
    ) {
      return;
    }
    const lines = [];
    for (const l of rfx.lines) {
      const item = await this.items.findById(l.itemId);
      lines.push({
        rfxLineId: l.id,
        quantity: l.quantity,
        standardPriceCents: item?.standardPriceCents ?? 100,
      });
    }
    const bid = simulateBid({
      rfxId: id,
      supplierId,
      countryCode: invitation.supplier.countryCode,
      today: this.clock.today(),
      lines,
    });
    if (bid) {
      await this.submitBid(null, id, bid, 'SIMULATED');
    } else {
      await this.uow.run(() => this.repo.declineInvitation(id, supplierId, this.clock.now()));
    }
    this.logger.log(
      `Simulated ${bid ? 'bid' : 'decline'} for ${rfx.number} from ${invitation.supplier.code}`,
    );
  }

  async close(actorId: ActorId, id: string): Promise<RfxEvent> {
    const rfx = await this.get(id);
    assertRfxTransition(rfx.status, 'CLOSED');
    await this.uow.run(async () => {
      await this.repo.transition(id, rfx.version, { status: 'CLOSED', closedAt: this.clock.now() });
      await this.record(
        actorId,
        'RFX_CLOSED',
        id,
        { status: rfx.status },
        { status: 'CLOSED' },
        {
          bids: rfx.bids.length,
          trigger: actorId ? 'manual' : 'deadline',
        },
      );
    });
    return this.get(id);
  }

  /** Job handler: close at the deadline unless someone already acted. */
  async closeIfDue(id: string): Promise<void> {
    const rfx = await this.repo.findById(id);
    if (rfx?.status === 'PUBLISHED' && this.clock.now() >= rfx.responseDeadline) {
      await this.close(null, id);
    }
  }

  async markEvaluated(actorId: string, id: string): Promise<RfxEvent> {
    const rfx = await this.get(id);
    assertRfxTransition(rfx.status, 'EVALUATED');
    await this.uow.run(async () => {
      await this.repo.transition(id, rfx.version, {
        status: 'EVALUATED',
        evaluatedAt: this.clock.now(),
      });
      await this.record(
        actorId,
        'RFX_EVALUATED',
        id,
        { status: rfx.status },
        { status: 'EVALUATED' },
      );
    });
    return this.get(id);
  }

  async award(actorId: string, id: string, input: Award): Promise<RfxEvent> {
    const rfx = await this.get(id);
    const decision = decideAward(rfx, input, this.clock.today());
    const awardedPrLines = new Set(decision.awards.map((a) => a.prLineId));
    const releasedPrLines = rfx.lines.map((l) => l.prLineId).filter((p) => !awardedPrLines.has(p));

    await this.uow.run(async () => {
      await this.repo.transition(id, rfx.version, {
        status: 'AWARDED',
        awardedAt: this.clock.now(),
        awardJustification: input.justification ?? null,
      });
      await this.repo.setAwards(decision.awards);
      await this.repo.setPrLineStatus([...awardedPrLines], 'AWARDED');
      // Lines nobody won go back to the sourcing backlog.
      await this.repo.setPrLineStatus(releasedPrLines, 'OPEN');
      await this.record(
        actorId,
        'RFX_AWARDED',
        id,
        { status: rfx.status },
        { status: 'AWARDED' },
        {
          awards: decision.awards,
          deviations: decision.deviations,
          justification: input.justification ?? null,
        },
      );
    });
    return this.get(id);
  }

  async cancel(actorId: string, id: string): Promise<RfxEvent> {
    const rfx = await this.get(id);
    assertRfxTransition(rfx.status, 'CANCELLED');
    await this.uow.run(async () => {
      await this.repo.transition(id, rfx.version, { status: 'CANCELLED' });
      await this.repo.setPrLineStatus(
        rfx.lines.map((l) => l.prLineId),
        'OPEN',
      );
      await this.record(
        actorId,
        'RFX_CANCELLED',
        id,
        { status: rfx.status },
        { status: 'CANCELLED' },
      );
    });
    return this.get(id);
  }

  private record(
    actorId: ActorId,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
    metadata?: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId,
      action,
      entityType: ENTITY,
      entityId: id,
      before,
      after,
      ...(metadata ? { metadata } : {}),
    });
  }
}
