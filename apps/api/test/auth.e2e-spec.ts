import { Controller, Get, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { AUDIT_LOG_REPOSITORY } from '../src/modules/audit/audit-log.port';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../src/modules/auth/application/ports';
import { Roles } from '../src/modules/auth/http/decorators/access.decorators';
import {
  FakePasswordHasher,
  InMemoryAuditLogRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  makeUser,
} from './fakes/in-memory-auth';

// Probe routes that exist only in this test, to exercise the global guards end to end.
@Controller('probe')
class ProbeController {
  @Roles('FINANCE') @Get('finance') finance() {
    return { ok: true };
  }

  @Get('forgotten') forgotten() {
    return { ok: true };
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const buyer = makeUser();
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(USER_REPOSITORY)
      .useValue(new InMemoryUserRepository([buyer]))
      .overrideProvider(REFRESH_TOKEN_REPOSITORY)
      .useValue(new InMemoryRefreshTokenRepository())
      .overrideProvider(AUDIT_LOG_REPOSITORY)
      .useValue(new InMemoryAuditLogRepository())
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new FakePasswordHasher())
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();

    const res = await login().expect(200);
    accessToken = (res.body as { accessToken: string }).accessToken;
  });

  afterAll(() => app.close());

  const login = (password = 'correct-password') =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'BUYER@procurestack.dev', password });

  it('GET /api/health/live is public', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);
  });

  it('sets security headers (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects an invalid body with 400 before reaching the service', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('email');
  });

  it('rejects wrong credentials with 401', async () => {
    await login('wrong').expect(401);
  });

  it('logs in, sets an httpOnly path-scoped refresh cookie, and never returns the hash', async () => {
    const res = await login().expect(200);
    expect(res.body).toMatchObject({ expiresIn: 900, user: { id: buyer.id, roles: ['BUYER'] } });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/ps_rt=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('GET /api/auth/me requires a valid bearer token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer garbage')
      .expect(401);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).toEqual({
      id: buyer.id,
      email: buyer.email,
      fullName: buyer.fullName,
      roles: ['BUYER'],
    });
  });

  it('refresh rotates the cookie; replaying the old cookie is rejected', async () => {
    const first = await login().expect(200);
    const oldCookie = first.headers['set-cookie'] as unknown as string[];

    const second = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(200);
    expect(String(second.headers['set-cookie'])).not.toEqual(String(oldCookie));

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(401);
  });

  it('enforces roles: BUYER calling a FINANCE route gets 403', async () => {
    await request(app.getHttpServer())
      .get('/api/probe/finance')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('denies a route that forgot to declare an access policy (fail closed)', async () => {
    await request(app.getHttpServer())
      .get('/api/probe/forgotten')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  // Runs last: /login was hit 5 times above (incl. the 400 — throttling runs before
  // validation, so malformed floods are limited too). The 6th call in the window is refused.
  it('throttles login after 5 attempts per minute (brute-force brake)', async () => {
    await login('wrong').expect(429);
  });
});
