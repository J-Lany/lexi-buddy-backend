import { Module } from '@nestjs/common';
import { ActivityService } from 'common/modules/activity/activity.service';
import { PrismaModule } from 'common/modules/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
