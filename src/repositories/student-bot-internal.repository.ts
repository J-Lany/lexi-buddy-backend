import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { StudentAttemptStatus } from '@prisma/client';

type SaveAttemptInput = {
  userId: number;
  attemptId: number;
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
    return this.prisma.lesson.findMany({
      where: {
        archived: false,
        assignments: {
          some: {
            assignedAssignments: {
              some: { userId: studentId, revokedAt: null },
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
    const rows = await this.prisma.studentAssignedAssignment.findMany({
      where: {
        userId,
        revokedAt: null,
        assignment: {
          lessonId,
        },
      },
      orderBy: { assignmentId: 'asc' },
      select: {
        assignmentId: true,
        assignment: {
          select: {
            type: { select: { name: true } },
          },
        },
        attempts: {
          orderBy: { attemptNo: 'desc' },
          take: 1,
          select: { status: true, score: true },
        },
      },
    });

    return rows.map((r) => {
      const last = r.attempts?.[0] ?? null;
      return {
        assignmentId: r.assignmentId,
        typeName: r.assignment.type.name,
        status: last?.status ?? null,
        score: last?.score ?? null,
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
            vocab: {
              orderBy: { id: 'asc' },
              select: {
                term: true,
                translation: true,
                synonyms: true,
              },
            },
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

      vocab: (a.lesson.vocab ?? []).map((v) => ({
        term: v.term,
        translation: v.translation ?? null,
        synonyms: Array.isArray(v.synonyms) ? (v.synonyms as string[]) : null,
      })),

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

    const assigned = await this.prisma.studentAssignedAssignment.findFirst({
      where: { userId, assignmentId, revokedAt: null },
      select: { id: true },
    });

    if (!assigned) return null;

    const last = await this.prisma.studentAssignmentAttempt.findFirst({
      where: { assignedId: assigned.id },
      orderBy: { attemptNo: 'desc' },
      select: {
        id: true,
        attemptNo: true,
        status: true,
        submittedAt: true,
      },
    });

    if (
      last &&
      last.status === StudentAttemptStatus.IN_PROGRESS &&
      last.submittedAt === null
    ) {
      return {
        studentAssignment: {
          id: last.id,
          attemptNo: last.attemptNo,
          status: last.status,
        },
        assignment: payload,
      };
    }

    const nextAttemptNo = (last?.attemptNo ?? 0) + 1;

    const created = await this.prisma.studentAssignmentAttempt.create({
      data: {
        assignedId: assigned.id,
        attemptNo: nextAttemptNo,
        status: StudentAttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
      select: { id: true, attemptNo: true, status: true },
    });

    return { studentAssignment: created, assignment: payload };
  }

  async saveAttemptResultsAndComplete(input: SaveAttemptInput) {
    const { userId, attemptId, results, clientSessionId } = input;

    const attempt = await this.prisma.studentAssignmentAttempt.findFirst({
      where: {
        id: attemptId,
        assigned: { userId },
      },
      select: {
        id: true,
        status: true,
        score: true,
        assigned: {
          select: {
            assignmentId: true,
          },
        },
      },
    });

    if (!attempt) return null;

    if (
      attempt.status === StudentAttemptStatus.COMPLETED ||
      attempt.status === StudentAttemptStatus.GRADED
    ) {
      const savedAttempts = await this.prisma.result.count({
        where: { attemptId: attempt.id },
      });

      return {
        ok: true,
        attemptId: attempt.id,
        savedAttempts,
        score: attempt.score ?? null,
        status: StudentAttemptStatus.COMPLETED,
      };
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: attempt.assigned.assignmentId },
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

    const maxAttempts = 3;
    const policyTypes = new Set(['gap_fill', 'open_text']);

    const rows: Array<{
      attemptId: number;
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
        const limit = qType && policyTypes.has(qType) ? maxAttempts : 1;
        if (
          !Number.isFinite(att.attempt) ||
          att.attempt < 1 ||
          att.attempt > limit
        ) {
          continue;
        }

        rows.push({
          attemptId: attempt.id,
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

    await this.prisma.$transaction(async (tx) => {
      await tx.result.deleteMany({
        where: { attemptId: attempt.id },
      });

      if (rows.length > 0) {
        await tx.result.createMany({ data: rows });
      }

      await tx.studentAssignmentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: StudentAttemptStatus.COMPLETED,
          score: score ?? undefined,
          submittedAt: new Date(),
        },
      });
    });

    return {
      ok: true,
      attemptId: attempt.id,
      savedAttempts: rows.length,
      score,
      status: StudentAttemptStatus.COMPLETED,
    };
  }
}
