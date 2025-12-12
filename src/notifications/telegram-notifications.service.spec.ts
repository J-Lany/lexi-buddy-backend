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

  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };

    httpService = {
      post: jest.fn(),
    } as any;

    service = new TelegramNotificationsService(httpService);

    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = ORIGINAL_ENV;
  });

  const mockedFirstValueFrom = firstValueFrom as jest.Mock;

  // -------------------------------------------------------------------
  // sendTeacherRequest
  // -------------------------------------------------------------------

  describe('sendTeacherRequest', () => {
    const options = {
      telegramId: '123456789',
      inviteId: 42,
      teacherName: 'Анна Ивановна',
      message: 'Привет, давай заниматься английским?',
    };

    it('should warn and skip when TELEGRAM_BOT_INTERNAL_URL is not configured', async () => {
      delete process.env.TELEGRAM_BOT_INTERNAL_URL;

      service = new TelegramNotificationsService(httpService);

      await service.sendTeacherRequest(options);

      expect(warnSpy).toHaveBeenCalledWith(
        'TELEGRAM_BOT_INTERNAL_URL is not configured, skipping notify',
      );
      expect(httpService.post).not.toHaveBeenCalled();
      expect(mockedFirstValueFrom).not.toHaveBeenCalled();
    });

    it('should call http.post with correct URL, payload and headers', async () => {
      process.env.TELEGRAM_BOT_INTERNAL_URL = 'http://telegram-bot:3001';
      process.env.TELEGRAM_BOT_INTERNAL_TOKEN = 'super-secret';

      // пересоздаём сервис после установки env
      service = new TelegramNotificationsService(httpService);

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
      process.env.TELEGRAM_BOT_INTERNAL_URL = 'http://telegram-bot:3001';
      process.env.TELEGRAM_BOT_INTERNAL_TOKEN = 'super-secret';

      service = new TelegramNotificationsService(httpService);

      const mockObservable = {} as any;
      httpService.post.mockReturnValueOnce(mockObservable);
      mockedFirstValueFrom.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.sendTeacherRequest(options),
      ).resolves.toBeUndefined();

      expect(httpService.post).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to send teacher request notification to bot:',
        ),
      );
    });
  });
});
