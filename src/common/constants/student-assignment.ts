import { StudentAttemptStatus } from '@prisma/client';

export const DONE_STATUSES: StudentAttemptStatus[] = [
  StudentAttemptStatus.COMPLETED,
  StudentAttemptStatus.GRADED,
];
