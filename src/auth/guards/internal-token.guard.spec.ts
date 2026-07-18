import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard';

function makeContext(token: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token !== undefined ? { 'x-internal-token': token } : {},
      }),
    }),
  } as unknown as ExecutionContext;
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

  it('should throw UnauthorizedException when x-internal-token header is missing', () => {
    const guard = new InternalTokenGuard();
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when token has wrong length', () => {
    const guard = new InternalTokenGuard();
    expect(() => guard.canActivate(makeContext('short'))).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when token has correct length but wrong value', () => {
    const guard = new InternalTokenGuard();
    // Same length as 'super-secret-token' (18 chars), wrong content
    expect(() => guard.canActivate(makeContext('wrong-secret-token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('should return true when token matches exactly', () => {
    const guard = new InternalTokenGuard();
    const result = guard.canActivate(makeContext('super-secret-token'));
    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when TELEGRAM_BOT_INTERNAL_TOKEN env is not set', () => {
    delete process.env.TELEGRAM_BOT_INTERNAL_TOKEN;
    const guard = new InternalTokenGuard();
    expect(() => guard.canActivate(makeContext('super-secret-token'))).toThrow(
      UnauthorizedException,
    );
  });
});
