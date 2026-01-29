import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentBotInternalRepository } from '../repositories/student-bot-internal.repository';
import { SubmitAssignmentInternalDto } from './dto/submit-assignment-internal.dto';

@Injectable()
export class StudentBotInternalService {
  constructor(private readonly repo: StudentBotInternalRepository) {}

  async getStudentLessonsByTelegramId(telegramId: number) {
    const studentId = await this.repo.findStudentIdByTelegramId(telegramId);
    if (!studentId) throw new NotFoundException('Student not found');

    const lessons = await this.repo.findLessonsForStudent(studentId);

    return {
      items: lessons.map((l) => ({
        lessonId: l.id,
        title: l.title,
        level: l.level ?? null,
        topic: l.topic ?? null,
      })),
    };
  }

  async getStudentProfileByTelegramId(telegramId: number) {
    const profile = await this.repo.findStudentProfileByTelegramId(telegramId);
    if (!profile) throw new NotFoundException('Student not found');

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

    const data = await this.repo.createNewAttemptAndGetPayload(
      studentId,
      assignmentId,
    );
    if (!data) throw new NotFoundException('Assignment not found');

    return {
      studentAssignmentId: data.studentAssignment.id,
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
      studentAssignmentId: dto.studentAssignmentId,
      results: dto.results,
      clientSessionId: dto.clientSessionId ?? null,
    });

    if (!saved) throw new NotFoundException('Attempt not found');
    return saved;
  }
}
