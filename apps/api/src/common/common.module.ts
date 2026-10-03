import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';

/** Cross-cutting, framework-free services available to every module. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class CommonModule {}
