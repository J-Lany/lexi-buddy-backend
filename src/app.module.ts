import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from 'prisma/prisma.module';
import { StudentsModule } from 'students/students.module';
import { GroupsModule } from 'groups/groups.module';

@Module({
  imports: [AuthModule, MailModule, PrismaModule, StudentsModule, GroupsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
