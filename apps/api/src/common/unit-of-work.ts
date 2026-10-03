/**
 * Port: run `fn` atomically. Everything a repository does inside `fn` (including audit
 * entries) commits together or rolls back together. Nested calls join the outer unit.
 */
export interface UnitOfWork {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
