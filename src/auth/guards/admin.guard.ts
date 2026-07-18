import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
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
    if (!userId) return false;

    if (this.adminEmails.length === 0) return false;

    const user = await this.userRepo.findByIdWithContacts(userId);
    const email = user?.contacts
      .find((c) => c.contactType.name === 'email')
      ?.contactValue?.toLowerCase();

    if (!email || !this.adminEmails.includes(email)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
