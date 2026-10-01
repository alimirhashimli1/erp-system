import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/http/decorators/access.decorators';
import { DatabaseHealthIndicator, RedisHealthIndicator } from './health.indicators';

/**
 * Two probes, two questions (Kubernetes/Compose convention):
 * - live:  is the process up? (no dependencies — a DB outage must not trigger restarts)
 * - ready: can it serve traffic right now? (DB + Redis reachable)
 */
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.check('database'), () => this.redis.check('redis')]);
  }
}
