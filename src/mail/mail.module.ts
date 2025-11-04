import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host:  process.env.SMTP_HOST,
        port: 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      },
      defaults: {
        from: '"Lexi Buddy" <noreply@lexibuddy.com>',
      },
    })
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
