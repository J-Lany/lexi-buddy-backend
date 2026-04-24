import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';
import { GroupInviteStatus } from '@prisma/client';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable()
export class GroupInviteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIndividualGroupWithInvite(args: {
    teacherId: number;
    studentId: number;
    teacherGroupRoleId: number;
    message?: string;
  }) {
    const { teacherId, studentId, teacherGroupRoleId, message } = args;

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: `Индивидуально с учителем #${teacherId}`,
          description: 'Индивидуальная группа (1-на-1)',
          members: {
            create: {
              userId: teacherId,
              roleId: teacherGroupRoleId,
              isActive: true,
            },
          },
        },
      });

      const invite = await tx.groupInvite.create({
        data: {
          groupId: group.id,
          inviterId: teacherId,
          inviteeId: studentId,
          status: GroupInviteStatus.PENDING,
          message: message ?? null,
          expiresAt: new Date(Date.now() + THREE_DAYS_MS),
        },
      });

      return { group, invite };
    });
  }

  async findInviteForStudent(inviteId: number, studentId: number) {
    return this.prisma.groupInvite.findFirst({
      where: {
        id: inviteId,
        inviteeId: studentId,
      },
      include: {
        group: {
          include: {
            members: true,
          },
        },
      },
    });
  }

  async markInviteAccepted(inviteId: number) {
    return this.prisma.groupInvite.update({
      where: { id: inviteId },
      data: {
        status: GroupInviteStatus.ACCEPTED,
        respondedAt: new Date(),
      },
    });
  }

  async markInviteDeclined(inviteId: number) {
    return this.prisma.groupInvite.update({
      where: { id: inviteId },
      data: {
        status: GroupInviteStatus.DECLINED,
        respondedAt: new Date(),
      },
    });
  }

  async addStudentToGroup(args: {
    groupId: number;
    studentId: number;
    studentGroupRoleId: number;
  }) {
    const { groupId, studentId, studentGroupRoleId } = args;

    return this.prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId: studentId,
        },
      },
      create: {
        groupId,
        userId: studentId,
        roleId: studentGroupRoleId,
        isActive: true,
        removedAt: null,
      },
      update: {
        roleId: studentGroupRoleId,
        isActive: true,
        removedAt: null,
        joinedAt: new Date(),
      },
    });
  }

  async findByTeacher(teacherId: number) {
    return this.prisma.groupInvite.findMany({
      where: {
        inviterId: teacherId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        invitee: true,
        group: true,
      },
    });
  }

  async findPendingInvite(teacherId: number, studentId: number) {
    return this.prisma.groupInvite.findFirst({
      where: {
        inviterId: teacherId,
        inviteeId: studentId,
        status: 'PENDING',
      },
    });
  }
}
