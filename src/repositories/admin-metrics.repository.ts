import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'common/modules/prisma/prisma.service';

@Injectable()
export class AdminMetricsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildCompletedStatusesSql(statuses: readonly string[]) {
    return Prisma.join(
      statuses.map(
        (status) => Prisma.sql`CAST(${status} AS "StudentAttemptStatus")`,
      ),
    );
  }

  async countTeachersActivity(input: {
    dauFrom: Date;
    wauFrom: Date;
    mauFrom: Date;
    to: Date;
  }) {
    const { dauFrom, wauFrom, mauFrom, to } = input;

    const [dau, wau, mau] = await Promise.all([
      this.prisma.user.count({
        where: {
          lastVisit: { gte: dauFrom, lte: to },
          role: { name: 'teacher' },
        },
      }),
      this.prisma.user.count({
        where: {
          lastVisit: { gte: wauFrom, lte: to },
          role: { name: 'teacher' },
        },
      }),
      this.prisma.user.count({
        where: {
          lastVisit: { gte: mauFrom, lte: to },
          role: { name: 'teacher' },
        },
      }),
    ]);

    return { dau, wau, mau };
  }

  async countStudentsActivityStarted(input: {
    dauFrom: Date;
    wauFrom: Date;
    mauFrom: Date;
    to: Date;
  }) {
    const { dauFrom, wauFrom, mauFrom, to } = input;

    const [dau, wau, mau] = await Promise.all([
      this.countDistinctStudentsByAttemptStarted({ from: dauFrom, to }),
      this.countDistinctStudentsByAttemptStarted({ from: wauFrom, to }),
      this.countDistinctStudentsByAttemptStarted({ from: mauFrom, to }),
    ]);

    return { dau, wau, mau };
  }

  async countStudentsActivityCompleted(input: {
    dauFrom: Date;
    wauFrom: Date;
    mauFrom: Date;
    to: Date;
    completedStatuses: readonly string[];
  }) {
    const { dauFrom, wauFrom, mauFrom, to, completedStatuses } = input;

    const [dau, wau, mau] = await Promise.all([
      this.countDistinctStudentsByAttemptCompleted({
        from: dauFrom,
        to,
        completedStatuses,
      }),
      this.countDistinctStudentsByAttemptCompleted({
        from: wauFrom,
        to,
        completedStatuses,
      }),
      this.countDistinctStudentsByAttemptCompleted({
        from: mauFrom,
        to,
        completedStatuses,
      }),
    ]);

    return { dau, wau, mau };
  }

  async countTotalRegisteredUsers() {
    const [students, teachers] = await Promise.all([
      this.prisma.user.count({ where: { role: { name: 'student' } } }),
      this.prisma.user.count({ where: { role: { name: 'teacher' } } }),
    ]);
    return { students, teachers };
  }

  async getTotals(input: {
    from: Date;
    to: Date;
    completedStatuses: readonly string[];
  }) {
    const { from, to, completedStatuses } = input;

    const [
      lessonsCreated,
      assignmentsAssigned,
      assignmentAttemptsStarted,
      assignmentAttemptsCompleted,
    ] = await Promise.all([
      this.prisma.lesson.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.studentAssignedAssignment.count({
        where: { assignedAt: { gte: from, lte: to } },
      }),
      this.prisma.studentAssignmentAttempt.count({
        where: { startedAt: { gte: from, lte: to } },
      }),
      this.prisma.studentAssignmentAttempt.count({
        where: {
          submittedAt: { gte: from, lte: to },
          status: { in: completedStatuses as any },
        },
      }),
    ]);

    return {
      lessonsCreated,
      assignmentsAssigned,
      assignmentAttemptsStarted,
      assignmentAttemptsCompleted,
    };
  }

  async getByAssignmentType(input: {
    from: Date;
    to: Date;
    completedStatuses: readonly string[];
    timezone: string;
  }) {
    const { from, to, completedStatuses } = input;
    const completedStatusesSql =
      this.buildCompletedStatusesSql(completedStatuses);

    const rows = await this.prisma.$queryRaw<
      Array<{
        type: string;
        attemptsStarted: number;
        attemptsCompleted: number;
      }>
    >(Prisma.sql`
      WITH attempts AS (
        SELECT
          at.id AS "attemptId",
          at."startedAt" AS "startedAt",
          at."submittedAt" AS "submittedAt",
          at."status" AS "status",
          t.name AS "typeName"
        FROM "StudentAssignmentAttempt" at
        JOIN "StudentAssignedAssignment" ass ON ass.id = at."assignedId"
        JOIN "Assignment" a ON a.id = ass."assignmentId"
        JOIN "AssignmentType" t ON t.id = a."typeId"
        WHERE at."startedAt" BETWEEN ${from} AND ${to}
           OR at."submittedAt" BETWEEN ${from} AND ${to}
      )
      SELECT
        "typeName" AS "type",
        COUNT(*) FILTER (
          WHERE "startedAt" BETWEEN ${from} AND ${to}
        )::int AS "attemptsStarted",
        COUNT(*) FILTER (
          WHERE "submittedAt" BETWEEN ${from} AND ${to}
            AND "status" IN (${completedStatusesSql})
        )::int AS "attemptsCompleted"
      FROM attempts
      GROUP BY "typeName"
      ORDER BY "typeName" ASC;
    `);

    return rows.map((r) => ({
      type: r.type,
      attemptsStarted: Number(r.attemptsStarted ?? 0),
      attemptsCompleted: Number(r.attemptsCompleted ?? 0),
      completionRate:
        Number(r.attemptsStarted ?? 0) > 0
          ? Number(r.attemptsCompleted ?? 0) / Number(r.attemptsStarted ?? 0)
          : 0,
    }));
  }

  async getDailySeries(input: {
    days: number;
    timezone: string;
    completedStatuses: readonly string[];
  }) {
    const { days, timezone, completedStatuses } = input;
    const completedStatusesSql =
      this.buildCompletedStatusesSql(completedStatuses);

    const rows = await this.prisma.$queryRaw<
      Array<{
        date: string;
        lessonsCreated: number;
        assignmentsAssigned: number;
        attemptsStarted: number;
        attemptsCompleted: number;
        uniqueStudentsStarted: number;
        uniqueStudentsCompleted: number;
      }>
    >(Prisma.sql`
      WITH bounds AS (
        SELECT
          (date_trunc('day', (now() AT TIME ZONE ${timezone})) - (${days} - 1) * interval '1 day') AS start_day,
          date_trunc('day', (now() AT TIME ZONE ${timezone})) AS end_day
      ),
      days AS (
        SELECT generate_series(
          (SELECT start_day FROM bounds),
          (SELECT end_day FROM bounds),
          interval '1 day'
        )::date AS day
      ),
      lessons AS (
        SELECT
          (l."createdAt" AT TIME ZONE ${timezone})::date AS day,
          COUNT(*)::int AS cnt
        FROM "Lesson" l, bounds b
        WHERE (l."createdAt" AT TIME ZONE ${timezone})::date
          BETWEEN b.start_day::date AND b.end_day::date
        GROUP BY day
      ),
      assigned AS (
        SELECT
          (sa."assignedAt" AT TIME ZONE ${timezone})::date AS day,
          COUNT(*)::int AS cnt
        FROM "StudentAssignedAssignment" sa, bounds b
        WHERE (sa."assignedAt" AT TIME ZONE ${timezone})::date
          BETWEEN b.start_day::date AND b.end_day::date
        GROUP BY day
      ),
      attempts_started AS (
        SELECT
          (at."startedAt" AT TIME ZONE ${timezone})::date AS day,
          COUNT(*)::int AS cnt,
          COUNT(DISTINCT sa."userId")::int AS uniq_students
        FROM "StudentAssignmentAttempt" at
        JOIN "StudentAssignedAssignment" sa ON sa.id = at."assignedId",
             bounds b
        WHERE (at."startedAt" AT TIME ZONE ${timezone})::date
          BETWEEN b.start_day::date AND b.end_day::date
        GROUP BY day
      ),
      attempts_completed AS (
        SELECT
          (at."submittedAt" AT TIME ZONE ${timezone})::date AS day,
          COUNT(*)::int AS cnt,
          COUNT(DISTINCT sa."userId")::int AS uniq_students
        FROM "StudentAssignmentAttempt" at
        JOIN "StudentAssignedAssignment" sa ON sa.id = at."assignedId",
             bounds b
        WHERE at."submittedAt" IS NOT NULL
          AND at."status" IN (${completedStatusesSql})
          AND (at."submittedAt" AT TIME ZONE ${timezone})::date
            BETWEEN b.start_day::date AND b.end_day::date
        GROUP BY day
      )
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS "date",
        COALESCE(l.cnt, 0)::int AS "lessonsCreated",
        COALESCE(a.cnt, 0)::int AS "assignmentsAssigned",
        COALESCE(s.cnt, 0)::int AS "attemptsStarted",
        COALESCE(c.cnt, 0)::int AS "attemptsCompleted",
        COALESCE(s.uniq_students, 0)::int AS "uniqueStudentsStarted",
        COALESCE(c.uniq_students, 0)::int AS "uniqueStudentsCompleted"
      FROM days d
      LEFT JOIN lessons l ON l.day = d.day
      LEFT JOIN assigned a ON a.day = d.day
      LEFT JOIN attempts_started s ON s.day = d.day
      LEFT JOIN attempts_completed c ON c.day = d.day
      ORDER BY d.day ASC;
    `);

    return rows.map((r) => ({
      date: r.date,
      lessonsCreated: Number(r.lessonsCreated ?? 0),
      assignmentsAssigned: Number(r.assignmentsAssigned ?? 0),
      attemptsStarted: Number(r.attemptsStarted ?? 0),
      attemptsCompleted: Number(r.attemptsCompleted ?? 0),
      uniqueStudentsStarted: Number(r.uniqueStudentsStarted ?? 0),
      uniqueStudentsCompleted: Number(r.uniqueStudentsCompleted ?? 0),
    }));
  }

  private async countDistinctStudentsByAttemptStarted(input: {
    from: Date;
    to: Date;
  }) {
    const { from, to } = input;

    const rows = await this.prisma.$queryRaw<Array<{ cnt: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT sa."userId")::int AS cnt
      FROM "StudentAssignmentAttempt" at
      JOIN "StudentAssignedAssignment" sa ON sa.id = at."assignedId"
      WHERE at."startedAt" BETWEEN ${from} AND ${to};
    `);

    return Number(rows?.[0]?.cnt ?? 0);
  }

  private async countDistinctStudentsByAttemptCompleted(input: {
    from: Date;
    to: Date;
    completedStatuses: readonly string[];
  }) {
    const { from, to, completedStatuses } = input;
    const completedStatusesSql =
      this.buildCompletedStatusesSql(completedStatuses);

    const rows = await this.prisma.$queryRaw<Array<{ cnt: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT sa."userId")::int AS cnt
      FROM "StudentAssignmentAttempt" at
      JOIN "StudentAssignedAssignment" sa ON sa.id = at."assignedId"
      WHERE at."submittedAt" IS NOT NULL
        AND at."status" IN (${completedStatusesSql})
        AND at."submittedAt" BETWEEN ${from} AND ${to};
    `);

    return Number(rows?.[0]?.cnt ?? 0);
  }
}
