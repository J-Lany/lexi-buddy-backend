import { Module } from '@nestjs/common';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminMetricsRepository } from 'repositories/admin-metrics.repository';
import { AdminGuard } from 'auth/guards/admin.guard';
import { UserRepository } from 'repositories/user.repository';

@Module({
  controllers: [AdminMetricsController],
  providers: [
    AdminMetricsService,
    AdminMetricsRepository,
    AdminGuard,
    UserRepository,
  ],
  exports: [AdminMetricsService],
})
export class AdminMetricsModule {}
