import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';
import { GroupInviteStatus } from '@prisma/client';

export type TeacherRequestResponseResult =
  | { outcome: 'not_found' }
  | { outcome: 'already_accepted' }
  | { outcome: 'already_declined' }
  | { outcome: 'student_role_not_configured' }
  | { outcome: 'accepted'; groupId: number }
  | { outcome: 'declined' };

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
          // Teaching requests are deliberately actionable until the student
          // accepts or declines them. Keep the nullable schema field for
          // historical/other invite data, but do not expire this flow.
          expiresAt: null,
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

  async respondToPendingTeacherRequest(args: {
    inviteId: number;
    studentId: number;
    accept: boolean;
  }): Promise<TeacherRequestResponseResult> {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.groupInvite.findFirst({
        where: { id: args.inviteId, inviteeId: args.studentId },
        select: { id: true, groupId: true, status: true },
      });

      if (!invite) return { outcome: 'not_found' };
      if (invite.status === GroupInviteStatus.ACCEPTED) {
        return { outcome: 'already_accepted' };
      }
      if (invite.status === GroupInviteStatus.DECLINED) {
        return { outcome: 'already_declined' };
      }
      if (invite.status !== GroupInviteStatus.PENDING) {
        return { outcome: 'not_found' };
      }

      const studentGroupRole = args.accept
        ? await tx.role.findFirst({
            where: { name: 'student', scope: 'GROUP' },
            select: { id: true },
          })
        : null;
      if (args.accept && !studentGroupRole) {
        return { outcome: 'student_role_not_configured' };
      }

      const status = args.accept
        ? GroupInviteStatus.ACCEPTED
        : GroupInviteStatus.DECLINED;
      const transitioned = await tx.groupInvite.updateMany({
        where: { id: invite.id, status: GroupInviteStatus.PENDING },
        data: { status, respondedAt: new Date() },
      });

      // A concurrent callback may have completed between the read and write.
      if (transitioned.count !== 1) {
        const current = await tx.groupInvite.findUnique({
          where: { id: invite.id },
          select: { status: true },
        });
        if (current?.status === GroupInviteStatus.ACCEPTED) {
          return { outcome: 'already_accepted' };
        }
        if (current?.status === GroupInviteStatus.DECLINED) {
          return { outcome: 'already_declined' };
        }
        return { outcome: 'not_found' };
      }

      if (!args.accept) return { outcome: 'declined' };
      await tx.groupMember.upsert({
        where: {
          groupId_userId: {
            groupId: invite.groupId,
            userId: args.studentId,
          },
        },
        create: {
          groupId: invite.groupId,
          userId: args.studentId,
          roleId: studentGroupRole!.id,
          isActive: true,
          removedAt: null,
        },
        update: {
          roleId: studentGroupRole!.id,
          isActive: true,
          removedAt: null,
          joinedAt: new Date(),
        },
      });

      return { outcome: 'accepted', groupId: invite.groupId };
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
