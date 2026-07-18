export type GroupDashboardDto = {
  group: {
    id: number;
    name: string;
    description: string | null;
    level: string | null;
    studentsCount: number;
  };
  students: Array<{
    id: number;
    name: string;
    username: string | null;
    level: string | null;
    telegramValue: string | null;
  }>;
  lessons: Array<{
    id: number;
    groupId: number;
    title: string;
    topic: string | null;
    level: string | null;
    createdAt: Date;
    assignmentsTotal: number;
    progress: {
      studentsTotal: number;
      studentsStarted: number;
      studentsDone: number;
      percentDone: number;
    };
  }>;
};
