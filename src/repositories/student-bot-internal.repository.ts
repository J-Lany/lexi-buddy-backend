import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { StudentAssignmentStatus } from '@prisma/client';

type SaveAttemptInput = {
  userId: number;
  studentAssignmentId: number;
  clientSessionId: string | null;
  results: Array<{
    questionId: number;
    attempts: Array<{
      attempt: number;
      answer?: any;
      isCorrect?: boolean;
      responseTimeMs?: number;
    }>;
  }>;
};

@Injectable()
export class StudentBotInternalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStudentIdByTelegramId(telegramId: number): Promise<number | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        contacts: {
          some: {
            contactType: { name: 'telegram' },
            contactValue: String(telegramId),
          },
        },
      },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  async findLessonsForStudent(studentId: number) {
    const lessons = await this.prisma.lesson.findMany({
      where: {
        archived: false,
        assignments: {
          some: {
            studentAssignments: {
              some: {
                userId: studentId,
              },
            },
          },
        },
      },
      select: {
        id: true,
        title: true,
        level: true,
        topic: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return lessons;
  }

  async findStudentProfileByTelegramId(telegramId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        contacts: {
          some: {
            contactType: { name: 'telegram' },
            contactValue: String(telegramId),
          },
        },
      },
      select: {
        username: true,
        firstName: true,
        lastName: true,
        level: true,
        ageGroup: true,
        groupMemberships: {
          where: {
            isActive: true,
            removedAt: null,
            group: { archived: false },
          },
          select: { id: true },
        },
      },
    });

    if (!user) return null;

    return {
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      level: user.level ?? null,
      ageGroup: user.ageGroup ?? null,
      groupsCount: user.groupMemberships?.length ?? 0,
    };
  }

  async findAssignmentsForStudentInLesson(userId: number, lessonId: number) {
    const assignments = await this.prisma.assignment.findMany({
      where: { lessonId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        type: { select: { name: true } },
        studentAssignments: {
          where: { userId },
          orderBy: { attemptNo: 'desc' },
          select: { status: true, score: true },
          take: 1,
        },
      },
    });

    return assignments.map((a) => {
      const sa = a.studentAssignments[0];
      return {
        assignmentId: a.id,
        typeName: a.type.name,
        status: sa?.status ?? StudentAssignmentStatus.PENDING,
        score: sa?.score ?? null,
      };
    });
  }

  async getAssignmentPayload(assignmentId: number) {
    const a = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        type: { select: { name: true } },
        lesson: {
          select: {
            id: true,
            title: true,
            level: true,
            ageCategory: true,
            topic: true,
          },
        },
        questions: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            text: true,
            explanation: true,
            questionType: { select: { name: true } },
            answers: {
              orderBy: { id: 'asc' },
              select: { id: true, text: true, isCorrect: true },
            },
          },
        },
      },
    });

    if (!a) return null;

    return {
      assignmentId: a.id,
      type: a.type.name,
      lesson: {
        lessonId: a.lesson.id,
        title: a.lesson.title,
        level: a.lesson.level ?? null,
        ageCategory: a.lesson.ageCategory ?? null,
        topic: a.lesson.topic ?? null,
      },
      questions: a.questions.map((q) => ({
        id: q.id,
        text: q.text,
        questionType: q.questionType.name,
        explanation: q.explanation ?? null,
        answers: q.answers.map((ans) => ({
          id: ans.id,
          text: ans.text,
          isCorrect: ans.isCorrect,
        })),
      })),
    };
  }

  async createNewAttemptAndGetPayload(userId: number, assignmentId: number) {
    const payload = await this.getAssignmentPayload(assignmentId);
    if (!payload) return null;

    for (let i = 0; i < 2; i++) {
      const last = await this.prisma.studentAssignment.findFirst({
        where: { userId, assignmentId },
        orderBy: { attemptNo: 'desc' },
        select: { attemptNo: true },
      });

      const nextAttemptNo = (last?.attemptNo ?? 0) + 1;

      try {
        const studentAssignment = await this.prisma.studentAssignment.create({
          data: {
            userId,
            assignmentId,
            attemptNo: nextAttemptNo,
            startedAt: new Date(),
            status: StudentAssignmentStatus.PENDING,
          },
          select: { id: true, attemptNo: true, status: true },
        });

        return { studentAssignment, assignment: payload };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          if (i === 0) continue;
        }
        throw e;
      }
    }

    return null;
  }

  async saveAttemptResultsAndComplete(input: SaveAttemptInput) {
    const { userId, studentAssignmentId, results, clientSessionId } = input;

    // 1) Забираем попытку + статус (нужно для идемпотентности)
    const attempt = await this.prisma.studentAssignment.findFirst({
      where: { id: studentAssignmentId, userId },
      select: {
        id: true,
        assignmentId: true,
        status: true,
        score: true,
      },
    });
    if (!attempt) return null;

    // 2) Идемпотентность: если уже completed — возвращаем сохранённое, ничего не трогаем
    if (attempt.status === StudentAssignmentStatus.COMPLETED) {
      const savedAttempts = await this.prisma.result.count({
        where: { studentAssignmentId: attempt.id },
      });

      return {
        ok: true,
        studentAssignmentId: attempt.id,
        savedAttempts,
        score: attempt.score ?? null,
        status: StudentAssignmentStatus.COMPLETED,
      };
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: attempt.assignmentId },
      select: {
        questions: {
          select: {
            id: true,
            questionType: { select: { name: true } },
          },
        },
      },
    });
    if (!assignment) return null;

    const allowedQuestions = assignment.questions;
    const allowedQuestionIds = new Set(allowedQuestions.map((q) => q.id));

    // 3) Политика попыток (сейчас 3 как в сервисе, но не захардкожено в DTO)
    const maxAttempts = 3;
    const policyTypes = new Set(['gap_fill', 'open_text']);

    const rows: Array<{
      studentAssignmentId: number;
      questionId: number;
      answer: any;
      isCorrect?: boolean | null;
      responseTimeMs?: number | null;
    }> = [];

    const lastAttemptByQuestion = new Map<
      number,
      { attempt: number; isCorrect?: boolean | null }
    >();

    for (const qr of results) {
      if (!allowedQuestionIds.has(qr.questionId)) continue;

      const qMeta = allowedQuestions.find((q) => q.id === qr.questionId);
      const qType = qMeta?.questionType.name ?? null;

      for (const att of qr.attempts) {
        // мягкая защита по policy
        const limit = qType && policyTypes.has(qType) ? maxAttempts : 1;
        if (
          !Number.isFinite(att.attempt) ||
          att.attempt < 1 ||
          att.attempt > limit
        ) {
          continue;
        }

        rows.push({
          studentAssignmentId: attempt.id,
          questionId: qr.questionId,
          answer: {
            attempt: att.attempt,
            value: att.answer ?? null,
            clientSessionId,
            savedAt: new Date().toISOString(),
          },
          isCorrect: typeof att.isCorrect === 'boolean' ? att.isCorrect : null,
          responseTimeMs:
            typeof att.responseTimeMs === 'number' ? att.responseTimeMs : null,
        });

        const prev = lastAttemptByQuestion.get(qr.questionId);
        if (!prev || att.attempt > prev.attempt) {
          lastAttemptByQuestion.set(qr.questionId, {
            attempt: att.attempt,
            isCorrect:
              typeof att.isCorrect === 'boolean' ? att.isCorrect : null,
          });
        }
      }
    }

    // 4) Score считаем по последним попыткам, как было
    const totalQuestions = allowedQuestions.length;

    const canScore =
      lastAttemptByQuestion.size > 0 &&
      Array.from(lastAttemptByQuestion.values()).some(
        (v) => v.isCorrect !== null && v.isCorrect !== undefined,
      );

    const correctCount = Array.from(lastAttemptByQuestion.entries())
      .filter(([qid]) => allowedQuestionIds.has(qid))
      .filter(([, v]) => v.isCorrect === true).length;

    const score =
      canScore && totalQuestions > 0 ? correctCount / totalQuestions : null;

    // 5) Важно: атомарно. И главное — при ретраях после успеха мы сюда уже не попадём (см. статус COMPLETED выше)
    await this.prisma.$transaction(async (tx) => {
      await tx.result.deleteMany({
        where: { studentAssignmentId: attempt.id },
      });

      if (rows.length > 0) {
        await tx.result.createMany({ data: rows });
      }

      await tx.studentAssignment.update({
        where: { id: attempt.id },
        data: {
          status: StudentAssignmentStatus.COMPLETED,
          score: score ?? undefined,
          submittedAt: new Date(),
        },
      });
    });

    return {
      ok: true,
      studentAssignmentId: attempt.id,
      savedAttempts: rows.length,
      score,
      status: StudentAssignmentStatus.COMPLETED,
    };
  }
}
