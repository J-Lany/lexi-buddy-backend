import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRepository } from 'repositories/user.repository';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly userRepo: UserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: number = request.user?.sub;
    if (!userId) return false;

    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length === 0) return false;

    const user = await this.userRepo.findByIdWithContacts(userId);
    const email = user?.contacts
      .find((c) => c.contactType.name === 'email')
      ?.contactValue?.toLowerCase();

    if (!email || !adminEmails.includes(email)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
