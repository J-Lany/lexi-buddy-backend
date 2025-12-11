import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GroupRepository } from 'repositories/group-repository';
import { RoleRepository } from 'repositories/role.repository';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    private groupRepo: GroupRepository,
    private roleRepo: RoleRepository,
  ) {}

  async getGroups(teacherId: number) {
    const groups = await this.groupRepo.findByTeacher(teacherId);

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      students: group.members.map((member) => {
        const student = member.user;

        return {
          id: student.id,
          name: student.firstName || student.lastName || '',
          level: student.level,
          telegramValue: student.contacts.find(
            (c) => c.contactType.name === 'telegram',
          )?.contactValue,
        };
      }),
    }));
  }

  async createGroup(teacherId: number, createGroupDto: CreateGroupDto) {
    const teacherRole = await this.roleRepo.findGroupRole('teacher');
    const studentRole = await this.roleRepo.findGroupRole('student');

    if (!teacherRole || !studentRole) {
      throw new BadRequestException('Group roles not configured');
    }

    const newGroup = await this.groupRepo.createGroup(
      teacherId,
      createGroupDto,
      {
        teacherRoleId: teacherRole.id,
        studentRoleId: studentRole.id,
      },
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

  async addStudentToGroup(
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

    const existing = await this.groupRepo.studentInGroupExists(
      groupId,
      studentId,
    );
    if (existing) {
      throw new BadRequestException(
        `Student with ID ${studentId} is already in group ${groupId}.`,
      );
    }

    const studentRole = await this.roleRepo.findGroupRole('student');
    if (!studentRole) {
      throw new BadRequestException('Group student role not configured');
    }

    const member = await this.groupRepo.addStudentToGroup(
      groupId,
      studentId,
      studentRole.id,
    );

    return {
      success: true,
      message: `Student ${studentId} added to group ${groupId}.`,
      student: {
        id: member.user.id,
        name: member.user.firstName || member.user.lastName || '',
        level: member.user.level,
      },
    };
  }
}
