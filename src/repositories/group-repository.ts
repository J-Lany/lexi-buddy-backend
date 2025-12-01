import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class GroupRepository {
  constructor(public readonly prisma: PrismaService) {}

  async findByTeacher(teacherId: number) {
    return this.prisma.group.findMany({
      where: {
        teacherId: teacherId,
      },
      select: {
        name: true,
        students: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                level: true,
                contacts: {
                  select: {
                    contactValue: true,
                    contactType: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
