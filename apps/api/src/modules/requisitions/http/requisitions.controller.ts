import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateRequisitionSchema,
  DecisionSchema,
  DoaLevelSchema,
  type Requisition as RequisitionDto,
  RequisitionListQuerySchema,
  RequisitionSchema,
  type RequisitionSummary,
  RequisitionSummarySchema,
  UpdateRequisitionSchema,
} from '@procurestack/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { WriteThrottle } from '../../../common/throttle.decorators';
import type { AuthPrincipal } from '../../auth/domain/user-account';
import { CurrentUser } from '../../auth/http/authenticated-request';
import { AnyAuthenticated, Roles } from '../../auth/http/decorators/access.decorators';
import { RequisitionService } from '../application/requisition.service';
import { pendingLevel, type Requisition } from '../domain/requisition';

class CreateRequisitionDto extends createZodDto(CreateRequisitionSchema) {}
class UpdateRequisitionDto extends createZodDto(UpdateRequisitionSchema) {}
class DecisionDto extends createZodDto(DecisionSchema) {}
class RequisitionListQueryDto extends createZodDto(RequisitionListQuerySchema) {}
class RequisitionResponseDto extends createZodDto(RequisitionSchema) {}
class RequisitionSummaryDto extends createZodDto(RequisitionSummarySchema) {}
class DoaLevelDto extends createZodDto(DoaLevelSchema) {}

const toSummary = (pr: Requisition): RequisitionSummary => ({
  id: pr.id,
  number: pr.number,
  status: pr.status,
  title: pr.title,
  requester: { id: pr.requesterId, fullName: pr.requesterName },
  costCenter: pr.costCenter,
  needByDate: pr.needByDate,
  totalCents: pr.totalCents,
  requiredLevels: pr.requiredLevels,
  pendingLevel: pendingLevel(pr),
  createdAt: pr.createdAt.toISOString(),
});

const toDto = (pr: Requisition): RequisitionDto => ({
  ...toSummary(pr),
  justification: pr.justification,
  approvalRound: pr.approvalRound,
  version: pr.version,
  submittedAt: pr.submittedAt?.toISOString() ?? null,
  decidedAt: pr.decidedAt?.toISOString() ?? null,
  lines: pr.lines,
  approvals: pr.approvals.map((a) => ({
    round: a.round,
    level: a.level,
    decision: a.decision,
    comment: a.comment,
    approver: { id: a.approverId, fullName: a.approverName },
    decidedAt: a.decidedAt.toISOString(),
  })),
});

/** Roles that may read PRs at all; the service narrows a pure requester to their own. */
const READERS = ['REQUESTER', 'APPROVER', 'BUYER', 'FINANCE', 'ADMIN'] as const;

@ApiTags('requisitions')
@ApiBearerAuth()
@Controller()
export class RequisitionsController {
  constructor(private readonly service: RequisitionService) {}

  @AnyAuthenticated()
  @Get('doa-levels')
  @ZodResponse({ type: [DoaLevelDto] })
  doaLevels() {
    return this.service.doaMatrix();
  }

  @Roles(...READERS)
  @Get('requisitions')
  @ZodResponse({ type: [RequisitionSummaryDto] })
  async list(@CurrentUser() user: AuthPrincipal, @Query() query: RequisitionListQueryDto) {
    return (await this.service.list(user, query)).map(toSummary);
  }

  @Roles(...READERS)
  @Get('requisitions/:id')
  @ZodResponse({ type: RequisitionResponseDto })
  async get(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return toDto(await this.service.get(user, id));
  }

  @Roles('REQUESTER')
  @WriteThrottle()
  @Post('requisitions')
  @ZodResponse({ status: 201, type: RequisitionResponseDto })
  async create(@CurrentUser() user: AuthPrincipal, @Body() body: CreateRequisitionDto) {
    return toDto(await this.service.create(user, body));
  }

  @Roles('REQUESTER')
  @WriteThrottle()
  @Put('requisitions/:id')
  @ZodResponse({ type: RequisitionResponseDto })
  async update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRequisitionDto,
  ) {
    return toDto(await this.service.update(user, id, body));
  }

  @Roles('REQUESTER')
  @WriteThrottle()
  @Post('requisitions/:id/submit')
  @HttpCode(200)
  @ZodResponse({ type: RequisitionResponseDto })
  async submit(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return toDto(await this.service.submit(user, id));
  }

  @Roles('REQUESTER')
  @WriteThrottle()
  @Post('requisitions/:id/cancel')
  @HttpCode(200)
  @ZodResponse({ type: RequisitionResponseDto })
  async cancel(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return toDto(await this.service.cancel(user, id));
  }

  /** Approve / reject / return the pending level. Authority + SoD are checked in the domain. */
  @Roles('APPROVER')
  @WriteThrottle()
  @Post('requisitions/:id/decision')
  @HttpCode(200)
  @ZodResponse({ type: RequisitionResponseDto })
  async decide(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecisionDto,
  ) {
    return toDto(await this.service.decide(user, id, body));
  }
}
