import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';

@Injectable()
export class UserContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.userContact.findFirst({
      where: {
        contactValue: email,
        contactType: { name: 'email' },
      },
    });
  }

  async findByTelegram(telegramId: number) {
    return this.prisma.userContact.findFirst({
      where: {
        contactValue: String(telegramId),
        contactType: { name: 'telegram' },
      },
    });
  }
}
