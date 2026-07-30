import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AppException } from 'common/errors';
import { UserRepository } from 'repositories/user.repository';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminEmails: string[];

  constructor(private readonly userRepo: UserRepository) {
    this.adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: number = request.user?.sub;

    // An admin-contour access attempt without a valid admin identity is
    // always logged at 'warn', regardless of which check below rejected it.
    if (!userId || this.adminEmails.length === 0) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', {
        logLevel: 'warn',
      });
    }

    const user = await this.userRepo.findByIdWithContacts(userId);
    const email = user?.contacts
      .find((c) => c.contactType.name === 'email')
      ?.contactValue?.toLowerCase();

    if (!email || !this.adminEmails.includes(email)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', {
        logLevel: 'warn',
      });
    }

    return true;
  }
}
