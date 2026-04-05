import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TelegramNotificationsService {
  private readonly logger = new Logger(TelegramNotificationsService.name);
  private readonly botBaseUrl = process.env.TELEGRAM_BOT_INTERNAL_URL;
  private readonly internalToken = process.env.TELEGRAM_BOT_INTERNAL_TOKEN;

  constructor(private readonly http: HttpService) {
    if (!this.botBaseUrl) {
      throw new Error('TELEGRAM_BOT_INTERNAL_URL is missing');
    }

    if (!this.internalToken) {
      throw new Error('TELEGRAM_BOT_INTERNAL_TOKEN is missing');
    }
  }

  private async postInternal(path: string, payload: unknown): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.botBaseUrl}${path}`, payload, {
          headers: { 'x-internal-token': this.internalToken },
          timeout: 5000,
        }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Telegram notify failed (${path}): ${errorMessage}`);
    }
  }

  async sendLessonAssigned(options: {
    telegramId: string;
    lessonId: number;
    lessonTitle: string;
    teacherName?: string | null;
  }): Promise<void> {
    return this.postInternal('/internal/lesson-assigned', {
      telegramId: options.telegramId,
      lessonId: options.lessonId,
      lessonTitle: options.lessonTitle,
      teacherName: options.teacherName ?? null,
    });
  }

  async sendTeacherRequest(options: {
    telegramId: string;
    inviteId: number;
    teacherName: string;
    message?: string;
  }): Promise<void> {
    return this.postInternal('/internal/teacher-request', {
      telegramId: options.telegramId,
      inviteId: options.inviteId,
      teacherName: options.teacherName,
      message: options.message ?? null,
    });
  }
}
