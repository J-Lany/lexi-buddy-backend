import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';
import { GroupInviteStatus, Prisma } from '@prisma/client';

export type DetachStudentFromTeacherResult = {
  removedFromGroups: number;
  revokedAssignments: number;
  expiredPendingInvites: number;
  affectedGroupIds: number[];
};

@Injectable()
export class StudentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentDashboardRaw(teacherId: number, studentId: number) {
    const INDIVIDUAL_NAME_PREFIX = 'Индивидуально с учителем';
    const INDIVIDUAL_DESC = 'Индивидуальная группа (1-на-1)';

    const groups = await this.prisma.groupMember.findMany({
      where: {
        userId: studentId,
        isActive: true,
        removedAt: null,
        group: {
          archived: false,
          NOT: [
            { description: INDIVIDUAL_DESC },
            { name: { startsWith: INDIVIDUAL_NAME_PREFIX } },
          ],
          members: {
            some: {
              userId: teacherId,
              isActive: true,
              role: { name: 'teacher' },
            },
          },
        },
      },
      select: {
        joinedAt: true,
        group: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        level: true,
        ageGroup: true,
        avatarUrl: true,
        lastVisit: true,
        createdAt: true,
        contacts: {
          select: {
            contactValue: true,
            contactType: { select: { name: true } },
          },
        },
      },
    });

    const lessons = await this.prisma.lesson.findMany({
      where: {
        archived: false,
        createdById: teacherId,
        assignments: {
          some: {
            assignedAssignments: {
              some: { userId: studentId, revokedAt: null },
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
        archived: true,
        assignments: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const assignmentIds = lessons.flatMap((l) =>
      l.assignments.map((a) => a.id),
    );

    const assignedRows = assignmentIds.length
      ? await this.prisma.studentAssignedAssignment.findMany({
          where: {
            userId: studentId,
            assignmentId: { in: assignmentIds },
            revokedAt: null,
          },
          select: {
            assignmentId: true,
            attempts: {
              orderBy: { attemptNo: 'desc' },
              take: 1,
              select: {
                status: true,
                score: true,
                submittedAt: true,
              },
            },
          },
        })
      : [];

    const studentAssignments = assignedRows.map((r) => ({
      assignmentId: r.assignmentId,
      status: r.attempts?.[0]?.status ?? null,
      score: r.attempts?.[0]?.score ?? null,
      submittedAt: r.attempts?.[0]?.submittedAt ?? null,
    }));

    return {
      student,
      groups: groups.map((g) => ({
        id: g.group.id,
        name: g.group.name,
        level: g.group.level,
        joinedAt: g.joinedAt,
      })),
      lessons,
      studentAssignments,
    };
  }

  async getStudentLessonProgressRaw(studentId: number, lessonId: number) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        title: true,
        createdById: true,
        archived: true,
        assignments: {
          select: {
            id: true,
            type: { select: { id: true, name: true } },
            questions: {
              select: {
                id: true,
                text: true,
                explanation: true,
                questionType: { select: { name: true } },
                answers: { select: { id: true, text: true, isCorrect: true } },
              },
            },
          },
        },
      },
    });

    const assignmentIds = lesson?.assignments.map((a) => a.id) ?? [];

    const assignedRows = assignmentIds.length
      ? await this.prisma.studentAssignedAssignment.findMany({
          where: {
            userId: studentId,
            assignmentId: { in: assignmentIds },
            revokedAt: null,
          },
          select: {
            assignmentId: true,
            assignedAt: true,
            attempts: {
              orderBy: [{ attemptNo: 'asc' }],
              select: {
                id: true,
                attemptNo: true,
                status: true,
                score: true,
                startedAt: true,
                submittedAt: true,
                gradedAt: true,
                results: {
                  orderBy: [{ createdAt: 'asc' }],
                  select: {
                    questionId: true,
                    answer: true,
                    isCorrect: true,
                    responseTimeMs: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        })
      : [];

    const studentAssignments = assignedRows.flatMap((r) =>
      (r.attempts ?? []).map((a) => ({
        id: a.id,
        assignmentId: r.assignmentId,
        attemptNo: a.attemptNo,
        status: a.status,
        score: a.score,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        gradedAt: a.gradedAt,
        results: a.results ?? [],
      })),
    );

    const assignedMeta = assignedRows.map((r) => ({
      assignmentId: r.assignmentId,
      assignedAt: r.assignedAt,
    }));

    return {
      student,
      lesson,
      studentAssignments,
      assignedMeta,
    };
  }

  async updateStudentProfile(
    studentId: number,
    data: Prisma.UserUpdateInput,
  ): Promise<boolean> {
    const res = await this.prisma.user.updateMany({
      where: { id: studentId },
      data,
    });

    return res.count > 0;
  }

  async detachStudentFromTeacher(params: {
    teacherId: number;
    studentId: number;
  }): Promise<DetachStudentFromTeacherResult> {
    const { teacherId, studentId } = params;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const affectedGroups = await tx.group.findMany({
        where: {
          AND: [
            {
              members: {
                some: {
                  userId: teacherId,
                  isActive: true,
                  role: { name: 'teacher' },
                },
              },
            },
            {
              members: {
                some: {
                  userId: studentId,
                  isActive: true,
                  role: { name: 'student' },
                },
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

      const affectedGroupIds = affectedGroups.map((group) => group.id);

      const removedMemberships = affectedGroupIds.length
        ? await tx.groupMember.updateMany({
            where: {
              groupId: { in: affectedGroupIds },
              userId: studentId,
              isActive: true,
              role: { name: 'student' },
            },
            data: {
              isActive: false,
              removedAt: now,
            },
          })
        : { count: 0 };

      const revokedAssignments = await tx.studentAssignedAssignment.updateMany({
        where: {
          userId: studentId,
          revokedAt: null,
          assignment: {
            lesson: {
              createdById: teacherId,
            },
          },
        },
        data: {
          revokedAt: now,
        },
      });

      const expiredPendingInvites = await tx.groupInvite.updateMany({
        where: {
          inviterId: teacherId,
          inviteeId: studentId,
          status: GroupInviteStatus.PENDING,
        },
        data: {
          status: GroupInviteStatus.EXPIRED,
          respondedAt: now,
        },
      });

      return {
        removedFromGroups: removedMemberships.count,
        revokedAssignments: revokedAssignments.count,
        expiredPendingInvites: expiredPendingInvites.count,
        affectedGroupIds,
      };
    });
  }
}
