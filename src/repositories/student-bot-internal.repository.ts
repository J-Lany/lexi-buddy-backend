import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StudentBotInternalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStudentIdByTelegramId(telegramId: number): Promise<number | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        contacts: {
          some: {
            contactType: { name: 'telegram' },
            contactValue: String(telegramId),
          },
        },
      },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  async findLessonsForStudent(studentId: number) {
    const lessons = await this.prisma.lesson.findMany({
      where: {
        archived: false,
        assignments: {
          some: {
            studentAssignments: {
              some: {
                userId: studentId,
              },
            },
          },
        },
      },
      select: {
        id: true,
        title: true,
        level: true,
        topic: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return lessons;
  }

  async findStudentProfileByTelegramId(telegramId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        contacts: {
          some: {
            contactType: { name: 'telegram' },
            contactValue: String(telegramId),
          },
        },
      },
      select: {
        username: true,
        firstName: true,
        lastName: true,
        level: true,
        ageGroup: true,
        groupMemberships: {
          where: {
            isActive: true,
            removedAt: null,
            group: { archived: false },
          },
          select: { id: true },
        },
      },
    });

    if (!user) return null;

    return {
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      level: user.level ?? null,
      ageGroup: user.ageGroup ?? null,
      groupsCount: user.groupMemberships?.length ?? 0,
    };
  }
}
