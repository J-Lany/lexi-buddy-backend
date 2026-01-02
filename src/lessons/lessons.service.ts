import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { StudentAssignmentStatus } from '@prisma/client';

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
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

    return this.lessonRepo.findById(lesson.id);
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
        completedAssignments: number;
      }
    >();

    for (const assignment of lesson.assignments) {
      for (const sa of assignment.studentAssignments) {
        if (!sa.user) continue;

        const existing = studentsMap.get(sa.user.id) ?? {
          id: sa.user.id,
          username: sa.user.username,
          completedAssignments: 0,
        };

        if (
          sa.status === StudentAssignmentStatus.COMPLETED ||
          sa.status === StudentAssignmentStatus.GRADED
        ) {
          existing.completedAssignments += 1;
        }

        studentsMap.set(sa.user.id, existing);
      }
    }

    const students = Array.from(studentsMap.values()).map((s) => {
      const completed = s.completedAssignments;
      const total = totalAssignments || 0;

      let status: LessonStudentStatus = 'NOT_STARTED';

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
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { assignments: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    this.ensureLessonOwner(lesson.createdById, teacherId);

    const studentIds = new Set<number>();

    dto.studentIds?.forEach((id) => studentIds.add(id));

    if (dto.groupIds?.length) {
      const groups = await this.prisma.group.findMany({
        where: {
          id: { in: dto.groupIds },
          members: {
            some: {
              userId: teacherId,
              isActive: true,
            },
          },
        },
      });

      const allowedGroupIds = new Set(groups.map((g) => g.id));
      const forbidden = dto.groupIds.filter((id) => !allowedGroupIds.has(id));
      if (forbidden.length) {
        throw new ForbiddenException(
          `You are not a member of groups: ${forbidden.join(', ')}`,
        );
      }

      const members = await this.prisma.groupMember.findMany({
        where: {
          groupId: { in: dto.groupIds },
          isActive: true,
        },
      });
      members.forEach((m) => studentIds.add(m.userId));
    }

    const ids = [...studentIds];
    if (!ids.length || !lesson.assignments.length) {
      return { created: 0 };
    }

    await this.prisma.$transaction(
      ids.flatMap((userId) =>
        lesson.assignments.map((a) =>
          this.prisma.studentAssignment.create({
            data: {
              user: { connect: { id: userId } },
              assignment: { connect: { id: a.id } },
            },
          }),
        ),
      ),
    );

    if (dto.groupIds?.length) {
      await this.prisma.groupLesson.createMany({
        data: dto.groupIds.map((groupId) => ({
          groupId,
          lessonId,
        })),
        skipDuplicates: true,
      });
    }

    return { created: ids.length * lesson.assignments.length };
  }
}
