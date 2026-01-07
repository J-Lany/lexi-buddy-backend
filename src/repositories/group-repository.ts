import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateGroupDto } from 'groups/dto/create-group.dto';

@Injectable()
export class GroupRepository {
  constructor(public readonly prisma: PrismaService) {}

  async findValidGroupsByTeacher(teacherId: number) {
    const groups = await this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: teacherId,
            isActive: true,
            role: { name: 'teacher' },
          },
        },
        archived: false,
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            members: { where: { isActive: true } },
          },
        },
      },
    });

    return groups.filter((g) => g._count.members > 1);
  }

  async findStudentsWithGroups(groupIds: number[]) {
    return this.prisma.user.findMany({
      where: {
        groupMemberships: {
          some: {
            groupId: { in: groupIds },
            isActive: true,
            role: { name: 'student' },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        level: true,
        username: true,
        avatarUrl: true,
        groupMemberships: {
          where: {
            groupId: { in: groupIds },
            isActive: true,
            role: { name: 'student' },
          },
          select: {
            group: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async findByTeacher(teacherId: number) {
    return this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: teacherId,
            isActive: true,
            role: {
              name: 'teacher',
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        level: true,
        members: {
          where: {
            isActive: true,
            role: {
              name: 'student',
            },
          },
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                level: true,
                username: true,
                contacts: {
                  select: {
                    contactValue: true,
                    contactType: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async createGroup(
    teacherId: number,
    createGroupDto: CreateGroupDto,
    roles: { teacherRoleId: number; studentRoleId: number },
  ) {
    const { name, description, studentIds, level } = createGroupDto;

    return this.prisma.group.create({
      data: {
        name,
        description,
        level,
        members: {
          create: [
            {
              userId: teacherId,
              roleId: roles.teacherRoleId,
              isActive: true,
            },
            ...(studentIds?.map((studentId) => ({
              userId: studentId,
              roleId: roles.studentRoleId,
              isActive: true,
            })) ?? []),
          ],
        },
      },
      select: {
        id: true,
        name: true,
        members: {
          where: {
            isActive: true,
            role: { name: 'student' },
          },
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                level: true,
              },
            },
          },
        },
      },
    });
  }

  async removeStudentFromGroup(groupId: number, studentId: number) {
    return this.prisma.groupMember.updateMany({
      where: {
        groupId,
        userId: studentId,
        isActive: true,
      },
      data: {
        isActive: false,
        removedAt: new Date(),
      },
    });
  }

  async findGroupForTeacher(teacherId: number, groupId: number) {
    return this.prisma.group.findFirst({
      where: {
        id: groupId,
        members: {
          some: {
            userId: teacherId,
            isActive: true,
            role: {
              name: 'teacher',
              // scope: 'GROUP',
            },
          },
        },
      },
    });
  }

  async deleteGroup(groupId: number) {
    return this.prisma.group.delete({
      where: {
        id: groupId,
      },
    });
  }

  async studentInGroupExists(groupId: number, studentId: number) {
    return this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: studentId,
        isActive: true,
        role: {
          name: 'student',
          // scope: 'GROUP',
        },
      },
    });
  }

  async addStudentToGroup(
    groupId: number,
    studentId: number,
    studentRoleId: number,
  ) {
    return this.prisma.groupMember.create({
      data: {
        groupId,
        userId: studentId,
        roleId: studentRoleId,
        isActive: true,
      },
      select: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            level: true,
          },
        },
      },
    });
  }

  async teacherHasStudent(teacherId: number, studentId: number) {
    const group = await this.prisma.group.findFirst({
      where: {
        members: {
          some: {
            userId: teacherId,
            isActive: true,
            role: { name: 'teacher' },
          },
        },
        AND: [
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
      select: { id: true },
    });

    return !!group;
  }

  async getGroupDashboardRaw(groupId: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        description: true,
        level: true,
      },
    });

    if (!group) {
      return { group: null, students: [], lessons: [], studentAssignments: [] };
    }

    const students = await this.prisma.groupMember.findMany({
      where: {
        groupId,
        isActive: true,
        removedAt: null,
        role: { name: 'student' },
      },
      select: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            level: true,
            contacts: {
              select: {
                contactValue: true,
                contactType: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const studentUsers = students.map((m) => m.user);
    const studentIds = studentUsers.map((u) => u.id);

    const lessons = await this.prisma.lesson.findMany({
      where: {
        archived: false,
        groupLessons: {
          some: { groupId },
        },
      },
      select: {
        id: true,
        title: true,
        topic: true,
        level: true,
        createdAt: true,
        assignments: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const assignmentIds = lessons.flatMap((l) =>
      l.assignments.map((a) => a.id),
    );

    const studentAssignments =
      studentIds.length && assignmentIds.length
        ? await this.prisma.studentAssignment.findMany({
            where: {
              userId: { in: studentIds },
              assignmentId: { in: assignmentIds },
            },
            select: {
              userId: true,
              assignmentId: true,
              status: true,
            },
          })
        : [];

    return {
      group,
      students: studentUsers,
      lessons,
      studentAssignments,
    };
  }
}
