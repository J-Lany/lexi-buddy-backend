import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';

@Injectable()
export class PasswordChangeRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: {
    userId: number;
    passwordHash: string;
    token: string;
    expiresAt: Date;
  }) {
    await this.prisma.passwordChangeRequest.upsert({
      where: { userId: data.userId },
      create: data,
      update: {
        passwordHash: data.passwordHash,
        token: data.token,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      },
    });
  }

  async findByToken(token: string) {
    return this.prisma.passwordChangeRequest.findUnique({ where: { token } });
  }

  async deleteByUserId(userId: number) {
    await this.prisma.passwordChangeRequest.deleteMany({ where: { userId } });
  }
}
