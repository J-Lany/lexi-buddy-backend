import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { LessonRepository } from 'repositories/lesson.repository';
import { AssignmentRepository } from 'repositories/assignment.repository';
import { AiService } from 'ai/ai.service';

import { CreateLessonDto } from './dto/create-lesson.dto';
import { VocabPreviewDto } from './dto/vocab-preview.dto';
import { SaveVocabListDto } from './dto/save-vocab-list.dto';
import { AssignmentPreviewDto } from './dto/assignment-preview.dto';
import { SaveAssignmentDto } from './dto/save-assignment.dto';
import { AssignLessonDto } from './dto/assign-lesson.dto';
import { TrainingTypeKey } from 'ai/prompts';
import { LessonSummaryDto } from './dto/lesson-summary.dto';
import { LessonDetailsDto } from './dto/lesson-details.dto';
import { DONE_STATUSES } from 'common/constants/student-assignment';
import { TelegramNotificationsService } from 'notifications/telegram-notifications.service';

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramNotificationsService: TelegramNotificationsService,
    private readonly lessonRepo: LessonRepository,
    private readonly assignmentRepo: AssignmentRepository,
    private readonly ai: AiService,
  ) {}

  private async getAssignmentTypeIdOrThrow(typeName: string): Promise<number> {
    const assignmentType =
      await this.assignmentRepo.findAssignmentTypeByName(typeName);

    if (!assignmentType) {
      throw new BadRequestException(`Assignment type "${typeName}" not found`);
    }

    return assignmentType.id;
  }

  async createLesson(dto: CreateLessonDto, teacherId: number) {
    const lesson = await this.lessonRepo.createLesson({
      title: dto.title,
      topic: dto.topic,
      description: dto.description,
      level: dto.level,
      ageCategory: dto.ageCategory,
      createdBy: { connect: { id: teacherId } },
    });

    if (dto.vocabItems?.length) {
      await this.lessonRepo.replaceLessonVocab(
        lesson.id,
        dto.vocabItems.map((i) => ({
          term: i.term,
          translation: i.translation,
          synonyms: i.synonyms ?? [],
        })),
      );
    }

    if (dto.assignments?.length) {
      const questionTypeMap = await this.assignmentRepo.getQuestionTypeMap();

      for (const assignmentDto of dto.assignments) {
        const questions = assignmentDto.questions.map((q) => ({
          text: q.text,
          questionTypeId:
            questionTypeMap[q.questionType] ??
            questionTypeMap['multiple_choice'],
          answers: q.answers.map((a) => ({
            text: a.text,
            isCorrect: a.isCorrect,
          })),
          explanation: q.explanation,
        }));

        const typeId = await this.getAssignmentTypeIdOrThrow(
          assignmentDto.type,
        );

        await this.assignmentRepo.createAssignmentWithQuestionsAndAnswers({
          lessonId: lesson.id,
          typeId,
          questions,
        });
      }
    }

    return { lessonId: lesson.id };
  }

  private ensureLessonOwner(lessonCreatorId: number, teacherId: number) {
    if (lessonCreatorId !== teacherId) {
      throw new ForbiddenException('You are not the owner of this lesson');
    }
  }

  async getLessonForTeacher(
    lessonId: number,
    teacherId: number,
  ): Promise<LessonDetailsDto> {
    const lesson = await this.lessonRepo.findById(lessonId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    this.ensureLessonOwner(lesson.createdById, teacherId);

    const totalAssignments = lesson.assignments.length;

    const groups = lesson.groupLessons
      .filter((gl) => gl.group.members.length > 1)
      .map((gl) => ({
        id: gl.group.id,
        name: gl.group.name,
      }));

    type LessonStudentStatus = 'NOT_STARTED' | 'PENDING' | 'COMPLETED';

    const studentsMap = new Map<
      number,
      {
        id: number;
        username: string | null;
        avatarUrl: string | null;
        firstName: string | null;
        lastName: string | null;
        lastVisit: Date | null;
        completedAssignments: number;
      }
    >();

    for (const assignment of lesson.assignments) {
      for (const aa of assignment.assignedAssignments ?? []) {
        if (!aa.user) continue;

        const existing = studentsMap.get(aa.user.id) ?? {
          id: aa.user.id,
          username: aa.user.username,
          avatarUrl: aa.user.avatarUrl,
          firstName: aa.user.firstName,
          lastName: aa.user.lastName,
          lastVisit: aa.user.lastVisit,
          completedAssignments: 0,
        };

        const lastAttempt = aa.attempts?.[0] ?? null;
        if (lastAttempt && DONE_STATUSES.includes(lastAttempt.status)) {
          existing.completedAssignments += 1;
        }

        studentsMap.set(aa.user.id, existing);
      }
    }

    const students = Array.from(studentsMap.values()).map((s) => {
      const completed = s.completedAssignments;
      const total = totalAssignments || 0;

      let status: LessonStudentStatus;

      if (total === 0) {
        status = 'NOT_STARTED';
      } else if (completed === 0) {
        status = 'NOT_STARTED';
      } else if (completed < total) {
        status = 'PENDING';
      } else {
        status = 'COMPLETED';
      }

      const progressPercent =
        total === 0 ? 0 : Math.round((completed / total) * 100);

      return {
        id: s.id,
        username: s.username,
        avatarUrl: s.avatarUrl,
        lastName: s.lastName,
        firstName: s.firstName,
        lastVisit: s.lastVisit,
        status,
        completedAssignments: completed,
        totalAssignments: total,
        progressPercent,
      };
    });

    const vocab = lesson.vocab.map((v) => ({
      id: v.id,
      term: v.term,
      translation: v.translation,
      synonyms: (v.synonyms ?? []) as string[],
    }));

    const assignments = lesson.assignments.map((a) => ({
      id: a.id,
      type: a.type,
      questions: a.questions.map((q) => ({
        id: q.id,
        text: q.text,
        explanation: q.explanation,
        answers: q.answers.map((ans) => ({
          id: ans.id,
          text: ans.text,
          isCorrect: ans.isCorrect,
        })),
      })),
    }));

    return {
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      level: lesson.level,
      ageCategory: lesson.ageCategory,
      vocab,
      assignments,
      groups,
      students,
    };
  }

  async getLessonsForTeacher(teacherId: number): Promise<LessonSummaryDto[]> {
    const lessons = await this.lessonRepo.findAllByTeacher(teacherId);

    return lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      level: lesson.level,
      ageCategory: lesson.ageCategory,
      vocabCount: lesson._count.vocab,
      assignmentsCount: lesson._count.assignments,
    }));
  }

  async vocabPreview(dto: VocabPreviewDto) {
    return this.ai.translateVocab(dto.terms, {
      topic: dto.topic,
      level: dto.level ?? null,
      ageGroup: dto.ageGroup ?? null,
    });
  }

  async updateVocab(
    lessonId: number,
    dto: SaveVocabListDto,
    teacherId: number,
  ) {
    const lesson = await this.lessonRepo.findById(lessonId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    this.ensureLessonOwner(lesson.createdById, teacherId);

    return this.lessonRepo.replaceLessonVocab(
      lessonId,
      dto.items.map((i) => ({
        term: i.term,
        translation: i.translation,
        synonyms: i.synonyms ?? [],
      })),
    );
  }

  async assignmentPreview(dto: AssignmentPreviewDto) {
    return this.ai.generateAssignment({
      trainingType: dto.type as TrainingTypeKey,
      terms: dto.terms,
      questionsCount: dto.questionsCount,
      topic: dto.topic,
      level: dto.level,
      ageGroup: dto.ageGroup,
    });
  }

  async updateAssignments(
    lessonId: number,
    dto: SaveAssignmentDto,
    teacherId: number,
  ) {
    const lesson = await this.lessonRepo.findById(lessonId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    this.ensureLessonOwner(lesson.createdById, teacherId);

    const questionTypeMap = await this.assignmentRepo.getQuestionTypeMap();

    const questions = dto.questions.map((q) => ({
      text: q.text,
      questionTypeId:
        questionTypeMap[q.questionType] ?? questionTypeMap['multiple_choice'],
      answers: q.answers.map((a) => ({
        text: a.text,
        isCorrect: a.isCorrect,
      })),
      explanation: q.explanation,
    }));

    const typeId = await this.getAssignmentTypeIdOrThrow(dto.type);

    return this.assignmentRepo.createAssignmentWithQuestionsAndAnswers({
      lessonId,
      typeId,
      questions,
    });
  }

  async assignLesson(
    lessonId: number,
    dto: AssignLessonDto,
    teacherId: number,
  ) {
    const groupIds = Array.from(
      new Set((dto.groupIds ?? []).filter((x) => Number.isInteger(x))),
    );
    const directStudentIds = Array.from(
      new Set((dto.studentIds ?? []).filter((x) => Number.isInteger(x))),
    );

    if (!groupIds.length && !directStudentIds.length) {
      throw new BadRequestException('studentIds or groupIds must be provided');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: {
          id: true,
          title: true,
          createdById: true,
          assignments: { select: { id: true } },
        },
      });

      if (!lesson) throw new NotFoundException('Lesson not found');
      this.ensureLessonOwner(lesson.createdById, teacherId);

      const assignmentIds = lesson.assignments.map((a) => a.id);
      if (!assignmentIds.length) {
        return {
          created: 0,
          usersTargeted: 0,
          assignmentsTargeted: 0,
          usersToNotify: [] as number[],
          lessonTitle: lesson.title,
        };
      }

      if (groupIds.length) {
        const allowed = await tx.groupMember.findMany({
          where: {
            groupId: { in: groupIds },
            userId: teacherId,
            isActive: true,
          },
          select: { groupId: true },
        });

        const allowedSet = new Set(allowed.map((x) => x.groupId));
        const forbidden = groupIds.filter((id) => !allowedSet.has(id));

        if (forbidden.length) {
          throw new ForbiddenException(
            `You are not a member of groups: ${forbidden.join(', ')}`,
          );
        }
      }

      const groupMembers = groupIds.length
        ? await tx.groupMember.findMany({
            where: {
              groupId: { in: groupIds },
              isActive: true,
              role: { name: 'student', scope: 'GROUP' },
            },
            select: { userId: true },
          })
        : [];

      let allowedDirectStudentIds: number[] = [];
      if (directStudentIds.length) {
        const rows = await tx.groupMember.findMany({
          where: {
            userId: { in: directStudentIds },
            isActive: true,
            role: { name: 'student', scope: 'GROUP' },
            group: {
              members: {
                some: { userId: teacherId, isActive: true },
              },
            },
          },
          select: { userId: true },
        });

        allowedDirectStudentIds = Array.from(
          new Set(rows.map((r) => r.userId)),
        );

        const allowedSet = new Set(allowedDirectStudentIds);
        const invalid = directStudentIds.filter((id) => !allowedSet.has(id));

        if (invalid.length) {
          throw new ForbiddenException(
            `You cannot assign to these students: ${invalid.join(', ')}`,
          );
        }
      }

      const targetUserIds = new Set<number>();
      for (const id of allowedDirectStudentIds) targetUserIds.add(id);
      for (const m of groupMembers) targetUserIds.add(m.userId);

      targetUserIds.delete(teacherId);

      const userIds = Array.from(targetUserIds);
      if (!userIds.length) {
        return {
          created: 0,
          usersTargeted: 0,
          assignmentsTargeted: assignmentIds.length,
          usersToNotify: [] as number[],
          lessonTitle: lesson.title,
        };
      }

      // ✅ ИДЕАЛЬНЫЙ ДИФФ: узнаём что уже есть, создаём только missing
      const existing = await tx.studentAssignedAssignment.findMany({
        where: { userId: { in: userIds }, assignmentId: { in: assignmentIds } },
        select: { userId: true, assignmentId: true },
      });

      const existingSet = new Set(
        existing.map((x) => `${x.userId}:${x.assignmentId}`),
      );

      const missingData: Prisma.StudentAssignedAssignmentCreateManyInput[] = [];
      for (const userId of userIds) {
        for (const assignmentId of assignmentIds) {
          const key = `${userId}:${assignmentId}`;
          if (!existingSet.has(key)) {
            missingData.push({ userId, assignmentId });
          }
        }
      }

      if (missingData.length) {
        await tx.studentAssignedAssignment.createMany({
          data: missingData,
          skipDuplicates: true,
        });
      }

      const usersToNotify = Array.from(
        new Set(missingData.map((x) => x.userId)),
      );

      if (groupIds.length) {
        await tx.groupLesson.createMany({
          data: groupIds.map((groupId) => ({ groupId, lessonId })),
          skipDuplicates: true,
        });
      }

      return {
        created: missingData.length, // это точное число новых связок userId-assignmentId, которые мы хотели создать
        usersTargeted: userIds.length,
        assignmentsTargeted: assignmentIds.length,
        usersToNotify,
        lessonTitle: lesson.title,
      };
    });

    if (result.usersToNotify.length) {
      const contacts = await this.prisma.userContact.findMany({
        where: {
          userId: { in: result.usersToNotify },
          contactType: { name: 'telegram' },
        },
        select: { contactValue: true },
      });

      const teacher = await this.prisma.user.findUnique({
        where: { id: teacherId },
        select: { firstName: true, lastName: true, username: true },
      });

      const teacherName =
        [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') ||
        teacher?.username ||
        null;

      await Promise.allSettled(
        contacts.map((c) =>
          this.telegramNotificationsService.sendLessonAssigned({
            telegramId: c.contactValue,
            lessonId,
            lessonTitle: result.lessonTitle,
            teacherName,
          }),
        ),
      );
    }

    return {
      created: result.created,
      usersTargeted: result.usersTargeted,
      assignmentsTargeted: result.assignmentsTargeted,
    };
  }
}
