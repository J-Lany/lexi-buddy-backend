import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { StudentAssignmentStatus } from '@prisma/client';

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

  async findAssignmentsForStudentInLesson(userId: number, lessonId: number) {
    const assignments = await this.prisma.assignment.findMany({
      where: { lessonId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        type: { select: { name: true } },
        studentAssignments: {
          where: { userId },
          select: { status: true, score: true },
          take: 1,
        },
      },
    });

    return assignments.map((a) => {
      const sa = a.studentAssignments[0];
      return {
        assignmentId: a.id,
        typeName: a.type.name,
        status: sa?.status ?? StudentAssignmentStatus.PENDING,
        score: sa?.score ?? null,
      };
    });
  }
}
