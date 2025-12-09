import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateGroupDto } from 'groups/dto/create-group.dto';

@Injectable()
export class GroupRepository {
  constructor(public readonly prisma: PrismaService) {}

  async findByTeacher(teacherId: number) {
    return this.prisma.group.findMany({
      where: {
        teacherId: teacherId,
      },
      select: {
        name: true,
        id: true,
        students: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                level: true,
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

  async createGroup(teacherId: number, createGroupDto: CreateGroupDto) {
    const { name, studentIds } = createGroupDto;
    return await this.prisma.group.create({
      data: {
        name,
        teacher: {
          connect: { id: teacherId },
        },
        students: {
          createMany:
            studentIds && studentIds.length > 0
              ? {
                  data: studentIds.map((studentId) => ({
                    studentId: studentId,
                  })),
                }
              : undefined,
        },
      },
      select: {
        id: true,
        name: true,
        students: {
          select: {
            student: {
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
    return await this.prisma.studentInGroup.deleteMany({
      where: {
        groupId: groupId,
        studentId: studentId,
      },
    });
  }

  async findGroupForTeacher(teacherId: number, groupId: number) {
    return this.prisma.group.findUnique({
      where: { id: groupId, teacherId: teacherId },
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
    return await this.prisma.studentInGroup.findFirst({
      where: { groupId, studentId },
    });
  }

  async addStudentToGroup(groupId: number, studentId: number) {
    return await this.prisma.studentInGroup.create({
      data: {
        groupId,
        studentId,
      },
      select: {
        student: {
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
