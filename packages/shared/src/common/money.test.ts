import { describe, expect, it } from 'vitest';
import { applyBps, formatCents, lineTotalCents, parseEuroToCents, QuantitySchema } from './money';

describe('money', () => {
  it('computes line totals exactly, rounding half up', () => {
    expect(lineTotalCents(3, 1999)).toBe(5997);
    expect(lineTotalCents(0.333, 100)).toBe(33); // 33.3 → 33
    expect(lineTotalCents(0.005, 100)).toBe(1); // 0.5 → 1
    expect(lineTotalCents(1.1, 3)).toBe(3); // 3.3 → 3, no float drift
  });

  it('stays exact beyond float precision', () => {
    expect(lineTotalCents(1_000_000, 900_000_000)).toBe(900_000_000_000_000);
  });

  it('applies basis points with half-up rounding', () => {
    expect(applyBps(10_000, 250)).toBe(250);
    expect(applyBps(199, 50)).toBe(1); // 0.995 → 1
  });

  it('validates quantity precision', () => {
    expect(QuantitySchema.safeParse(1.125).success).toBe(true);
    expect(QuantitySchema.safeParse(1.1255).success).toBe(false);
    expect(QuantitySchema.safeParse(0).success).toBe(false);
  });

  it('parses and formats euro amounts', () => {
    expect(parseEuroToCents('12.5')).toBe(1250);
    expect(parseEuroToCents('0,99')).toBe(99);
    expect(parseEuroToCents('1.999')).toBeUndefined();
    expect(formatCents(123456)).toBe('€1,234.56');
  });
});
