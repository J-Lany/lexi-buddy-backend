import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from 'app.controller';
import { AppService } from 'app.service';
import { AuthModule } from 'auth/auth.module';
import { MailModule } from 'common/modules/mail/mail.module';
import { PrismaModule } from 'common/modules/prisma/prisma.module';
import { StudentsModule } from 'students/students.module';
import { GroupsModule } from 'groups/groups.module';
import { TeacherRequestsModule } from 'common/modules/teacher-requests/teacher-requests.module';
import { TelegramNotificationsModule } from 'common/modules/notifications/telegram-notifications.module';
import { LessonsModule } from 'lessons/lessons.module';
import { StudentBotInternalModule } from 'student-bot-internal/student-bot-internal.module';
import { RequestIdMiddleware } from 'common/middleware/request-id.middleware';
import { HealthController } from 'health/health.controller';
import { AdminMetricsModule } from 'admin-metrics/admin-metrics.module';

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
    AdminMetricsModule,
    LessonsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
