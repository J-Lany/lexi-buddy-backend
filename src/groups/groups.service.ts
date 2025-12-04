import { Injectable, NotFoundException } from '@nestjs/common';
import { GroupRepository } from 'repositories/group-repository';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class GroupsService {
  constructor(private groupRepo: GroupRepository) {}

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

  async createGroup(teacherId: number, createGroupDto: CreateGroupDto) {
    const newGroup = await this.groupRepo.createGroup(
      teacherId,
      createGroupDto,
    );

    return newGroup;
  }

  async removeStudentFromGroup(
    teacherId: number,
    groupId: number,
    studentId: number,
  ) {
    const group = await this.groupRepo.findGroupForTeacher(teacherId, groupId);

    if (!group) {
      throw new NotFoundException(
        `Group with ID ${groupId} not found or access denied.`,
      );
    }

    const deleteResult = await this.groupRepo.removeStudentFromGroup(
      groupId,
      studentId,
    );

    if (deleteResult.count === 0) {
      throw new NotFoundException(
        `Student with ID ${studentId} not found in group ${groupId}.`,
      );
    }

    return {
      success: true,
      message: `Student ${studentId} removed from group ${groupId}.`,
    };
  }

  async deleteMyGroup(teacherId: number, groupId: number) {
    const group = await this.groupRepo.findGroupForTeacher(teacherId, groupId);

    if (!group) {
      throw new NotFoundException(
        `Group with ID ${groupId} not found or access denied.`,
      );
    }

    await this.groupRepo.deleteGroup(groupId);

    return { success: true, message: `Group ${groupId} deleted successfully.` };
  }
}
