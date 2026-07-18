import { StudentsService } from './students.service';
import { GroupRepository } from 'repositories/group-repository';
import { UserRepository } from 'repositories/user.repository';
import { StudentsRepository } from 'repositories/student-repository';

describe('StudentsService (unit, manual DI)', () => {
  let service: StudentsService;

  let groupRepo: jest.Mocked<Partial<GroupRepository>>;
  let userRepo: jest.Mocked<Partial<UserRepository>>;
  let studentsRepo: jest.Mocked<Partial<StudentsRepository>>;

  beforeEach(() => {
    groupRepo = {
      findByTeacher: jest.fn(),
      teacherHasStudent: jest.fn(),
      findTeacherStudentsWithPublicGroups: jest.fn(),
    };

    userRepo = {
      searchStudentsByUsername: jest.fn(),
    };

    studentsRepo = {
      getStudentDashboardRaw: jest.fn(),
    };

    service = new StudentsService(
      groupRepo as any,
      userRepo as any,
      studentsRepo as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // getStudents
  // -------------------------------------------------------------------
  describe('getStudents', () => {
    it('should return empty array if no students', async () => {
      (
        groupRepo.findTeacherStudentsWithPublicGroups as jest.Mock
      ).mockResolvedValueOnce([]);

      const result = await service.getStudents(1);

      expect(
        groupRepo.findTeacherStudentsWithPublicGroups,
      ).toHaveBeenCalledWith(1);
      expect(result).toEqual([]);
    });

    it('should map students and attach only public groups from memberships', async () => {
      (
        groupRepo.findTeacherStudentsWithPublicGroups as jest.Mock
      ).mockResolvedValueOnce([
        {
          id: 100,
          firstName: 'Petr',
          lastName: 'Petrov',
          level: 'INTERMEDIATE',
          username: undefined,
          avatarUrl: 'https://cdn/a.png',
          groupMemberships: [
            { group: { id: 10, name: 'Group A' } },
            { group: { id: 20, name: 'Group B' } },
          ],
        },
        {
          id: 200,
          firstName: null,
          lastName: 'Sidorova',
          level: 'BEGINNER',
          username: 'sidorova',
          avatarUrl: null,
          groupMemberships: [{ group: { id: 20, name: 'Group B' } }],
        },
      ]);

      const result = await service.getStudents(1);

      expect(
        groupRepo.findTeacherStudentsWithPublicGroups,
      ).toHaveBeenCalledWith(1);

      expect(result).toEqual([
        {
          id: 100,
          name: 'Petr',
          level: 'INTERMEDIATE',
          username: undefined,
          avatarUrl: 'https://cdn/a.png',
          groups: [
            { id: 10, name: 'Group A' },
            { id: 20, name: 'Group B' },
          ],
        },
        {
          id: 200,
          name: 'Sidorova',
          level: 'BEGINNER',
          username: 'sidorova',
          avatarUrl: null,
          groups: [{ id: 20, name: 'Group B' }],
        },
      ]);
    });

    it('should include student even if they are only in private group (public groups empty)', async () => {
      (
        groupRepo.findTeacherStudentsWithPublicGroups as jest.Mock
      ).mockResolvedValueOnce([
        {
          id: 300,
          firstName: 'Ivan',
          lastName: 'Ivanov',
          level: 'A2',
          username: 'ivan',
          avatarUrl: null,
          groupMemberships: [],
        },
      ]);

      const result = await service.getStudents(1);

      expect(result).toEqual([
        {
          id: 300,
          name: 'Ivan',
          level: 'A2',
          username: 'ivan',
          avatarUrl: null,
          groups: [],
        },
      ]);
    });

    it('should be defensive for missing memberships array', async () => {
      (
        groupRepo.findTeacherStudentsWithPublicGroups as jest.Mock
      ).mockResolvedValueOnce([
        {
          id: 400,
          firstName: 'NoGroups',
          lastName: null,
          level: null,
          username: null,
          avatarUrl: null,
          groupMemberships: null,
        },
      ]);

      const result = await service.getStudents(1);

      expect(result).toEqual([
        {
          id: 400,
          name: 'NoGroups',
          level: null,
          username: null,
          avatarUrl: null,
          groups: [],
        },
      ]);
    });
  });

  // -------------------------------------------------------------------
  // getGroups
  // -------------------------------------------------------------------
  describe('getGroups', () => {
    it('should map groups and students with telegram values', async () => {
      (groupRepo.findByTeacher as jest.Mock).mockResolvedValueOnce([
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
                  { contactValue: '111', contactType: { name: 'telegram' } },
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
      ]);

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
