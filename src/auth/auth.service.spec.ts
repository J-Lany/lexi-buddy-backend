/* eslint-disable @typescript-eslint/unbound-method */

import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
import { UserRepository } from 'repositories/user.repository';
import { RoleRepository } from 'repositories/role.repository';
import { ContactTypeRepository } from 'repositories/contact-type.repository';
import { UserContactRepository } from 'repositories/user-contact.repository';
import { BadRequestException } from '@nestjs/common';
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

  beforeEach(() => {
    mailService = {
      sendActivationMail: jest.fn(),
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
      findByEmail: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      findById: jest.fn(),
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
        service.register({ email: 'test@mail.com', password: '1234' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if teacher role not found', async () => {
      userContactRepo.findByEmail.mockResolvedValueOnce(null);
      roleRepo.findGlobalRole.mockResolvedValueOnce(null as any);

      await expect(
        service.register({ email: 'new@mail.com', password: '1234' }),
      ).rejects.toThrow('Teacher role not found');
    });

    it('should call sendActivationMail after successful registration', async () => {
      userContactRepo.findByEmail.mockResolvedValueOnce(null);
      roleRepo.findGlobalRole.mockResolvedValueOnce({ id: 1 } as any);
      contactTypeRepo.findByName.mockResolvedValueOnce({ id: 2 } as any);
      userRepo.createUserByEmail.mockResolvedValueOnce({} as any);

      (argon.hash as jest.Mock).mockResolvedValueOnce('hashed-pass');

      await service.register({ email: 'ok@mail.com', password: '1234' });

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
      userRepo.findByActivationToken.mockResolvedValueOnce(null);

      await expect(service.activate('invalid')).rejects.toThrow(
        'Invalid token',
      );
    });

    it('should mark user as verified if token is valid', async () => {
      userRepo.findByActivationToken.mockResolvedValueOnce({ id: 1 } as any);

      await service.activate('valid-token');

      expect(userRepo.updateUserVerification).toHaveBeenCalledWith(1);
    });
  });

  // -------------------------------------------------------------------
  // LOGIN
  // -------------------------------------------------------------------

  describe('login', () => {
    const dto = { email: 'test@mail.com', password: 'pass123' };

    it('should throw if user not found', async () => {
      userRepo.findByEmail.mockResolvedValueOnce(null);

      await expect(service.login(dto)).rejects.toThrow(
        'User by this email is not found',
      );
    });

    it('should throw if email not verified', async () => {
      userRepo.findByEmail.mockResolvedValueOnce({
        passwordHash: 'hash',
        verified: false,
      } as any);

      await expect(service.login(dto)).rejects.toThrow(
        'Email not verified. Check your mailbox',
      );
    });

    it('should throw if password invalid', async () => {
      userRepo.findByEmail.mockResolvedValueOnce({
        passwordHash: 'hash',
        verified: true,
      } as any);

      (argon.verify as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(dto)).rejects.toThrow('Invalid password');
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
      (argon.hash as jest.Mock).mockResolvedValueOnce('refresh-hash');
      (jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('access')
        .mockResolvedValueOnce('refresh');

      const result = await service.login(dto);

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
    });
  });

  // -------------------------------------------------------------------
  // LOGOUT
  // -------------------------------------------------------------------

  describe('logout', () => {
    it('should remove refresh token hash', async () => {
      userRepo.updateRefreshTokenHash.mockResolvedValueOnce({} as any);

      const result = await service.logout(5);

      expect(userRepo.updateRefreshTokenHash).toHaveBeenCalledWith(5, null);
      expect(result).toEqual({ message: 'Logged out' });
    });
  });
});
