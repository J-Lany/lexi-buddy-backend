import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TelegramNotificationsService {
  private readonly logger = new Logger(TelegramNotificationsService.name);
  private readonly botBaseUrl = process.env.TELEGRAM_BOT_INTERNAL_URL;
  private readonly internalToken = process.env.TELEGRAM_BOT_INTERNAL_TOKEN;

  constructor(private readonly http: HttpService) {}

  async sendTeacherRequest(options: {
    telegramId: string;
    inviteId: number;
    teacherName: string;
    message?: string;
  }): Promise<void> {
    if (!this.botBaseUrl) {
      this.logger.warn(
        'TELEGRAM_BOT_INTERNAL_URL is not configured, skipping notify',
      );
      return;
    }

    const payload = {
      telegramId: options.telegramId,
      inviteId: options.inviteId,
      teacherName: options.teacherName,
      message: options.message ?? null,
    };

    try {
      await firstValueFrom(
        this.http.post(`${this.botBaseUrl}/internal/teacher-request`, payload, {
          headers: {
            'x-internal-token': this.internalToken ?? '',
          },
          timeout: 5000,
        }),
      );
    } catch (error) {
      console.log(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to send teacher request notification to bot: ${errorMessage}`,
      );
    }
  }
}
