/** Prisma returns BIGINT as `bigint`; the domain uses safe-integer `number` cents (ADR 0005). */
export function centsFromDb(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new RangeError(`Amount ${value.toString()} exceeds safe range`);
  return n;
}

/** NUMERIC(14,3) arrives as Prisma.Decimal; `toString()` keeps it exact before parsing. */
export const quantityFromDb = (value: { toString(): string }): number => Number(value.toString());
