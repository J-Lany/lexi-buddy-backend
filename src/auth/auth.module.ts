import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from '../mail/mail.module';
import { UserRepository } from 'repositories/user.repository';
import { ContactTypeRepository } from 'repositories/contact-type.repository';
import { UserContactRepository } from 'repositories/user-contact.repository';
import { RoleRepository } from 'repositories/role.repository';

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    ContactTypeRepository,
    UserContactRepository,
    RoleRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
