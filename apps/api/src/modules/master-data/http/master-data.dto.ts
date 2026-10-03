import {
  CostCenterSchema,
  CreateCostCenterSchema,
  CreateItemSchema,
  CreateSupplierSchema,
  ItemSchema,
  MasterDataQuerySchema,
  SupplierSchema,
  UpdateCostCenterSchema,
  UpdateItemSchema,
  UpdateSupplierSchema,
} from '@procurestack/shared';
import { createZodDto } from 'nestjs-zod';

export class MasterDataQueryDto extends createZodDto(MasterDataQuerySchema) {}

export class SupplierDto extends createZodDto(SupplierSchema) {}
export class CreateSupplierDto extends createZodDto(CreateSupplierSchema) {}
export class UpdateSupplierDto extends createZodDto(UpdateSupplierSchema) {}

export class ItemDto extends createZodDto(ItemSchema) {}
export class CreateItemDto extends createZodDto(CreateItemSchema) {}
export class UpdateItemDto extends createZodDto(UpdateItemSchema) {}

export class CostCenterDto extends createZodDto(CostCenterSchema) {}
export class CreateCostCenterDto extends createZodDto(CreateCostCenterSchema) {}
export class UpdateCostCenterDto extends createZodDto(UpdateCostCenterSchema) {}
