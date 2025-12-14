import { Injectable } from '@nestjs/common';
import { GroupRepository } from 'repositories/group-repository';
import { StudentDto } from './dto/student.dto';

@Injectable()
export class StudentsService {
  constructor(private groupRepo: GroupRepository) {}

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
