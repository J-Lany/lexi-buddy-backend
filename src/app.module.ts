import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from 'prisma/prisma.module';
import { StudentsModule } from 'students/students.module';
import { GroupsModule } from 'groups/groups.module';
import { TeacherRequestsModule } from 'teacher-requests/teacher-requests.module';
import { TelegramNotificationsModule } from 'notifications/telegram-notifications.module';
import { LessonsModule } from 'lessons/lessons.module';
import { StudentBotInternalModule } from 'student-bot-internal/student-bot-internal.module';

@Module({
  imports: [
    AuthModule,
    MailModule,
    PrismaModule,
    StudentsModule,
    GroupsModule,
    TeacherRequestsModule,
    TelegramNotificationsModule,
    StudentBotInternalModule,
    LessonsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
