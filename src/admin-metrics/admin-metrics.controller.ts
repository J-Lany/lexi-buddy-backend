import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdminMetricsService } from './admin-metrics.service';
import { JwtAuthGuard } from 'auth/guards/jwt-auth.guard';

@Controller('admin/metrics')
@UseGuards(JwtAuthGuard) // TODO: добавить проверку роли admin/allowlist
export class AdminMetricsController {
  constructor(private readonly service: AdminMetricsService) {}

  @Get('overview')
  async overview(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) {
      throw new BadRequestException(
        'Query params "from" and "to" are required (ISO strings).',
      );
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('"from" and "to" must be valid ISO dates.');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('"from" must be <= "to".');
    }

    return this.service.getOverview({ from: fromDate, to: toDate });
  }

  @Get('daily')
  async daily(@Query('days') daysRaw?: string) {
    const days = daysRaw ? Number(daysRaw) : 30;
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new BadRequestException('"days" must be a number in range 1..365');
    }

    return this.service.getDaily({ days });
  }
}
