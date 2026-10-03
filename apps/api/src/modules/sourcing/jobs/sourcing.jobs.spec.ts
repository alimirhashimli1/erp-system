import type { Job, Queue } from 'bullmq';
import { DomainEvents } from '../../../common/domain-events';
import type { AppConfigService } from '../../../config/app-config.service';
import type { SourcingService } from '../application/sourcing.service';
import { SourcingJobScheduler, SourcingProcessor } from './sourcing.jobs';

const RFX = '11111111-1111-4111-8111-111111111111';
const SUP_A = '22222222-2222-4222-8222-222222222222';
const SUP_B = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-01T12:00:00Z');

function setup(simulate: boolean) {
  const queue = {
    add: jest
      .fn<Promise<void>, [string, unknown, { jobId: string; delay: number }]>()
      .mockResolvedValue(undefined),
    on: jest.fn(),
  };
  const events = new DomainEvents();
  const config = { get: jest.fn().mockReturnValue(simulate) };
  const scheduler = new SourcingJobScheduler(
    queue as unknown as Queue,
    events,
    config as unknown as AppConfigService,
    { now: () => NOW, today: () => '2026-10-01' },
  );
  scheduler.onModuleInit();
  return { queue, events };
}

describe('SourcingJobScheduler', () => {
  const published = {
    rfxId: RFX,
    responseDeadline: new Date('2026-10-01T13:00:00Z'),
    supplierIds: [SUP_A, SUP_B],
  };

  it('schedules an idempotent close exactly at the deadline', async () => {
    const { queue, events } = setup(false);
    await events.emit('rfx.published', published);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'close-rfx',
      { rfxId: RFX },
      { jobId: `close-${RFX}`, delay: 3_600_000 },
    );
  });

  it('adds staggered simulated bids only when the demo flag is on', async () => {
    const { queue, events } = setup(true);
    await events.emit('rfx.published', published);
    expect(queue.add).toHaveBeenCalledWith(
      'simulate-bid',
      { rfxId: RFX, supplierId: SUP_B },
      { jobId: `bid-${RFX}-${SUP_B}`, delay: 5_500 },
    );
    // BullMQ rejects ':' in custom ids — keep that from ever regressing.
    for (const call of queue.add.mock.calls) {
      expect(call[2].jobId).not.toContain(':');
    }
  });

  it('never lets an enqueue failure break the business action', async () => {
    const { queue, events } = setup(false);
    queue.add.mockRejectedValue(new Error('Redis down'));
    await expect(events.emit('rfx.published', published)).resolves.toBeUndefined();
  });
});

describe('SourcingProcessor', () => {
  const sourcing = { closeIfDue: jest.fn(), simulateSupplierResponse: jest.fn() };
  const processor = new SourcingProcessor(sourcing as unknown as SourcingService);
  const job = (name: string, data: unknown) => ({ name, data }) as Job<unknown>;

  it('dispatches jobs to the service', async () => {
    await processor.process(job('close-rfx', { rfxId: RFX }));
    await processor.process(job('simulate-bid', { rfxId: RFX, supplierId: SUP_A }));
    expect(sourcing.closeIfDue).toHaveBeenCalledWith(RFX);
    expect(sourcing.simulateSupplierResponse).toHaveBeenCalledWith(RFX, SUP_A);
  });

  it('validates payloads read back from Redis and rejects unknown jobs', async () => {
    await expect(processor.process(job('close-rfx', { rfxId: 'nope' }))).rejects.toThrow();
    await expect(processor.process(job('drop-tables', {}))).rejects.toThrow('Unknown job');
  });
});
