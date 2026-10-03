import { Module } from '@nestjs/common';
import { MasterDataModule } from '../master-data/master-data.module';
import { APPROVER_DIRECTORY, DOA_MATRIX, REQUISITION_REPOSITORY } from './application/ports';
import { RequisitionService } from './application/requisition.service';
import { RequisitionsController } from './http/requisitions.controller';
import {
  PrismaApproverDirectory,
  PrismaDoaMatrix,
  PrismaRequisitionRepository,
} from './infrastructure/prisma-requisition.repository';

@Module({
  imports: [MasterDataModule],
  controllers: [RequisitionsController],
  providers: [
    RequisitionService,
    { provide: REQUISITION_REPOSITORY, useClass: PrismaRequisitionRepository },
    { provide: DOA_MATRIX, useClass: PrismaDoaMatrix },
    { provide: APPROVER_DIRECTORY, useClass: PrismaApproverDirectory },
  ],
  exports: [REQUISITION_REPOSITORY],
})
export class RequisitionsModule {}
