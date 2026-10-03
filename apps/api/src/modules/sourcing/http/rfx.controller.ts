import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AwardSchema,
  CreateRfxSchema,
  OpenPrLineSchema,
  type Rfx,
  RfxSchema,
  RfxStatusSchema,
  type RfxSummary,
  RfxSummarySchema,
  SubmitBidSchema,
} from '@procurestack/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { WriteThrottle } from '../../../common/throttle.decorators';
import type { AuthPrincipal } from '../../auth/domain/user-account';
import { CurrentUser } from '../../auth/http/authenticated-request';
import { Roles } from '../../auth/http/decorators/access.decorators';
import type { PrLineForSourcing } from '../application/ports';
import { SourcingService } from '../application/sourcing.service';
import { isSealed, type RfxEvent } from '../domain/rfx';

class CreateRfxDto extends createZodDto(CreateRfxSchema) {}
class SubmitBidDto extends createZodDto(SubmitBidSchema) {}
class AwardDto extends createZodDto(AwardSchema) {}
class RfxListQueryDto extends createZodDto(z.object({ status: RfxStatusSchema.optional() })) {}
class RfxDto extends createZodDto(RfxSchema) {}
class RfxSummaryDto extends createZodDto(RfxSummarySchema) {}
class OpenPrLineDto extends createZodDto(OpenPrLineSchema) {}

const iso = (d: Date | null) => d?.toISOString() ?? null;

const toSummary = (r: RfxEvent): RfxSummary => ({
  id: r.id,
  number: r.number,
  type: r.type,
  title: r.title,
  status: r.status,
  buyer: { id: r.buyerId, fullName: r.buyerName },
  responseDeadline: r.responseDeadline.toISOString(),
  invitedCount: r.invitations.length,
  respondedCount: r.invitations.filter((i) => i.status === 'RESPONDED').length,
  createdAt: r.createdAt.toISOString(),
});

const toOpenLine = (l: PrLineForSourcing) => ({
  prLineId: l.prLineId,
  requisitionId: l.requisitionId,
  prNumber: l.prNumber,
  lineNo: l.lineNo,
  itemId: l.itemId,
  sku: l.sku,
  description: l.description,
  uom: l.uom,
  quantity: l.quantity,
  estimatedUnitPriceCents: l.unitPriceCents,
  needByDate: l.needByDate,
});

/** Procurement owns sourcing; finance and admin may look (spend visibility, audit). */
const READERS = ['BUYER', 'FINANCE', 'ADMIN'] as const;

@ApiTags('sourcing')
@ApiBearerAuth()
@Controller()
export class RfxController {
  constructor(private readonly sourcing: SourcingService) {}

  private toDto(r: RfxEvent): Rfx {
    const sealed = isSealed(r);
    return {
      ...toSummary(r),
      version: r.version,
      publishedAt: iso(r.publishedAt),
      closedAt: iso(r.closedAt),
      evaluatedAt: iso(r.evaluatedAt),
      awardedAt: iso(r.awardedAt),
      awardJustification: r.awardJustification,
      sealed,
      lines: r.lines,
      invitations: r.invitations.map((i) => ({ ...i, respondedAt: iso(i.respondedAt) })),
      // Sealed-bid rule enforced at the API edge: contents leave the server only after close.
      bids: sealed ? [] : r.bids.map((b) => ({ ...b, submittedAt: b.submittedAt.toISOString() })),
      evaluation: this.sourcing.evaluation(r),
    };
  }

  @Roles('BUYER')
  @Get('sourcing/open-pr-lines')
  @ZodResponse({ type: [OpenPrLineDto] })
  async openPrLines() {
    return (await this.sourcing.openPrLines()).map(toOpenLine);
  }

  @Roles(...READERS)
  @Get('rfx')
  @ZodResponse({ type: [RfxSummaryDto] })
  async list(@Query() query: RfxListQueryDto) {
    return (await this.sourcing.list(query.status)).map(toSummary);
  }

  @Roles(...READERS)
  @Get('rfx/:id')
  @ZodResponse({ type: RfxDto })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.toDto(await this.sourcing.get(id));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('rfx')
  @ZodResponse({ status: 201, type: RfxDto })
  async create(@CurrentUser() user: AuthPrincipal, @Body() body: CreateRfxDto) {
    return this.toDto(await this.sourcing.create(user.id, body));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('rfx/:id/bids')
  @HttpCode(200)
  @ZodResponse({ type: RfxDto })
  async submitBid(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitBidDto,
  ) {
    return this.toDto(await this.sourcing.submitBid(user.id, id, body));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('rfx/:id/award')
  @HttpCode(200)
  @ZodResponse({ type: RfxDto })
  async award(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AwardDto,
  ) {
    return this.toDto(await this.sourcing.award(user.id, id, body));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('rfx/:id/publish')
  @HttpCode(200)
  @ZodResponse({ type: RfxDto })
  async publish(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.toDto(await this.sourcing.publish(user.id, id));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('rfx/:id/close')
  @HttpCode(200)
  @ZodResponse({ type: RfxDto })
  async close(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.toDto(await this.sourcing.close(user.id, id));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('rfx/:id/evaluate')
  @HttpCode(200)
  @ZodResponse({ type: RfxDto })
  async evaluate(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.toDto(await this.sourcing.markEvaluated(user.id, id));
  }

  @Roles('BUYER')
  @WriteThrottle()
  @Post('rfx/:id/cancel')
  @HttpCode(200)
  @ZodResponse({ type: RfxDto })
  async cancel(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.toDto(await this.sourcing.cancel(user.id, id));
  }
}
