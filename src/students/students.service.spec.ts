/* eslint-disable @typescript-eslint/unbound-method */

import { StudentsService } from './students.service';
import { GroupRepository } from 'repositories/group-repository';

describe('StudentsService (unit, manual DI)', () => {
  let service: StudentsService;
  let groupRepo: jest.Mocked<GroupRepository>;

  beforeEach(() => {
    groupRepo = {
      findByTeacher: jest.fn(),
    } as any;

    service = new StudentsService(groupRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // getStudents
  // -------------------------------------------------------------------

  describe('getStudents', () => {
    it('should return empty array if no groups', async () => {
      groupRepo.findByTeacher.mockResolvedValueOnce([]);

      const result = await service.getStudents(1);

      expect(groupRepo.findByTeacher).toHaveBeenCalledWith(1);
      expect(result).toEqual([]);
    });

    it('should return empty array if groups is null/undefined (defensive)', async () => {
      groupRepo.findByTeacher.mockResolvedValueOnce(null as any);

      const result = await service.getStudents(1);

      expect(result).toEqual([]);
    });

    it('should flatten unique students across all groups', async () => {
      // один и тот же студент в двух группах
      groupRepo.findByTeacher.mockResolvedValueOnce([
        {
          id: 10,
          name: 'Group A',
          members: [
            {
              user: {
                id: 100,
                firstName: 'Petr',
                lastName: 'Petrov',
                level: 'INTERMEDIATE',
                contacts: [
                  {
                    contactValue: '111',
                    contactType: { name: 'telegram' },
                  },
                ],
              },
            },
          ],
        },
        {
          id: 20,
          name: 'Group B',
          members: [
            {
              user: {
                id: 100,
                firstName: 'Petr',
                lastName: 'Petrov',
                level: 'INTERMEDIATE',
                contacts: [
                  {
                    contactValue: '111',
                    contactType: { name: 'telegram' },
                  },
                ],
              },
            },
            {
              user: {
                id: 200,
                firstName: null,
                lastName: 'Sidorova',
                level: 'BEGINNER',
                contacts: [
                  {
                    contactValue: 'sidora',
                    contactType: { name: 'telegram' },
                  },
                ],
              },
            },
          ],
        },
      ] as any);

      const result = await service.getStudents(1);

      expect(result).toEqual([
        {
          id: 100,
          name: 'Petr', // берётся firstName
          level: 'INTERMEDIATE',
          telegramValue: '111',
        },
        {
          id: 200,
          name: 'Sidorova', // firstName null, берём lastName
          level: 'BEGINNER',
          telegramValue: 'sidora',
        },
      ]);
    });

    it('should set telegramValue to null if telegram contact not found', async () => {
      groupRepo.findByTeacher.mockResolvedValueOnce([
        {
          id: 10,
          name: 'Group A',
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
                ],
              },
            },
          ],
        },
      ] as any);

      const result = await service.getStudents(1);

      expect(result).toEqual([
        {
          id: 100,
          name: 'Petr',
          level: 'INTERMEDIATE',
          telegramValue: null,
        },
      ]);
    });
  });

  // -------------------------------------------------------------------
  // getGroups
  // -------------------------------------------------------------------

  describe('getGroups', () => {
    it('should map groups and students with telegram values', async () => {
      groupRepo.findByTeacher.mockResolvedValueOnce([
        {
          id: 10,
          name: 'Group A',
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
                    contactValue: '111',
                    contactType: { name: 'telegram' },
                  },
                ],
              },
            },
            {
              user: {
                id: 200,
                firstName: null,
                lastName: 'Sidorova',
                level: 'BEGINNER',
                contacts: [],
              },
            },
          ],
        },
      ] as any);

      const result = await service.getGroups(1);

      expect(groupRepo.findByTeacher).toHaveBeenCalledWith(1);
      expect(result).toEqual([
        {
          id: 10,
          name: 'Group A',
          students: [
            {
              id: 100,
              name: 'Petr',
              level: 'INTERMEDIATE',
              telegramValue: '111',
            },
            {
              id: 200,
              name: 'Sidorova',
              level: 'BEGINNER',
              telegramValue: null,
            },
          ],
        },
      ]);
    });
  });
});
