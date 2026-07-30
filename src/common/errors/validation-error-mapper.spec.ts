import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { validationErrorsToAppException } from './validation-error-mapper';

function err(
  property: string,
  value: unknown,
  constraints: Record<string, string> | undefined,
  children: ValidationError[] = [],
): ValidationError {
  return { property, value, constraints, children } as ValidationError;
}

describe('validationErrorsToAppException', () => {
  it('produces an AppException(400, VALIDATION_FAILED) with a fields[] details block', () => {
    const ex = validationErrorsToAppException([
      err('email', 'not-an-email', { isEmail: 'email must be an email' }),
    ]);

    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.code).toBe('VALIDATION_FAILED');
    expect(ex.details).toEqual({
      fields: [{ field: 'email', code: 'INVALID_EMAIL' }],
    });
  });

  it('maps a missing value to REQUIRED regardless of which type constraint technically failed', () => {
    const ex = validationErrorsToAppException([
      err('password', undefined, { isString: 'password must be a string' }),
    ]);

    expect(ex.details?.fields).toEqual([
      { field: 'password', code: 'REQUIRED' },
    ]);
  });

  it('maps minLength to VALUE_TOO_SHORT', () => {
    const ex = validationErrorsToAppException([
      err('password', 'abc', {
        minLength: 'password must be longer than or equal to 8 characters',
      }),
    ]);

    expect(ex.details?.fields).toEqual([
      { field: 'password', code: 'VALUE_TOO_SHORT' },
    ]);
  });

  it('maps maxLength to VALUE_TOO_LONG', () => {
    const ex = validationErrorsToAppException([
      err('firstName', 'x'.repeat(200), {
        maxLength: 'firstName must be shorter than or equal to 100 characters',
      }),
    ]);

    expect(ex.details?.fields).toEqual([
      { field: 'firstName', code: 'VALUE_TOO_LONG' },
    ]);
  });

  it('maps a whitelist violation (unknown field) to UNKNOWN_FIELD', () => {
    const ex = validationErrorsToAppException([
      err('admin', true, {
        whitelistValidation: 'property admin should not exist',
      }),
    ]);

    expect(ex.details?.fields).toEqual([
      { field: 'admin', code: 'UNKNOWN_FIELD' },
    ]);
  });

  it('maps an unrecognized class-validator constraint to INVALID_VALUE, never leaking the constraint name', () => {
    const ex = validationErrorsToAppException([
      err('someField', 'x', { someBrandNewConstraint: 'some message' }),
    ]);

    expect(ex.details?.fields).toEqual([
      { field: 'someField', code: 'INVALID_VALUE' },
    ]);
    expect(JSON.stringify(ex.details)).not.toContain('someBrandNewConstraint');
  });

  it('never includes the raw class-validator message text in details', () => {
    const ex = validationErrorsToAppException([
      err('email', 'not-an-email', { isEmail: 'email must be an email' }),
    ]);

    expect(JSON.stringify(ex.details)).not.toContain('must be an email');
  });

  it('flattens nested children into dot-path field names', () => {
    const ex = validationErrorsToAppException([
      err('address', {}, undefined, [
        err('city', undefined, { isString: 'city must be a string' }),
      ]),
    ]);

    expect(ex.details?.fields).toEqual([
      { field: 'address.city', code: 'REQUIRED' },
    ]);
  });

  it('collects one entry per invalid field, in order', () => {
    const ex = validationErrorsToAppException([
      err('email', 'bad', { isEmail: 'x' }),
      err('password', 'abc', { minLength: 'x' }),
    ]);

    expect(ex.details?.fields).toEqual([
      { field: 'email', code: 'INVALID_EMAIL' },
      { field: 'password', code: 'VALUE_TOO_SHORT' },
    ]);
  });
});
