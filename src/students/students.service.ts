import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupRepository } from 'repositories/group-repository';
import { StudentDto } from './dto/student.dto';
import { UserRepository } from 'repositories/user.repository';
import { StudentsRepository } from 'repositories/student-repository';
import { round1 } from 'common/utils/round';
import { DONE_STATUSES } from 'common/constants/student-assignment';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentLessonProgressDto } from 'students/dto/student-lesson-progress.dto';
import { StudentAttemptStatus } from '@prisma/client';

@Injectable()
export class StudentsService {
  constructor(
    private groupRepo: GroupRepository,
    private userRepo: UserRepository,
    private studentsRepo: StudentsRepository,
  ) {}

  async getStudents(teacherId: number): Promise<StudentDto[]> {
    const students =
      await this.groupRepo.findTeacherStudentsWithPublicGroups(teacherId);

    return (students ?? []).map((u) => ({
      id: u.id,
      name: u.firstName || u.lastName || '',
      level: u.level,
      username: u.username,
      avatarUrl: u.avatarUrl,
      groups: (u.groupMemberships ?? []).map((m) => m.group),
    }));
  }

  async getAllStudents(teacherId: number, q: string): Promise<StudentDto[]> {
    const query = (q ?? '').trim().replace(/^@+/, '');

    if (query.length < 2) return [];

    const users = await this.userRepo.searchStudentsByUsername({
      q: query,
      take: 15,
      excludeTeacherId: teacherId,
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      level: u.level,
      name: u.firstName || u.lastName || '',
    }));
  }

  async getGroups(teacherId: number) {
    const groups = await this.groupRepo.findByTeacher(teacherId);

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      students: group.members.map((member) => {
        const user = member.user;

        return {
          id: user.id,
          name: user.firstName || user.lastName || '',
          level: user.level,
          telegramValue:
            user.contacts.find((c) => c.contactType.name === 'telegram')
              ?.contactValue ?? null,
        };
      }),
    }));
  }

  async getStudentDashboard(teacherId: number, studentId: number) {
    const canSee = await this.groupRepo.teacherHasStudent(teacherId, studentId);
    if (!canSee) throw new ForbiddenException('No access to this student');

    const data = await this.studentsRepo.getStudentDashboardRaw(
      teacherId,
      studentId,
    );

    if (!data.student) throw new NotFoundException('Student not found');

    const lessons = data.lessons as Array<
      (typeof data.lessons)[number] & {
        assignments: { id: number }[];
      }
    >;

    const assignmentToLessonId = new Map<number, number>();
    const totalByLesson = new Map<number, number>();

    for (const l of lessons) {
      totalByLesson.set(l.id, l.assignments?.length ?? 0);
      for (const a of l.assignments ?? []) {
        assignmentToLessonId.set(a.id, l.id);
      }
    }

    const doneByLesson = new Map<number, number>();
    const scoreSumByLesson = new Map<number, number>();
    const scoreCountByLesson = new Map<number, number>();
    const lastSubmittedByLesson = new Map<number, Date>();

    for (const l of lessons) {
      doneByLesson.set(l.id, 0);
      scoreSumByLesson.set(l.id, 0);
      scoreCountByLesson.set(l.id, 0);
    }

    let assignmentsDoneAll = 0;
    let assignmentsTotalAll = 0;
    let scoreSumAll = 0;
    let scoreCountAll = 0;
    let lastSubmittedAtAll: Date | null = null;

    assignmentsTotalAll = Array.from(totalByLesson.values()).reduce(
      (a, b) => a + b,
      0,
    );

    for (const sa of data.studentAssignments) {
      const lessonId = assignmentToLessonId.get(sa.assignmentId);
      if (!lessonId) continue;

      if (sa.status && DONE_STATUSES.includes(sa.status)) {
        doneByLesson.set(lessonId, (doneByLesson.get(lessonId) ?? 0) + 1);
        assignmentsDoneAll += 1;
      }

      if (typeof sa.score === 'number') {
        scoreSumByLesson.set(
          lessonId,
          (scoreSumByLesson.get(lessonId) ?? 0) + sa.score,
        );
        scoreCountByLesson.set(
          lessonId,
          (scoreCountByLesson.get(lessonId) ?? 0) + 1,
        );

        scoreSumAll += sa.score;
        scoreCountAll += 1;
      }

      if (sa.submittedAt) {
        const prev = lastSubmittedByLesson.get(lessonId);
        if (!prev || sa.submittedAt > prev)
          lastSubmittedByLesson.set(lessonId, sa.submittedAt);

        if (!lastSubmittedAtAll || sa.submittedAt > lastSubmittedAtAll)
          lastSubmittedAtAll = sa.submittedAt;
      }
    }

    const lessonsDto = lessons.map((l) => {
      const total = totalByLesson.get(l.id) ?? 0;
      const done = doneByLesson.get(l.id) ?? 0;
      const percent = total > 0 ? round1((done / total) * 100) : 0;

      const scCount = scoreCountByLesson.get(l.id) ?? 0;
      const scSum = scoreSumByLesson.get(l.id) ?? 0;
      const avgScore = scCount > 0 ? scSum / scCount : null;

      return {
        id: l.id,
        groupId: null,
        title: l.title,
        level: l.level,
        topic: l.topic,
        createdAt: l.createdAt,
        archived: l.archived,
        progress: {
          assignmentsTotal: total,
          assignmentsDone: done,
          percent,
          avgScore,
          lastSubmittedAt: lastSubmittedByLesson.get(l.id) ?? null,
        },
      };
    });

    const progressPercentAll =
      assignmentsTotalAll > 0
        ? round1((assignmentsDoneAll / assignmentsTotalAll) * 100)
        : 0;

    const avgScoreAll = scoreCountAll > 0 ? scoreSumAll / scoreCountAll : null;

    return {
      student: {
        id: data.student.id,
        username: data.student.username,
        firstName: data.student.firstName,
        lastName: data.student.lastName,
        level: data.student.level,
        ageGroup: data.student.ageGroup,
        lastVisit: data.student.lastVisit,
        avatarUrl: data.student.avatarUrl,
        createdAt: data.student.createdAt,
        telegramValue:
          data.student.contacts.find((c) => c.contactType.name === 'telegram')
            ?.contactValue ?? null,
      },
      groups: data.groups.map((g) => ({
        id: g.id,
        name: g.name,
        level: g.level,
        joinedAt: g.joinedAt,
      })),
      stats: {
        lessonsTotal: lessons.length,
        assignmentsTotal: assignmentsTotalAll,
        assignmentsDone: assignmentsDoneAll,
        progressPercent: progressPercentAll,
        avgScore: avgScoreAll,
        lastSubmittedAt: lastSubmittedAtAll,
      },
      lessons: lessonsDto,
    };
  }

  async getStudentLessonProgress(
    teacherId: number,
    studentId: number,
    lessonId: number,
  ): Promise<StudentLessonProgressDto> {
    const canSee = await this.groupRepo.teacherHasStudent(teacherId, studentId);
    if (!canSee) throw new ForbiddenException('No access to this student');

    const data = await this.studentsRepo.getStudentLessonProgressRaw(
      studentId,
      lessonId,
    );

    if (!data.student) throw new NotFoundException('Student not found');
    if (!data.lesson) throw new NotFoundException('Lesson not found');
    if (data.lesson.archived) throw new NotFoundException('Lesson not found');

    if (data.lesson.createdById !== teacherId) {
      throw new ForbiddenException('You are not the owner of this lesson');
    }

    const allAssignments = data.lesson.assignments ?? [];

    const assignedMeta = data.assignedMeta;

    const assignedSet = new Set<number>(
      (assignedMeta ?? []).map((x) => x.assignmentId),
    );

    const assignedAtByAssignmentId = new Map<number, Date>(
      (assignedMeta ?? []).map((x) => [x.assignmentId, x.assignedAt]),
    );

    const assignments = allAssignments.filter((a) => assignedSet.has(a.id));
    const totalCount = assignments.length;

    type AttemptRow = {
      id: number;
      assignmentId: number;
      attemptNo: number;
      status: StudentAttemptStatus;
      score: number | null;
      startedAt: Date | null;
      submittedAt: Date | null;
      gradedAt: Date | null;
      results: Array<{
        questionId: number;
        answer: any;
        isCorrect: boolean | null;
        responseTimeMs: number | null;
        createdAt: Date;
      }>;
    };

    const studentAttempts: AttemptRow[] = data.studentAssignments;

    const attemptsByAssignment = new Map<number, AttemptRow[]>();
    for (const sa of studentAttempts) {
      if (!assignedSet.has(sa.assignmentId)) continue;

      const arr = attemptsByAssignment.get(sa.assignmentId) ?? [];
      arr.push(sa);
      attemptsByAssignment.set(sa.assignmentId, arr);
    }

    let completedCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let lastActivityAt: Date | null = null;

    for (const a of assignments) {
      const attempts = (attemptsByAssignment.get(a.id) ?? []).sort(
        (x, y) => x.attemptNo - y.attemptNo,
      );
      if (!attempts.length) continue;

      const last = attempts[attempts.length - 1];

      for (const t of attempts) {
        const candidates = [t.startedAt, t.submittedAt, t.gradedAt].filter(
          Boolean,
        ) as Date[];

        for (const d of candidates) {
          if (!lastActivityAt || d > lastActivityAt) lastActivityAt = d;
        }
      }

      if (DONE_STATUSES.includes(last.status)) completedCount += 1;

      if (typeof last.score === 'number') {
        scoreSum += last.score;
        scoreCount += 1;
      }
    }

    if (!lastActivityAt) {
      for (const a of assignments) {
        const d = assignedAtByAssignmentId.get(a.id);
        if (d && (!lastActivityAt || d > lastActivityAt)) lastActivityAt = d;
      }
    }

    const avgScore = scoreCount > 0 ? scoreSum / scoreCount : null;

    const assignmentsDto = assignments.map((a) => {
      const attempts = (attemptsByAssignment.get(a.id) ?? []).sort(
        (x, y) => x.attemptNo - y.attemptNo,
      );

      const questions = a.questions ?? [];

      const attemptsDto = attempts.map((sa) => {
        const resultsByQuestionId = new Map<
          number,
          Array<AttemptRow['results'][number]>
        >();

        for (const r of sa.results ?? []) {
          const arr = resultsByQuestionId.get(r.questionId) ?? [];
          arr.push(r);
          resultsByQuestionId.set(r.questionId, arr);
        }

        const questionsDto = questions.map((q) => {
          const list = resultsByQuestionId.get(q.id) ?? [];
          list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

          const last = list[list.length - 1] ?? null;
          const correct = (q.answers ?? []).find((ans) => ans.isCorrect);

          return {
            id: q.id,
            text: q.text,
            questionType: q.questionType.name,
            explanation: q.explanation ?? null,

            studentAnswers: list.map((r) => ({
              value: r.answer ?? null,
              isCorrect: r.isCorrect ?? null,
              responseTimeMs: r.responseTimeMs ?? null,
              createdAt: r.createdAt,
              attempt:
                typeof r.answer?.attempt === 'number' ? r.answer.attempt : null,
            })),

            studentAnswer: last?.answer ?? null,
            isCorrect: last?.isCorrect ?? null,

            correctAnswerText: correct?.text ?? null,
          };
        });

        return {
          id: sa.id,
          attemptNo: sa.attemptNo,
          status: sa.status,
          score: sa.score ?? null,
          startedAt: sa.startedAt ?? null,
          submittedAt: sa.submittedAt ?? null,
          gradedAt: sa.gradedAt ?? null,
          questions: questionsDto,
        };
      });

      return {
        id: a.id,
        type: a.type,
        attempts: attemptsDto,
      };
    });

    return {
      lesson: { id: data.lesson.id, title: data.lesson.title },
      student: {
        id: data.student.id,
        username: data.student.username,
        firstName: data.student.firstName,
        lastName: data.student.lastName,
        avatarUrl: data.student.avatarUrl,
      },
      overall: {
        completedCount,
        totalCount,
        avgScore,
        lastActivityAt,
      },
      assignments: assignmentsDto,
    };
  }
  async updateStudentProfile(
    teacherId: number,
    studentId: number,
    dto: UpdateStudentDto,
  ) {
    const canSee = await this.groupRepo.teacherHasStudent(teacherId, studentId);
    if (!canSee) {
      throw new ForbiddenException('No access to this student');
    }

    const ok = await this.studentsRepo.updateStudentProfile(studentId, dto);
    if (!ok) throw new NotFoundException('Student not found');

    return { ok: true };
  }
}
