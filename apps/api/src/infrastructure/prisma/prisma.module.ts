import { Global, Module } from '@nestjs/common';
import { DOCUMENT_NUMBERS } from '../../common/document-number.port';
import { UNIT_OF_WORK } from '../../common/unit-of-work';
import { PrismaDocumentNumbers } from './prisma-document-numbers';
import { PrismaService } from './prisma.service';
import { PrismaTxHost } from './prisma-tx-host';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaTxHost,
    { provide: UNIT_OF_WORK, useExisting: PrismaTxHost },
    { provide: DOCUMENT_NUMBERS, useClass: PrismaDocumentNumbers },
  ],
  exports: [PrismaService, PrismaTxHost, UNIT_OF_WORK, DOCUMENT_NUMBERS],
})
export class PrismaModule {}
