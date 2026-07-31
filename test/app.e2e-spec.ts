import request from 'supertest';
import * as argon2 from 'argon2';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/modules/prisma/prisma.service';
import { MailService } from '../src/common/modules/mail/mail.service';
import { TelegramNotificationsService } from '../src/common/modules/notifications/telegram-notifications.service';
import { StorageService } from '../src/common/modules/storage/storage.service';
import { AiService } from '../src/ai/ai.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationErrorsToAppException } from '../src/common/errors';

// Minimal Prisma mock — individual tests fill in model methods as needed
const createPrismaMock = () => ({
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  userContact: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  role: { findFirst: jest.fn() },
  contactType: { findUnique: jest.fn(), findFirst: jest.fn() },
  groupMember: { findMany: jest.fn() },
  lesson: { findMany: jest.fn(), findUnique: jest.fn() },
  assignment: { findMany: jest.fn() },
  passwordChangeRequest: { findUnique: jest.fn() },
  passwordResetRequest: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn(),
  $on: jest.fn(),
});

describe('App (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let mailServiceMock: {
    sendActivationMail: jest.Mock;
    sendPasswordChangeMail: jest.Mock;
    sendPasswordResetMail: jest.Mock;
  };

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_INTERNAL_TOKEN = 'test-internal-token';
    prismaMock = createPrismaMock();
    mailServiceMock = {
      sendActivationMail: jest.fn(),
      sendPasswordChangeMail: jest.fn(),
      sendPasswordResetMail: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(MailService)
      .useValue(mailServiceMock)
      .overrideProvider(TelegramNotificationsService)
      .useValue({
        sendLessonAssigned: jest.fn(),
        sendTeacherRequest: jest.fn(),
      })
      .overrideProvider(StorageService)
      .useValue({ uploadUserAvatar: jest.fn() })
      .overrideProvider(AiService)
      .useValue({ translateVocab: jest.fn(), generateAssignment: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationErrorsToAppException,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Health
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return { status: ok }', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DTO validation (ValidationPipe)
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /auth/register — DTO validation', () => {
    const validRest = { consentAccepted: true, consentVersion: 1 };

    it('should return 400 VALIDATION_FAILED with a stable INVALID_EMAIL field code when email is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'Password1!', ...validRest })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: { fields: [{ field: 'email', code: 'INVALID_EMAIL' }] },
      });
      expect(res.body).not.toHaveProperty('message');
      expect(JSON.stringify(res.body)).not.toContain('isEmail');
    });

    it('should return 400 VALIDATION_FAILED with a stable VALUE_TOO_SHORT field code when password is too short (< 6 chars)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'valid@example.com', password: 'abc', ...validRest })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: { fields: [{ field: 'password', code: 'VALUE_TOO_SHORT' }] },
      });
      expect(res.body).not.toHaveProperty('message');
    });

    it('should return 400 VALIDATION_FAILED with an UNKNOWN_FIELD code when extra unexpected fields are sent (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'valid@example.com',
          password: 'Password1!',
          ...validRest,
          admin: true,
        })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: { fields: [{ field: 'admin', code: 'UNKNOWN_FIELD' }] },
      });
      expect(res.body).not.toHaveProperty('message');
      expect(JSON.stringify(res.body)).not.toContain('should not exist');
    });

    it('should return 400 when body is empty', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({})
        .expect(400);
    });

    const validBase = {
      email: 'valid@example.com',
      password: 'Password1!',
    };

    it('should return 400 when consentAccepted is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBase, consentVersion: 1 })
        .expect(400);
    });

    it('should return 400 when consentAccepted is false', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBase, consentAccepted: false, consentVersion: 1 })
        .expect(400);
    });

    // The exhaustive consentAccepted/consentVersion type-validation matrix
    // (missing/decimal/string/etc.) lives in register.dto.spec.ts, run
    // directly against class-validator — identical decorators to what the
    // global ValidationPipe runs, without the cost of going through HTTP
    // (this route is rate-limited to 10 req/60s, so only a few
    // representative full-stack checks are kept here).
    it('should return 400 when consentVersion does not match the current supported version', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBase, consentAccepted: true, consentVersion: 999 })
        .expect(400);
    });

    it('should accept the current supported consent version and register successfully', async () => {
      prismaMock.userContact.findFirst.mockResolvedValueOnce(null);
      prismaMock.role.findFirst.mockResolvedValueOnce({ id: 1 });
      prismaMock.contactType.findFirst.mockResolvedValueOnce({ id: 2 });
      prismaMock.user.create.mockResolvedValueOnce({ id: 1 });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBase, consentAccepted: true, consentVersion: 1 })
        .expect(201);

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consentVersion: 1,
            consentAcceptedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/register/telegram
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /auth/register/telegram', () => {
    const INTERNAL_TOKEN = 'test-internal-token';
    const validTelegramBody = {
      telegramId: 555,
      consentAccepted: true,
      consentVersion: 1,
    };

    function post(body: Record<string, unknown>, token?: string) {
      const req = request(app.getHttpServer())
        .post('/auth/register/telegram')
        .send(body);
      if (token !== undefined) req.set('x-internal-token', token);
      return req;
    }

    it('should return 401 AUTH_UNAUTHENTICATED when the internal token header is missing', async () => {
      const res = await post(validTelegramBody).expect(401);
      expect(res.body).toEqual(
        expect.objectContaining({
          statusCode: 401,
          code: 'AUTH_UNAUTHENTICATED',
        }),
      );
      expect(res.body).not.toHaveProperty('message');
    });

    it('should return 401 AUTH_UNAUTHENTICATED when the internal token is wrong', async () => {
      const res = await post(validTelegramBody, 'wrong-token').expect(401);
      expect(res.body).toEqual(
        expect.objectContaining({
          statusCode: 401,
          code: 'AUTH_UNAUTHENTICATED',
        }),
      );
    });

    // The exhaustive telegramId/consentAccepted/consentVersion type-validation
    // matrix lives in register-telegram.dto.spec.ts, run directly against
    // class-validator (same decorators the global ValidationPipe runs),
    // without HTTP overhead — this route is rate-limited to 10 req/60s, so
    // only a few representative full-stack checks are kept here.
    it('should return 400 when telegramId is 0 (real endpoint, guard + DTO + pipe together)', async () => {
      await post(
        { ...validTelegramBody, telegramId: 0 },
        INTERNAL_TOKEN,
      ).expect(400);
    });

    it('should return 400 when consentVersion does not match the supported version', async () => {
      await post(
        { ...validTelegramBody, consentVersion: 2 },
        INTERNAL_TOKEN,
      ).expect(400);
    });

    it('should return exactly { id } on success, with no sensitive User fields', async () => {
      prismaMock.userContact.findFirst.mockResolvedValueOnce(null);
      prismaMock.role.findFirst.mockResolvedValueOnce({ id: 3 });
      prismaMock.contactType.findFirst.mockResolvedValueOnce({ id: 4 });
      prismaMock.user.create.mockResolvedValueOnce({ id: 777 });

      const res = await post(validTelegramBody, INTERNAL_TOKEN).expect(201);

      expect(res.body).toEqual({ id: 777 });
    });

    it('should return { id } (not an error) when the Telegram user already exists — idempotent duplicate', async () => {
      prismaMock.userContact.findFirst.mockResolvedValueOnce({
        id: 1,
        userId: 42,
      });

      const res = await post(validTelegramBody, INTERNAL_TOKEN).expect(201);
      expect(res.body).toEqual({ id: 42 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // JWT guard — protected routes reject unauthenticated requests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Guards — unauthenticated access', () => {
    it('GET /lessons should return 401 AUTH_UNAUTHENTICATED without JWT, with no message field', async () => {
      const res = await request(app.getHttpServer())
        .get('/lessons')
        .expect(401);
      expect(res.body).toEqual(
        expect.objectContaining({
          statusCode: 401,
          code: 'AUTH_UNAUTHENTICATED',
        }),
      );
      expect(res.body).not.toHaveProperty('message');
      expect(res.body.requestId).toEqual(expect.any(String));
    });

    it('GET /students/my should return 401 without JWT', async () => {
      await request(app.getHttpServer()).get('/students/my').expect(401);
    });

    it('GET /groups/my should return 401 without JWT', async () => {
      await request(app.getHttpServer()).get('/groups/my').expect(401);
    });

    it('GET /admin/metrics/overview should return 401 without JWT', async () => {
      await request(app.getHttpServer())
        .get('/admin/metrics/overview')
        .expect(401);
    });

    it('POST /lessons/vocab/preview should return 401 without JWT', async () => {
      await request(app.getHttpServer())
        .post('/lessons/vocab/preview')
        .expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/login
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    const LOGIN_FAILURE_BODY = expect.objectContaining({
      statusCode: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      requestId: expect.any(String),
    });

    it('should return 401 AUTH_INVALID_CREDENTIALS when user is not found, with no message field', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password1!' })
        .expect(401);

      expect(res.body).toEqual(LOGIN_FAILURE_BODY);
      expect(res.body).not.toHaveProperty('message');
    });

    it('should return 401 AUTH_INVALID_CREDENTIALS when password is incorrect', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 1,
        roleId: 1,
        verified: true,
        passwordHash: await argon2.hash('correct-password'),
        refreshTokenHash: null,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrong-password' })
        .expect(401);

      expect(res.body).toEqual(LOGIN_FAILURE_BODY);
    });

    it('should return 401 AUTH_INVALID_CREDENTIALS when email is not verified — never a distinct AUTH_EMAIL_NOT_VERIFIED code', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 1,
        verified: false,
        passwordHash: await argon2.hash('Password1!'),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'Password1!' })
        .expect(401);

      expect(res.body).toEqual(LOGIN_FAILURE_BODY);
    });

    it('produces byte-identical bodies (aside from requestId) across the three login failure branches', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      const notFound = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password1!' })
        .expect(401);

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 1,
        roleId: 1,
        verified: true,
        passwordHash: await argon2.hash('correct-password'),
      });
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrong-password' })
        .expect(401);

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 1,
        verified: false,
        passwordHash: await argon2.hash('Password1!'),
      });
      const unverified = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'Password1!' })
        .expect(401);

      const strip = (body: Record<string, unknown>) => {
        const rest = { ...body };
        delete rest.requestId;
        return rest;
      };
      expect(strip(notFound.body)).toEqual(strip(wrongPassword.body));
      expect(strip(wrongPassword.body)).toEqual(strip(unverified.body));
    });

    it('echoes a client-supplied X-Request-Id back in both the response header and body.requestId', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Request-Id', 'e2e-fixed-request-id')
        .send({ email: 'nobody@example.com', password: 'Password1!' })
        .expect(401);

      expect(res.headers['x-request-id']).toBe('e2e-fixed-request-id');
      expect(res.body.requestId).toBe('e2e-fixed-request-id');
    });

    it('should return 200 and set auth cookies on valid credentials', async () => {
      const hash = await argon2.hash('Password1!');
      prismaMock.user.findFirst.mockResolvedValue({
        id: 42,
        roleId: 1,
        verified: true,
        passwordHash: hash,
        refreshTokenHash: null,
        firstName: 'Анна',
        lastName: 'Ивановна',
      });
      prismaMock.user.update.mockResolvedValue({} as any);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'teacher@example.com', password: 'Password1!' })
        .expect(201);

      const setCookie: unknown = res.headers['set-cookie'];
      const cookies: string[] = Array.isArray(setCookie)
        ? (setCookie as string[])
        : typeof setCookie === 'string'
          ? [setCookie]
          : [];
      expect(cookies.length).toBeGreaterThan(0);
      const cookieStr = cookies.join('; ');
      expect(cookieStr).toContain('access_token');
      expect(cookieStr).toContain('refresh_token');
      expect(cookieStr).toContain('HttpOnly');
    });

    it('should return 400 when body is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'abc' })
        .expect(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error handling — no stack trace leaks
  // ─────────────────────────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('500 response body is { statusCode, code: INTERNAL_ERROR, requestId } — no message, no stack, no internal reason', async () => {
      // userContact.findFirst throws unexpectedly (simulate DB crash during registration)
      prismaMock.userContact.findFirst.mockRejectedValueOnce(
        new Error('Connection refused at host db.internal:5432'),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'Password1!',
          consentAccepted: true,
          consentVersion: 1,
        })
        .expect(500);

      expect(res.body).toEqual({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        requestId: expect.any(String),
      });
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('message');
      expect(JSON.stringify(res.body)).not.toContain('at ');
      expect(JSON.stringify(res.body)).not.toContain('Connection refused');
      expect(JSON.stringify(res.body)).not.toContain('db.internal');
    });

    it('registration conflict returns 409 AUTH_EMAIL_ALREADY_EXISTS, not the raw Prisma/service message', async () => {
      prismaMock.userContact.findFirst.mockResolvedValueOnce({ id: 1 } as any);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'Password1!',
          consentAccepted: true,
          consentVersion: 1,
        })
        .expect(409);

      expect(res.body).toEqual({
        statusCode: 409,
        code: 'AUTH_EMAIL_ALREADY_EXISTS',
        requestId: expect.any(String),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Forgot / reset password (public flow)
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /auth/forgot-password', () => {
    const NEUTRAL_BODY = expect.objectContaining({ ok: true });

    it('returns 202 { ok: true } and sends the reset email for an existing, eligible user', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 1,
        roleId: 1,
        verified: true,
        passwordHash: 'hashed',
      });
      prismaMock.passwordResetRequest.upsert.mockResolvedValueOnce({} as any);

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(202);

      expect(res.body).toEqual(NEUTRAL_BODY);
      expect(mailServiceMock.sendPasswordResetMail).toHaveBeenCalledTimes(1);
    });

    it('produces a byte-identical 202 body whether the email exists or not, and never sends mail for a nonexistent account', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 1,
        roleId: 1,
        verified: true,
        passwordHash: 'hashed',
      });
      prismaMock.passwordResetRequest.upsert.mockResolvedValueOnce({} as any);
      const existing = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(202);

      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      const nonexistent = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(202);

      const strip = (body: Record<string, unknown>) => {
        const rest = { ...body };
        delete rest.requestId;
        return rest;
      };
      expect(strip(existing.body)).toEqual(strip(nonexistent.body));
      expect(mailServiceMock.sendPasswordResetMail).toHaveBeenCalledTimes(1); // only for the existing account
    });

    it('returns 202 { ok: true } even when the mail provider fails, without leaking the provider error', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 1,
        roleId: 1,
        verified: true,
        passwordHash: 'hashed',
      });
      prismaMock.passwordResetRequest.upsert.mockResolvedValueOnce({} as any);
      mailServiceMock.sendPasswordResetMail.mockRejectedValueOnce(
        new Error('Resend API unreachable'),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(202);

      expect(res.body).toEqual(NEUTRAL_BODY);
      expect(JSON.stringify(res.body)).not.toContain('Resend');
    });

    it('returns 400 VALIDATION_FAILED with an UNKNOWN_FIELD code when a password field is sent (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'user@example.com', password: 'sneaky-new-password' })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: { fields: [{ field: 'password', code: 'UNKNOWN_FIELD' }] },
      });
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    });

    it('is rate limited: repeated requests eventually return 429 RATE_LIMITED, not a raw throttler message', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      let sawRateLimited = false;
      for (let i = 0; i < 10 && !sawRateLimited; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/forgot-password')
          .send({ email: `probe-${i}@example.com` });

        if (res.status === 429) {
          sawRateLimited = true;
          expect(res.body).toEqual({
            statusCode: 429,
            code: 'RATE_LIMITED',
            requestId: expect.any(String),
          });
          expect(res.body).not.toHaveProperty('message');
        } else {
          expect(res.status).toBe(202);
        }
      }

      expect(sawRateLimited).toBe(true);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('returns 400 AUTH_PASSWORDS_DO_NOT_MATCH when password and confirmPassword differ', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'some-token',
          password: 'Password1!',
          confirmPassword: 'Different1!',
        })
        .expect(400);

      expect(res.body).toEqual({
        statusCode: 400,
        code: 'AUTH_PASSWORDS_DO_NOT_MATCH',
        requestId: expect.any(String),
      });
      expect(prismaMock.passwordResetRequest.findUnique).not.toHaveBeenCalled();
    });

    it('returns 400 AUTH_INVALID_TOKEN when no request matches the token', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'unknown-token',
          password: 'Password1!',
          confirmPassword: 'Password1!',
        })
        .expect(400);

      expect(res.body).toEqual({
        statusCode: 400,
        code: 'AUTH_INVALID_TOKEN',
        requestId: expect.any(String),
      });
    });

    it('returns 400 AUTH_TOKEN_EXPIRED when the token has expired, and never opens a transaction to change the password', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValueOnce({
        id: 'req-1',
        userId: 1,
        tokenHash: 'irrelevant-in-this-mock',
        expiresAt: new Date(Date.now() - 1000),
      } as any);
      prismaMock.passwordResetRequest.deleteMany.mockResolvedValueOnce({
        count: 1,
      } as any);

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'expired-token',
          password: 'Password1!',
          confirmPassword: 'Password1!',
        })
        .expect(400);

      expect(res.body).toEqual({
        statusCode: 400,
        code: 'AUTH_TOKEN_EXPIRED',
        requestId: expect.any(String),
      });
      // The password is only ever written inside consumeAndApplyPassword's
      // transaction — an expired token must never reach that point.
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('changes the password on a valid, unexpired token', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValueOnce({
        id: 'req-1',
        userId: 1,
        tokenHash: 'irrelevant-in-this-mock',
        expiresAt: new Date(Date.now() + 60_000),
      } as any);
      prismaMock.$transaction.mockImplementationOnce(
        (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            passwordResetRequest: {
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            user: { update: jest.fn().mockResolvedValue({ id: 1 }) },
          }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'valid-token',
          password: 'NewPassword1!',
          confirmPassword: 'NewPassword1!',
        })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
    });

    it('an old refresh token is rejected with 401 AUTH_SESSION_EXPIRED after the password is reset', async () => {
      // A stateful in-memory user record, shared by findFirst/findUnique/update,
      // so that reset-password's write is actually visible to the later
      // /auth/refresh call — this is what makes the test a genuine chain
      // (login sets refreshTokenHash -> reset nulls it -> refresh rejects it)
      // rather than two independently-mocked facts stitched together.
      const userRecord: {
        id: number;
        roleId: number;
        verified: boolean;
        passwordHash: string;
        refreshTokenHash: string | null;
      } = {
        id: 1,
        roleId: 1,
        verified: true,
        passwordHash: await argon2.hash('OldPassword1!'),
        refreshTokenHash: null,
      };

      prismaMock.user.findFirst.mockImplementation(() =>
        Promise.resolve({ ...userRecord }),
      );
      prismaMock.user.findUnique.mockImplementation(() =>
        Promise.resolve({ ...userRecord }),
      );
      prismaMock.user.update.mockImplementation(({ data }: any) => {
        Object.assign(userRecord, data);
        return Promise.resolve({ ...userRecord });
      });

      try {
        // 1. Log in — this issues a refresh token and persists its hash.
        const loginRes = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'user@example.com', password: 'OldPassword1!' })
          .expect(201);

        const setCookie: unknown = loginRes.headers['set-cookie'];
        const cookies: string[] = Array.isArray(setCookie)
          ? (setCookie as string[])
          : typeof setCookie === 'string'
            ? [setCookie]
            : [];
        const oldRefreshCookie = cookies.find((c) =>
          c.startsWith('refresh_token='),
        );
        expect(oldRefreshCookie).toBeDefined();
        expect(userRecord.refreshTokenHash).toEqual(expect.any(String));

        // 2. Reset the password for this same user via a real conditional-consume
        //    transaction (mirrors consumeAndApplyPassword: id/tokenHash/expiresAt
        //    scoped delete + a single user.update writing passwordHash and
        //    refreshTokenHash: null into the same shared userRecord).
        prismaMock.passwordResetRequest.findUnique.mockResolvedValueOnce({
          id: 'req-1',
          userId: 1,
          tokenHash: 'irrelevant-in-this-mock',
          expiresAt: new Date(Date.now() + 60_000),
        } as any);
        prismaMock.$transaction.mockImplementationOnce(
          (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              passwordResetRequest: {
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
              user: {
                update: ({ data }: any) => {
                  Object.assign(userRecord, data);
                  return Promise.resolve({ ...userRecord });
                },
              },
            }),
        );

        await request(app.getHttpServer())
          .post('/auth/reset-password')
          .send({
            token: 'valid-token',
            password: 'NewPassword1!',
            confirmPassword: 'NewPassword1!',
          })
          .expect(200);

        // Sanity check: the reset really did null out refreshTokenHash on the
        // shared record before we assert anything about /auth/refresh.
        expect(userRecord.refreshTokenHash).toBeNull();

        // 3. The refresh cookie issued *before* the reset must now be rejected.
        const refreshRes = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', oldRefreshCookie!)
          .expect(401);

        expect(refreshRes.body).toMatchObject({
          statusCode: 401,
          code: 'AUTH_SESSION_EXPIRED',
        });
      } finally {
        // This test intentionally installs stateful, cross-call implementations
        // on shared mocks (unlike every other test here, which uses
        // mockResolvedValueOnce). Reset them so later tests get the default
        // createPrismaMock() behavior — jest.clearAllMocks() in beforeEach
        // clears call history but does NOT remove custom implementations.
        prismaMock.user.findFirst.mockReset();
        prismaMock.user.findUnique.mockReset();
        prismaMock.user.update.mockReset();
      }
    });
  });
});
