import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
import { UserRepository } from '../repositories/user.repository';
import { RoleRepository } from '../repositories/role.repository';
import { ContactTypeRepository } from '../repositories/contact-type.repository';
import { UserContactRepository } from '../repositories/user-contact.repository';
import { BadRequestException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  // Создаём моки
  const mockMailService = { sendActivationMail: jest.fn() };
  const mockUserRepo = {
    createUserByEmail: jest.fn(),
    findByActivationToken: jest.fn(),
    updateUserVerification: jest.fn(),
  };

  const mockRoleRepo = { findByName: jest.fn() };
  const mockContactTypeRepo = { findByName: jest.fn() };
  const mockUserContactRepo = { findByEmail: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: MailService, useValue: mockMailService },
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
});
