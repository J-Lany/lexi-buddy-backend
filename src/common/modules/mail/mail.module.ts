import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { MailService, RESEND_CLIENT } from './mail.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: RESEND_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Resend => {
        const apiKey = configService.getOrThrow<string>('RESEND_API_KEY');
        return new Resend(apiKey);
      },
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
