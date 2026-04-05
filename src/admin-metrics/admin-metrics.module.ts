import { Module } from '@nestjs/common';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminMetricsRepository } from 'repositories/admin-metrics.repository';

@Module({
  controllers: [AdminMetricsController],
  providers: [AdminMetricsService, AdminMetricsRepository],
  exports: [AdminMetricsService],
})
export class AdminMetricsModule {}
