import {
  BadRequestException,
  Injectable,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'common/errors';
import { RoleRepository } from 'repositories/role.repository';
import { UserRepository } from 'repositories/user.repository';
import { GroupInviteRepository } from 'repositories/group-invite.repository';
import { TelegramNotificationsService } from 'common/modules/notifications/telegram-notifications.service';
import { CreateTeacherRequestDto } from './dto/create-teacher-request.dto';
import {
  RespondTeacherRequestDto,
  TeacherRequestAction,
} from './dto/respond-teacher-request.dto';
import { GroupInviteStatus, Prisma } from '@prisma/client';

const PENDING_TEACHER_REQUEST_INDEX =
  'GroupInvite_one_pending_per_teacher_student_key';
const PENDING_TEACHER_REQUEST_FIELDS = ['inviterId', 'inviteeId'] as const;

function isPendingTeacherRequestConstraintViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (target === PENDING_TEACHER_REQUEST_INDEX) {
    return true;
  }

  return (
    Array.isArray(target) &&
    target.length === PENDING_TEACHER_REQUEST_FIELDS.length &&
    PENDING_TEACHER_REQUEST_FIELDS.every((field) => target.includes(field))
  );
}

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
      throw new AppException(
        HttpStatus.CONFLICT,
        'TEACHER_REQUEST_ALREADY_PENDING',
      );
    }

    let created: Awaited<
      ReturnType<GroupInviteRepository['createIndividualGroupWithInvite']>
    >;
    try {
      created = await this.groupInviteRepo.createIndividualGroupWithInvite({
        teacherId,
        studentId,
        teacherGroupRoleId: teacherGroupRole.id,
        message,
      });
    } catch (error) {
      if (isPendingTeacherRequestConstraintViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'TEACHER_REQUEST_ALREADY_PENDING',
        );
      }
      throw error;
    }

    const { group, invite } = created;

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
    const accept = dto.action === TeacherRequestAction.ACCEPT;
    const result = await this.groupInviteRepo.respondToPendingTeacherRequest({
      inviteId,
      studentId,
      accept,
    });

    if (result.outcome === 'not_found') {
      throw new AppException(HttpStatus.NOT_FOUND, 'TEACHER_REQUEST_NOT_FOUND');
    }
    if (result.outcome === 'already_accepted') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TEACHER_REQUEST_ALREADY_ACCEPTED',
      );
    }
    if (result.outcome === 'already_declined') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TEACHER_REQUEST_ALREADY_DECLINED',
      );
    }
    if (result.outcome === 'student_role_not_configured') {
      throw new BadRequestException('Group student role not configured');
    }
    if (result.outcome === 'declined') {
      return { status: GroupInviteStatus.DECLINED };
    }
    return { status: GroupInviteStatus.ACCEPTED, groupId: result.groupId };
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
    if (!user) {
      throw new AppException(HttpStatus.NOT_FOUND, 'TEACHER_REQUEST_NOT_FOUND');
    }

    return this.respondToRequest(user.id, inviteId, {
      action: accept
        ? TeacherRequestAction.ACCEPT
        : TeacherRequestAction.DECLINE,
    });
  }
}
