import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon from 'argon2';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'common/modules/mail/mail.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import { UserRepository } from 'repositories/user.repository';
import { ContactTypeRepository } from 'repositories/contact-type.repository';
import { RoleRepository } from 'repositories/role.repository';
import { UserContactRepository } from 'repositories/user-contact.repository';
import { LoginrDto } from './dto/login.dto/login.dto';
import { RegisterTelegramDto } from './dto/register-telegram.dto/register-telegram.dto';
import { TelegramAvatarService } from 'common/modules/telegram/telegram-avatar.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  private readonly secret = process.env.JWT_SECRET;
  constructor(
    private mail: MailService,
    private jwt: JwtService,
    private userRepo: UserRepository,
    private contactTypeRepo: ContactTypeRepository,
    private userContactRepo: UserContactRepository,
    private roleRepo: RoleRepository,
    private telegramAvatarService?: TelegramAvatarService,
  ) {}

  async register(dto: RegisterDto) {
    const exist = await this.userContactRepo.findByEmail(dto.email);

    if (exist) throw new BadRequestException('Email already exist');

    const passwordHash = await argon.hash(dto.password);
    const activationToken = randomUUID();

    const teacherRole = await this.roleRepo.findGlobalRole('teacher');

    if (!teacherRole) throw new BadRequestException('Teacher role not found');

    const contactType = await this.contactTypeRepo.findByName('email');

    if (!contactType)
      throw new BadRequestException('Contact email is not found');

    const data = {
      passwordHash,
      roleId: teacherRole.id,
      activationToken,
      activationExpires: new Date(Date.now() + 86400000),
      email: dto.email,
      contactTypeId: contactType.id,
    };

    await this.userRepo.createUserByEmail(data);
    await this.mail.sendActivationMail(dto.email, activationToken);

    return { message: 'Activation email sent' };
  }

  async registerTelegram(dto: RegisterTelegramDto) {
    const existing = await this.userContactRepo.findByTelegram(dto.telegramId);
    if (existing) throw new BadRequestException('Telegram user already exists');

    const role = await this.roleRepo.findGlobalRole('student');

    if (!role) throw new BadRequestException('Student role not found');

    const contactType = await this.contactTypeRepo.findByName('telegram');
    if (!contactType)
      throw new BadRequestException('Telegram contact type not found');

    let avatarUrl: string | null;

    try {
      avatarUrl = this.telegramAvatarService
        ? await this.telegramAvatarService.saveTelegramAvatarByTelegramId(
            dto.telegramId,
          )
        : null;
    } catch (e) {
      console.warn('Telegram avatar fetch failed', {
        telegramId: dto.telegramId,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : null,
      });
      avatarUrl = null;
    }

    return await this.userRepo.createUserByTelegram({
      firstName: dto.firstName,
      lastName: dto.lastName,
      roleId: role.id,
      username: dto.username,
      telegramId: dto.telegramId || 0,
      contactTypeId: contactType.id,
      avatarUrl,
    });
  }

  async activate(token: string) {
    const user = await this.userRepo.findByActivationToken(token);

    if (!user) {
      throw new BadRequestException('Invalid token');
    }

    if (user.verified) {
      return { message: 'Account already activated' };
    }

    const now = new Date();

    if (!user.activationExpires || user.activationExpires < now) {
      await this.userRepo.deleteUser(user.id);
      throw new BadRequestException('Activation token expired');
    }

    await this.userRepo.updateUserVerification(user.id);

    return { message: 'Account activated' };
  }

  async getByTelegramId(telegramId: number) {
    const user = await this.userRepo.findByTelegramId(telegramId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      level: user.level,
      ageGroup: user.ageGroup,
      roleId: user.roleId,
      verified: user.verified,
    };
  }

  async login(dto: LoginrDto) {
    const { email, password } = dto;
    const user = await this.userRepo.findByEmail(email);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('User by this email is not found');
    }

    if (!user.verified) {
      throw new UnauthorizedException('Email not verified. Check your mailbox');
    }

    const isValid = await argon.verify(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const payload = { sub: user.id, roleId: user.roleId };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
      secret: this.secret,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      expiresIn: '30d',
      secret: this.secret,
    });

    const refreshHash = await argon.hash(refreshToken);
    await this.userRepo.updateRefreshTokenHash(user.id, refreshHash);

    return {
      accessToken,
      refreshToken,
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email,
      },
    };
  }

  async getProfile(userId: number) {
    const profile = await this.userRepo.findTeacherProfile(userId);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    return this.userRepo.updateTeacherProfile(userId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      defaultLanguage: dto.defaultLanguage,
    });
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const jwtPayload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.secret,
      });

      const user = await this.userRepo.findById(jwtPayload.sub);

      if (!user || !user.refreshTokenHash) {
        return;
      }

      const matches = await argon.verify(user.refreshTokenHash, refreshToken);

      if (!matches) {
        return;
      }

      await this.userRepo.updateRefreshTokenHash(user.id, null);
    } catch {
      return;
    }
  }

  async refresh(refreshToken: string) {
    try {
      const jwtPayload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.secret,
      });
      const user = await this.userRepo.findById(jwtPayload.sub);

      if (!user || !user.refreshTokenHash) {
        throw new ForbiddenException('Access denied');
      }

      const matches = await argon.verify(user.refreshTokenHash, refreshToken);

      if (!matches) {
        throw new ForbiddenException('Access denied');
      }

      const payload = { sub: user.id, roleId: user.roleId };
      const newAccessToken = await this.jwt.signAsync(payload, {
        secret: this.secret,
        expiresIn: '15m',
      });
      const newRefreshToken = await this.jwt.signAsync(payload, {
        secret: this.secret,
        expiresIn: '30d',
      });

      const newRefreshHash = await argon.hash(newRefreshToken);
      await this.userRepo.updateRefreshTokenHash(user.id, newRefreshHash);

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
