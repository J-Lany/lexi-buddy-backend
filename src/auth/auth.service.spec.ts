import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
import { UserRepository } from '../repositories/user.repository';
import { RoleRepository } from '../repositories/role.repository';
import { ContactTypeRepository } from '../repositories/contact-type.repository';
import { UserContactRepository } from '../repositories/user-contact.repository';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';

// 👇 Мокаем весь модуль argon2, чтобы не трогать его нативные свойства
jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockMailService = { sendActivationMail: jest.fn() };
  const mockJwtService = { signAsync: jest.fn() };
  const mockUserRepo = {
    createUserByEmail: jest.fn(),
    findByActivationToken: jest.fn(),
    updateUserVerification: jest.fn(),
    findByEmail: jest.fn(),
    updateRefreshTokenHash: jest.fn(),
  };
  const mockRoleRepo = { findByName: jest.fn() };
  const mockContactTypeRepo = { findByName: jest.fn() };
  const mockUserContactRepo = { findByEmail: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: MailService, useValue: mockMailService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: RoleRepository, useValue: mockRoleRepo },
        { provide: ContactTypeRepository, useValue: mockContactTypeRepo },
        { provide: UserContactRepository, useValue: mockUserContactRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────
  // REGISTER
  // ───────────────────────────────
  describe('register', () => {
    it('should throw if email already exists', async () => {
      mockUserContactRepo.findByEmail.mockResolvedValueOnce({ id: 1 });

      await expect(
        service.register({ email: 'test@mail.com', password: '1234' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if role not found', async () => {
      mockUserContactRepo.findByEmail.mockResolvedValueOnce(null);
      mockRoleRepo.findByName.mockResolvedValueOnce(null);

      await expect(
        service.register({ email: 'new@mail.com', password: '1234' }),
      ).rejects.toThrow('Teacher role not found');
    });

    it('should call sendActivationMail after successful register', async () => {
      mockUserContactRepo.findByEmail.mockResolvedValueOnce(null);
      mockRoleRepo.findByName.mockResolvedValueOnce({ id: 1 });
      mockContactTypeRepo.findByName.mockResolvedValueOnce({ id: 2 });
      mockUserRepo.createUserByEmail.mockResolvedValueOnce({});

      // можно задать поведение hash, если хочется
      (argon.hash as jest.Mock).mockResolvedValueOnce('password-hash');

      await service.register({ email: 'ok@mail.com', password: '1234' });

      expect(mockMailService.sendActivationMail).toHaveBeenCalledWith(
        'ok@mail.com',
        expect.any(String),
      );
    });
  });

  describe('activate', () => {
    it('should throw if token invalid', async () => {
      mockUserRepo.findByActivationToken.mockResolvedValueOnce(null);

      await expect(service.activate('invalid')).rejects.toThrow(
        'Invalid token',
      );
    });

    it('should update verification if token valid', async () => {
      mockUserRepo.findByActivationToken.mockResolvedValueOnce({ id: 1 });

      await service.activate('valid_token');

      expect(mockUserRepo.updateUserVerification).toHaveBeenCalledWith(1);
    });
  });

  describe('login', () => {
    const dto = { email: 'test@mail.com', password: 'pass123' };

    it('should throw if user not found', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce(null);

      await expect(service.login(dto)).rejects.toThrow(
        'User by this email is not found',
      );
    });

    it('should throw if email not verified', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce({
        passwordHash: 'hash',
        verified: false,
      });

      await expect(service.login(dto)).rejects.toThrow(
        'Email not verified. Check your mailbox',
      );
    });

    it('should throw if password invalid', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce({
        passwordHash: 'hash',
        verified: true,
      });

      (argon.verify as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(dto)).rejects.toThrow('Invalid password');
    });

    it('should return tokens and call updateRefreshTokenHash', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce({
        id: 1,
        roleId: 2,
        verified: true,
        passwordHash: 'hash',
        firstName: 'John',
        lastName: 'Doe',
      });

      (argon.verify as jest.Mock).mockResolvedValueOnce(true);
      (argon.hash as jest.Mock).mockResolvedValueOnce('refresh-hash');
      mockJwtService.signAsync.mockResolvedValueOnce('access');
      mockJwtService.signAsync.mockResolvedValueOnce('refresh');

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

      expect(mockUserRepo.updateRefreshTokenHash).toHaveBeenCalledWith(
        1,
        'refresh-hash',
      );
    });
  });

  describe('logout', () => {
    it('should remove refresh token hash', async () => {
      mockUserRepo.updateRefreshTokenHash.mockResolvedValueOnce({});

      const result = await service.logout(5);

      expect(mockUserRepo.updateRefreshTokenHash).toHaveBeenCalledWith(5, null);
      expect(result).toEqual({ message: 'Logged out' });
    });
  });
});
