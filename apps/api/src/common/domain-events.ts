import { Injectable, Logger } from '@nestjs/common';

/**
 * Facts other parts of the system may react to. Add an entry here for each new event;
 * the map keeps emit/on type-safe.
 */
export interface DomainEventMap {
  'rfx.published': { rfxId: string; responseDeadline: Date; supplierIds: string[] };
}

type Handler<K extends keyof DomainEventMap> = (payload: DomainEventMap[K]) => Promise<void>;

/**
 * Minimal in-process event bus. Services emit AFTER their transaction commits; listeners
 * (e.g. the BullMQ scheduler) are optional — with jobs disabled nobody listens.
 *
 * Trade-off: an event is lost if the process dies between commit and emit. The durable
 * fix is a transactional outbox table (Phase 5 lesson).
 */
@Injectable()
export class DomainEvents {
  private readonly logger = new Logger(DomainEvents.name);
  private readonly handlers = new Map<keyof DomainEventMap, Handler<keyof DomainEventMap>[]>();

  on<K extends keyof DomainEventMap>(type: K, handler: Handler<K>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler<keyof DomainEventMap>);
    this.handlers.set(type, list);
  }

  /** Runs every handler; a failing listener is logged and never fails the business action. */
  async emit<K extends keyof DomainEventMap>(type: K, payload: DomainEventMap[K]): Promise<void> {
    for (const handler of this.handlers.get(type) ?? []) {
      try {
        await handler(payload);
      } catch (e) {
        this.logger.error(
          `Handler for ${type} failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }
  }
}
