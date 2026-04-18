import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Resend } from 'resend';
import { MailService, RESEND_CLIENT } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mockResendClient: {
    emails: {
      send: jest.Mock;
    };
  };

  const env = {
    RESEND_API_KEY: 're_test_key',
    MAIL_FROM: 'Lexi Buddy <no-reply@auth.lexi-buddy.com>',
    ACTIVATION_URL: 'https://api.lexi-buddy.com/auth/activate',
  };

  beforeEach(async () => {
    mockResendClient = {
      emails: {
        send: jest.fn(),
      },
    };

    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        const value = env[key as keyof typeof env];

        if (!value) {
          throw new Error(`${key} is not set`);
        }

        return value;
      }),
      get: jest.fn(() => undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: RESEND_CLIENT,
          useValue: mockResendClient as unknown as Resend,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should send activation email with correct payload', async () => {
    mockResendClient.emails.send.mockResolvedValue({
      data: { id: 'email_123' },
      error: null,
    });

    const email = 'user@example.com';
    const token = '12345';

    await service.sendActivationMail(email, token);

    expect(mockResendClient.emails.send).toHaveBeenCalledTimes(1);

    const payload = mockResendClient.emails.send.mock.calls[0][0];

    expect(payload.from).toBe(env.MAIL_FROM);
    expect(payload.to).toBe(email);
    expect(payload.subject).toBe('Activate your Lexi Buddy account');
    expect(payload.html).toContain(
      'https://api.lexi-buddy.com/auth/activate?token=12345',
    );
    expect(payload.text).toContain(
      'https://api.lexi-buddy.com/auth/activate?token=12345',
    );
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        filename: 'lexi-buddy-icon.png',
        contentId: 'lexi-logo',
      }),
    ]);
  });

  it('should preserve token value correctly in activation URL', async () => {
    mockResendClient.emails.send.mockResolvedValue({
      data: { id: 'email_456' },
      error: null,
    });

    const token = 'abc 123/+?=';

    await service.sendActivationMail('someone@example.com', token);

    const payload = mockResendClient.emails.send.mock.calls[0][0];
    const urlFromText = payload.text.split('\n').at(-1);

    expect(urlFromText).toBeDefined();

    const url = new URL(urlFromText as string);

    expect(url.searchParams.get('token')).toBe(token);
  });

  it('should throw InternalServerErrorException when resend returns an error', async () => {
    mockResendClient.emails.send.mockResolvedValue({
      data: null,
      error: { message: 'provider failed' },
    });

    await expect(
      service.sendActivationMail('user@example.com', 'token'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
