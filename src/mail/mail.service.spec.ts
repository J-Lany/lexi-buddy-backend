import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailerService } from '@nestjs-modules/mailer';

describe('MailService', () => {
  let service: MailService;
  let mockMailerService: { sendMail: jest.Mock };

  beforeEach(async () => {
    // Мокаем MailerService
    mockMailerService = {
      sendMail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mockMailerService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call mailer.sendMail with correct arguments', async () => {
    process.env.ACTIVATION_URL = 'https://example.com/activate';
    const email = 'user@example.com';
    const token = '12345';

    await service.sendActivationMail(email, token);

    expect(mockMailerService.sendMail).toHaveBeenCalledTimes(1);
    expect(mockMailerService.sendMail).toHaveBeenCalledWith({
      to: email,
      subject: 'Activate your Lexi Buddy account',
      html: expect.stringContaining(
        `https://example.com/activate?token=${token}`,
      ),
    });
  });

  it('should include activation link with token in the html body', async () => {
    process.env.ACTIVATION_URL = 'https://activate.lexi-buddy.io';
    const email = 'someone@mail.com';
    const token = 'abc123';

    await service.sendActivationMail(email, token);

    const callArgs = mockMailerService.sendMail.mock.calls[0][0];

    expect(callArgs.html).toContain(`?token=${token}`);
    expect(callArgs.html).toContain(
      `<a href="https://activate.lexi-buddy.io?token=${token}">`,
    );
  });
});
