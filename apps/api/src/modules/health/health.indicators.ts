import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';

const TIMEOUT_MS = 1500;

const withTimeout = <T>(p: Promise<T>): Promise<T> =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error('timeout'));
      }, TIMEOUT_MS),
    ),
  ]);

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async check(key: string) {
    const indicator = this.indicators.check(key);
    try {
      // Tagged template = parameterized query; no user input involved anyway.
      await withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return indicator.up();
    } catch {
      return indicator.down('unreachable');
    }
  }
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async check(key: string) {
    const indicator = this.indicators.check(key);
    try {
      await withTimeout(this.redis.ping());
      return indicator.up();
    } catch {
      return indicator.down('unreachable');
    }
  }
}
