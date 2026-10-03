import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';
import { DomainEvents } from './domain-events';

/** Cross-cutting, framework-light services available to every module. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }, DomainEvents],
  exports: [CLOCK, DomainEvents],
})
export class CommonModule {}
