import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: any }>();
    const token = req.headers['x-internal-token'];

    const expected = process.env.TELEGRAM_BOT_INTERNAL_TOKEN;
    if (!expected) {
      throw new UnauthorizedException(
        'TELEGRAM_BOT_INTERNAL_TOKEN is not configured',
      );
    }

    if (!token || token.length !== expected.length) {
      throw new UnauthorizedException('Unauthorized');
    }

    const tokensMatch = timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expected),
    );

    if (!tokensMatch) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}
