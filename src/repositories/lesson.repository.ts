import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
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
            questions: {
              include: {
                answers: true,
              },
            },
          },
        },

        groupLessons: {
          include: {
            group: true,
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
}
