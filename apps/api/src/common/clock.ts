/** Port for "now", so time-dependent rules (need-by dates, deadlines) are testable. */
export interface Clock {
  now(): Date;
  /** Business date as ISO `YYYY-MM-DD` (UTC; per-site time zones are out of scope). */
  today(): string;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = {
  now: () => new Date(),
  today: () => new Date().toISOString().slice(0, 10),
};
