import { describe, expect, it } from 'vitest';

import { describeError } from './app-error.util';

/**
 * These cover the shapes `fetch` actually throws. Every network failure in this
 * project surfaces as the literal string "fetch failed" with the real reason in
 * `cause`, so the unwrapping is what makes a log entry actionable — and the
 * difference between "start the container" and "the port is blocked".
 */
describe('describeError', () => {
  function fetchFailure(code: string, message: string): Error {
    const syscall = Object.assign(new Error(message), { code });

    return new Error('fetch failed', { cause: syscall });
  }

  it('keeps a plain message unchanged', () => {
    expect(describeError(new Error('collection does not exist'))).toBe('collection does not exist');
  });

  it('stringifies a non-error throw', () => {
    expect(describeError('boom')).toBe('boom');
  });

  it('appends the syscall code and message behind "fetch failed"', () => {
    const result = describeError(
      fetchFailure('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:6333'),
    );

    expect(result).toBe('fetch failed — ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:6333');
  });

  it('distinguishes a blocked port from a bad host', () => {
    const blocked = describeError(fetchFailure('ETIMEDOUT', 'connect ETIMEDOUT 3.3.3.3:6333'));
    const unknownHost = describeError(
      fetchFailure('ENOTFOUND', 'getaddrinfo ENOTFOUND nope.cloud.qdrant.io'),
    );

    expect(blocked).toContain('ETIMEDOUT');
    expect(unknownHost).toContain('ENOTFOUND');
    expect(blocked).not.toBe(unknownHost);
  });

  it('does not repeat a cause the wrapper already quoted', () => {
    const inner = fetchFailure('ETIMEDOUT', 'connect ETIMEDOUT 3.3.3.3:6333');
    const wrapped = new Error(`qdrant unavailable: ${inner.message}`, { cause: inner });

    expect(describeError(wrapped)).toBe(
      'qdrant unavailable: fetch failed — ETIMEDOUT: connect ETIMEDOUT 3.3.3.3:6333',
    );
  });

  it('terminates on a cyclic cause chain', () => {
    const first = new Error('first');
    const second = new Error('second', { cause: first });

    first.cause = second;

    expect(describeError(second)).toBe('second — first');
  });
});
