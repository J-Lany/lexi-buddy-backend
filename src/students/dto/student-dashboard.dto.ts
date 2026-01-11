export type StudentDashboardDto = {
  student: {
    id: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    level: string | null;
    ageGroup: string | null;
    lastVisit: Date | null;
    avatarUrl: string | null;
    createdAt: Date;
  };
  groups: Array<{
    id: number;
    name: string;
    level: string | null;
    joinedAt: Date;
  }>;
  stats: {
    lessonsTotal: number;
    assignmentsTotal: number;
    assignmentsDone: number;
    progressPercent: number;
    avgScore: number | null;
    lastSubmittedAt: Date | null;
  };
  lessons: Array<{
    id: number;
    groupId: number;
    title: string;
    level: string | null;
    topic: string | null;
    createdAt: Date;
    archived: boolean;
    progress: {
      assignmentsTotal: number;
      assignmentsDone: number;
      percent: number;
      avgScore: number | null;
      lastSubmittedAt: Date | null;
    };
  }>;
};
