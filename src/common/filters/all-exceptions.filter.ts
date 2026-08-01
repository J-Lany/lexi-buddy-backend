import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AppErrorCode,
  AppException,
  AppExceptionLogLevel,
  SafeErrorDetails,
} from 'common/errors';

// Safe fallback code for a legacy HttpException (one that isn't an
// AppException) that isn't otherwise special-cased below, keyed by status.
const LEGACY_STATUS_CODE: Partial<Record<number, AppErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

function codeForLegacyStatus(status: number): AppErrorCode {
  const known = LEGACY_STATUS_CODE[status];
  if (known) return known;
  return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
}

type ResolvedError = {
  status: number;
  code: AppErrorCode;
  details?: SafeErrorDetails;
  logLevel?: AppExceptionLogLevel;
  internalReason?: string;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.requestId ?? 'unknown';

    const resolved = this.resolve(exception);

    this.log(exception, resolved, req, requestId);

    res.status(resolved.status).json({
      statusCode: resolved.status,
      code: resolved.code,
      requestId,
      ...(resolved.details ? { details: resolved.details } : {}),
    });
  }

  private resolve(exception: unknown): ResolvedError {
    // 1. AppException. Priority 3 (validation errors → VALIDATION_FAILED) is
    // folded into this branch: the ValidationPipe's exceptionFactory (see
    // main.ts) already converts ValidationError[] into an AppException
    // before it reaches this filter.
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        details: exception.details,
        logLevel: exception.logLevel,
        internalReason: exception.internalReason,
      };
    }

    // 2. Throttling.
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        logLevel: 'warn',
      };
    }

    // 4. Legacy HttpException — never forward exception.getResponse().
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, code: codeForLegacyStatus(status) };
    }

    // 5. Unknown error.
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR' };
  }

  private log(
    exception: unknown,
    resolved: ResolvedError,
    req: Request,
    requestId: string,
  ) {
    const level: AppExceptionLogLevel =
      resolved.logLevel ?? (resolved.status >= 500 ? 'error' : 'debug');
    // An AppException's own .message is just its public code, so it's not a
    // useful log reason — only fall back to the raw exception message for
    // non-AppException errors (legacy HttpException, unknown throws).
    const reason =
      resolved.internalReason ??
      (exception instanceof AppException
        ? undefined
        : this.extractReason(exception));
    const line = `[${requestId}] ${req.method} ${req.url} -> ${resolved.status} ${resolved.code}${reason ? `: ${reason}` : ''}`;

    if (level === 'error') {
      const err =
        exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(line, err.stack);
      return;
    }

    if (level === 'warn') {
      this.logger.warn(line);
      return;
    }

    if (level === 'info') {
      this.logger.log(line);
      return;
    }

    this.logger.debug(line);
  }

  // Only used for the internal log line — never sent in the response.
  // Legacy HttpException messages in this codebase are static/non-sensitive
  // (e.g. "Not Found"); an AppException instead carries an explicit
  // internalReason, which always takes priority over this fallback.
  private extractReason(exception: unknown): string | undefined {
    if (exception instanceof Error) return exception.message;
    return undefined;
  }
}
