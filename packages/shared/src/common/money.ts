import { z } from 'zod';

/*
 * Money is integer EUR cents; quantities have at most 3 decimals (ADR 0005).
 * Pure helpers shared by API (persisted totals) and web (live previews), so both
 * sides always compute the same number.
 */

export const CURRENCY = 'EUR';

export const CentsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const MAX_QUANTITY = 99_999_999_999; // NUMERIC(14,3)

/** Quantity in thousandths, e.g. 1.25 kg → 1250. */
export const toMilli = (quantity: number): number => Math.round(quantity * 1000);

export const QuantitySchema = z
  .number()
  .positive()
  .max(MAX_QUANTITY)
  .refine((q) => Math.abs(q * 1000 - toMilli(q)) < 1e-6, 'At most 3 decimal places');

/** Non-negative variant for "received 0, rejected 5" style inputs. */
export const NonNegativeQuantitySchema = z
  .number()
  .min(0)
  .max(MAX_QUANTITY)
  .refine((q) => Math.abs(q * 1000 - toMilli(q)) < 1e-6, 'At most 3 decimal places');

/** round_half_up(quantity × unit price) in exact integer arithmetic. */
export function lineTotalCents(quantity: number, unitPriceCents: number): number {
  const product = BigInt(toMilli(quantity)) * BigInt(unitPriceCents);
  return Number((product + 500n) / 1000n);
}

/** Basis points → share of an amount, rounded half up (e.g. 250 bps of €100 = €2.50). */
export function applyBps(amountCents: number, bps: number): number {
  return Number((BigInt(amountCents) * BigInt(bps) + 5_000n) / 10_000n);
}

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: CURRENCY });

export const formatCents = (cents: number): string => eur.format(cents / 100);

/** Inverse of `formatCents` for form inputs: "12.5" → 1250. Undefined if not a valid amount. */
export function parseEuroToCents(input: string): number | undefined {
  const trimmed = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  const [whole = '0', frac = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
