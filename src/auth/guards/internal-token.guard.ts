import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AppException } from 'common/errors';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: any }>();
    const token = req.headers['x-internal-token'];

    const expected = process.env.TELEGRAM_BOT_INTERNAL_TOKEN;
    if (!expected) {
      // Ops misconfiguration, not a client error — never tell the caller
      // the env var is missing, but flag it loudly in logs.
      throw new AppException(HttpStatus.UNAUTHORIZED, 'AUTH_UNAUTHENTICATED', {
        internalReason: 'TELEGRAM_BOT_INTERNAL_TOKEN is not configured',
        logLevel: 'error',
      });
    }

    if (!token || token.length !== expected.length) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'AUTH_UNAUTHENTICATED', {
        internalReason: 'internal token missing or wrong length',
        logLevel: 'warn',
      });
    }

    const tokensMatch = timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expected),
    );

    if (!tokensMatch) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'AUTH_UNAUTHENTICATED', {
        internalReason: 'internal token mismatch',
        logLevel: 'warn',
      });
    }

    return true;
  }
}
