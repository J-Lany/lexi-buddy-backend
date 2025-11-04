import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailer: MailerService) {}

  async sendActivationMail(email: string, token: string) {
    const url = `${process.env.ACTIVATION_URL}?token=${token}`;

    await this.mailer.sendMail({
      to: email,
      subject: 'Activate your Lexi Buddy account',
      html: `Click <a href="${url}">here</a> to activate.`,
    });
  }
}
