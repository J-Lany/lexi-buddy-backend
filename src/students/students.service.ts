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
}
