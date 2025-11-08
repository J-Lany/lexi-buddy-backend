import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByActivationToken(token: string) {
    return this.prisma.user.findFirst({ where: { activationToken: token } });
  }

  async createUserByEmail(data: {
    passwordHash: string;
    roleId: number;
    activationToken: string;
    activationExpires: Date;
    email: string;
    contactTypeId: number;
  }) {
    await this.prisma.user.create({
      data: {
        passwordHash: data.passwordHash,
        roleId: data.roleId,
        activationToken: data.activationToken,
        activationExpires: data.activationExpires,
        contacts: {
          create: {
            contactValue: data.email,
            contactTypeId: data.contactTypeId,
            isPrimary: true,
          },
        },
      },
    });
  }

  async updateUserVerification(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verified: true,
        activationToken: null,
        activationExpires: null,
      },
    });
  }
}
