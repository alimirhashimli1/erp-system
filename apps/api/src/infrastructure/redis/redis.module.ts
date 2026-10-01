import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Redis } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Shared Redis connection (health checks, later caching) + BullMQ root config.
 * Queues are registered per module (BullModule.registerQueue) from Phase 1 on.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: { url: config.get('REDIS_URL'), maxRetriesPerRequest: null },
      }),
    }),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const client = new Redis(config.get('REDIS_URL'), {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
        // Without a listener ioredis prints raw stack traces to stderr on every retry.
        const logger = new Logger('Redis');
        client.on('error', (e: Error) => {
          logger.warn(`Redis connection error: ${e.message}`);
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT, BullModule],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
  }
}
