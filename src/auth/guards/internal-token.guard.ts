import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

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

    if (!token || token !== expected) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}
