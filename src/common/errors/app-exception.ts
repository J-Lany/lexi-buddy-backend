import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode, SafeErrorDetails } from './error-codes';

// Not part of the public response — used only to pick a Logger level in
// AllExceptionsFilter. Defaults (when omitted) to 'error' for 5xx and
// 'debug' for everything else.
export type AppExceptionLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppExceptionOptions = {
  /** Safe, pre-typed structured details (e.g. validation field errors). */
  details?: SafeErrorDetails;
  /** Technical cause, for structured logs only — never serialized to the client. */
  internalReason?: string;
  logLevel?: AppExceptionLogLevel;
};

/**
 * The one exception type the whole app should throw for errors that carry a
 * stable, public `code`. AllExceptionsFilter turns this into
 * `{ statusCode, code, requestId, details? }` — it never calls
 * `getResponse()` on this class.
 */
export class AppException extends HttpException {
  readonly code: AppErrorCode;
  readonly details?: SafeErrorDetails;
  readonly internalReason?: string;
  readonly logLevel?: AppExceptionLogLevel;

  constructor(
    status: HttpStatus,
    code: AppErrorCode,
    options?: AppExceptionOptions,
  ) {
    super(code, status);
    this.code = code;
    this.details = options?.details;
    this.internalReason = options?.internalReason;
    this.logLevel = options?.logLevel;
  }
}
