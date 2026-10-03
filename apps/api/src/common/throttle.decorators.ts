import { Throttle } from '@nestjs/throttler';

/**
 * Tighter per-client limit for state-changing endpoints (default is 120/min for reads).
 * Slows scripted abuse such as mass document creation without hurting a human user.
 */
export const WriteThrottle = () => Throttle({ default: { limit: 60, ttl: 60_000 } });
