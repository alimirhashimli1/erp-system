import { Module } from '@nestjs/common';
import { SourcingModule } from '../sourcing/sourcing.module';
import { PURCHASE_ORDER_REPOSITORY } from './application/ports';
import { PurchasingService } from './application/purchasing.service';
import { PurchaseOrdersController } from './http/purchase-orders.controller';
import { PrismaPurchaseOrderRepository } from './infrastructure/prisma-purchase-order.repository';

@Module({
  imports: [SourcingModule],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchasingService,
    { provide: PURCHASE_ORDER_REPOSITORY, useClass: PrismaPurchaseOrderRepository },
  ],
  // Receiving and invoicing update PO quantities/status through these.
  exports: [PurchasingService, PURCHASE_ORDER_REPOSITORY],
})
export class PurchasingModule {}
