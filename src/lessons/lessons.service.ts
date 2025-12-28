import {
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

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessonRepo: LessonRepository,
    private readonly assignmentRepo: AssignmentRepository,
    private readonly ai: AiService,
  ) {}

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
      const questionTypes = await this.prisma.assignmentQuestionType.findMany();
      const typeByName = Object.fromEntries(
        questionTypes.map((t) => [t.name, t.id]),
      );

      for (const assignmentDto of dto.assignments) {
        const questions = assignmentDto.questions.map((q) => ({
          text: q.text,
          questionTypeId:
            typeByName[q.questionType] ?? typeByName['multiple_choice'],
          answers: q.answers.map((a) => ({
            text: a.text,
            isCorrect: a.isCorrect,
          })),
          explanation: q.explanation,
        }));

        await this.assignmentRepo.createAssignmentWithQuestionsAndAnswers({
          lessonId: lesson.id,
          typeId: assignmentDto.assignmentTypeId,
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

  async getLessonForTeacher(lessonId: number, teacherId: number) {
    const lesson = await this.lessonRepo.findById(lessonId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    this.ensureLessonOwner(lesson.createdById, teacherId);

    return lesson;
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

    const questionTypes = await this.prisma.assignmentQuestionType.findMany();
    const typeByName = Object.fromEntries(
      questionTypes.map((t) => [t.name, t.id]),
    );

    const questions = dto.questions.map((q) => ({
      text: q.text,
      questionTypeId:
        typeByName[q.questionType] ?? typeByName['multiple_choice'],
      answers: q.answers.map((a) => ({
        text: a.text,
        isCorrect: a.isCorrect,
      })),
      explanation: q.explanation,
    }));

    return this.assignmentRepo.createAssignmentWithQuestionsAndAnswers({
      lessonId,
      typeId: dto.assignmentTypeId,
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
