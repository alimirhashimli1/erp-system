import { Module } from '@nestjs/common';
import { MasterDataModule } from '../master-data/master-data.module';
import { RFX_REPOSITORY } from './application/ports';
import { SourcingService } from './application/sourcing.service';
import { RfxController } from './http/rfx.controller';
import { PrismaRfxRepository } from './infrastructure/prisma-rfx.repository';

@Module({
  imports: [MasterDataModule],
  controllers: [RfxController],
  providers: [SourcingService, { provide: RFX_REPOSITORY, useClass: PrismaRfxRepository }],
  exports: [SourcingService, RFX_REPOSITORY],
})
export class SourcingModule {}
