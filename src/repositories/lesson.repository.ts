import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';
import { Lesson, LessonVocab, Prisma } from '@prisma/client';

@Injectable()
export class LessonRepository {
  constructor(private readonly prisma: PrismaService) {}

  createLesson(data: Prisma.LessonCreateInput): Promise<Lesson> {
    return this.prisma.lesson.create({ data });
  }

  findById(id: number) {
    return this.prisma.lesson.findUnique({
      where: { id },
      include: {
        vocab: true,
        assignments: {
          include: {
            type: true,

            assignedAssignments: {
              where: { revokedAt: null },
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatarUrl: true,
                    firstName: true,
                    lastName: true,
                    lastVisit: true,
                  },
                },
                attempts: {
                  orderBy: { attemptNo: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    attemptNo: true,
                    status: true,
                    score: true,
                    startedAt: true,
                    submittedAt: true,
                    gradedAt: true,
                  },
                },
              },
            },

            questions: {
              include: {
                answers: true,
              },
            },
          },
        },
        groupLessons: {
          include: {
            group: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });
  }

  async replaceLessonVocab(
    lessonId: number,
    items: Array<{ term: string; translation: string; synonyms: string[] }>,
  ): Promise<LessonVocab[]> {
    await this.prisma.lessonVocab.deleteMany({ where: { lessonId } });

    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.lessonVocab.create({
          data: {
            lessonId,
            term: item.term,
            translation: item.translation,
            synonyms: item.synonyms,
          },
        }),
      ),
    );
  }

  findAllByTeacher(teacherId: number) {
    return this.prisma.lesson.findMany({
      where: { createdById: teacherId, archived: false },
      include: {
        _count: {
          select: {
            vocab: true,
            assignments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  archiveLesson(lessonId: number) {
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { archived: true },
    });
  }

  findCreatorById(
    id: number,
  ): Promise<{ id: number; createdById: number } | null> {
    return this.prisma.lesson.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
  }

  async hardDeleteLesson(lessonId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const questionIds = (
        await tx.assignmentQuestion.findMany({
          where: { assignment: { lessonId } },
          select: { id: true },
        })
      ).map((q) => q.id);

      if (questionIds.length) {
        await tx.result.deleteMany({
          where: { questionId: { in: questionIds } },
        });
      }

      await tx.assignment.deleteMany({ where: { lessonId } });
      await tx.lesson.delete({ where: { id: lessonId } });
    });
  }
}
