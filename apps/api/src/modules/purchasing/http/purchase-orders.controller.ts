import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AcknowledgePoSchema,
  CancelPoSchema,
  CreatePosFromRfxSchema,
  PoListQuerySchema,
  type PurchaseOrder as PurchaseOrderDto,
  PurchaseOrderSchema,
  type PurchaseOrderSummary,
  PurchaseOrderSummarySchema,
} from '@procurestack/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { WriteThrottle } from '../../../common/throttle.decorators';
import type { AuthPrincipal } from '../../auth/domain/user-account';
import { CurrentUser } from '../../auth/http/authenticated-request';
import { Roles } from '../../auth/http/decorators/access.decorators';
import { PurchasingService } from '../application/purchasing.service';
import type { PurchaseOrder } from '../domain/purchase-order';

class CreatePosFromRfxDto extends createZodDto(CreatePosFromRfxSchema) {}
class AcknowledgePoDto extends createZodDto(AcknowledgePoSchema) {}
class CancelPoDto extends createZodDto(CancelPoSchema) {}
class PoListQueryDto extends createZodDto(PoListQuerySchema) {}
class PurchaseOrderResponseDto extends createZodDto(PurchaseOrderSchema) {}
class PurchaseOrderSummaryDto extends createZodDto(PurchaseOrderSummarySchema) {}

const iso = (d: Date | null) => d?.toISOString() ?? null;

const toSummary = (po: PurchaseOrder): PurchaseOrderSummary => ({
  id: po.id,
  number: po.number,
  status: po.status,
  supplier: po.supplier,
  totalCents: po.totalCents,
  incoterm: po.incoterm,
  namedPlace: po.namedPlace,
  expectedDeliveryDate: po.expectedDeliveryDate,
  createdAt: po.createdAt.toISOString(),
});

export const toPurchaseOrderDto = (po: PurchaseOrder): PurchaseOrderDto => ({
  ...toSummary(po),
  rfx: { id: po.rfxId, number: po.rfxNumber },
  buyer: { id: po.buyerId, fullName: po.buyerName },
  leadTimeDays: po.leadTimeDays,
  version: po.version,
  issuedAt: iso(po.issuedAt),
  acknowledgedAt: iso(po.acknowledgedAt),
  closedAt: iso(po.closedAt),
  cancelReason: po.cancelReason,
  lines: po.lines.map(({ approvedUnitPriceCents: _budget, rfxBidLineId: _bid, ...l }) => l),
});

/** Warehouse needs open POs to receive against; finance to match invoices. */
const READERS = ['BUYER', 'WAREHOUSE', 'FINANCE', 'ADMIN'] as const;

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Roles(...READERS)
  @Get()
  @ZodResponse({ type: [PurchaseOrderSummaryDto] })
  async list(@Query() query: PoListQueryDto) {
    return (await this.purchasing.list(query.status)).map(toSummary);
  }

  @Roles(...READERS)
  @Get(':id')
  @ZodResponse({ type: PurchaseOrderResponseDto })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toPurchaseOrderDto(await this.purchasing.get(id));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('from-rfx/:rfxId')
  @ZodResponse({ status: 201, type: [PurchaseOrderResponseDto] })
  async createFromRfx(
    @CurrentUser() user: AuthPrincipal,
    @Param('rfxId', ParseUUIDPipe) rfxId: string,
    @Body() body: CreatePosFromRfxDto,
  ) {
    return (await this.purchasing.createFromRfx(user.id, rfxId, body)).map(toPurchaseOrderDto);
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post(':id/issue')
  @HttpCode(200)
  @ZodResponse({ type: PurchaseOrderResponseDto })
  async issue(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return toPurchaseOrderDto(await this.purchasing.issue(user.id, id));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post(':id/acknowledge')
  @HttpCode(200)
  @ZodResponse({ type: PurchaseOrderResponseDto })
  async acknowledge(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AcknowledgePoDto,
  ) {
    return toPurchaseOrderDto(await this.purchasing.acknowledge(user.id, id, body));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post(':id/cancel')
  @HttpCode(200)
  @ZodResponse({ type: PurchaseOrderResponseDto })
  async cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelPoDto,
  ) {
    return toPurchaseOrderDto(await this.purchasing.cancel(user.id, id, body));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post(':id/close')
  @HttpCode(200)
  @ZodResponse({ type: PurchaseOrderResponseDto })
  async close(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return toPurchaseOrderDto(await this.purchasing.close(user.id, id));
  }
}
