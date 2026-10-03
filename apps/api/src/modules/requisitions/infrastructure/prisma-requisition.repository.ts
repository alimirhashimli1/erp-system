import { Injectable } from '@nestjs/common';
import type { DoaLevel, PrStatus } from '@procurestack/shared';
import { DomainError, staleWrite } from '../../../common/domain-error';
import { centsFromDb, quantityFromDb } from '../../../common/money';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTxHost } from '../../../infrastructure/prisma/prisma-tx-host';
import type {
  ApproverDirectory,
  DoaMatrix,
  RequisitionContent,
  RequisitionRepository,
  StatusPatch,
} from '../application/ports';
import type { PricedLine, Requisition } from '../domain/requisition';

const LIST_LIMIT = 200;

const include = {
  requester: { select: { fullName: true } },
  costCenter: { select: { id: true, code: true, name: true } },
  lines: { orderBy: { lineNo: 'asc' }, include: { item: { select: { sku: true } } } },
  approvals: {
    orderBy: [{ round: 'asc' }, { level: 'asc' }],
    include: { approver: { select: { fullName: true } } },
  },
} satisfies Prisma.PurchaseRequisitionInclude;

type Row = Prisma.PurchaseRequisitionGetPayload<{ include: typeof include }>;

/** `@db.Date` round-trips as UTC midnight. */
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);

const toDomain = (r: Row): Requisition => ({
  id: r.id,
  number: r.number,
  status: r.status,
  title: r.title,
  justification: r.justification,
  requesterId: r.requesterId,
  requesterName: r.requester.fullName,
  costCenter: r.costCenter,
  needByDate: fromDate(r.needByDate),
  totalCents: centsFromDb(r.totalCents),
  requiredLevels: r.requiredLevels,
  approvalRound: r.approvalRound,
  version: r.version,
  submittedAt: r.submittedAt,
  decidedAt: r.decidedAt,
  createdAt: r.createdAt,
  lines: r.lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    itemId: l.itemId,
    sku: l.item.sku,
    description: l.description,
    uom: l.uom,
    quantity: quantityFromDb(l.quantity),
    unitPriceCents: centsFromDb(l.unitPriceCents),
    lineTotalCents: centsFromDb(l.lineTotalCents),
  })),
  approvals: r.approvals.map((a) => ({
    round: a.round,
    level: a.level,
    approverId: a.approverId,
    approverName: a.approver.fullName,
    decision: a.decision,
    comment: a.comment,
    decidedAt: a.decidedAt,
  })),
});

const lineData = (lines: PricedLine[]) =>
  lines.map((l) => ({
    lineNo: l.lineNo,
    itemId: l.itemId,
    description: l.description,
    uom: l.uom,
    // String keeps NUMERIC exact (no float → decimal surprises).
    quantity: new Prisma.Decimal(l.quantity.toString()),
    unitPriceCents: BigInt(l.unitPriceCents),
    lineTotalCents: BigInt(l.lineTotalCents),
  }));

@Injectable()
export class PrismaRequisitionRepository implements RequisitionRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  async findById(id: string): Promise<Requisition | null> {
    const row = await this.tx.client.purchaseRequisition.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async list(filter: { requesterId?: string; status?: PrStatus }): Promise<Requisition[]> {
    const rows = await this.tx.client.purchaseRequisition.findMany({
      where: filter,
      include,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toDomain);
  }

  async create(
    input: RequisitionContent & { number: string; requesterId: string },
  ): Promise<string> {
    const row = await this.tx.client.purchaseRequisition.create({
      data: {
        number: input.number,
        requesterId: input.requesterId,
        costCenterId: input.costCenterId,
        title: input.title,
        justification: input.justification,
        needByDate: toDate(input.needByDate),
        totalCents: BigInt(input.totalCents),
        lines: { create: lineData(input.lines) },
      },
      select: { id: true },
    });
    return row.id;
  }

  async replaceContent(id: string, expectedVersion: number, c: RequisitionContent): Promise<void> {
    const { count } = await this.tx.client.purchaseRequisition.updateMany({
      where: { id, version: expectedVersion },
      data: {
        costCenterId: c.costCenterId,
        title: c.title,
        justification: c.justification,
        needByDate: toDate(c.needByDate),
        totalCents: BigInt(c.totalCents),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw staleWrite('Requisition');
    await this.tx.client.prLine.deleteMany({ where: { requisitionId: id } });
    await this.tx.client.prLine.createMany({
      data: lineData(c.lines).map((l) => ({ ...l, requisitionId: id })),
    });
  }

  async transition(id: string, expectedVersion: number, patch: StatusPatch): Promise<void> {
    const { count } = await this.tx.client.purchaseRequisition.updateMany({
      where: { id, version: expectedVersion },
      data: { ...patch, version: { increment: 1 } },
    });
    if (count === 0) throw staleWrite('Requisition');
  }

  async addApproval(
    id: string,
    a: Parameters<RequisitionRepository['addApproval']>[1],
  ): Promise<void> {
    try {
      await this.tx.client.prApproval.create({ data: { requisitionId: id, ...a } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new DomainError(
          'conflict',
          'PR_LEVEL_ALREADY_DECIDED',
          'This level was just decided',
        );
      }
      throw e;
    }
  }
}

@Injectable()
export class PrismaDoaMatrix implements DoaMatrix {
  constructor(private readonly tx: PrismaTxHost) {}

  async load(): Promise<DoaLevel[]> {
    const rows = await this.tx.client.doaLevel.findMany({ orderBy: { level: 'asc' } });
    return rows.map((r) => ({
      level: r.level,
      name: r.name,
      maxAmountCents: r.maxAmountCents === null ? null : centsFromDb(r.maxAmountCents),
    }));
  }
}

@Injectable()
export class PrismaApproverDirectory implements ApproverDirectory {
  constructor(private readonly tx: PrismaTxHost) {}

  async approvalLevelOf(userId: string): Promise<number | null> {
    const user = await this.tx.client.user.findUnique({
      where: { id: userId },
      select: { approvalLevel: true, isActive: true },
    });
    return user?.isActive ? user.approvalLevel : null;
  }
}
