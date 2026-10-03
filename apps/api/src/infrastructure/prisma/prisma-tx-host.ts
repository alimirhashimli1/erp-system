import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { UnitOfWork } from '../../common/unit-of-work';
import { PrismaService } from './prisma.service';

/**
 * Ambient transaction (ADR 0006). Repositories always use `client`: inside `run` that is
 * the open transaction, outside it is the pooled client. No Prisma leaks into services.
 */
@Injectable()
export class PrismaTxHost implements UnitOfWork {
  private readonly als = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaService) {}

  get client(): Prisma.TransactionClient {
    return this.als.getStore() ?? this.prisma;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.als.getStore()) return fn(); // nested unit joins the outer transaction
    return this.prisma.$transaction((tx) => this.als.run(tx, fn), { timeout: 10_000 });
  }
}
