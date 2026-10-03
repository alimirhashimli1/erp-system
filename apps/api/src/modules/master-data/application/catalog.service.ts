import type { MasterDataQuery } from '@procurestack/shared';
import { DomainError } from '../../../common/domain-error';
import type { UnitOfWork } from '../../../common/unit-of-work';
import type { AuditService } from '../../audit/audit.service';
import type { CatalogRepository } from './ports';

export interface CatalogEntity {
  /** Audit `entityType` and action prefix, e.g. `CostCenter` → `COST_CENTER_UPDATED`. */
  type: string;
  /** Human label for error messages, e.g. "Cost center". */
  label: string;
}

/**
 * Use cases shared by suppliers, items and cost centers: list, read, create, update.
 * Every change is audited in the same transaction — master-data governance: "who changed
 * this supplier's e-mail, and when?" is a classic payment-fraud question.
 */
export class CatalogService<T extends { id: string }, TCreate, TUpdate> {
  private readonly actionPrefix: string;

  constructor(
    private readonly entity: CatalogEntity,
    private readonly repo: CatalogRepository<T, TCreate, TUpdate>,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {
    this.actionPrefix = entity.type.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
  }

  list(query: MasterDataQuery): Promise<T[]> {
    return this.repo.list(query);
  }

  async get(id: string): Promise<T> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw new DomainError(
        'not_found',
        `${this.actionPrefix}_NOT_FOUND`,
        `${this.entity.label} not found`,
      );
    }
    return record;
  }

  create(actorId: string, input: TCreate): Promise<T> {
    return this.uow.run(async () => {
      const created = await this.repo.create(input);
      await this.record(actorId, 'CREATED', created.id, null, created);
      return created;
    });
  }

  update(actorId: string, id: string, patch: TUpdate): Promise<T> {
    return this.uow.run(async () => {
      const before = await this.get(id);
      const after = await this.repo.update(id, patch);
      await this.record(actorId, 'UPDATED', id, before, after);
      return after;
    });
  }

  private record(actorId: string, verb: string, id: string, before: unknown, after: unknown) {
    return this.audit.record({
      actorId,
      action: `${this.actionPrefix}_${verb}`,
      entityType: this.entity.type,
      entityId: id,
      before,
      after,
    });
  }
}
