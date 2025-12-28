import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { PrismaService } from 'prisma/prisma.service';
import { LessonRepository } from 'repositories/lesson.repository';
import { AssignmentRepository } from 'repositories/assignment.repository';
import { AiModule } from 'ai/ai.module';

@Module({
  imports: [AiModule],
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
