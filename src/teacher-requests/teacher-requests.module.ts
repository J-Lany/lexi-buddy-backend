import { Module } from '@nestjs/common';
import { TeacherRequestsController } from './teacher-requests.controller';
import { TeacherRequestsInternalController } from './teacher-requests.internal.controller';
import { TeacherRequestsService } from './teacher-requests.service';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from 'auth/auth.module';
import { RoleRepository } from 'repositories/role.repository';
import { UserRepository } from 'repositories/user.repository';
import { GroupInviteRepository } from 'repositories/group-invite.repository';
import { TelegramNotificationsModule } from 'notifications/telegram-notifications.module';

@Module({
  imports: [AuthModule, PrismaModule, TelegramNotificationsModule],
  controllers: [TeacherRequestsController, TeacherRequestsInternalController],
  providers: [
    TeacherRequestsService,
    RoleRepository,
    UserRepository,
    GroupInviteRepository,
  ],
  exports: [TeacherRequestsService],
})
export class TeacherRequestsModule {}
