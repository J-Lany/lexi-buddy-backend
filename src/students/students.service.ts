import { Injectable } from '@nestjs/common';
import { GroupRepository } from 'repositories/group-repository';
import { StudentDto } from './dto/student.dto';
import { UserRepository } from 'repositories/user.repository';

@Injectable()
export class StudentsService {
  constructor(
    private groupRepo: GroupRepository,
    private userRepo: UserRepository,
  ) {}

  async getStudents(teacherId: number): Promise<StudentDto[]> {
    const groups = await this.groupRepo.findByTeacher(teacherId);

    if (!groups || groups.length === 0) return [];

    const allMembers = groups.flatMap((g) => g.members);

    const uniqueById = new Map<number, StudentDto>();

    for (const member of allMembers) {
      const user = member.user;

      if (!uniqueById.has(user.id)) {
        uniqueById.set(user.id, {
          id: user.id,
          name: user.firstName || user.lastName || '',
          level: user.level,
          username: user.username,
        });
      }
    }

    return Array.from(uniqueById.values());
  }

  async getAllStudents(teacherId: number, q: string): Promise<StudentDto[]> {
    const query = (q ?? '').trim().replace(/^@+/, '');

    if (query.length < 2) return [];

    const users = await this.userRepo.searchStudentsByUsername({
      q: query,
      take: 15,
      excludeTeacherId: teacherId,
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      level: u.level,
      name: u.firstName || u.lastName || '',
    }));
  }

  async getGroups(teacherId: number) {
    const groups = await this.groupRepo.findByTeacher(teacherId);

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      students: group.members.map((member) => {
        const user = member.user;

        return {
          id: user.id,
          name: user.firstName || user.lastName || '',
          level: user.level,
          telegramValue:
            user.contacts.find((c) => c.contactType.name === 'telegram')
              ?.contactValue ?? null,
        };
      }),
    }));
  }
}
