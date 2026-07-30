import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard';
import { AppException } from 'common/errors';

function makeContext(token: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token !== undefined ? { 'x-internal-token': token } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

function expectRejected(guard: InternalTokenGuard, token: string | undefined) {
  let caught: unknown;
  try {
    guard.canActivate(makeContext(token));
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AppException);
  const ex = caught as AppException;
  expect(ex.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  expect(ex.code).toBe('AUTH_UNAUTHENTICATED');
  return ex;
}

describe('InternalTokenGuard', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      TELEGRAM_BOT_INTERNAL_TOKEN: 'super-secret-token',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should throw AppException(401, AUTH_UNAUTHENTICATED) when x-internal-token header is missing', () => {
    const guard = new InternalTokenGuard();
    expectRejected(guard, undefined);
  });

  it('should throw AppException(401, AUTH_UNAUTHENTICATED) when token has wrong length', () => {
    const guard = new InternalTokenGuard();
    expectRejected(guard, 'short');
  });

  it('should throw AppException(401, AUTH_UNAUTHENTICATED) when token has correct length but wrong value', () => {
    const guard = new InternalTokenGuard();
    // Same length as 'super-secret-token' (18 chars), wrong content
    expectRejected(guard, 'wrong-secret-token');
  });

  it('should return true when token matches exactly', () => {
    const guard = new InternalTokenGuard();
    const result = guard.canActivate(makeContext('super-secret-token'));
    expect(result).toBe(true);
  });

  it('should throw AppException(401, AUTH_UNAUTHENTICATED) when TELEGRAM_BOT_INTERNAL_TOKEN env is not set, without revealing that in the exception', () => {
    delete process.env.TELEGRAM_BOT_INTERNAL_TOKEN;
    const guard = new InternalTokenGuard();
    const ex = expectRejected(guard, 'super-secret-token');

    // internalReason is for logs only — AllExceptionsFilter never serializes
    // it, but as a defense in depth it must never leak the env var name.
    expect(ex.code).toBe('AUTH_UNAUTHENTICATED');
    expect(
      JSON.stringify({ code: ex.code, status: ex.getStatus() }),
    ).not.toContain('TELEGRAM_BOT_INTERNAL_TOKEN');
  });
});
