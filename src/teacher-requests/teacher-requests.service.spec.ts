/* eslint-disable @typescript-eslint/unbound-method */

import { NotFoundException } from '@nestjs/common';
import { TeacherRequestsService } from './teacher-requests.service';
import { RoleRepository } from 'repositories/role.repository';
import { UserRepository } from 'repositories/user.repository';
import { GroupInviteRepository } from 'repositories/group-invite.repository';
import { TelegramNotificationsService } from 'notifications/telegram-notifications.service';
import { GroupInviteStatus } from '@prisma/client';
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
      findByActivationToken: jest.fn(),
      createUserByEmail: jest.fn(),
      createUserByTelegram: jest.fn(),
      updateUserVerification: jest.fn(),
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

      groupInviteRepo.createIndividualGroupWithInvite.mockResolvedValueOnce({
        group: { id: 100 },
        invite: {
          id: 200,
          status: GroupInviteStatus.PENDING,
        },
      } as any);

      const result = await service.requestStudent(1, dto);

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

      groupInviteRepo.createIndividualGroupWithInvite.mockResolvedValueOnce({
        group: { id: 100 },
        invite: {
          id: 200,
          status: GroupInviteStatus.PENDING,
        },
      } as any);

      const result = await service.requestStudent(1, dto);

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

    it('should throw if invite not found', async () => {
      groupInviteRepo.findInviteForStudent.mockResolvedValueOnce(null);

      await expect(
        service.respondToRequest(studentId, inviteId, {
          action: TeacherRequestAction.ACCEPT,
        }),
      ).rejects.toThrow('Invite not found');
    });

    it('should throw if invite is not pending', async () => {
      groupInviteRepo.findInviteForStudent.mockResolvedValueOnce({
        id: inviteId,
        status: GroupInviteStatus.ACCEPTED,
      } as any);

      await expect(
        service.respondToRequest(studentId, inviteId, {
          action: TeacherRequestAction.ACCEPT,
        }),
      ).rejects.toThrow('Invite already processed');
    });

    it('should throw if invite is expired', async () => {
      groupInviteRepo.findInviteForStudent.mockResolvedValueOnce({
        id: inviteId,
        status: GroupInviteStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
      } as any);

      await expect(
        service.respondToRequest(studentId, inviteId, {
          action: TeacherRequestAction.ACCEPT,
        }),
      ).rejects.toThrow('Invite has expired');
    });

    it('should decline invite and return DECLINED status', async () => {
      groupInviteRepo.findInviteForStudent.mockResolvedValueOnce({
        id: inviteId,
        status: GroupInviteStatus.PENDING,
        expiresAt: null,
      } as any);

      groupInviteRepo.markInviteDeclined.mockResolvedValueOnce({} as any);

      const result = await service.respondToRequest(studentId, inviteId, {
        action: TeacherRequestAction.DECLINE,
      });

      expect(groupInviteRepo.markInviteDeclined).toHaveBeenCalledWith(inviteId);
      expect(result).toEqual({ status: GroupInviteStatus.DECLINED });
    });

    it('should throw if group student role not configured on ACCEPT', async () => {
      groupInviteRepo.findInviteForStudent.mockResolvedValueOnce({
        id: inviteId,
        status: GroupInviteStatus.PENDING,
        expiresAt: null,
        group: {
          members: [],
        },
        groupId: 100,
      } as any);

      roleRepo.findGroupRole.mockResolvedValueOnce(null as any);

      await expect(
        service.respondToRequest(studentId, inviteId, {
          action: TeacherRequestAction.ACCEPT,
        }),
      ).rejects.toThrow('Group student role not configured');
    });

    it('should accept invite and NOT add member if already in group', async () => {
      groupInviteRepo.findInviteForStudent.mockResolvedValueOnce({
        id: inviteId,
        status: GroupInviteStatus.PENDING,
        expiresAt: null,
        groupId: 100,
        group: {
          members: [{ userId: studentId }],
        },
      } as any);

      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 30 } as any); // student group role

      groupInviteRepo.markInviteAccepted.mockResolvedValueOnce({} as any);

      const result = await service.respondToRequest(studentId, inviteId, {
        action: TeacherRequestAction.ACCEPT,
      });

      expect(groupInviteRepo.markInviteAccepted).toHaveBeenCalledWith(inviteId);
      expect(groupInviteRepo.addStudentToGroup).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: GroupInviteStatus.ACCEPTED,
        groupId: 100,
      });
    });

    it('should accept invite and add student to group if not a member', async () => {
      groupInviteRepo.findInviteForStudent.mockResolvedValueOnce({
        id: inviteId,
        status: GroupInviteStatus.PENDING,
        expiresAt: null,
        groupId: 100,
        group: {
          members: [],
        },
      } as any);

      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 30 } as any); // student group role

      groupInviteRepo.markInviteAccepted.mockResolvedValueOnce({} as any);
      groupInviteRepo.addStudentToGroup.mockResolvedValueOnce({} as any);

      const result = await service.respondToRequest(studentId, inviteId, {
        action: TeacherRequestAction.ACCEPT,
      });

      expect(groupInviteRepo.markInviteAccepted).toHaveBeenCalledWith(inviteId);
      expect(groupInviteRepo.addStudentToGroup).toHaveBeenCalledWith({
        groupId: 100,
        studentId,
        studentGroupRoleId: 30,
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
