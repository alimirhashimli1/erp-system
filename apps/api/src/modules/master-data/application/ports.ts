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
import type { CatalogService } from './catalog.service';

/**
 * One port shape for every catalog-style master record. Adapters must turn a
 * duplicate business key into `DomainError('conflict')`, never leak a Prisma error.
 */
export interface CatalogRepository<T, TCreate, TUpdate> {
  list(query: MasterDataQuery): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(input: TCreate): Promise<T>;
  update(id: string, patch: TUpdate): Promise<T>;
}

export type SupplierRepository = CatalogRepository<Supplier, CreateSupplier, UpdateSupplier>;
export type ItemRepository = CatalogRepository<Item, CreateItem, UpdateItem>;
export type CostCenterRepository = CatalogRepository<
  CostCenter,
  CreateCostCenter,
  UpdateCostCenter
>;

export type SupplierService = CatalogService<Supplier, CreateSupplier, UpdateSupplier>;
export type ItemService = CatalogService<Item, CreateItem, UpdateItem>;
export type CostCenterService = CatalogService<CostCenter, CreateCostCenter, UpdateCostCenter>;

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');
export const ITEM_REPOSITORY = Symbol('ITEM_REPOSITORY');
export const COST_CENTER_REPOSITORY = Symbol('COST_CENTER_REPOSITORY');
export const SUPPLIER_SERVICE = Symbol('SUPPLIER_SERVICE');
export const ITEM_SERVICE = Symbol('ITEM_SERVICE');
export const COST_CENTER_SERVICE = Symbol('COST_CENTER_SERVICE');
