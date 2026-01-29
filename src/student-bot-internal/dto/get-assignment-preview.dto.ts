import { AgeGroup, Level } from '@prisma/client';

export type InternalAssignmentQuestionAnswerDto = {
  id: number;
  text: string;
  isCorrect: boolean;
};

export type InternalAssignmentQuestionDto = {
  id: number;
  text: string;
  questionType: string;
  explanation: string | null;
  answers: InternalAssignmentQuestionAnswerDto[];
};

export type InternalAssignmentDto = {
  assignmentId: number;
  type: string;
  lesson: {
    lessonId: number;
    title: string;
    level: Level | null;
    ageCategory: AgeGroup | null;
    topic: string | null;
  };
  questions: InternalAssignmentQuestionDto[];
};

export type InternalAssignmentPreviewResponseDto = {
  assignment: InternalAssignmentDto;
};
