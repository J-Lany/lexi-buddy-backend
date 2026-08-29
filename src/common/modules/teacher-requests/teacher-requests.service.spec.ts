/* eslint-disable @typescript-eslint/unbound-method */

import { NotFoundException } from '@nestjs/common';
import { TeacherRequestsService } from './teacher-requests.service';
import { RoleRepository } from 'repositories/role.repository';
import { UserRepository } from 'repositories/user.repository';
import { GroupInviteRepository } from 'repositories/group-invite.repository';
import { TelegramNotificationsService } from 'common/modules/notifications/telegram-notifications.service';
import { GroupInviteStatus, Prisma } from '@prisma/client';
import { TeacherRequestAction } from './dto/respond-teacher-request.dto';

describe('TeacherRequestsService (unit, manual DI)', () => {
  let service: TeacherRequestsService;

  let roleRepo: jest.Mocked<RoleRepository>;
  let userRepo: jest.Mocked<UserRepository>;
  let groupInviteRepo: jest.Mocked<GroupInviteRepository>;
  let telegramNotifications: jest.Mocked<TelegramNotificationsService>;

  beforeEach(() => {
    roleRepo = {
      findGlobalRole: jest.fn(),
      findGroupRole: jest.fn(),
    } as any;

    userRepo = {
      findById: jest.fn(),
      findByIdWithContacts: jest.fn(),
      createUserByEmail: jest.fn(),
      createUserByTelegram: jest.fn(),
      findByEmail: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      findByTelegramId: jest.fn(),
    } as any;

    groupInviteRepo = {
      createIndividualGroupWithInvite: jest.fn(),
      findInviteForStudent: jest.fn(),
      markInviteAccepted: jest.fn(),
      markInviteDeclined: jest.fn(),
      addStudentToGroup: jest.fn(),
      findByTeacher: jest.fn(),
      findPendingInvite: jest.fn(), // ✅ added after service update
      respondToPendingTeacherRequest: jest.fn(),
    } as any;

    telegramNotifications = {
      sendTeacherRequest: jest.fn(),
    } as any;

    service = new TeacherRequestsService(
      roleRepo,
      userRepo,
      groupInviteRepo,
      telegramNotifications,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // requestStudent
  // -------------------------------------------------------------------

  describe('requestStudent', () => {
    const dto = {
      studentId: 2,
      message: 'Привет, давай заниматься?',
    };

    it('should throw if teacherId equals studentId', async () => {
      await expect(
        service.requestStudent(1, { ...dto, studentId: 1 }),
      ).rejects.toThrow('Нельзя отправить запрос самому себе');
    });

    it('should throw if student not found', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce(null);

      await expect(service.requestStudent(1, dto)).rejects.toThrow(
        NotFoundException,
      );

      expect(userRepo.findByIdWithContacts).toHaveBeenCalledWith(2);
    });

    it('should throw if teacher not found', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        id: 2,
      } as any);
      userRepo.findById.mockResolvedValueOnce(null);

      await expect(service.requestStudent(1, dto)).rejects.toThrow(
        NotFoundException,
      );

      expect(userRepo.findById).toHaveBeenCalledWith(1);
    });

    it('should throw if group teacher role not configured', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        id: 2,
      } as any);
      userRepo.findById.mockResolvedValueOnce({ id: 1 } as any);
      roleRepo.findGroupRole.mockResolvedValueOnce(null as any);

      await expect(service.requestStudent(1, dto)).rejects.toThrow(
        'Group teacher role not configured',
      );
    });

    it('should throw if invite already pending', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        id: 2,
      } as any);
      userRepo.findById.mockResolvedValueOnce({ id: 1 } as any);

      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 10 } as any); // teacher group role
      groupInviteRepo.findPendingInvite.mockResolvedValueOnce({
        id: 999,
        expiresAt: new Date(Date.now() - 60_000),
      } as any);

      await expect(service.requestStudent(1, dto)).rejects.toMatchObject({
        code: 'TEACHER_REQUEST_ALREADY_PENDING',
      });

      expect(groupInviteRepo.findPendingInvite).toHaveBeenCalledWith(1, 2);
      expect(
        groupInviteRepo.createIndividualGroupWithInvite,
      ).not.toHaveBeenCalled();
      expect(telegramNotifications.sendTeacherRequest).not.toHaveBeenCalled();
    });

    it.each([GroupInviteStatus.ACCEPTED, GroupInviteStatus.DECLINED])(
      '%s history does not block a new request',
      async () => {
        userRepo.findByIdWithContacts.mockResolvedValueOnce({
          id: 2,
          contacts: [],
        } as any);
        userRepo.findById.mockResolvedValueOnce({ id: 1 } as any);
        roleRepo.findGroupRole.mockResolvedValueOnce({ id: 10 } as any);
        // findPendingInvite scopes its query to PENDING, so historical rows
        // produce null and remain preserved without blocking a new request.
        groupInviteRepo.findPendingInvite.mockResolvedValueOnce(null as any);
        groupInviteRepo.createIndividualGroupWithInvite.mockResolvedValueOnce({
          group: { id: 100 },
          invite: { id: 200, status: GroupInviteStatus.PENDING },
        } as any);

        await expect(service.requestStudent(1, dto)).resolves.toMatchObject({
          status: GroupInviteStatus.PENDING,
        });
        expect(
          groupInviteRepo.createIndividualGroupWithInvite,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it('maps the pending-pair P2002 even if the winner is no longer pending', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        id: 2,
        contacts: [],
      } as any);
      userRepo.findById.mockResolvedValueOnce({ id: 1 } as any);
      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 10 } as any);
      groupInviteRepo.findPendingInvite
        .mockResolvedValueOnce(null)
        // If consulted after the P2002, this represents the winner already
        // transitioning to ACCEPTED or DECLINED.
        .mockResolvedValueOnce(null);
      groupInviteRepo.createIndividualGroupWithInvite.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.15.0',
          meta: {
            // Prisma 5.15's PostgreSQL connector reports fields parsed from
            // PostgreSQL DETAIL, not the custom partial-index name.
            target: ['inviterId', 'inviteeId'],
          },
        }),
      );

      await expect(service.requestStudent(1, dto)).rejects.toMatchObject({
        code: 'TEACHER_REQUEST_ALREADY_PENDING',
      });
      expect(groupInviteRepo.findPendingInvite).toHaveBeenCalledTimes(1);
    });

    it('does not mask an unrelated P2002 when no pending race winner exists', async () => {
      const unrelated = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.15.0',
          meta: { target: ['someOtherField'] },
        },
      );
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        id: 2,
        contacts: [],
      } as any);
      userRepo.findById.mockResolvedValueOnce({ id: 1 } as any);
      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 10 } as any);
      groupInviteRepo.findPendingInvite
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      groupInviteRepo.createIndividualGroupWithInvite.mockRejectedValueOnce(
        unrelated,
      );

      await expect(service.requestStudent(1, dto)).rejects.toBe(unrelated);
      expect(groupInviteRepo.findPendingInvite).toHaveBeenCalledTimes(1);
    });

    it('should create group + invite and NOT call telegram if no telegram contact', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        id: 2,
        firstName: 'Student',
        lastName: 'User',
        username: 'stud',
        contacts: [
          {
            contactValue: 'student@example.com',
            contactType: { name: 'email' },
          },
        ],
      } as any);

      userRepo.findById.mockResolvedValueOnce({
        id: 1,
        firstName: 'Teacher',
        lastName: 'One',
        username: 'teach',
      } as any);

      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 10 } as any); // teacher group role
      groupInviteRepo.findPendingInvite.mockResolvedValueOnce(null as any); // ✅ new

      groupInviteRepo.createIndividualGroupWithInvite.mockResolvedValueOnce({
        group: { id: 100 },
        invite: {
          id: 200,
          status: GroupInviteStatus.PENDING,
        },
      } as any);

      const result = await service.requestStudent(1, dto);

      expect(groupInviteRepo.findPendingInvite).toHaveBeenCalledWith(1, 2);

      expect(
        groupInviteRepo.createIndividualGroupWithInvite,
      ).toHaveBeenCalledWith({
        teacherId: 1,
        studentId: 2,
        teacherGroupRoleId: 10,
        message: dto.message,
      });

      expect(telegramNotifications.sendTeacherRequest).not.toHaveBeenCalled();

      expect(result).toEqual({
        inviteId: 200,
        groupId: 100,
        status: GroupInviteStatus.PENDING,
      });
    });

    it('should create group + invite and call telegram with correct payload if telegram contact exists', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        id: 2,
        firstName: 'Student',
        lastName: 'User',
        username: 'stud',
        contacts: [
          {
            contactValue: 'student@example.com',
            contactType: { name: 'email' },
          },
          {
            contactValue: '123456789',
            contactType: { name: 'telegram' },
          },
        ],
      } as any);

      userRepo.findById.mockResolvedValueOnce({
        id: 1,
        firstName: 'Teacher',
        lastName: 'One',
        username: 'teach',
      } as any);

      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 10 } as any); // teacher group role
      groupInviteRepo.findPendingInvite.mockResolvedValueOnce(null as any); // ✅ new

      groupInviteRepo.createIndividualGroupWithInvite.mockResolvedValueOnce({
        group: { id: 100 },
        invite: {
          id: 200,
          status: GroupInviteStatus.PENDING,
        },
      } as any);

      const result = await service.requestStudent(1, dto);

      expect(groupInviteRepo.findPendingInvite).toHaveBeenCalledWith(1, 2);

      expect(
        groupInviteRepo.createIndividualGroupWithInvite,
      ).toHaveBeenCalledWith({
        teacherId: 1,
        studentId: 2,
        teacherGroupRoleId: 10,
        message: dto.message,
      });

      expect(telegramNotifications.sendTeacherRequest).toHaveBeenCalledWith({
        telegramId: '123456789',
        inviteId: 200,
        teacherName: 'Teacher',
        message: dto.message,
      });

      expect(result).toEqual({
        inviteId: 200,
        groupId: 100,
        status: GroupInviteStatus.PENDING,
      });
    });
  });

  // -------------------------------------------------------------------
  // respondToRequest
  // -------------------------------------------------------------------

  describe('respondToRequest', () => {
    const studentId = 2;
    const inviteId = 200;

    it('maps a missing request to a stable domain code', async () => {
      groupInviteRepo.respondToPendingTeacherRequest.mockResolvedValueOnce({
        outcome: 'not_found',
      });

      await expect(
        service.respondToRequest(studentId, inviteId, {
          action: TeacherRequestAction.ACCEPT,
        }),
      ).rejects.toMatchObject({ code: 'TEACHER_REQUEST_NOT_FOUND' });
    });

    it.each([
      ['already_accepted', 'TEACHER_REQUEST_ALREADY_ACCEPTED'],
      ['already_declined', 'TEACHER_REQUEST_ALREADY_DECLINED'],
    ] as const)('maps %s to its stable domain code', async (outcome, code) => {
      groupInviteRepo.respondToPendingTeacherRequest.mockResolvedValueOnce({
        outcome,
      });

      await expect(
        service.respondToRequest(studentId, inviteId, {
          action: TeacherRequestAction.ACCEPT,
        }),
      ).rejects.toMatchObject({ code });
    });

    it('declines a pending request without consulting expiresAt', async () => {
      groupInviteRepo.respondToPendingTeacherRequest.mockResolvedValueOnce({
        outcome: 'declined',
      });

      const result = await service.respondToRequest(studentId, inviteId, {
        action: TeacherRequestAction.DECLINE,
      });

      expect(
        groupInviteRepo.respondToPendingTeacherRequest,
      ).toHaveBeenCalledWith({
        inviteId,
        studentId,
        accept: false,
      });
      expect(result).toEqual({ status: GroupInviteStatus.DECLINED });
    });

    it('should throw if group student role not configured on ACCEPT', async () => {
      groupInviteRepo.respondToPendingTeacherRequest.mockResolvedValueOnce({
        outcome: 'student_role_not_configured',
      });

      await expect(
        service.respondToRequest(studentId, inviteId, {
          action: TeacherRequestAction.ACCEPT,
        }),
      ).rejects.toThrow('Group student role not configured');
    });

    it('accepts through one atomic repository operation', async () => {
      groupInviteRepo.respondToPendingTeacherRequest.mockResolvedValueOnce({
        outcome: 'accepted',
        groupId: 100,
      });

      const result = await service.respondToRequest(studentId, inviteId, {
        action: TeacherRequestAction.ACCEPT,
      });

      expect(
        groupInviteRepo.respondToPendingTeacherRequest,
      ).toHaveBeenCalledWith({
        inviteId,
        studentId,
        accept: true,
      });
      expect(result).toEqual({
        status: GroupInviteStatus.ACCEPTED,
        groupId: 100,
      });
    });
  });

  // -------------------------------------------------------------------
  // getMyRequests
  // -------------------------------------------------------------------

  describe('getMyRequests', () => {
    it('should map invites to DTO', async () => {
      groupInviteRepo.findByTeacher.mockResolvedValueOnce([
        {
          id: 1,
          status: GroupInviteStatus.PENDING,
          createdAt: new Date('2025-01-01T10:00:00Z'),
          respondedAt: null,
          groupId: 100,
          invitee: {
            id: 2,
            firstName: 'Petr',
            lastName: 'Petrov',
            username: 'petka',
          },
          message: 'Привет',
        },
        {
          id: 2,
          status: GroupInviteStatus.ACCEPTED,
          createdAt: new Date('2025-01-02T10:00:00Z'),
          respondedAt: new Date('2025-01-03T10:00:00Z'),
          groupId: 101,
          invitee: {
            id: 3,
            firstName: null,
            lastName: 'Sidorova',
            username: 'sida',
          },
          message: null,
        },
      ] as any);

      const result = await service.getMyRequests(1);

      expect(groupInviteRepo.findByTeacher).toHaveBeenCalledWith(1);
      expect(result).toEqual([
        {
          id: 1,
          status: GroupInviteStatus.PENDING,
          createdAt: new Date('2025-01-01T10:00:00Z'),
          respondedAt: null,
          groupId: 100,
          student: {
            id: 2,
            name: 'Petr',
            username: 'petka',
          },
        },
        {
          id: 2,
          status: GroupInviteStatus.ACCEPTED,
          createdAt: new Date('2025-01-02T10:00:00Z'),
          respondedAt: new Date('2025-01-03T10:00:00Z'),
          groupId: 101,
          student: {
            id: 3,
            name: 'Sidorova',
            username: 'sida',
          },
        },
      ]);
    });
  });
});
