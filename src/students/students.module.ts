import { Module } from '@nestjs/common';

import { AuthModule } from 'auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { GroupRepository } from 'repositories/group-repository';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StudentsController],
  providers: [StudentsService, GroupRepository],
  exports: [StudentsService],
})
export class StudentsModule {}
