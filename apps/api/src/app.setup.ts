import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppConfigService } from './config/app-config.service';

export const API_PREFIX = 'api';
const DOCS_PATH = `${API_PREFIX}/docs`;

/** HTTP hardening shared by main.ts and the e2e tests, so tests exercise the real stack. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  // Only trust X-Forwarded-For from private-network proxies (the nginx container),
  // so rate limiting keys on the real client IP and clients can't spoof it.
  app.set('trust proxy', 'loopback, uniquelocal');

  const strict = helmet();
  // Swagger UI needs inline scripts/styles; relax CSP for the docs page only.
  const docs = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const middleware = req.path.startsWith(`/${DOCS_PATH}`) ? docs : strict;
    middleware(req, res, next);
  });

  app.use(cookieParser());
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  app.setGlobalPrefix(API_PREFIX);
}

export function setupSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ProcureStack API')
      .setDescription('Procure-to-Pay ERP — learning project')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, cleanupOpenApiDoc(document));
}
