import { Injectable } from '@nestjs/common';
import type {
  CostCenter,
  CreateCostCenter,
  CreateItem,
  CreateSupplier,
  Item,
  MasterDataQuery,
  Supplier,
  UpdateCostCenter,
  UpdateItem,
  UpdateSupplier,
} from '@procurestack/shared';
import { DomainError } from '../../../common/domain-error';
import { centsFromDb } from '../../../common/money';
import { Prisma, type Item as ItemRow } from '../../../generated/prisma/client';
import { PrismaTxHost } from '../../../infrastructure/prisma/prisma-tx-host';
import type {
  CostCenterRepository,
  ItemRepository,
  SupplierRepository,
} from '../application/ports';

/** Upper bound for unpaginated pick-lists; real pagination is a Phase 5 scale lesson. */
const LIST_LIMIT = 200;

/** P2002 = unique constraint violation → business-level "already exists" (409). */
async function uniqueOrConflict<T>(entity: string, key: string, op: Promise<T>): Promise<T> {
  try {
    return await op;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new DomainError(
        'conflict',
        `${entity.toUpperCase().replace(/ /g, '_')}_EXISTS`,
        `${entity} ${key} already exists`,
      );
    }
    throw e;
  }
}

/** Case-insensitive search across text columns; active records only unless asked. */
const searchWhere = (q: MasterDataQuery, columns: string[]) => ({
  ...(q.includeInactive ? {} : { isActive: true }),
  ...(q.q
    ? { OR: columns.map((c) => ({ [c]: { contains: q.q, mode: 'insensitive' as const } })) }
    : {}),
});

const supplierSelect = {
  id: true,
  code: true,
  name: true,
  countryCode: true,
  email: true,
  isActive: true,
} as const;

@Injectable()
export class PrismaSupplierRepository implements SupplierRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  list(q: MasterDataQuery): Promise<Supplier[]> {
    return this.tx.client.supplier.findMany({
      where: searchWhere(q, ['code', 'name']),
      orderBy: { code: 'asc' },
      take: LIST_LIMIT,
      select: supplierSelect,
    });
  }

  findById(id: string): Promise<Supplier | null> {
    return this.tx.client.supplier.findUnique({ where: { id }, select: supplierSelect });
  }

  create(input: CreateSupplier): Promise<Supplier> {
    return uniqueOrConflict(
      'Supplier',
      input.code,
      this.tx.client.supplier.create({ data: input, select: supplierSelect }),
    );
  }

  update(id: string, patch: UpdateSupplier): Promise<Supplier> {
    return this.tx.client.supplier.update({ where: { id }, data: patch, select: supplierSelect });
  }
}

const toItem = (r: ItemRow): Item => ({
  id: r.id,
  sku: r.sku,
  description: r.description,
  uom: r.uom,
  category: r.category,
  standardPriceCents: centsFromDb(r.standardPriceCents),
  isActive: r.isActive,
});

@Injectable()
export class PrismaItemRepository implements ItemRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  async list(q: MasterDataQuery): Promise<Item[]> {
    const rows = await this.tx.client.item.findMany({
      where: searchWhere(q, ['sku', 'description', 'category']),
      orderBy: { sku: 'asc' },
      take: LIST_LIMIT,
    });
    return rows.map(toItem);
  }

  async findById(id: string): Promise<Item | null> {
    const row = await this.tx.client.item.findUnique({ where: { id } });
    return row ? toItem(row) : null;
  }

  async create(input: CreateItem): Promise<Item> {
    const row = await uniqueOrConflict(
      'Item',
      input.sku,
      this.tx.client.item.create({
        data: { ...input, standardPriceCents: BigInt(input.standardPriceCents) },
      }),
    );
    return toItem(row);
  }

  async update(id: string, { standardPriceCents, ...rest }: UpdateItem): Promise<Item> {
    const row = await this.tx.client.item.update({
      where: { id },
      data: {
        ...rest,
        ...(standardPriceCents === undefined
          ? {}
          : { standardPriceCents: BigInt(standardPriceCents) }),
      },
    });
    return toItem(row);
  }
}

const costCenterSelect = { id: true, code: true, name: true, isActive: true } as const;

@Injectable()
export class PrismaCostCenterRepository implements CostCenterRepository {
  constructor(private readonly tx: PrismaTxHost) {}

  list(q: MasterDataQuery): Promise<CostCenter[]> {
    return this.tx.client.costCenter.findMany({
      where: searchWhere(q, ['code', 'name']),
      orderBy: { code: 'asc' },
      take: LIST_LIMIT,
      select: costCenterSelect,
    });
  }

  findById(id: string): Promise<CostCenter | null> {
    return this.tx.client.costCenter.findUnique({ where: { id }, select: costCenterSelect });
  }

  create(input: CreateCostCenter): Promise<CostCenter> {
    return uniqueOrConflict(
      'Cost center',
      input.code,
      this.tx.client.costCenter.create({ data: input, select: costCenterSelect }),
    );
  }

  update(id: string, patch: UpdateCostCenter): Promise<CostCenter> {
    return this.tx.client.costCenter.update({
      where: { id },
      data: patch,
      select: costCenterSelect,
    });
  }
}
