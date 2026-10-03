import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { Role } from '@procurestack/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { TokenService } from '../../src/modules/auth/application/token.service';

export interface TestUser {
  id: string;
  email: string;
  roles: Role[];
  token: string;
}

/**
 * The whole API against the integration database: real guards, pipes, services,
 * repositories and SQL. Only the rate limiter is neutralised (it has its own e2e test),
 * because a suite legitimately sends more writes per minute than a human would.
 */
export async function createHttpApp(customize?: (b: TestingModuleBuilder) => TestingModuleBuilder) {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: () =>
        Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
    });
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();

  const app: INestApplication<App> = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app as NestExpressApplication);
  await app.init();

  const prisma = moduleRef.get(PrismaService);
  const tokens = moduleRef.get(TokenService);

  /** Inserts a user with the given roles and returns a ready-to-use access token. */
  async function user(roles: Role[]): Promise<TestUser> {
    const email = `${roles.join('-').toLowerCase()}-${randomUUID()}@test.dev`;
    const row = await prisma.user.create({
      data: { email, fullName: `Test ${roles.join('/')}`, passwordHash: 'unused', roles },
    });
    const token = await tokens.signAccessToken({ ...row, roles: row.roles });
    return { id: row.id, email, roles, token };
  }

  /** Supertest request with the user's bearer token. */
  const as = (u: TestUser) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).auth(u.token, { type: 'bearer' }),
    post: (url: string, body?: object) =>
      request(app.getHttpServer()).post(url).auth(u.token, { type: 'bearer' }).send(body),
    put: (url: string, body?: object) =>
      request(app.getHttpServer()).put(url).auth(u.token, { type: 'bearer' }).send(body),
    patch: (url: string, body?: object) =>
      request(app.getHttpServer()).patch(url).auth(u.token, { type: 'bearer' }).send(body),
  });

  return { app, moduleRef, prisma, user, as, close: () => app.close() };
}

export type HttpApp = Awaited<ReturnType<typeof createHttpApp>>;

/** Short unique suffix for business keys (codes/SKUs must be unique across the suite). */
export const uniq = () => randomUUID().slice(0, 8).toUpperCase();
