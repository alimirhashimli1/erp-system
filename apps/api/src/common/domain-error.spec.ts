import { assertTransition, DomainError } from './domain-error';

type S = 'A' | 'B' | 'C';
const T: Record<S, readonly S[]> = { A: ['B'], B: ['C'], C: [] };

describe('assertTransition', () => {
  it('allows listed transitions', () => {
    expect(() => {
      assertTransition(T, 'A', 'B', 'Thing');
    }).not.toThrow();
  });

  it('rejects unlisted transitions with a conflict', () => {
    try {
      assertTransition(T, 'A', 'C', 'Thing');
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).kind).toBe('conflict');
      expect((e as DomainError).message).toBe('Thing cannot go from A to C');
    }
  });
});
