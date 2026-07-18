/* eslint-disable @typescript-eslint/unbound-method */

import { TelegramNotificationsService } from './telegram-notifications.service';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

jest.mock('rxjs', () => ({
  firstValueFrom: jest.fn(),
}));

describe('TelegramNotificationsService (unit, manual DI)', () => {
  let service: TelegramNotificationsService;
  let httpService: jest.Mocked<HttpService>;
  let errorSpy: jest.SpyInstance;

  const ORIGINAL_ENV = process.env;
  const mockedFirstValueFrom = firstValueFrom as jest.Mock;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };

    process.env.TELEGRAM_BOT_INTERNAL_URL = 'http://telegram-bot:3001';
    process.env.TELEGRAM_BOT_INTERNAL_TOKEN = 'super-secret';

    httpService = {
      post: jest.fn(),
    } as any;

    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    service = new TelegramNotificationsService(httpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = ORIGINAL_ENV;
  });

  describe('sendTeacherRequest', () => {
    const options = {
      telegramId: '123456789',
      inviteId: 42,
      teacherName: 'Анна Ивановна',
      message: 'Привет, давай заниматься английским?',
    };

    it('should throw when TELEGRAM_BOT_INTERNAL_URL is not configured', () => {
      delete process.env.TELEGRAM_BOT_INTERNAL_URL;

      expect(() => new TelegramNotificationsService(httpService)).toThrow(
        'TELEGRAM_BOT_INTERNAL_URL is missing',
      );
    });

    it('should throw when TELEGRAM_BOT_INTERNAL_TOKEN is not configured', () => {
      delete process.env.TELEGRAM_BOT_INTERNAL_TOKEN;

      expect(() => new TelegramNotificationsService(httpService)).toThrow(
        'TELEGRAM_BOT_INTERNAL_TOKEN is missing',
      );
    });

    it('should call http.post with correct URL, payload and headers', async () => {
      const mockObservable = {} as any;
      httpService.post.mockReturnValueOnce(mockObservable);
      mockedFirstValueFrom.mockResolvedValueOnce(undefined);

      await service.sendTeacherRequest(options);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://telegram-bot:3001/internal/teacher-request',
        {
          telegramId: options.telegramId,
          inviteId: options.inviteId,
          teacherName: options.teacherName,
          message: options.message,
        },
        {
          headers: {
            'x-internal-token': 'super-secret',
          },
          timeout: 5000,
        },
      );

      expect(mockedFirstValueFrom).toHaveBeenCalledWith(mockObservable);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should log error if http call fails but not throw', async () => {
      const mockObservable = {} as any;
      httpService.post.mockReturnValueOnce(mockObservable);
      mockedFirstValueFrom.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.sendTeacherRequest(options),
      ).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'Telegram notify failed (/internal/teacher-request): boom',
      );
    });
  });
});
