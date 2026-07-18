import { Module } from '@nestjs/common';

import { AuthModule } from 'auth/auth.module';
import { PrismaModule } from 'common/modules/prisma/prisma.module';
import { GroupRepository } from 'repositories/group-repository';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { UserRepository } from 'repositories/user.repository';
import { StudentsRepository } from 'repositories/student-repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StudentsController],
  providers: [
    StudentsService,
    GroupRepository,
    UserRepository,
    StudentsRepository,
  ],
  exports: [StudentsService],
})
export class StudentsModule {}
