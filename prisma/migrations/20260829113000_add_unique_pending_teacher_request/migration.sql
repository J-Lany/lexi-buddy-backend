-- Enforce the teaching-request business invariant at the database level.
-- Historical ACCEPTED/DECLINED rows remain unrestricted; only one PENDING
-- request may exist for a teacher/student pair.
CREATE UNIQUE INDEX "GroupInvite_one_pending_per_teacher_student_key"
ON "GroupInvite"("inviterId", "inviteeId")
WHERE "status" = 'PENDING';
