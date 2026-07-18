import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';
import { RoleScope } from '@prisma/client';

@Injectable()
export class RoleRepository {
  constructor(public readonly prisma: PrismaService) {}

  async findByNameAndScope(name: string, scope: RoleScope) {
    return this.prisma.role.findFirst({
      where: { name, scope },
    });
  }

  async findGlobalRole(name: string) {
    return this.findByNameAndScope(name, RoleScope.GLOBAL);
  }

  async findGroupRole(name: string) {
    return this.findByNameAndScope(name, RoleScope.GROUP);
  }
}
