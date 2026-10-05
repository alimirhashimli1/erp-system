import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type GoodsReceipt as GoodsReceiptDto,
  GoodsReceiptQuerySchema,
  GoodsReceiptSchema,
  PostGoodsReceiptSchema,
} from '@procurestack/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { WriteThrottle } from '../../../common/throttle.decorators';
import type { AuthPrincipal } from '../../auth/domain/user-account';
import { CurrentUser } from '../../auth/http/authenticated-request';
import { Roles } from '../../auth/http/decorators/access.decorators';
import { ReceivingService } from '../application/receiving.service';
import type { GoodsReceipt } from '../domain/goods-receipt';

class PostGoodsReceiptDto extends createZodDto(PostGoodsReceiptSchema) {}
class GoodsReceiptQueryDto extends createZodDto(GoodsReceiptQuerySchema) {}
class GoodsReceiptResponseDto extends createZodDto(GoodsReceiptSchema) {}

const toDto = (gr: GoodsReceipt): GoodsReceiptDto => ({
  id: gr.id,
  number: gr.number,
  po: { id: gr.poId, number: gr.poNumber },
  supplier: gr.supplier,
  receivedBy: { id: gr.receivedById, fullName: gr.receivedByName },
  receivedAt: gr.receivedAt.toISOString(),
  deliveryNote: gr.deliveryNote,
  lines: gr.lines,
});

const READERS = ['WAREHOUSE', 'BUYER', 'FINANCE', 'ADMIN'] as const;

@ApiTags('receiving')
@ApiBearerAuth()
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly receiving: ReceivingService) {}

  @Roles(...READERS)
  @Get()
  @ZodResponse({ type: [GoodsReceiptResponseDto] })
  async list(@Query() query: GoodsReceiptQueryDto) {
    return (await this.receiving.list(query.poId)).map(toDto);
  }

  @Roles(...READERS)
  @Get(':id')
  @ZodResponse({ type: GoodsReceiptResponseDto })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toDto(await this.receiving.get(id));
  }

  /** Only the warehouse confirms deliveries (purchasing ≠ receiving). */
  @Roles('WAREHOUSE')
  @WriteThrottle()
  @Post()
  @ZodResponse({ status: 201, type: GoodsReceiptResponseDto })
  async post(@CurrentUser() user: AuthPrincipal, @Body() body: PostGoodsReceiptDto) {
    return toDto(await this.receiving.post(user.id, body));
  }
}
