import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class RoleRepository {
  constructor(public readonly prisma: PrismaService) {}

  async findByName(name: string) {
    return this.prisma.role.findFirst({ where: { name } });
  }
}
