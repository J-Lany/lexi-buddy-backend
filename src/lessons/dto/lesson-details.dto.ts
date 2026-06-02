type LessonStudentStatus = 'NOT_STARTED' | 'PENDING' | 'COMPLETED';

type LessonStudentDto = {
  id: number;
  username: string | null;
  status: LessonStudentStatus;
  completedAssignments: number;
  totalAssignments: number;
  progressPercent: number;
};

type LessonGroupDto = {
  id: number;
  name: string;
};

export type LessonDetailsDto = {
  id: number;
  title: string;
  targetLanguage: string;
  nativeLanguage: string;
  instructionLanguage: string;
  topic: string | null;
  level: string | null;
  ageCategory: string | null;
  additionalInstructions: string | null;
  materialLinks: string[];

  vocab: {
    id: number;
    term: string;
    translation: string | null;
    synonyms: string[];
  }[];

  assignments: {
    id: number;
    type: {
      id: number;
      name: string;
    };
    questions: {
      id: number;
      text: string;
      explanation: string | null;
      answers: {
        id: number;
        text: string;
        isCorrect: boolean;
      }[];
    }[];
  }[];

  groups: LessonGroupDto[];
  students: LessonStudentDto[];
};
