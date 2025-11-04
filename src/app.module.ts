import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
