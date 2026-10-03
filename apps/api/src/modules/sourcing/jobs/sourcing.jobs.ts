import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import type { Job, JobsOptions, Queue } from 'bullmq';
import { z } from 'zod';
import { CLOCK, type Clock } from '../../../common/clock';
import { DomainEvents, type DomainEventMap } from '../../../common/domain-events';
import { AppConfigService } from '../../../config/app-config.service';
import { SourcingService } from '../application/sourcing.service';
import { SourcingModule } from '../sourcing.module';

export const SOURCING_QUEUE = 'sourcing';

/** Job payloads come back from Redis: validate them like any other external input. */
const CloseRfxJob = z.object({ rfxId: z.uuid() });
const SimulateBidJob = z.object({ rfxId: z.uuid(), supplierId: z.uuid() });

/** Turns domain events into delayed, idempotent jobs (ADR 0008). */
@Injectable()
export class SourcingJobScheduler implements OnModuleInit {
  private readonly logger = new Logger(SourcingJobScheduler.name);

  constructor(
    @InjectQueue(SOURCING_QUEUE) private readonly queue: Queue,
    private readonly events: DomainEvents,
    private readonly config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    // Without a listener, connection errors surface as raw "unhandled error" stack traces.
    this.queue.on('error', (e) => {
      this.logger.warn(`Queue error: ${e.message}`);
    });
    this.events.on('rfx.published', (e) => this.onPublished(e));
  }

  async onPublished(e: DomainEventMap['rfx.published']): Promise<void> {
    const delay = Math.max(0, e.responseDeadline.getTime() - this.clock.now().getTime());
    // Deterministic jobId: re-publishing or a retried handler can't schedule a second close.
    await this.queue.add('close-rfx', { rfxId: e.rfxId }, this.opts(`close-${e.rfxId}`, delay));

    if (this.config.get('RFX_SIMULATE_SUPPLIERS')) {
      for (const [i, supplierId] of e.supplierIds.entries()) {
        await this.queue.add(
          'simulate-bid',
          { rfxId: e.rfxId, supplierId },
          this.opts(`bid-${e.rfxId}-${supplierId}`, 3_000 + i * 2_500),
        );
      }
    }
  }

  private opts(jobId: string, delay: number): JobsOptions {
    return { jobId, delay };
  }
}

@Processor(SOURCING_QUEUE)
export class SourcingProcessor extends WorkerHost {
  private readonly logger = new Logger(SourcingProcessor.name);

  constructor(private readonly sourcing: SourcingService) {
    super();
  }

  @OnWorkerEvent('error')
  onError(e: Error): void {
    this.logger.warn(`Worker error: ${e.message}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, e: Error): void {
    this.logger.error(`Job ${job?.name ?? '?'} (${job?.id ?? '?'}) failed: ${e.message}`);
  }

  async process(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case 'close-rfx':
        await this.sourcing.closeIfDue(CloseRfxJob.parse(job.data).rfxId);
        return;
      case 'simulate-bid': {
        const { rfxId, supplierId } = SimulateBidJob.parse(job.data);
        await this.sourcing.simulateSupplierResponse(rfxId, supplierId);
        return;
      }
      default:
        // Unknown job names fail loudly instead of being silently dropped.
        this.logger.error(`Unknown job ${job.name}`);
        throw new Error(`Unknown job ${job.name}`);
    }
  }
}

/** Loaded only when JOBS_ENABLED (see app.module.ts): needs Redis. */
@Module({
  imports: [
    BullModule.registerQueue({
      name: SOURCING_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    }),
    SourcingModule,
  ],
  providers: [SourcingJobScheduler, SourcingProcessor],
})
export class SourcingJobsModule {}
