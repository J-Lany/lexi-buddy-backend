import { Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { PrismaService } from 'common/modules/prisma/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Re-issues activation for an existing, not-yet-verified user (a
   * re-registration). Scoped by `verified: false` so this can never touch an
   * already-activated account; `passwordHash` is deliberately absent from the
   * write — the new password only becomes live once the activation link is
   * used (see consumeActivation). Returns false if the account was activated
   * concurrently between the caller's read and this write. */
  async reissueActivation(args: {
    userId: number;
    activationToken: string;
    activationExpires: Date;
    pendingPasswordHash: string;
    consentAcceptedAt: Date;
    consentVersion: number;
  }): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: args.userId, verified: false },
      data: {
        activationToken: args.activationToken,
        activationExpires: args.activationExpires,
        pendingPasswordHash: args.pendingPasswordHash,
        consentAcceptedAt: args.consentAcceptedAt,
        consentVersion: args.consentVersion,
      },
    });
    return count === 1;
  }

  /** Atomically consumes an activation token: single-use, so a second use of
   * the same link (or one superseded by a later re-registration) resolves to
   * 'not_found' rather than repeating a stale success. On success, any
   * pendingPasswordHash staged by a re-registration is promoted into
   * passwordHash in the same write — the account's real password can only
   * change once ownership of the mailbox is proven this way. */
  async consumeActivation(args: {
    token: string;
    now: Date;
  }): Promise<'activated' | 'expired' | 'not_found'> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { activationToken: args.token },
        select: {
          id: true,
          activationExpires: true,
          pendingPasswordHash: true,
        },
      });

      if (!user) return 'not_found';
      if (!user.activationExpires || user.activationExpires < args.now) {
        return 'expired';
      }

      const { count } = await tx.user.updateMany({
        where: { id: user.id, verified: false, activationToken: args.token },
        data: {
          verified: true,
          activationToken: null,
          activationExpires: null,
          pendingPasswordHash: null,
          ...(user.pendingPasswordHash
            ? { passwordHash: user.pendingPasswordHash }
            : {}),
        },
      });

      return count === 1 ? 'activated' : 'not_found';
    });
  }

  async createUserByEmail(data: {
    passwordHash: string;
    roleId: number;
    activationToken: string;
    activationExpires: Date;
    email: string;
    contactTypeId: number;
    consentAcceptedAt: Date;
    consentVersion: number;
  }) {
    await this.prisma.user.create({
      data: {
        passwordHash: data.passwordHash,
        roleId: data.roleId,
        activationToken: data.activationToken,
        activationExpires: data.activationExpires,
        consentAcceptedAt: data.consentAcceptedAt,
        consentVersion: data.consentVersion,
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
    roleId: number;
    telegramId: number;
    username?: string;
    contactTypeId: number;
    avatarUrl?: string | null;
    consentAcceptedAt: Date;
    consentVersion: number;
  }): Promise<{ id: number }> {
    return this.prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        roleId: data.roleId,
        avatarUrl: data.avatarUrl,
        passwordHash: null,
        verified: true,
        username: data.username,
        consentAcceptedAt: data.consentAcceptedAt,
        consentVersion: data.consentVersion,
        contacts: {
          create: {
            contactValue: String(data.telegramId),
            contactTypeId: data.contactTypeId,
            isPrimary: true,
            verified: true,
          },
        },
      },
      select: { id: true },
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

  async updatePasswordHash(userId: number, passwordHash: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
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

  async findTeacherProfile(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        defaultLanguage: true,
        contacts: {
          where: { contactType: { name: 'email' } },
          select: { contactValue: true },
        },
      },
    });
  }

  async updateTeacherProfile(
    userId: number,
    data: {
      firstName?: string;
      lastName?: string;
      defaultLanguage?: Language;
    },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        defaultLanguage: true,
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
