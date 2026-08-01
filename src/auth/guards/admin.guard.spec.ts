/* eslint-disable @typescript-eslint/unbound-method */
import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UserRepository } from 'repositories/user.repository';
import { AppException } from 'common/errors';

function makeContext(userId: number | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId !== undefined ? { sub: userId } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

async function expectForbidden(guard: AdminGuard, userId: number | undefined) {
  try {
    await guard.canActivate(makeContext(userId));
    throw new Error(
      'expected canActivate to throw AppException, but it resolved',
    );
  } catch (e) {
    expect(e).toBeInstanceOf(AppException);
    const ex = e as AppException;
    expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(ex.code).toBe('FORBIDDEN');
  }
}

describe('AdminGuard', () => {
  let userRepo: jest.Mocked<UserRepository>;
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      ADMIN_EMAILS: 'admin@example.com,boss@example.com',
    };

    userRepo = {
      findByIdWithContacts: jest.fn(),
    } as any;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  it('should throw AppException(403, FORBIDDEN) when request has no user (no JWT ran)', async () => {
    const guard = new AdminGuard(userRepo);
    await expectForbidden(guard, undefined);
    expect(userRepo.findByIdWithContacts).not.toHaveBeenCalled();
  });

  it('should throw AppException(403, FORBIDDEN) when ADMIN_EMAILS is empty', async () => {
    process.env.ADMIN_EMAILS = '';
    const guard = new AdminGuard(userRepo);
    await expectForbidden(guard, 1);
    expect(userRepo.findByIdWithContacts).not.toHaveBeenCalled();
  });

  it('should throw AppException(403, FORBIDDEN) when user email is not in admin list', async () => {
    const guard = new AdminGuard(userRepo);
    userRepo.findByIdWithContacts.mockResolvedValue({
      contacts: [
        { contactType: { name: 'email' }, contactValue: 'user@example.com' },
      ],
    } as any);

    await expectForbidden(guard, 1);
  });

  it('should throw AppException(403, FORBIDDEN) when user has no email contact', async () => {
    const guard = new AdminGuard(userRepo);
    userRepo.findByIdWithContacts.mockResolvedValue({
      contacts: [{ contactType: { name: 'telegram' }, contactValue: '123456' }],
    } as any);

    await expectForbidden(guard, 1);
  });

  it('should throw AppException(403, FORBIDDEN) when user not found in DB', async () => {
    const guard = new AdminGuard(userRepo);
    userRepo.findByIdWithContacts.mockResolvedValue(null as any);

    await expectForbidden(guard, 1);
  });

  it('should return true for a valid admin email (case-insensitive)', async () => {
    const guard = new AdminGuard(userRepo);
    userRepo.findByIdWithContacts.mockResolvedValueOnce({
      contacts: [
        { contactType: { name: 'email' }, contactValue: 'ADMIN@EXAMPLE.COM' },
      ],
    } as any);

    const result = await guard.canActivate(makeContext(1));
    expect(result).toBe(true);
  });

  it('should parse ADMIN_EMAILS only once (in constructor, not per request)', async () => {
    const guard = new AdminGuard(userRepo);

    // Change env AFTER construction — guard should still use the original value
    process.env.ADMIN_EMAILS = 'other@example.com';

    userRepo.findByIdWithContacts.mockResolvedValue({
      contacts: [
        { contactType: { name: 'email' }, contactValue: 'admin@example.com' },
      ],
    } as any);

    // Should still pass since guard cached original ADMIN_EMAILS at construction time
    const result = await guard.canActivate(makeContext(1));
    expect(result).toBe(true);
  });
});
