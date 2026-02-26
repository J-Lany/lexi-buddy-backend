import { StudentAttemptStatus } from '@prisma/client';

export type StudentLessonProgressDto = {
  lesson: {
    id: number;
    title: string;
  };

  student: {
    id: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };

  overall: {
    completedCount: number;
    totalCount: number;
    avgScore: number | null;
    lastActivityAt: Date | null;
  };

  assignments: Array<{
    id: number;
    type: {
      id: number;
      name: string;
    };

    attempts: Array<{
      id: number;
      attemptNo: number;
      status: StudentAttemptStatus;
      score: number | null;
      startedAt: Date | null;
      submittedAt: Date | null;
      gradedAt: Date | null;

      questions: Array<{
        id: number;
        text: string;
        questionType: string;
        explanation: string | null;

        studentAnswer: import('@prisma/client').Prisma.JsonValue;
        isCorrect: boolean | null;

        correctAnswerText: string | null;
      }>;
    }>;
  }>;
};
