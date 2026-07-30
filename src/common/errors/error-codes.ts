// Stable, public application error codes. These are part of the API contract —
// never rename an existing value, only add new ones.
export const APP_ERROR_CODES = [
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_UNAUTHENTICATED',
  'AUTH_SESSION_EXPIRED',
  'AUTH_EMAIL_ALREADY_EXISTS',
  'AUTH_INVALID_TOKEN',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_PASSWORDS_DO_NOT_MATCH',
  'VALIDATION_FAILED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

// Stable, public field-level validation codes — never the raw class-validator
// constraint name (e.g. "isEmail", "minLength") or its message text.
export const VALIDATION_FIELD_CODES = [
  'REQUIRED',
  'INVALID_EMAIL',
  'VALUE_TOO_SHORT',
  'VALUE_TOO_LONG',
  'INVALID_FORMAT',
  'INVALID_VALUE',
  'UNKNOWN_FIELD',
] as const;

export type ValidationFieldCode = (typeof VALIDATION_FIELD_CODES)[number];

export type ValidationFieldError = {
  field: string;
  code: ValidationFieldCode;
};

// The only shape currently allowed in AppException#details. Extend this
// union (never widen to a bare object) when a new safe details shape is
// needed.
export type SafeErrorDetails = {
  fields: ValidationFieldError[];
};
