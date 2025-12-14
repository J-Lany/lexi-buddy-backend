/* eslint-disable @typescript-eslint/unbound-method */

import { GroupsService } from './groups.service';
import { GroupRepository } from 'repositories/group-repository';
import { RoleRepository } from 'repositories/role.repository';
import { NotFoundException } from '@nestjs/common';

describe('GroupsService (unit, manual DI)', () => {
  let service: GroupsService;

  let groupRepo: jest.Mocked<GroupRepository>;
  let roleRepo: jest.Mocked<RoleRepository>;

  beforeEach(() => {
    groupRepo = {
      findByTeacher: jest.fn(),
      createGroup: jest.fn(),
      removeStudentFromGroup: jest.fn(),
      findGroupForTeacher: jest.fn(),
      deleteGroup: jest.fn(),
      studentInGroupExists: jest.fn(),
      addStudentToGroup: jest.fn(),
    } as any;

    roleRepo = {
      findGlobalRole: jest.fn(),
      findGroupRole: jest.fn(),
    } as any;

    service = new GroupsService(groupRepo, roleRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // getGroups
  // -------------------------------------------------------------------

  describe('getGroups', () => {
    it('should return empty array if no groups', async () => {
      groupRepo.findByTeacher.mockResolvedValueOnce([]);

      const result = await service.getGroups(1);

      expect(groupRepo.findByTeacher).toHaveBeenCalledWith(1);
      expect(result).toEqual([]);
    });

    it('should not return groups with 0 or 1 students', async () => {
      groupRepo.findByTeacher.mockResolvedValueOnce([
        { id: 1, name: 'Empty group', members: [] },
        {
          id: 2,
          name: 'Single student group',
          members: [{ user: { id: 10 } }],
        },
      ] as any);

      const result = await service.getGroups(1);

      expect(result).toEqual([]);
    });

    it('should map groups and students with telegram contact', async () => {
      groupRepo.findByTeacher.mockResolvedValueOnce([
        {
          id: 10,
          name: 'Group 1',
          members: [
            {
              user: {
                id: 100,
                firstName: 'Petr',
                lastName: 'Petrov',
                level: 'INTERMEDIATE',
                contacts: [
                  {
                    contactValue: 'petr@example.com',
                    contactType: { name: 'email' },
                  },
                  {
                    contactValue: '123456789',
                    contactType: { name: 'telegram' },
                  },
                ],
              },
            },
            {
              user: {
                id: 101,
                firstName: 'Ivan',
                lastName: 'Ivanov',
                level: 'BEGINNER',
                contacts: [
                  {
                    contactValue: 'ivan_tg',
                    contactType: { name: 'telegram' },
                  },
                ],
              },
            },
          ],
        },
      ] as any);

      const result = await service.getGroups(1);

      expect(result).toEqual([
        {
          id: 10,
          name: 'Group 1',
          students: [
            {
              id: 100,
              name: 'Petr',
              level: 'INTERMEDIATE',
              telegramValue: '123456789',
            },
            {
              id: 101,
              name: 'Ivan',
              level: 'BEGINNER',
              telegramValue: 'ivan_tg',
            },
          ],
        },
      ]);
    });
  });

  // -------------------------------------------------------------------
  // createGroup
  // -------------------------------------------------------------------

  describe('createGroup', () => {
    const dto = { name: 'New group', description: 'desc', studentIds: [1, 2] };

    it('should throw if group roles are not configured', async () => {
      roleRepo.findGroupRole
        .mockResolvedValueOnce(null as any)
        .mockResolvedValueOnce({ id: 2 } as any);

      await expect(service.createGroup(1, dto)).rejects.toThrow(
        'Group roles not configured',
      );
    });

    it('should create group with correct roles', async () => {
      roleRepo.findGroupRole
        .mockResolvedValueOnce({ id: 10 } as any)
        .mockResolvedValueOnce({ id: 20 } as any);

      const createdGroup = {
        id: 5,
        name: 'New group',
        members: [],
      };

      groupRepo.createGroup.mockResolvedValueOnce(createdGroup as any);

      const result = await service.createGroup(1, dto);

      expect(roleRepo.findGroupRole).toHaveBeenNthCalledWith(1, 'teacher');
      expect(roleRepo.findGroupRole).toHaveBeenNthCalledWith(2, 'student');
      expect(groupRepo.createGroup).toHaveBeenCalledWith(1, dto, {
        teacherRoleId: 10,
        studentRoleId: 20,
      });
      expect(result).toBe(createdGroup);
    });
  });

  // -------------------------------------------------------------------
  // removeStudentFromGroup
  // -------------------------------------------------------------------

  describe('removeStudentFromGroup', () => {
    it('should throw if group not found or access denied', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce(null);

      await expect(service.removeStudentFromGroup(1, 100, 200)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if student not found in group', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce({ id: 100 } as any);
      groupRepo.removeStudentFromGroup.mockResolvedValueOnce({
        count: 0,
      } as any);

      await expect(service.removeStudentFromGroup(1, 100, 200)).rejects.toThrow(
        'Student with ID 200 not found in group 100.',
      );
    });

    it('should remove student and return success message', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce({ id: 100 } as any);
      groupRepo.removeStudentFromGroup.mockResolvedValueOnce({
        count: 1,
      } as any);

      const result = await service.removeStudentFromGroup(1, 100, 200);

      expect(groupRepo.removeStudentFromGroup).toHaveBeenCalledWith(100, 200);
      expect(result).toEqual({
        success: true,
        message: 'Student 200 removed from group 100.',
      });
    });
  });

  // -------------------------------------------------------------------
  // deleteMyGroup
  // -------------------------------------------------------------------

  describe('deleteMyGroup', () => {
    it('should throw if group not found or access denied', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce(null);

      await expect(service.deleteMyGroup(1, 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete group and return success message', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce({ id: 100 } as any);
      groupRepo.deleteGroup.mockResolvedValueOnce({} as any);

      const result = await service.deleteMyGroup(1, 100);

      expect(groupRepo.deleteGroup).toHaveBeenCalledWith(100);
      expect(result).toEqual({
        success: true,
        message: 'Group 100 deleted successfully.',
      });
    });
  });

  // -------------------------------------------------------------------
  // addStudentToGroup
  // -------------------------------------------------------------------

  describe('addStudentToGroup', () => {
    it('should throw if group not found or access denied', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce(null);

      await expect(service.addStudentToGroup(1, 100, 200)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if student already in group', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce({ id: 100 } as any);
      groupRepo.studentInGroupExists.mockResolvedValueOnce({ id: 1 } as any);

      await expect(service.addStudentToGroup(1, 100, 200)).rejects.toThrow(
        'Student with ID 200 is already in group 100.',
      );
    });

    it('should throw if group student role not configured', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce({ id: 100 } as any);
      groupRepo.studentInGroupExists.mockResolvedValueOnce(null);
      roleRepo.findGroupRole.mockResolvedValueOnce(null as any);

      await expect(service.addStudentToGroup(1, 100, 200)).rejects.toThrow(
        'Group student role not configured',
      );
    });

    it('should add student and return success response', async () => {
      groupRepo.findGroupForTeacher.mockResolvedValueOnce({ id: 100 } as any);
      groupRepo.studentInGroupExists.mockResolvedValueOnce(null);
      roleRepo.findGroupRole.mockResolvedValueOnce({ id: 20 } as any);

      groupRepo.addStudentToGroup.mockResolvedValueOnce({
        user: {
          id: 200,
          firstName: 'Petr',
          lastName: 'Petrov',
          level: 'INTERMEDIATE',
        },
      } as any);

      const result = await service.addStudentToGroup(1, 100, 200);

      expect(groupRepo.addStudentToGroup).toHaveBeenCalledWith(100, 200, 20);
      expect(result).toEqual({
        success: true,
        message: 'Student 200 added to group 100.',
        student: {
          id: 200,
          name: 'Petr',
          level: 'INTERMEDIATE',
        },
      });
    });
  });
});
