import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';

@Injectable()
export class ContactTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByName(name: string) {
    return this.prisma.contactType.findFirst({ where: { name } });
  }
}
