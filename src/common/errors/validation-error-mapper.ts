import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AppException } from './app-exception';
import { ValidationFieldCode, ValidationFieldError } from './error-codes';

// Maps known, stable class-validator constraint keys (not messages) to a
// public field code. Never expose the constraint key itself to the client.
const CONSTRAINT_FIELD_CODE: Record<string, ValidationFieldCode> = {
  isNotEmpty: 'REQUIRED',
  isDefined: 'REQUIRED',
  isEmail: 'INVALID_EMAIL',
  minLength: 'VALUE_TOO_SHORT',
  maxLength: 'VALUE_TOO_LONG',
  whitelistValidation: 'UNKNOWN_FIELD',
  isString: 'INVALID_FORMAT',
  isInt: 'INVALID_FORMAT',
  isNumber: 'INVALID_FORMAT',
  isBoolean: 'INVALID_FORMAT',
  isEnum: 'INVALID_FORMAT',
  isArray: 'INVALID_FORMAT',
  isUuid: 'INVALID_FORMAT',
  equals: 'INVALID_VALUE',
  min: 'INVALID_VALUE',
  max: 'INVALID_VALUE',
};

function fieldPath(error: ValidationError, parentPath?: string): string {
  return parentPath ? `${parentPath}.${error.property}` : error.property;
}

function codeForError(error: ValidationError): ValidationFieldCode {
  // A missing property fails whichever type decorator is present (isEmail,
  // isString, isInt, ...) rather than a semantically "required" constraint —
  // value === undefined is the only reliable signal that the field was
  // absent rather than merely invalid.
  if (error.value === undefined) return 'REQUIRED';

  const constraintKeys = Object.keys(error.constraints ?? {});
  for (const key of constraintKeys) {
    const code = CONSTRAINT_FIELD_CODE[key];
    if (code) return code;
  }

  // Unrecognized class-validator constraint: fail safe rather than leak the
  // constraint name.
  return 'INVALID_VALUE';
}

function flatten(
  errors: ValidationError[],
  parentPath?: string,
): ValidationFieldError[] {
  const result: ValidationFieldError[] = [];

  for (const error of errors) {
    if (error.children && error.children.length > 0) {
      result.push(...flatten(error.children, fieldPath(error, parentPath)));
      continue;
    }

    if (!error.constraints) continue;

    result.push({
      field: fieldPath(error, parentPath),
      code: codeForError(error),
    });
  }

  return result;
}

/** Converts class-validator's ValidationError[] into the public VALIDATION_FAILED contract. */
export function validationErrorsToAppException(
  errors: ValidationError[],
): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', {
    details: { fields: flatten(errors) },
  });
}
