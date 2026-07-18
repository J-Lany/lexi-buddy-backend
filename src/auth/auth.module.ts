import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from 'common/modules/mail/mail.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserRepository } from 'repositories/user.repository';
import { ContactTypeRepository } from 'repositories/contact-type.repository';
import { UserContactRepository } from 'repositories/user-contact.repository';
import { RoleRepository } from 'repositories/role.repository';
import { PasswordChangeRequestRepository } from 'repositories/password-change-request.repository';
import { StorageService } from 'common/modules/storage/storage.service';
import { TelegramAvatarService } from 'common/modules/telegram/telegram-avatar.service';
import { TelegramApiService } from 'common/modules/telegram/telegram-api.service';

@Module({
  imports: [
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret)
          throw new Error('JWT_SECRET environment variable is not set');
        return { secret, signOptions: { expiresIn: '15m' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    StorageService,
    TelegramAvatarService,
    TelegramApiService,
    UserRepository,
    ContactTypeRepository,
    UserContactRepository,
    RoleRepository,
    PasswordChangeRequestRepository,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, RoleRepository],
})
export class AuthModule {}
