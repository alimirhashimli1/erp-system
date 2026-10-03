/**
 * Business-rule failures raised by domain and application code. No framework import:
 * `DomainErrorFilter` maps `kind` to an HTTP status at the edge.
 */
export type DomainErrorKind = 'not_found' | 'forbidden' | 'conflict' | 'rule';

export class DomainError extends Error {
  constructor(
    readonly kind: DomainErrorKind,
    /** Stable, machine-readable code (e.g. `PR_INVALID_TRANSITION`) for clients and tests. */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (entity: string) =>
  new DomainError('not_found', `${entity.toUpperCase()}_NOT_FOUND`, `${entity} not found`);

/** Optimistic-lock miss: someone else changed the record since it was read. */
export const staleWrite = (entity: string) =>
  new DomainError(
    'conflict',
    'STALE_WRITE',
    `${entity} was changed by someone else — reload and try again`,
  );

/** Guard for state machines: `assertTransition(TRANSITIONS, from, to, 'PR')`. */
export function assertTransition<S extends string>(
  transitions: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
  entity: string,
): void {
  if (!transitions[from].includes(to)) {
    throw new DomainError(
      'conflict',
      'INVALID_TRANSITION',
      `${entity} cannot go from ${from} to ${to}`,
    );
  }
}
