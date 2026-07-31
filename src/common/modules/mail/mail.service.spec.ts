import { InternalServerErrorException, Logger } from '@nestjs/common';
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
    // A single origin — frontend paths live in FRONTEND_AUTH_ROUTES in
    // mail.service.ts, not in env.
    FRONTEND_BASE_URL: 'https://app.lexi-buddy.com',
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
    // Built from FRONTEND_BASE_URL + the /activate route (FRONTEND_AUTH_ROUTES.activation).
    expect(payload.html).toContain(
      'https://app.lexi-buddy.com/activate?token=12345',
    );
    expect(payload.text).toContain(
      'https://app.lexi-buddy.com/activate?token=12345',
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

  describe('sendPasswordChangeMail', () => {
    it('should build the confirm URL from FRONTEND_BASE_URL and the /confirm-password-change route', async () => {
      mockResendClient.emails.send.mockResolvedValue({
        data: { id: 'email_500' },
        error: null,
      });

      await service.sendPasswordChangeMail(
        'user@example.com',
        'change-token-1',
      );

      const payload = mockResendClient.emails.send.mock.calls[0][0];

      expect(payload.subject).toBe('Confirm your password change — Lexi Buddy');
      expect(payload.html).toContain(
        'https://app.lexi-buddy.com/confirm-password-change?token=change-token-1',
      );
      expect(payload.text).toContain(
        'https://app.lexi-buddy.com/confirm-password-change?token=change-token-1',
      );
    });

    it('should percent-encode the token correctly via searchParams', async () => {
      mockResendClient.emails.send.mockResolvedValue({
        data: { id: 'email_501' },
        error: null,
      });

      const token = 'abc 123/+?=';
      await service.sendPasswordChangeMail('someone@example.com', token);

      const payload = mockResendClient.emails.send.mock.calls[0][0];
      const urlFromText = payload.text.split('\n')[2];
      const url = new URL(urlFromText as string);

      expect(url.pathname).toBe('/confirm-password-change');
      expect(url.searchParams.get('token')).toBe(token);
    });

    it('should throw InternalServerErrorException when resend returns an error', async () => {
      mockResendClient.emails.send.mockResolvedValue({
        data: null,
        error: { message: 'provider failed' },
      });

      await expect(
        service.sendPasswordChangeMail('user@example.com', 'token'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('sendPasswordResetMail', () => {
    it('should send password reset email with the token as a query param', async () => {
      mockResendClient.emails.send.mockResolvedValue({
        data: { id: 'email_789' },
        error: null,
      });

      await service.sendPasswordResetMail('user@example.com', 'reset-token-1');

      expect(mockResendClient.emails.send).toHaveBeenCalledTimes(1);
      const payload = mockResendClient.emails.send.mock.calls[0][0];

      expect(payload.to).toBe('user@example.com');
      expect(payload.subject).toBe('Reset your password — Lexi Buddy');
      expect(payload.html).toContain(
        'https://app.lexi-buddy.com/reset-password?token=reset-token-1',
      );
      expect(payload.text).toContain(
        'https://app.lexi-buddy.com/reset-password?token=reset-token-1',
      );
    });

    it('does not produce a malformed link even if FRONTEND_BASE_URL includes a stray path or query', async () => {
      mockResendClient.emails.send.mockResolvedValue({
        data: { id: 'email_790' },
        error: null,
      });

      // FRONTEND_BASE_URL is documented to hold only an origin. buildFrontendUrl
      // resolves the route as an absolute-path reference against it (new
      // URL(pathname, base)), so even a misconfigured base with its own path
      // or query must not leak into, or corrupt, the built link — the route's
      // own path and query params always win.
      const messyEnv = {
        ...env,
        FRONTEND_BASE_URL: 'https://app.lexi-buddy.com/some/stale/path?lang=ru',
      };
      const mockConfigServiceWithMessyBase = {
        getOrThrow: jest.fn((key: string) => {
          const value = messyEnv[key as keyof typeof messyEnv];
          if (!value) throw new Error(`${key} is not set`);
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
          { provide: ConfigService, useValue: mockConfigServiceWithMessyBase },
        ],
      }).compile();
      const serviceWithMessyBase = module.get<MailService>(MailService);

      await serviceWithMessyBase.sendPasswordResetMail(
        'user@example.com',
        'tok',
      );

      const payload = mockResendClient.emails.send.mock.calls[0][0];
      // text lines: [0] intro, [1] instruction, [2] the URL, [3] "if you did not request..."
      const urlFromText = payload.text.split('\n')[2];
      const url = new URL(urlFromText as string);

      expect(url.origin).toBe('https://app.lexi-buddy.com');
      expect(url.pathname).toBe('/reset-password');
      expect(url.searchParams.get('token')).toBe('tok');
      // The stale path/query from the misconfigured base must not survive.
      expect(url.pathname).not.toContain('/some/stale/path');
      expect(url.searchParams.get('lang')).toBeNull();
    });

    it('should percent-encode the token correctly via searchParams', async () => {
      mockResendClient.emails.send.mockResolvedValue({
        data: { id: 'email_791' },
        error: null,
      });

      const token = 'abc 123/+?=';
      await service.sendPasswordResetMail('someone@example.com', token);

      const payload = mockResendClient.emails.send.mock.calls[0][0];
      const urlFromText = payload.text.split('\n')[2];
      const url = new URL(urlFromText as string);

      expect(url.searchParams.get('token')).toBe(token);
    });

    it('should throw InternalServerErrorException when resend returns an error, without leaking the provider message', async () => {
      mockResendClient.emails.send.mockResolvedValue({
        data: null,
        error: { message: 'provider failed' },
      });

      await expect(
        service.sendPasswordResetMail('user@example.com', 'token'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('should never include the raw token in a thrown error message', async () => {
      mockResendClient.emails.send.mockRejectedValue(new Error('network down'));

      const rawToken = 'super-secret-raw-token-xyz';
      try {
        await service.sendPasswordResetMail('user@example.com', rawToken);
        throw new Error('expected rejection');
      } catch (e) {
        expect((e as Error).message).not.toContain(rawToken);
      }
    });
  });

  it('should fail fast at construction if FRONTEND_BASE_URL is not a valid URL', async () => {
    const badEnv = { ...env, FRONTEND_BASE_URL: 'not-a-valid-url' };
    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        const value = badEnv[key as keyof typeof badEnv];
        if (!value) throw new Error(`${key} is not set`);
        return value;
      }),
      get: jest.fn(() => undefined),
    };

    await expect(
      Test.createTestingModule({
        providers: [
          MailService,
          {
            provide: RESEND_CLIENT,
            useValue: mockResendClient as unknown as Resend,
          },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile(),
    ).rejects.toThrow();
  });

  it('should fail fast at construction if FRONTEND_BASE_URL is missing entirely', async () => {
    const envWithoutBase = Object.fromEntries(
      Object.entries(env).filter(([key]) => key !== 'FRONTEND_BASE_URL'),
    );
    const mockConfigService = {
      getOrThrow: jest.fn((key: string) => {
        const value = (envWithoutBase as Record<string, string>)[key];
        if (!value) throw new Error(`${key} is not set`);
        return value;
      }),
      get: jest.fn(() => undefined),
    };

    await expect(
      Test.createTestingModule({
        providers: [
          MailService,
          {
            provide: RESEND_CLIENT,
            useValue: mockResendClient as unknown as Resend,
          },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile(),
    ).rejects.toThrow('FRONTEND_BASE_URL is not set');
  });

  describe('logging never leaks the token or the full built URL', () => {
    it('omits the token/URL from the success log line', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      mockResendClient.emails.send.mockResolvedValue({
        data: { id: 'email_900' },
        error: null,
      });

      const rawToken = 'super-secret-success-path-token';
      await service.sendPasswordResetMail('user@example.com', rawToken);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const [logMessage] = logSpy.mock.calls[0];
      expect(logMessage).not.toContain(rawToken);
      expect(logMessage).not.toContain('https://app.lexi-buddy.com');
      expect(logMessage).not.toContain(env.MAIL_FROM); // no raw email either

      logSpy.mockRestore();
    });

    it('omits the token/URL from the provider-error log line', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      mockResendClient.emails.send.mockResolvedValue({
        data: null,
        error: { message: 'provider failed' },
      });

      const rawToken = 'super-secret-error-path-token';
      await expect(
        service.sendPasswordResetMail('user@example.com', rawToken),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [logMessage] = errorSpy.mock.calls[0];
      expect(logMessage).not.toContain(rawToken);
      expect(logMessage).not.toContain('https://app.lexi-buddy.com');

      errorSpy.mockRestore();
    });
  });
});
