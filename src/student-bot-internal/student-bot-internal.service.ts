import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentBotInternalRepository } from '../repositories/student-bot-internal.repository';

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
}
