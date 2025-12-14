import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateGroupDto } from 'groups/dto/create-group.dto';

@Injectable()
export class GroupRepository {
  constructor(public readonly prisma: PrismaService) {}

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
    const { name, description, studentIds } = createGroupDto;

    return this.prisma.group.create({
      data: {
        name,
        description,
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
}
