import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Assignment } from '@prisma/client';

@Injectable()
export class AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAssignmentWithQuestionsAndAnswers(params: {
    lessonId: number;
    typeId: number;
    questions: Array<{
      text: string;
      questionTypeId: number;
      answers: Array<{ text: string; isCorrect: boolean }>;
      explanation?: string | null;
    }>;
  }): Promise<Assignment> {
    const { lessonId, typeId, questions } = params;

    return this.prisma.assignment.create({
      data: {
        lesson: { connect: { id: lessonId } },
        type: { connect: { id: typeId } },
        questions: {
          create: questions.map((q) => ({
            text: q.text,
            questionType: { connect: { id: q.questionTypeId } },
            explanation: q.explanation ?? null,
            answers: {
              create: q.answers.map((a) => ({
                text: a.text,
                isCorrect: a.isCorrect,
              })),
            },
          })),
        },
      },
      include: {
        type: true,
        questions: { include: { answers: true } },
      },
    });
  }

  async findAssignmentTypeByName(name: string) {
    return this.prisma.assignmentType.findUnique({
      where: { name },
    });
  }

  async getQuestionTypeMap(): Promise<Record<string, number>> {
    const types = await this.prisma.assignmentQuestionType.findMany();
    return Object.fromEntries(types.map((t) => [t.name, t.id]));
  }
}
