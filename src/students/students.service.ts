import { Injectable } from '@nestjs/common';

import { GroupRepository } from 'repositories/group-repository';
import { transformGroupsToFlatStudents } from './utils/student-transformer';

@Injectable()
export class StudentsService {
  constructor(private groupRepo: GroupRepository) {}

  async getStudents(teacherId: number) {
    const students = await this.groupRepo.findByTeacher(teacherId);
    if (!students || students.length === 0) return [];

    return transformGroupsToFlatStudents(students);
  }

  async getGroups(teacherId: number) {
    const groups = await this.groupRepo.findByTeacher(teacherId);

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      students: group.students.map((studentInGroup) => ({
        id: studentInGroup.student.id,
        name:
          studentInGroup.student.firstName ||
          studentInGroup.student.lastName ||
          '',
        level: studentInGroup.student.level,
        telegramValue: studentInGroup.student.contacts.find(
          (c) => c.contactType.name === 'telegram',
        )?.contactValue,
      })),
    }));
  }
}
