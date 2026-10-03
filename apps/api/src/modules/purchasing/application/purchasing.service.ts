import { Inject, Injectable } from '@nestjs/common';
import type { AcknowledgePo, CancelPo, CreatePosFromRfx, PoStatus } from '@procurestack/shared';
import { CLOCK, type Clock } from '../../../common/clock';
import {
  DOCUMENT_NUMBERS,
  type DocumentNumberGenerator,
} from '../../../common/document-number.port';
import { DomainError, notFound } from '../../../common/domain-error';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/unit-of-work';
import { AuditService } from '../../audit/audit.service';
import { RFX_REPOSITORY, type RfxRepository } from '../../sourcing/application/ports';
import {
  assertCanCancel,
  assertCanIssue,
  assertPoTransition,
  expectedDeliveryDate,
  planPurchaseOrders,
  type PurchaseOrder,
} from '../domain/purchase-order';
import { PURCHASE_ORDER_REPOSITORY, type PurchaseOrderRepository } from './ports';

const ENTITY = 'PurchaseOrder';

@Injectable()
export class PurchasingService {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly repo: PurchaseOrderRepository,
    @Inject(RFX_REPOSITORY) private readonly rfx: RfxRepository,
    @Inject(DOCUMENT_NUMBERS) private readonly numbers: DocumentNumberGenerator,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  list(status?: PoStatus): Promise<PurchaseOrder[]> {
    return this.repo.list(status ? { status } : {});
  }

  async get(id: string): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id);
    if (!po) throw notFound('Purchase order');
    return po;
  }

  /** Draft POs (one per winning supplier) for an awarded RFx's not-yet-ordered lines. */
  async createFromRfx(
    actorId: string,
    rfxId: string,
    input: CreatePosFromRfx,
  ): Promise<PurchaseOrder[]> {
    const rfx = await this.rfx.findById(rfxId);
    if (!rfx) throw notFound('RFx');
    if (rfx.status !== 'AWARDED') {
      throw new DomainError(
        'rule',
        'PO_RFX_NOT_AWARDED',
        'POs can only be created from an awarded RFx',
      );
    }
    const drafts = planPurchaseOrders(await this.repo.awardedLines(rfxId));

    const ids = await this.uow.run(async () => {
      const created: string[] = [];
      for (const draft of drafts) {
        const id = await this.repo.create({
          ...draft,
          number: await this.numbers.next('PO'),
          buyerId: actorId,
          rfxId,
          namedPlace: input.namedPlace,
        });
        await this.rfx.setPrLineStatus(
          draft.lines.map((l) => l.prLineId),
          'ORDERED',
        );
        await this.record(actorId, 'PO_CREATED', id, null, {
          status: 'DRAFT',
          supplierId: draft.supplierId,
          totalCents: draft.totalCents,
          rfxId,
        });
        created.push(id);
      }
      return created;
    });
    return Promise.all(ids.map((id) => this.get(id)));
  }

  /** Issuing commits money with the supplier: SoD + budget check, audited. */
  async issue(actorId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.get(id);
    assertCanIssue(po, actorId);
    const delivery = expectedDeliveryDate(this.clock.today(), po.leadTimeDays);
    await this.uow.run(async () => {
      await this.repo.transition(id, po.version, {
        status: 'ISSUED',
        issuedAt: this.clock.now(),
        expectedDeliveryDate: delivery,
      });
      await this.record(
        actorId,
        'PO_ISSUED',
        id,
        { status: po.status },
        {
          status: 'ISSUED',
          supplierId: po.supplier.id,
          totalCents: po.totalCents,
          expectedDeliveryDate: delivery,
        },
      );
    });
    return this.get(id);
  }

  /** Records the supplier's order confirmation and its promised delivery date. */
  async acknowledge(actorId: string, id: string, input: AcknowledgePo): Promise<PurchaseOrder> {
    const po = await this.get(id);
    assertPoTransition(po.status, 'ACKNOWLEDGED');
    await this.uow.run(async () => {
      await this.repo.transition(id, po.version, {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: this.clock.now(),
        expectedDeliveryDate: input.confirmedDeliveryDate,
      });
      await this.record(
        actorId,
        'PO_ACKNOWLEDGED',
        id,
        { status: po.status, expectedDeliveryDate: po.expectedDeliveryDate },
        { status: 'ACKNOWLEDGED', expectedDeliveryDate: input.confirmedDeliveryDate },
      );
    });
    return this.get(id);
  }

  async cancel(actorId: string, id: string, input: CancelPo): Promise<PurchaseOrder> {
    const po = await this.get(id);
    assertCanCancel(po);
    await this.uow.run(async () => {
      await this.repo.transition(id, po.version, {
        status: 'CANCELLED',
        cancelReason: input.reason,
      });
      await this.repo.releaseLines(id);
      // The need still exists: lines go back to the sourcing backlog.
      await this.rfx.setPrLineStatus(
        po.lines.map((l) => l.prLineId),
        'OPEN',
      );
      await this.record(
        actorId,
        'PO_CANCELLED',
        id,
        { status: po.status },
        {
          status: 'CANCELLED',
          reason: input.reason,
        },
      );
    });
    return this.get(id);
  }

  /** Close (also "short-close" a partially received PO: the rest will not come). */
  async close(actorId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.get(id);
    assertPoTransition(po.status, 'CLOSED');
    await this.uow.run(async () => {
      await this.repo.transition(id, po.version, { status: 'CLOSED', closedAt: this.clock.now() });
      await this.record(actorId, 'PO_CLOSED', id, { status: po.status }, { status: 'CLOSED' });
    });
    return this.get(id);
  }

  private record(actorId: string, action: string, id: string, before: unknown, after: unknown) {
    return this.audit.record({ actorId, action, entityType: ENTITY, entityId: id, before, after });
  }
}
