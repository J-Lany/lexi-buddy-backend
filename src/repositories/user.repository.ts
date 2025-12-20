import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AgeGroup, Level } from '@prisma/client';

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
    level?: Level;
  }) {
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
            contactType: { name: 'email' },
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

  async findByIdWithContacts(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        contacts: {
          include: {
            contactType: true,
          },
        },
      },
    });
  }

  async findByTelegramId(telegramId: string | number) {
    return this.prisma.user.findFirst({
      where: {
        contacts: {
          some: {
            contactValue: String(telegramId),
            contactType: {
              name: 'telegram',
            },
          },
        },
      },
    });
  }

  async searchStudentsByUsername(params: {
    q: string;
    take?: number;
    excludeTeacherId?: number;
  }) {
    const { q, take = 15, excludeTeacherId } = params;

    return this.prisma.user.findMany({
      where: {
        role: { name: 'student' },
        username: {
          startsWith: q,
          mode: 'insensitive',
        },
        ...(excludeTeacherId
          ? {
              groupMemberships: {
                none: {
                  isActive: true,
                  group: {
                    members: {
                      some: {
                        userId: excludeTeacherId,
                        isActive: true,
                        role: { name: 'teacher' },
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        level: true,
      },
      take,
      orderBy: { username: 'asc' },
    });
  }
}
