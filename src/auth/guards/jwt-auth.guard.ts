import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from 'common/errors';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Passport-jwt rejects a missing/expired/malformed access token before our
  // JwtStrategy.validate() ever runs, via `err`/`info` here rather than a
  // thrown exception — overriding handleRequest is the only way to give
  // every rejection path (missing token, expired token, bad signature, or a
  // validate() failure) the same public AUTH_UNAUTHENTICATED contract.
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info?: unknown,
  ): TUser {
    if (err instanceof AppException) throw err;

    if (err || !user) {
      const internalReason =
        err instanceof Error
          ? err.message
          : info instanceof Error
            ? info.message
            : 'missing or invalid access token';

      throw new AppException(HttpStatus.UNAUTHORIZED, 'AUTH_UNAUTHENTICATED', {
        internalReason,
      });
    }

    return user;
  }
}
