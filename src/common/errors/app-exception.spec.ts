import { HttpException, HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception';

describe('AppException', () => {
  it('is an HttpException carrying status, code, details and requestId-relevant metadata', () => {
    const ex = new AppException(
      HttpStatus.CONFLICT,
      'AUTH_EMAIL_ALREADY_EXISTS',
      {
        details: { fields: [{ field: 'email', code: 'INVALID_EMAIL' }] },
        internalReason: 'duplicate contact row for email',
        logLevel: 'warn',
      },
    );

    expect(ex).toBeInstanceOf(HttpException);
    expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(ex.code).toBe('AUTH_EMAIL_ALREADY_EXISTS');
    expect(ex.details).toEqual({
      fields: [{ field: 'email', code: 'INVALID_EMAIL' }],
    });
    expect(ex.internalReason).toBe('duplicate contact row for email');
    expect(ex.logLevel).toBe('warn');
  });

  it('leaves details, internalReason and logLevel undefined when omitted', () => {
    const ex = new AppException(
      HttpStatus.UNAUTHORIZED,
      'AUTH_UNAUTHENTICATED',
    );

    expect(ex.details).toBeUndefined();
    expect(ex.internalReason).toBeUndefined();
    expect(ex.logLevel).toBeUndefined();
  });

  it('never exposes internalReason via getResponse() or message (both must stay client-safe)', () => {
    const ex = new AppException(
      HttpStatus.UNAUTHORIZED,
      'AUTH_INVALID_CREDENTIALS',
      {
        internalReason: 'password mismatch for user 42',
      },
    );

    expect(JSON.stringify(ex.getResponse())).not.toContain('password mismatch');
    expect(ex.message).not.toContain('password mismatch');
  });
});
