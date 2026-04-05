export type DauWauMau = { dau: number; wau: number; mau: number };

export type OverviewRangeDto = {
  from: string; // ISO
  to: string; // ISO
  timezone: string;
};

export type OverviewTotalsDto = {
  lessonsCreated: number;
  assignmentsAssigned: number;
  assignmentAttemptsStarted: number;
  assignmentAttemptsCompleted: number;
  attemptCompletionRate: number;
};

export type ByAssignmentTypeDto = {
  type: string;
  attemptsStarted: number;
  attemptsCompleted: number;
  completionRate: number;
};

export type AdminMetricsOverviewResponseDto = {
  range: OverviewRangeDto;
  teachers: DauWauMau;
  students: {
    started: DauWauMau;
    completed: DauWauMau;
  };
  totals: OverviewTotalsDto;
  byAssignmentType: ByAssignmentTypeDto[];
  definitions: Record<string, string>;
};

export type DailyRangeDto = { days: number; timezone: string };

export type DailyPointDto = {
  date: string; // YYYY-MM-DD
  lessonsCreated: number;
  assignmentsAssigned: number;
  attemptsStarted: number;
  attemptsCompleted: number;
  uniqueStudentsStarted: number;
  uniqueStudentsCompleted: number;
};

export type ByAssignmentTypeSeriesDto = Array<{
  type: string;
  points: Array<{
    date: string;
    attemptsStarted: number;
    attemptsCompleted: number;
  }>;
}>;

export type AdminMetricsDailyResponseDto = {
  range: DailyRangeDto;
  series: DailyPointDto[];
  byAssignmentTypeSeries: ByAssignmentTypeSeriesDto;
};
