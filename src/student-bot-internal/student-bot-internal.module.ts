import { Module } from '@nestjs/common';
import { StudentBotInternalController } from './student-bot-internal.controller';
import { StudentBotInternalService } from './student-bot-internal.service';
import { StudentBotInternalRepository } from 'repositories/student-bot-internal.repository';
import { ActivityModule } from 'common/modules/activity/activity.module';

@Module({
  imports: [ActivityModule],
  controllers: [StudentBotInternalController],
  providers: [StudentBotInternalService, StudentBotInternalRepository],
})
export class StudentBotInternalModule {}
