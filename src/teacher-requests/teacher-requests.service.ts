import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { RoleRepository } from 'repositories/role.repository';
import { UserRepository } from 'repositories/user.repository';
import { GroupInviteRepository } from 'repositories/group-invite.repository';
import { TelegramNotificationsService } from 'notifications/telegram-notifications.service';
import { CreateTeacherRequestDto } from './dto/create-teacher-request.dto';
import {
  RespondTeacherRequestDto,
  TeacherRequestAction,
} from './dto/respond-teacher-request.dto';
import { GroupInviteStatus } from '@prisma/client';

@Injectable()
export class TeacherRequestsService {
  constructor(
    private readonly roleRepo: RoleRepository,
    private readonly userRepo: UserRepository,
    private readonly groupInviteRepo: GroupInviteRepository,
    private readonly telegramNotifications: TelegramNotificationsService,
  ) {}

  async requestStudent(teacherId: number, dto: CreateTeacherRequestDto) {
    const { studentId, message } = dto;

    if (teacherId === studentId) {
      throw new BadRequestException('Нельзя отправить запрос самому себе');
    }

    const student = await this.userRepo.findByIdWithContacts(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const teacher = await this.userRepo.findById(teacherId);
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const teacherGroupRole = await this.roleRepo.findGroupRole('teacher');
    if (!teacherGroupRole) {
      throw new BadRequestException('Group teacher role not configured');
    }

    const pending = await this.groupInviteRepo.findPendingInvite(
      teacherId,
      studentId,
    );
    if (pending) {
      throw new ConflictException('Invite already pending');
    }

    const { group, invite } =
      await this.groupInviteRepo.createIndividualGroupWithInvite({
        teacherId,
        studentId,
        teacherGroupRoleId: teacherGroupRole.id,
        message,
      });

    const telegramContact = student.contacts?.find(
      (c) => c.contactType.name === 'telegram',
    );

    if (telegramContact?.contactValue) {
      await this.telegramNotifications.sendTeacherRequest({
        telegramId: telegramContact.contactValue,
        inviteId: invite.id,
        teacherName:
          teacher.firstName ||
          teacher.lastName ||
          teacher.username ||
          'Ваш преподаватель',
        message,
      });
    }

    return {
      inviteId: invite.id,
      groupId: group.id,
      status: invite.status,
    };
  }

  async respondToRequest(
    studentId: number,
    inviteId: number,
    dto: RespondTeacherRequestDto,
  ) {
    const invite = await this.groupInviteRepo.findInviteForStudent(
      inviteId,
      studentId,
    );

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status !== GroupInviteStatus.PENDING) {
      throw new BadRequestException('Invite already processed');
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    if (dto.action === TeacherRequestAction.DECLINE) {
      await this.groupInviteRepo.markInviteDeclined(invite.id);
      return { status: GroupInviteStatus.DECLINED };
    }

    const studentGroupRole = await this.roleRepo.findGroupRole('student');
    if (!studentGroupRole) {
      throw new BadRequestException('Group student role not configured');
    }

    await this.groupInviteRepo.markInviteAccepted(invite.id);

    const existingMember = invite.group.members.find(
      (m) => m.userId === studentId,
    );
    if (!existingMember) {
      await this.groupInviteRepo.addStudentToGroup({
        groupId: invite.groupId,
        studentId,
        studentGroupRoleId: studentGroupRole.id,
      });
    }

    return { status: GroupInviteStatus.ACCEPTED, groupId: invite.groupId };
  }

  async getMyRequests(teacherId: number) {
    const invites = await this.groupInviteRepo.findByTeacher(teacherId);

    return invites.map((inv) => ({
      id: inv.id,
      status: inv.status,
      createdAt: inv.createdAt,
      respondedAt: inv.respondedAt,
      groupId: inv.groupId,
      student: {
        id: inv.invitee.id,
        name: inv.invitee.firstName || inv.invitee.lastName || '',
        username: inv.invitee.username,
      },
    }));
  }

  async respondFromTelegram(
    telegramId: number,
    inviteId: number,
    accept: boolean,
  ) {
    const user = await this.userRepo.findByTelegramId(telegramId);
    if (!user) throw new NotFoundException('Student not found');

    try {
      return await this.respondToRequest(user.id, inviteId, {
        action: accept
          ? TeacherRequestAction.ACCEPT
          : TeacherRequestAction.DECLINE,
      });
    } catch (e: unknown) {
      if (
        e instanceof BadRequestException &&
        e.message?.includes('Invite already processed')
      ) {
        throw new ConflictException('Invite already processed');
      }
      throw e;
    }
  }
}
