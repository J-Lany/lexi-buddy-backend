import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentBotInternalRepository } from 'repositories/student-bot-internal.repository';
import { SubmitAssignmentInternalDto } from './dto/submit-assignment-internal.dto';
import { ActivityService } from 'common/modules/activity/activity.service';

@Injectable()
export class StudentBotInternalService {
  constructor(
    private readonly repo: StudentBotInternalRepository,
    private readonly activity: ActivityService,
  ) {}

  async getStudentLessonsByTelegramId(telegramId: number) {
    const studentId = await this.repo.findStudentIdByTelegramId(telegramId);
    if (!studentId) throw new NotFoundException('Student not found');

    await this.activity.touchUserLastVisit(studentId);

    const lessons = await this.repo.findLessonsForStudent(studentId);

    return {
      items: lessons.map((l) => ({
        lessonId: l.id,
        title: l.title,
        targetLanguage: (l as any).targetLanguage as string,
        nativeLanguage: (l as any).nativeLanguage as string,
        level: l.level ?? null,
        topic: l.topic ?? null,
      })),
    };
  }

  async getStudentProfileByTelegramId(telegramId: number) {
    const profile = await this.repo.findStudentProfileByTelegramId(telegramId);
    if (!profile) throw new NotFoundException('Student not found');

    await this.activity.touchUserLastVisit(profile.id);

    return profile;
  }

  async getLessonAssignmentsByTelegramId(telegramId: number, lessonId: number) {
    const studentId = await this.repo.findStudentIdByTelegramId(telegramId);
    if (!studentId) throw new NotFoundException('Student not found');

    const items = await this.repo.findAssignmentsForStudentInLesson(
      studentId,
      lessonId,
    );

    return {
      items: items.map((a) => ({
        assignmentId: a.assignmentId,
        type: a.typeName,
        status: a.status,
        score: a.score ?? null,
      })),
    };
  }

  async getAssignmentPreviewByTelegramId(
    telegramId: number,
    assignmentId: number,
  ) {
    const studentId = await this.repo.findStudentIdByTelegramId(telegramId);
    if (!studentId) throw new NotFoundException('Student not found');

    const assigned = await this.repo.isAssignmentAssignedToStudent(
      studentId,
      assignmentId,
    );
    if (!assigned) throw new NotFoundException('Assignment not found');

    const assignment = await this.repo.getAssignmentPayload(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');

    return { assignment };
  }

  async startNewAssignmentAttemptByTelegramId(
    telegramId: number,
    assignmentId: number,
  ) {
    const studentId = await this.repo.findStudentIdByTelegramId(telegramId);
    if (!studentId) throw new NotFoundException('Student not found');

    await this.activity.touchUserLastVisit(studentId);

    const data = await this.repo.createNewAttemptAndGetPayload(
      studentId,
      assignmentId,
    );
    if (!data) throw new NotFoundException('Assignment not found');

    return {
      attemptId: data.studentAssignment.id,
      attemptNo: data.studentAssignment.attemptNo,
      status: data.studentAssignment.status,
      attemptsPolicy: {
        maxAttempts: 3,
        showCorrectOnAttempt: 3,
        appliesToQuestionTypes: ['gap_fill', 'open_text'],
      },
      assignment: data.assignment,
    };
  }

  async submitAssignmentAttemptByTelegramId(dto: SubmitAssignmentInternalDto) {
    const studentId = await this.repo.findStudentIdByTelegramId(dto.telegramId);
    if (!studentId) throw new NotFoundException('Student not found');

    const saved = await this.repo.saveAttemptResultsAndComplete({
      userId: studentId,
      attemptId: dto.attemptId,
      results: dto.results,
      clientSessionId: dto.clientSessionId ?? null,
    });

    if (!saved) throw new NotFoundException('Attempt not found');
    return saved;
  }
}
