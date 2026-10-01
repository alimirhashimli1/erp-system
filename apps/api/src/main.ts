import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './app.setup';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  configureApp(app);
  const config = app.get(AppConfigService);
  if (config.get('SWAGGER_ENABLED')) setupSwagger(app);

  // Lets Prisma/Redis close cleanly on SIGTERM (docker stop, rolling deploys).
  app.enableShutdownHooks();
  await app.listen(config.get('PORT'), '0.0.0.0');
}

void bootstrap();
