import request from 'supertest';
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

// Kept in its own file/app instance (bootstrap mirrors app.e2e-spec.ts)
// rather than added to the shared app there: POST /auth/register is
// throttled to 10 req/60s per IP, and that file's register-related tests
// already sit at exactly that limit within the shared app's lifetime.
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

describe('Register re-activation flow (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let mailServiceMock: {
    sendActivationMail: jest.Mock;
    sendPasswordChangeMail: jest.Mock;
    sendPasswordResetMail: jest.Mock;
  };

  beforeAll(async () => {
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

  const registerBody = {
    email: 'pending@example.com',
    password: 'Password1!',
    consentAccepted: true,
    consentVersion: 1,
  };

  it('re-registration of an unverified account returns the same 201 body as a first registration, without creating a second user', async () => {
    prismaMock.userContact.findFirst.mockResolvedValueOnce({
      id: 5,
      userId: 42,
    } as any);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 42,
      verified: false,
    } as any);
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registerBody)
      .expect(201);

    expect(res.body).toEqual({ message: 'Activation email sent' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42, verified: false },
      }),
    );
    expect(mailServiceMock.sendActivationMail).toHaveBeenCalledWith(
      registerBody.email,
      expect.any(String),
    );
  });

  it('a re-issued activation token activates the account, and the same token cannot be used a second time', async () => {
    const activationToken = 'e2e-reissued-token';
    const future = new Date(Date.now() + 60_000);

    // GET /auth/activate -> UserRepository.consumeActivation runs inside
    // $transaction: a findFirst read, then a conditional updateMany write.
    prismaMock.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findFirst: jest.fn().mockResolvedValueOnce({
              id: 42,
              activationExpires: future,
              pendingPasswordHash: 'pending-hash',
            }),
            updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
          },
        };
        return fn(tx);
      },
    );

    const firstUse = await request(app.getHttpServer())
      .get('/auth/activate')
      .query({ token: activationToken })
      .expect(200);

    expect(firstUse.body).toEqual({ message: 'Account activated' });

    // Second use of the same (now-consumed) token: findFirst still matches
    // the row (activationToken isn't nulled in this mock's tx-local state,
    // since the outer prismaMock isn't a real DB) is deliberately NOT what
    // this asserts — instead it exercises the single-use contract directly
    // by having the transaction report no row left to update, exactly as a
    // real consumed/superseded token would after the first activation.
    prismaMock.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findFirst: jest.fn().mockResolvedValueOnce({
              id: 42,
              activationExpires: future,
              pendingPasswordHash: null,
            }),
            updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
          },
        };
        return fn(tx);
      },
    );

    const secondUse = await request(app.getHttpServer())
      .get('/auth/activate')
      .query({ token: activationToken })
      .expect(400);

    expect(secondUse.body).toMatchObject({
      statusCode: 400,
      code: 'AUTH_INVALID_TOKEN',
    });
  });
});
