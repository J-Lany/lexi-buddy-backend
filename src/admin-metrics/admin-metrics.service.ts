import { Injectable } from '@nestjs/common';
import {
  AdminMetricsDailyResponseDto,
  AdminMetricsOverviewResponseDto,
} from 'admin-metrics/metrics.dto';
import { AdminMetricsRepository } from 'repositories/admin-metrics.repository';

const TZ = 'Europe/Moscow';
const COMPLETED_STATUSES = ['COMPLETED', 'GRADED'] as const;

// ---------- In-memory cache (per process) ----------
type CacheEntry<T> = { expiresAt: number; value: T };

const overviewCache = new Map<
  string,
  CacheEntry<AdminMetricsOverviewResponseDto>
>();
const dailyCache = new Map<string, CacheEntry<AdminMetricsDailyResponseDto>>();

function getCache<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function setCache<T>(
  store: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

@Injectable()
export class AdminMetricsService {
  constructor(private readonly repo: AdminMetricsRepository) {}

  // Public API with caching
  async getOverview(input: {
    from: Date;
    to: Date;
  }): Promise<AdminMetricsOverviewResponseDto> {
    const { from, to } = input;

    const key = `overview:${from.toISOString()}:${to.toISOString()}:${TZ}`;
    const cached = getCache(overviewCache, key);
    if (cached) return cached;

    const result = await this.computeOverview({ from, to });
    // MVP default: 5 minutes
    setCache(overviewCache, key, result, 5 * 60 * 1000);

    return result;
  }

  // Public API with caching
  async getDaily(input: {
    days: number;
  }): Promise<AdminMetricsDailyResponseDto> {
    const { days } = input;

    const key = `daily:${days}:${TZ}`;
    const cached = getCache(dailyCache, key);
    if (cached) return cached;

    const result = await this.computeDaily({ days });
    // MVP default: 1 hour
    setCache(dailyCache, key, result, 60 * 60 * 1000);

    return result;
  }

  // ---------- Internal computations (no cache) ----------
  private async computeOverview(input: {
    from: Date;
    to: Date;
  }): Promise<AdminMetricsOverviewResponseDto> {
    const { from, to } = input;

    // DAU/WAU/MAU считаем относительно "to"
    const dauFrom = this.startOfDayInTz(to, TZ);
    const wauFrom = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const mauFrom = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      teachers,
      studentsStarted,
      studentsCompleted,
      totalsRaw,
      byAssignmentType,
      totalRegistered,
    ] = await Promise.all([
      this.repo.countTeachersActivity({ dauFrom, wauFrom, mauFrom, to }),
      this.repo.countStudentsActivityStarted({ dauFrom, wauFrom, mauFrom, to }),
      this.repo.countStudentsActivityCompleted({
        dauFrom,
        wauFrom,
        mauFrom,
        to,
        completedStatuses: COMPLETED_STATUSES,
      }),
      this.repo.getTotals({ from, to, completedStatuses: COMPLETED_STATUSES }),
      this.repo.getByAssignmentType({
        from,
        to,
        completedStatuses: COMPLETED_STATUSES,
        timezone: TZ,
      }),
      this.repo.countTotalRegisteredUsers(),
    ]);

    const attemptCompletionRate =
      totalsRaw.assignmentAttemptsStarted > 0
        ? totalsRaw.assignmentAttemptsCompleted /
          totalsRaw.assignmentAttemptsStarted
        : 0;

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        timezone: TZ,
      },
      teachers,
      students: {
        started: studentsStarted,
        completed: studentsCompleted,
      },
      totals: {
        totalRegisteredStudents: totalRegistered.students,
        totalRegisteredTeachers: totalRegistered.teachers,
        ...totalsRaw,
        attemptCompletionRate,
      },
      byAssignmentType,
      definitions: {
        teachersActivity: 'User.role=teacher AND lastVisit in window',
        studentsStarted:
          'distinct students with StudentAssignmentAttempt.startedAt in window',
        studentsCompleted:
          'distinct students with StudentAssignmentAttempt.submittedAt in window AND status in [COMPLETED,GRADED]',
        attemptsStarted: 'StudentAssignmentAttempt.startedAt in [from,to]',
        attemptsCompleted:
          'StudentAssignmentAttempt.submittedAt in [from,to] AND status in [COMPLETED,GRADED]',
      },
    };
  }

  private async computeDaily(input: {
    days: number;
  }): Promise<AdminMetricsDailyResponseDto> {
    const { days } = input;

    const series = await this.repo.getDailySeries({
      days,
      timezone: TZ,
      completedStatuses: COMPLETED_STATUSES,
    });

    return {
      range: { days, timezone: TZ },
      series,
      byAssignmentTypeSeries: [],
    };
  }

  /**
   * Start of day in given timezone using Intl (works fine for Europe/Moscow).
   * For exact day boundaries in daily series, repo uses SQL AT TIME ZONE.
   */
  private startOfDayInTz(date: Date, timezone: string): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;

    // Note: This creates a UTC timestamp at 00:00Z of that local date.
    // For Moscow (no DST), good enough for MVP DAU lower bound.
    return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  }
}
