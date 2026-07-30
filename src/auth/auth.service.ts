import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon from 'argon2';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'common/modules/mail/mail.service';
import { AppException } from 'common/errors';
import { maskEmail } from 'common/utils/mask-email';
import {
  CURRENT_TEACHER_CONSENT_VERSION,
  CURRENT_TELEGRAM_CONSENT_VERSION,
} from 'common/constants/consent';
import { RegisterDto } from './dto/register.dto/register.dto';
import { UserRepository } from 'repositories/user.repository';
import { ContactTypeRepository } from 'repositories/contact-type.repository';
import { RoleRepository } from 'repositories/role.repository';
import { UserContactRepository } from 'repositories/user-contact.repository';
import { PasswordChangeRequestRepository } from 'repositories/password-change-request.repository';
import { LoginrDto } from './dto/login.dto/login.dto';
import { RegisterTelegramDto } from './dto/register-telegram.dto/register-telegram.dto';
import { TelegramAvatarService } from 'common/modules/telegram/telegram-avatar.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestPasswordChangeDto } from './dto/request-password-change.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  // Computed once per process (never per login request) so that verifying a
  // password for a nonexistent user/account takes a comparable amount of
  // time to a real password check — this is what closes the "unknown email
  // fails immediately" timing oracle in login(). The value itself is not a
  // secret: it never needs to match any real password.
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    private mail: MailService,
    private jwt: JwtService,
    private userRepo: UserRepository,
    private contactTypeRepo: ContactTypeRepository,
    private userContactRepo: UserContactRepository,
    private roleRepo: RoleRepository,
    private passwordChangeRepo: PasswordChangeRequestRepository,
    private telegramAvatarService?: TelegramAvatarService,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
      throw new Error('JWT_SECRET must be set in environment variables');
    this.secret = secret;
    this.dummyPasswordHash = argon.hash(randomUUID());
  }

  async register(dto: RegisterDto) {
    const exist = await this.userContactRepo.findByEmail(dto.email);

    if (exist) {
      throw new AppException(HttpStatus.CONFLICT, 'AUTH_EMAIL_ALREADY_EXISTS');
    }

    if (dto.consentVersion !== CURRENT_TEACHER_CONSENT_VERSION) {
      throw new BadRequestException('Unsupported consent version');
    }

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
      consentAcceptedAt: new Date(),
      consentVersion: dto.consentVersion,
    };

    await this.userRepo.createUserByEmail(data);
    await this.mail.sendActivationMail(dto.email, activationToken);

    return { message: 'Activation email sent' };
  }

  async registerTelegram(dto: RegisterTelegramDto): Promise<{ id: number }> {
    if (dto.consentVersion !== CURRENT_TELEGRAM_CONSENT_VERSION) {
      throw new BadRequestException('Unsupported consent version');
    }

    // Idempotent: a sequential duplicate (including a bot retry after a lost
    // HTTP response for a registration that already succeeded) must resolve
    // to the SAME { id } contract as a fresh registration — never re-throw,
    // and never touch the existing user's name/username/avatar/consent
    // metadata.
    const existing = await this.userContactRepo.findByTelegram(dto.telegramId);
    if (existing) {
      return { id: existing.userId };
    }

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
      this.logger.warn(
        `Telegram avatar fetch failed for telegramId=${dto.telegramId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      avatarUrl = null;
    }

    try {
      const created = await this.userRepo.createUserByTelegram({
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleId: role.id,
        username: dto.username,
        telegramId: dto.telegramId,
        contactTypeId: contactType.id,
        avatarUrl,
        consentAcceptedAt: new Date(),
        consentVersion: dto.consentVersion,
      });

      return { id: created.id };
    } catch (e) {
      // A parallel/redelivered request can lose a race to another request
      // that already created the same Telegram contact between our
      // pre-check above and this create. Only treat that specific unique
      // conflict as idempotent success — anything else (e.g. a username
      // clash, which also has a unique constraint on User) must surface
      // unchanged so it isn't silently masked as Telegram idempotency.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        this.isTelegramContactUniqueViolation(e)
      ) {
        const raceWinner = await this.userContactRepo.findByTelegram(
          dto.telegramId,
        );
        if (raceWinner) {
          return { id: raceWinner.userId };
        }
        // The conflict really was on the Telegram-contact constraint, but the
        // re-lookup unexpectedly found nothing (e.g. the winning transaction
        // rolled back afterwards). Never fabricate a success response here —
        // surface the original error so it fails loudly instead of silently.
        throw e;
      }
      throw e;
    }
  }

  // The Telegram-contact compound unique constraint is
  // @@unique([contactTypeId, contactValue]) on UserContact, which Postgres
  // names "UserContact_contactTypeId_contactValue_key". Depending on how the
  // conflict surfaces, Prisma's P2002 `meta.target` can be either the array
  // of column names or that constraint name as a single string — support
  // both, but require both field names to be present so an unrelated
  // constraint (e.g. User.username) is never misclassified.
  private static readonly TELEGRAM_CONTACT_UNIQUE_CONSTRAINT_NAME =
    'UserContact_contactTypeId_contactValue_key';

  private isTelegramContactUniqueViolation(
    e: Prisma.PrismaClientKnownRequestError,
  ): boolean {
    const target = e.meta?.target;

    if (Array.isArray(target)) {
      return (
        target.includes('contactTypeId') && target.includes('contactValue')
      );
    }

    if (typeof target === 'string') {
      if (target === AuthService.TELEGRAM_CONTACT_UNIQUE_CONSTRAINT_NAME) {
        return true;
      }
      return (
        target.includes('contactTypeId') && target.includes('contactValue')
      );
    }

    return false;
  }

  async activate(token: string) {
    const user = await this.userRepo.findByActivationToken(token);

    if (!user) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'AUTH_INVALID_TOKEN');
    }

    if (user.verified) {
      return { message: 'Account already activated' };
    }

    const now = new Date();

    if (!user.activationExpires || user.activationExpires < now) {
      await this.userRepo.deleteUser(user.id);
      throw new AppException(HttpStatus.BAD_REQUEST, 'AUTH_TOKEN_EXPIRED');
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

    // Always run one Argon2 verify against a real-shaped hash — for a
    // nonexistent user (or a user without a password hash, e.g. a
    // Telegram-only account) we verify against a fixed dummy hash instead of
    // returning early. This keeps a "no such user" login and a "wrong
    // password" login taking a comparable amount of time, closing the most
    // obvious timing oracle for user enumeration.
    const hashToVerify = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await argon
      .verify(hashToVerify, password)
      .catch(() => false);

    // `verified` is intentionally checked only after the password verify
    // above — checking it earlier (or exiting before argon.verify runs)
    // would reintroduce a timing/enumeration difference for unverified
    // accounts.
    if (!user || !user.passwordHash || !passwordMatches || !user.verified) {
      let reason: string;
      if (!user) reason = 'user not found';
      else if (!user.passwordHash) reason = 'no password hash on account';
      else if (!passwordMatches) reason = 'password mismatch';
      else reason = 'email not verified';

      this.logger.debug(
        `Login rejected. email=${maskEmail(email)} reason=${reason}`,
      );

      // Deliberately identical for all branches above: user-not-found,
      // wrong-password, and unverified-email must be indistinguishable to
      // the client.
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_INVALID_CREDENTIALS',
      );
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

    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const email = profile.contacts[0]?.contactValue?.toLowerCase() ?? '';
    const isAdmin = adminEmails.length > 0 && adminEmails.includes(email);

    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      defaultLanguage: profile.defaultLanguage,
      isAdmin,
    };
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

  async requestPasswordChange(userId: number, dto: RequestPasswordChangeDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AUTH_PASSWORDS_DO_NOT_MATCH',
      );
    }

    const user = await this.userRepo.findByIdWithContacts(userId);
    if (!user) throw new NotFoundException('User not found');

    const email = user.contacts.find(
      (c) => c.contactType.name === 'email',
    )?.contactValue;
    if (!email)
      throw new BadRequestException('No email associated with this account');

    const passwordHash = await argon.hash(dto.password);
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.passwordChangeRepo.upsert({
      userId,
      passwordHash,
      token,
      expiresAt,
    });
    await this.mail.sendPasswordChangeMail(email, token);

    return { message: 'Confirmation email sent' };
  }

  async confirmPasswordChange(token: string) {
    const request = await this.passwordChangeRepo.findByToken(token);

    if (!request) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'AUTH_INVALID_TOKEN');
    }
    if (request.expiresAt < new Date()) {
      await this.passwordChangeRepo.deleteByUserId(request.userId);
      throw new AppException(HttpStatus.BAD_REQUEST, 'AUTH_TOKEN_EXPIRED');
    }

    await this.userRepo.updatePasswordHash(
      request.userId,
      request.passwordHash,
    );
    await this.passwordChangeRepo.deleteByUserId(request.userId);

    return { message: 'Password changed successfully' };
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
    } catch (err) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'AUTH_SESSION_EXPIRED', {
        internalReason: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
