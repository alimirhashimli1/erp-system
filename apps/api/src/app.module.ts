import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConditionalModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module';
import { DomainErrorFilter } from './common/domain-error.filter';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { SourcingJobsModule } from './modules/sourcing/jobs/sourcing.jobs';
import { SourcingModule } from './modules/sourcing/sourcing.module';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          // Correlation id: reuse the caller's (if well-formed) so one id follows a request
          // across services; echo it back so users can quote it in bug reports.
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const incoming = req.headers['x-request-id'];
            const id =
              typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
                ? incoming
                : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          // Log an allow-list of fields — headers (tokens, cookies) and bodies never get in.
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url?.startsWith('/api/health') ?? false,
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    HealthModule,
    MasterDataModule,
    RequisitionsModule,
    SourcingModule,
    PurchasingModule,
    // Queues + workers need Redis; tests and Redis-less runs set JOBS_ENABLED=false (ADR 0008).
    ConditionalModule.registerWhen(SourcingJobsModule, (env) => env['JOBS_ENABLED'] !== 'false'),
  ],
  providers: [
    // Throttle first so floods are rejected before any token/DB work happens.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Strips any field not in the declared response schema (e.g. passwordHash) — defense in depth.
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    // Business-rule errors (DomainError) → 404/403/409/422, see ADR 0006.
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
