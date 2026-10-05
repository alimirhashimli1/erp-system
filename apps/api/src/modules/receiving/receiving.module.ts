import { Module } from '@nestjs/common';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { ReceivingService } from './application/receiving.service';
import { GoodsReceiptsController } from './http/goods-receipts.controller';
import {
  GOODS_RECEIPT_REPOSITORY,
  PrismaGoodsReceiptRepository,
} from './infrastructure/prisma-goods-receipt.repository';

@Module({
  imports: [PurchasingModule],
  controllers: [GoodsReceiptsController],
  providers: [
    ReceivingService,
    { provide: GOODS_RECEIPT_REPOSITORY, useClass: PrismaGoodsReceiptRepository },
  ],
  exports: [GOODS_RECEIPT_REPOSITORY],
})
export class ReceivingModule {}
