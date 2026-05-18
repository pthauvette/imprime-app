/**
 * Tests pour classifyError + routeSentryEvent — pure functions.
 *
 * Couvre chaque branche du switch + le shape Sentry Event output
 * (tags severity/category, level adjusted for warnings, null pour drop).
 */

import { describe, it, expect } from 'vitest';
import { classifyError, routeSentryEvent } from '@/lib/sentry/routing';

class ZodErrorMock extends Error {
  constructor() {
    super('validation failed');
    this.name = 'ZodError';
  }
}

class AbortErrorMock extends Error {
  constructor() {
    super('The user aborted a request');
    this.name = 'AbortError';
  }
}

class OrderNotFoundError extends Error {
  constructor() {
    super('Order not found: xyz');
    this.name = 'OrderNotFoundError';
  }
}

class PrismaClientInitializationError extends Error {
  constructor() {
    super("Can't reach database server at localhost:5432");
    this.name = 'PrismaClientInitializationError';
  }
}

describe('classifyError', () => {
  it('null / undefined → drop', () => {
    expect(classifyError(null).severity).toBe('drop');
    expect(classifyError(undefined).severity).toBe('drop');
  });

  it('AbortError → drop (user cancel)', () => {
    const c = classifyError(new AbortErrorMock());
    expect(c.severity).toBe('drop');
    expect(c.category).toBe('network');
  });

  it('ZodError → drop (validation)', () => {
    const c = classifyError(new ZodErrorMock());
    expect(c.severity).toBe('drop');
    expect(c.category).toBe('validation');
  });

  it('Stripe card_declined → warning', () => {
    const c = classifyError(new Error('Your card was declined.'));
    expect(c.severity).toBe('warning');
    expect(c.category).toBe('stripe');
  });

  it('Stripe insufficient_funds → warning', () => {
    const c = classifyError(new Error('insufficient_funds'));
    expect(c.severity).toBe('warning');
  });

  it('Stripe authentication_required → drop (3DS flow)', () => {
    const c = classifyError(new Error('authentication_required: 3D Secure'));
    expect(c.severity).toBe('drop');
    expect(c.category).toBe('stripe');
  });

  it('rate limit → drop', () => {
    const c = classifyError(new Error('Rate limit exceeded'));
    expect(c.severity).toBe('drop');
    expect(c.category).toBe('rate-limit');
  });

  it('expired magic link → warning', () => {
    const c = classifyError(new Error('Verification token not found'));
    expect(c.severity).toBe('warning');
    expect(c.category).toBe('auth');
  });

  it('upstream timeout sinalite → warning', () => {
    const c = classifyError(new Error('timeout while POST to sinalite'));
    expect(c.severity).toBe('warning');
    expect(c.category).toBe('upstream-timeout');
  });

  it('Prisma connection failure → critical', () => {
    const c = classifyError(new PrismaClientInitializationError());
    expect(c.severity).toBe('critical');
    expect(c.category).toBe('database');
  });

  it('OrderNotFoundError → warning', () => {
    const c = classifyError(new OrderNotFoundError());
    expect(c.severity).toBe('warning');
    expect(c.category).toBe('order-state');
  });

  it('unknown error → critical (default safe)', () => {
    const c = classifyError(new Error('something weird happened'));
    expect(c.severity).toBe('critical');
    expect(c.category).toBe('unknown');
  });

  it('non-Error objects work via duck-typing', () => {
    const c = classifyError({ name: 'ZodError', message: 'invalid' });
    expect(c.severity).toBe('drop');
    expect(c.category).toBe('validation');
  });
});

describe('routeSentryEvent', () => {
  it('drop → return null (Sentry skips)', () => {
    const event = {} as unknown as Parameters<typeof routeSentryEvent>[0];
    const hint = { originalException: new AbortErrorMock() };
    expect(routeSentryEvent(event, hint as never)).toBeNull();
  });

  it('warning → tags + level=warning', () => {
    const event = { tags: {} } as unknown as Parameters<typeof routeSentryEvent>[0];
    const hint = { originalException: new Error('Your card was declined.') };
    const result = routeSentryEvent(event, hint as never);
    expect(result).not.toBeNull();
    expect(result!.tags?.severity).toBe('warning');
    expect(result!.tags?.category).toBe('stripe');
    expect(result!.level).toBe('warning');
  });

  it('critical → tags severity + preserve original level', () => {
    const event = { tags: {}, level: 'error' } as unknown as Parameters<typeof routeSentryEvent>[0];
    const hint = { originalException: new Error('something weird') };
    const result = routeSentryEvent(event, hint as never);
    expect(result).not.toBeNull();
    expect(result!.tags?.severity).toBe('critical');
    expect(result!.tags?.category).toBe('unknown');
    expect(result!.level).toBe('error'); // unchanged
  });

  it('préserve les tags existants en mergeant', () => {
    const event = { tags: { foo: 'bar' } } as unknown as Parameters<typeof routeSentryEvent>[0];
    const hint = { originalException: new Error('something weird') };
    const result = routeSentryEvent(event, hint as never);
    expect(result!.tags?.foo).toBe('bar');
    expect(result!.tags?.severity).toBe('critical');
  });
});
