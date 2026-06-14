/* eslint-disable @typescript-eslint/unbound-method */

import { AuthService } from './auth.service';
import { MailService } from 'common/modules/mail/mail.service';
import { UserRepository } from 'repositories/user.repository';
import { RoleRepository } from 'repositories/role.repository';
import { ContactTypeRepository } from 'repositories/contact-type.repository';
import { UserContactRepository } from 'repositories/user-contact.repository';
import { PasswordChangeRequestRepository } from 'repositories/password-change-request.repository';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService (unit, manual DI)', () => {
  let service: AuthService;

  let mailService: jest.Mocked<MailService>;
  let jwtService: jest.Mocked<JwtService>;
  let userRepo: jest.Mocked<UserRepository>;
  let roleRepo: jest.Mocked<RoleRepository>;
  let contactTypeRepo: jest.Mocked<ContactTypeRepository>;
  let userContactRepo: jest.Mocked<UserContactRepository>;
  let passwordChangeRepo: jest.Mocked<PasswordChangeRequestRepository>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    mailService = {
      sendActivationMail: jest.fn(),
      sendPasswordChangeMail: jest.fn(),
    } as any;

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as any;

    userRepo = {
      createUserByEmail: jest.fn(),
      createUserByTelegram: jest.fn(),
      findByActivationToken: jest.fn(),
      updateUserVerification: jest.fn(),
      deleteUser: jest.fn(),
      findByEmail: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      findById: jest.fn(),
      findByIdWithContacts: jest.fn(),
      findByTelegramId: jest.fn(),
      updatePasswordHash: jest.fn(),
    } as any;

    passwordChangeRepo = {
      upsert: jest.fn(),
      findByToken: jest.fn(),
      deleteByUserId: jest.fn(),
    } as any;

    roleRepo = {
      findGlobalRole: jest.fn(),
      findGroupRole: jest.fn(),
    } as any;

    contactTypeRepo = {
      findByName: jest.fn(),
    } as any;

    userContactRepo = {
      findByEmail: jest.fn(),
      findByTelegram: jest.fn(),
    } as any;

    service = new AuthService(
      mailService,
      jwtService,
      userRepo,
      contactTypeRepo,
      userContactRepo,
      roleRepo,
      passwordChangeRepo,
      undefined,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // REGISTER (EMAIL)
  // -------------------------------------------------------------------
  describe('register', () => {
    it('should throw if email already exists', async () => {
      userContactRepo.findByEmail.mockResolvedValueOnce({ id: 1 } as any);

      await expect(
        service.register({ email: 'test@mail.com', password: '1234' } as any),
      ).rejects.toThrow('Email already exist');

      expect(roleRepo.findGlobalRole).not.toHaveBeenCalled();
      expect(contactTypeRepo.findByName).not.toHaveBeenCalled();
      expect(userRepo.createUserByEmail).not.toHaveBeenCalled();
      expect(mailService.sendActivationMail).not.toHaveBeenCalled();
    });

    it('should throw if teacher role not found', async () => {
      userContactRepo.findByEmail.mockResolvedValueOnce(null as any);
      (argon.hash as jest.Mock).mockResolvedValueOnce('hashed-pass');
      roleRepo.findGlobalRole.mockResolvedValueOnce(null as any);

      await expect(
        service.register({ email: 'new@mail.com', password: '1234' } as any),
      ).rejects.toThrow('Teacher role not found');

      expect(roleRepo.findGlobalRole).toHaveBeenCalledWith('teacher');
    });

    it('should call sendActivationMail after successful registration', async () => {
      userContactRepo.findByEmail.mockResolvedValueOnce(null as any);
      (argon.hash as jest.Mock).mockResolvedValueOnce('hashed-pass');
      roleRepo.findGlobalRole.mockResolvedValueOnce({ id: 1 } as any);
      contactTypeRepo.findByName.mockResolvedValueOnce({ id: 2 } as any);
      userRepo.createUserByEmail.mockResolvedValueOnce({} as any);

      await service.register({ email: 'ok@mail.com', password: '1234' } as any);

      expect(roleRepo.findGlobalRole).toHaveBeenCalledWith('teacher');
      expect(contactTypeRepo.findByName).toHaveBeenCalledWith('email');
      expect(mailService.sendActivationMail).toHaveBeenCalledWith(
        'ok@mail.com',
        expect.any(String),
      );
    });
  });

  // -------------------------------------------------------------------
  // ACTIVATE
  // -------------------------------------------------------------------
  describe('activate', () => {
    it('should throw if token is invalid', async () => {
      userRepo.findByActivationToken.mockResolvedValueOnce(null as any);

      await expect(service.activate('invalid')).rejects.toThrow(
        'Invalid token',
      );

      expect(userRepo.updateUserVerification).not.toHaveBeenCalled();
      expect(userRepo.deleteUser).not.toHaveBeenCalled();
    });

    it('should return already activated if user is verified', async () => {
      userRepo.findByActivationToken.mockResolvedValueOnce({
        id: 1,
        verified: true,
        activationExpires: new Date(Date.now() - 1000),
      } as any);

      const result = await service.activate('any-token');

      expect(result).toEqual({ message: 'Account already activated' });
      expect(userRepo.updateUserVerification).not.toHaveBeenCalled();
      expect(userRepo.deleteUser).not.toHaveBeenCalled();
    });

    it('should delete user and throw if token is expired and user not verified', async () => {
      userRepo.findByActivationToken.mockResolvedValueOnce({
        id: 1,
        verified: false,
        activationExpires: new Date(Date.now() - 1000),
      } as any);

      await expect(service.activate('expired-token')).rejects.toThrow(
        'Activation token expired',
      );

      expect(userRepo.deleteUser).toHaveBeenCalledWith(1);
      expect(userRepo.updateUserVerification).not.toHaveBeenCalled();
    });

    it('should mark user as verified if token is valid and not expired', async () => {
      userRepo.findByActivationToken.mockResolvedValueOnce({
        id: 1,
        verified: false,
        activationExpires: new Date(Date.now() + 60_000),
      } as any);

      const result = await service.activate('valid-token');

      expect(result).toEqual({ message: 'Account activated' });
      expect(userRepo.updateUserVerification).toHaveBeenCalledWith(1);
      expect(userRepo.deleteUser).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // LOGIN
  // -------------------------------------------------------------------
  describe('login', () => {
    const dto = { email: 'test@mail.com', password: 'pass123' };

    it('should throw if user not found', async () => {
      userRepo.findByEmail.mockResolvedValueOnce(null as any);

      await expect(service.login(dto as any)).rejects.toThrow(
        'User by this email is not found',
      );
    });

    it('should throw if email not verified', async () => {
      userRepo.findByEmail.mockResolvedValueOnce({
        passwordHash: 'hash',
        verified: false,
      } as any);

      await expect(service.login(dto as any)).rejects.toThrow(
        'Email not verified. Check your mailbox',
      );
    });

    it('should throw if password invalid', async () => {
      userRepo.findByEmail.mockResolvedValueOnce({
        passwordHash: 'hash',
        verified: true,
      } as any);

      (argon.verify as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(dto as any)).rejects.toThrow(
        'Invalid password',
      );
    });

    it('should return tokens and update refresh token hash', async () => {
      userRepo.findByEmail.mockResolvedValueOnce({
        id: 1,
        roleId: 2,
        verified: true,
        passwordHash: 'hash',
        firstName: 'John',
        lastName: 'Doe',
      } as any);

      (argon.verify as jest.Mock).mockResolvedValueOnce(true);

      (jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('access')
        .mockResolvedValueOnce('refresh');

      (argon.hash as jest.Mock).mockResolvedValueOnce('refresh-hash');

      const result = await service.login(dto as any);

      expect(result).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: {
          firstName: 'John',
          lastName: 'Doe',
          email: dto.email,
        },
      });

      expect(userRepo.updateRefreshTokenHash).toHaveBeenCalledWith(
        1,
        'refresh-hash',
      );

      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { sub: 1, roleId: 2 },
        expect.objectContaining({
          expiresIn: '15m',
          secret: expect.any(String),
        }),
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { sub: 1, roleId: 2 },
        expect.objectContaining({
          expiresIn: '30d',
          secret: expect.any(String),
        }),
      );
    });
  });

  // -------------------------------------------------------------------
  // REFRESH
  // -------------------------------------------------------------------
  describe('refresh', () => {
    it('should throw UnauthorizedException if token verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));

      await expect(service.refresh('bad-token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({ sub: 99 });
      userRepo.findById.mockResolvedValueOnce(null as any);

      await expect(service.refresh('token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should throw UnauthorizedException if refresh hash does not match', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({ sub: 1 });
      userRepo.findById.mockResolvedValueOnce({
        id: 1,
        roleId: 2,
        refreshTokenHash: 'old-hash',
      } as any);
      (argon.verify as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.refresh('token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should return new tokens and rotate refresh hash on success', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({ sub: 1, roleId: 2 });
      userRepo.findById.mockResolvedValueOnce({
        id: 1,
        roleId: 2,
        refreshTokenHash: 'valid-hash',
      } as any);
      (argon.verify as jest.Mock).mockResolvedValueOnce(true);
      (jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');
      (argon.hash as jest.Mock).mockResolvedValueOnce('new-refresh-hash');

      const result = await service.refresh('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
      expect(userRepo.updateRefreshTokenHash).toHaveBeenCalledWith(
        1,
        'new-refresh-hash',
      );
    });
  });

  // -------------------------------------------------------------------
  // REQUEST PASSWORD CHANGE
  // -------------------------------------------------------------------
  describe('requestPasswordChange', () => {
    const dto = { password: 'NewPass1!', confirmPassword: 'NewPass1!' };

    it('should throw if passwords do not match', async () => {
      await expect(
        service.requestPasswordChange(1, {
          password: 'aaa',
          confirmPassword: 'bbb',
        } as any),
      ).rejects.toThrow('Passwords do not match');

      expect(userRepo.findByIdWithContacts).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce(null as any);

      await expect(
        service.requestPasswordChange(1, dto as any),
      ).rejects.toThrow('User not found');
    });

    it('should throw if user has no email contact', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        contacts: [],
      } as any);

      await expect(
        service.requestPasswordChange(1, dto as any),
      ).rejects.toThrow('No email associated with this account');
    });

    it('should hash password, upsert request and send email on success', async () => {
      userRepo.findByIdWithContacts.mockResolvedValueOnce({
        contacts: [
          {
            contactType: { name: 'email' },
            contactValue: 'user@example.com',
          },
        ],
      } as any);
      (argon.hash as jest.Mock).mockResolvedValueOnce('pw-hash');
      passwordChangeRepo.upsert.mockResolvedValueOnce(undefined as any);

      const result = await service.requestPasswordChange(1, dto as any);

      expect(result).toEqual({ message: 'Confirmation email sent' });
      expect(argon.hash).toHaveBeenCalledWith(dto.password);
      expect(passwordChangeRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, passwordHash: 'pw-hash' }),
      );
      expect(mailService.sendPasswordChangeMail).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
      );
    });
  });

  // -------------------------------------------------------------------
  // CONFIRM PASSWORD CHANGE
  // -------------------------------------------------------------------
  describe('confirmPasswordChange', () => {
    it('should throw if token not found', async () => {
      passwordChangeRepo.findByToken.mockResolvedValueOnce(null as any);

      await expect(service.confirmPasswordChange('bad-token')).rejects.toThrow(
        'Invalid or expired token',
      );
    });

    it('should throw and delete request if token is expired', async () => {
      passwordChangeRepo.findByToken.mockResolvedValueOnce({
        userId: 1,
        passwordHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
      } as any);

      await expect(
        service.confirmPasswordChange('expired-token'),
      ).rejects.toThrow('Token has expired');
      expect(passwordChangeRepo.deleteByUserId).toHaveBeenCalledWith(1);
      expect(userRepo.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('should update password and delete request on success', async () => {
      passwordChangeRepo.findByToken.mockResolvedValueOnce({
        userId: 1,
        passwordHash: 'new-hash',
        expiresAt: new Date(Date.now() + 60_000),
      } as any);

      const result = await service.confirmPasswordChange('valid-token');

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(userRepo.updatePasswordHash).toHaveBeenCalledWith(1, 'new-hash');
      expect(passwordChangeRepo.deleteByUserId).toHaveBeenCalledWith(1);
    });
  });

  // -------------------------------------------------------------------
});
