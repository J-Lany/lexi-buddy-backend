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
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn(),
  $on: jest.fn(),
});

describe('App (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_INTERNAL_TOKEN = 'test-internal-token';
    prismaMock = createPrismaMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(MailService)
      .useValue({
        sendActivationMail: jest.fn(),
        sendPasswordChangeMail: jest.fn(),
      })
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
});
