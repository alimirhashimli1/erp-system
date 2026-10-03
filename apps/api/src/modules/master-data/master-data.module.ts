import { Module, type Provider } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../common/unit-of-work';
import { AuditService } from '../audit/audit.service';
import { CatalogService, type CatalogEntity } from './application/catalog.service';
import {
  COST_CENTER_REPOSITORY,
  COST_CENTER_SERVICE,
  type CatalogRepository,
  ITEM_REPOSITORY,
  ITEM_SERVICE,
  SUPPLIER_REPOSITORY,
  SUPPLIER_SERVICE,
} from './application/ports';
import {
  CostCentersController,
  ItemsController,
  SuppliersController,
} from './http/catalog.controllers';
import {
  PrismaCostCenterRepository,
  PrismaItemRepository,
  PrismaSupplierRepository,
} from './infrastructure/prisma-catalog.repositories';

/** One CatalogService instance per entity, wired to that entity's repository port. */
const catalogService = (token: symbol, repoToken: symbol, entity: CatalogEntity): Provider => ({
  provide: token,
  inject: [repoToken, UNIT_OF_WORK, AuditService],
  useFactory: (
    repo: CatalogRepository<{ id: string }, unknown, unknown>,
    uow: UnitOfWork,
    audit: AuditService,
  ) => new CatalogService(entity, repo, uow, audit),
});

@Module({
  controllers: [SuppliersController, ItemsController, CostCentersController],
  providers: [
    { provide: SUPPLIER_REPOSITORY, useClass: PrismaSupplierRepository },
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
    { provide: COST_CENTER_REPOSITORY, useClass: PrismaCostCenterRepository },
    catalogService(SUPPLIER_SERVICE, SUPPLIER_REPOSITORY, { type: 'Supplier', label: 'Supplier' }),
    catalogService(ITEM_SERVICE, ITEM_REPOSITORY, { type: 'Item', label: 'Item' }),
    catalogService(COST_CENTER_SERVICE, COST_CENTER_REPOSITORY, {
      type: 'CostCenter',
      label: 'Cost center',
    }),
  ],
  // Other bounded contexts (requisitions, sourcing…) look records up through these ports.
  exports: [SUPPLIER_REPOSITORY, ITEM_REPOSITORY, COST_CENTER_REPOSITORY],
})
export class MasterDataModule {}
