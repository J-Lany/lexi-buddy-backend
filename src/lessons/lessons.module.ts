import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { PrismaService } from 'common/modules/prisma/prisma.service';
import { LessonRepository } from 'repositories/lesson.repository';
import { AssignmentRepository } from 'repositories/assignment.repository';
import { AiModule } from 'ai/ai.module';
import { TelegramNotificationsModule } from 'common/modules/notifications/telegram-notifications.module';

@Module({
  imports: [AiModule, TelegramNotificationsModule],
  controllers: [LessonsController],
  providers: [
    LessonsService,
    PrismaService,
    LessonRepository,
    AssignmentRepository,
  ],
  exports: [LessonsService],
})
export class LessonsModule {}
