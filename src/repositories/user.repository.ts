import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AgeGroup } from '@prisma/client';

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

  async createUserByTelegram(data: {
    firstName?: string;
    lastName?: string;
    ageGroup?: AgeGroup;
    roleId: number;
    telegramId: number;
    username?: string;
    contactTypeId: number;
    level?: string;
  }) {
    // Создаём пользователя
    const user = await this.prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        ageGroup: data.ageGroup,
        roleId: data.roleId,
        level: data.level,
        passwordHash: null,
        verified: true,
        username: data.username,
        contacts: {
          create: {
            contactValue: String(data.telegramId),
            contactTypeId: data.contactTypeId,
            isPrimary: true,
            verified: true,
          },
        },
      },
    });

    return user;
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

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: {
        contacts: {
          some: {
            contactValue: email,
          },
        },
      },
      include: {
        role: true,
      },
    });
  }

  async updateRefreshTokenHash(userId: number, hash: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
}
