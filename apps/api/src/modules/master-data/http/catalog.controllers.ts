import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { WriteThrottle } from '../../../common/throttle.decorators';
import { CurrentUser } from '../../auth/http/authenticated-request';
import { AnyAuthenticated, Roles } from '../../auth/http/decorators/access.decorators';
import type { AuthPrincipal } from '../../auth/domain/user-account';
import {
  COST_CENTER_SERVICE,
  type CostCenterService,
  ITEM_SERVICE,
  type ItemService,
  SUPPLIER_SERVICE,
  type SupplierService,
} from '../application/ports';
import {
  CostCenterDto,
  CreateCostCenterDto,
  CreateItemDto,
  CreateSupplierDto,
  ItemDto,
  MasterDataQueryDto,
  SupplierDto,
  UpdateCostCenterDto,
  UpdateItemDto,
  UpdateSupplierDto,
} from './master-data.dto';

/*
 * Reads are open to every signed-in user: all roles pick suppliers, items and cost
 * centers on their documents. Writes follow data ownership:
 *   suppliers, items → procurement (BUYER) · cost centers → controlling (FINANCE).
 * ADMIN may maintain all three — master data is an admin duty, unlike approvals/payments.
 */

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(@Inject(SUPPLIER_SERVICE) private readonly service: SupplierService) {}

  @AnyAuthenticated()
  @Get()
  @ZodResponse({ type: [SupplierDto] })
  list(@Query() query: MasterDataQueryDto) {
    return this.service.list(query);
  }

  @AnyAuthenticated()
  @Get(':id')
  @ZodResponse({ type: SupplierDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Roles('BUYER', 'ADMIN')
  @WriteThrottle()
  @Post()
  @ZodResponse({ status: 201, type: SupplierDto })
  create(@CurrentUser() user: AuthPrincipal, @Body() body: CreateSupplierDto) {
    return this.service.create(user.id, body);
  }

  @Roles('BUYER', 'ADMIN')
  @WriteThrottle()
  @Patch(':id')
  @ZodResponse({ type: SupplierDto })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplierDto,
  ) {
    return this.service.update(user.id, id, body);
  }
}

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(@Inject(ITEM_SERVICE) private readonly service: ItemService) {}

  @AnyAuthenticated()
  @Get()
  @ZodResponse({ type: [ItemDto] })
  list(@Query() query: MasterDataQueryDto) {
    return this.service.list(query);
  }

  @AnyAuthenticated()
  @Get(':id')
  @ZodResponse({ type: ItemDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Roles('BUYER', 'ADMIN')
  @WriteThrottle()
  @Post()
  @ZodResponse({ status: 201, type: ItemDto })
  create(@CurrentUser() user: AuthPrincipal, @Body() body: CreateItemDto) {
    return this.service.create(user.id, body);
  }

  @Roles('BUYER', 'ADMIN')
  @WriteThrottle()
  @Patch(':id')
  @ZodResponse({ type: ItemDto })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.service.update(user.id, id, body);
  }
}

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('cost-centers')
export class CostCentersController {
  constructor(@Inject(COST_CENTER_SERVICE) private readonly service: CostCenterService) {}

  @AnyAuthenticated()
  @Get()
  @ZodResponse({ type: [CostCenterDto] })
  list(@Query() query: MasterDataQueryDto) {
    return this.service.list(query);
  }

  @AnyAuthenticated()
  @Get(':id')
  @ZodResponse({ type: CostCenterDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Roles('FINANCE', 'ADMIN')
  @WriteThrottle()
  @Post()
  @ZodResponse({ status: 201, type: CostCenterDto })
  create(@CurrentUser() user: AuthPrincipal, @Body() body: CreateCostCenterDto) {
    return this.service.create(user.id, body);
  }

  @Roles('FINANCE', 'ADMIN')
  @WriteThrottle()
  @Patch(':id')
  @ZodResponse({ type: CostCenterDto })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCostCenterDto,
  ) {
    return this.service.update(user.id, id, body);
  }
}
