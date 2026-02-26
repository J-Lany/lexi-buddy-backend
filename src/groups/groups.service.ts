import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { GroupRepository } from 'repositories/group-repository';
import { RoleRepository } from 'repositories/role.repository';
import { CreateGroupDto } from './dto/create-group.dto';
import { round1 } from 'common/utils/round';
import { DONE_STATUSES } from 'common/constants/student-assignment';

@Injectable()
export class GroupsService {
  constructor(
    private groupRepo: GroupRepository,
    private roleRepo: RoleRepository,
  ) {}

  async getGroups(teacherId: number) {
    const groups = await this.groupRepo.findByTeacher(teacherId);
    const groupsWithMultipleStudents = groups.filter(
      (group) => group.members.length > 1,
    );

    return groupsWithMultipleStudents.map((group) => ({
      id: group.id,
      name: group.name,
      level: group.level,
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

  async getGroupDashboard(teacherId: number, groupId: number) {
    const canSee = await this.groupRepo.findGroupForTeacher(teacherId, groupId);
    if (!canSee) throw new ForbiddenException('No access to this group');

    const raw = await this.groupRepo.getGroupDashboardRaw(groupId);

    if (!raw.group) throw new NotFoundException('Group not found');

    const studentsTotal = raw.students.length;

    const assignmentToLessonId = new Map<number, number>();
    const totalAssignmentsByLesson = new Map<number, number>();

    const lessons = raw.lessons as Array<
      (typeof raw.lessons)[number] & {
        assignments: { id: number }[];
      }
    >;

    for (const lesson of lessons) {
      totalAssignmentsByLesson.set(lesson.id, lesson.assignments?.length ?? 0);

      for (const a of lesson.assignments ?? []) {
        assignmentToLessonId.set(a.id, lesson.id);
      }
    }

    const doneCountByLessonStudent = new Map<string, number>();

    for (const sa of raw.studentAssignments) {
      const status = sa.status;
      if (!status) continue;

      if (!DONE_STATUSES.includes(status)) continue;

      const lessonId = assignmentToLessonId.get(sa.assignmentId);
      if (!lessonId) continue;

      const key = `${lessonId}:${sa.userId}`;
      doneCountByLessonStudent.set(
        key,
        (doneCountByLessonStudent.get(key) ?? 0) + 1,
      );
    }

    const lessonsDto = lessons.map((lesson) => {
      const assignmentsTotal = totalAssignmentsByLesson.get(lesson.id) ?? 0;

      let studentsStarted = 0;
      let studentsDone = 0;

      for (const s of raw.students) {
        const key = `${lesson.id}:${s.id}`;
        const doneCount = doneCountByLessonStudent.get(key) ?? 0;

        if (doneCount > 0) studentsStarted += 1;
        if (assignmentsTotal > 0 && doneCount >= assignmentsTotal)
          studentsDone += 1;
      }

      const percentDone =
        studentsTotal > 0 ? round1((studentsDone / studentsTotal) * 100) : 0;

      return {
        id: lesson.id,
        groupId,
        title: lesson.title,
        topic: lesson.topic,
        level: lesson.level,
        createdAt: lesson.createdAt,
        assignmentsTotal,
        progress: {
          studentsTotal,
          studentsStarted,
          studentsDone,
          percentDone,
        },
      };
    });

    const studentsDto = raw.students.map((u) => ({
      id: u.id,
      name: u.firstName || u.lastName || '',
      username: u.username,
      level: u.level,
      avatarUrl: u.avatarUrl,
      telegramValue:
        u.contacts.find((c) => c.contactType.name === 'telegram')
          ?.contactValue ?? null,
    }));

    return {
      group: {
        id: raw.group.id,
        name: raw.group.name,
        description: raw.group.description,
        level: raw.group.level,
        studentsCount: studentsTotal,
      },
      students: studentsDto,
      lessons: lessonsDto,
    };
  }
}
