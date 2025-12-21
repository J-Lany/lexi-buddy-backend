import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StudentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentDashboardRaw(teacherId: number, studentId: number) {
    const groups = await this.prisma.groupMember.findMany({
      where: {
        userId: studentId,
        isActive: true,
        removedAt: null,
        group: {
          archived: false,
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

    const groupIds = groups.map((g) => g.group.id);

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        level: true,
        ageGroup: true,
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

    const lessons = groupIds.length
      ? await this.prisma.lesson.findMany({
          where: {
            groupId: { in: groupIds },
            archived: false,
          },
          select: {
            id: true,
            groupId: true,
            title: true,
            level: true,
            topic: true,
            createdAt: true,
            archived: true,
            assignments: { select: { id: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const assignmentIds = lessons.flatMap((l) =>
      l.assignments.map((a) => a.id),
    );

    const studentAssignments = assignmentIds.length
      ? await this.prisma.studentAssignment.findMany({
          where: {
            userId: studentId,
            assignmentId: { in: assignmentIds },
          },
          select: {
            assignmentId: true,
            status: true,
            score: true,
            submittedAt: true,
          },
        })
      : [];

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
}
