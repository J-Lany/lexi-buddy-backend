import { PasswordResetRequestRepository } from './password-reset-request.repository';
import { PrismaService } from 'common/modules/prisma/prisma.service';

type Row = { id: string; userId: number; tokenHash: string; expiresAt: Date };
type UserRow = { passwordHash?: string; refreshTokenHash?: string | null };

/**
 * Minimal stateful fake of the slice of PrismaService this repository uses.
 *
 * It models two properties real Postgres gives us for free and that
 * consumeAndApplyPassword's atomicity argument depends on:
 *   1. A conditional deleteMany's row mutation is visible immediately (no
 *      interleaving mid-operation) — mirrored here by plain synchronous
 *      array mutation.
 *   2. A transaction that throws mid-way rolls back every mutation made
 *      inside it — mirrored here by snapshot/restore around the callback.
 *
 * This is NOT a substitute for testing against real Postgres row locks
 * (see the plan's "honest limitation" note) — it verifies the repository's
 * *logic* (what gets deleted, in what order, and that a failed write undoes
 * the delete), not genuine concurrent-transaction isolation.
 */
function makeFakePrisma(
  initialRows: Row[],
  opts: { userUpdateShouldThrow?: boolean } = {},
) {
  let rows: Row[] = initialRows.map((r) => ({ ...r }));
  const users = new Map<number, UserRow>();

  const matchesDelete = (r: Row, where: any) =>
    r.id === where.id &&
    r.tokenHash === where.tokenHash &&
    (where.expiresAt?.gt ? r.expiresAt > where.expiresAt.gt : true) &&
    (where.expiresAt?.lte ? r.expiresAt <= where.expiresAt.lte : true);

  const passwordResetRequest = {
    upsert: jest.fn(({ where, create, update }: any) => {
      const idx = rows.findIndex((r) => r.userId === where.userId);
      if (idx === -1) rows.push({ ...create });
      else
        rows[idx] = {
          ...rows[idx],
          ...update,
          userId: rows[idx].userId,
          id: rows[idx].id,
        };
      return Promise.resolve();
    }),
    findUnique: jest.fn(({ where }: any) => {
      return Promise.resolve(
        rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      );
    }),
    // Non-transactional deleteMany, used by deleteExpired().
    deleteMany: jest.fn(({ where }: any) => {
      const before = rows.length;
      rows = rows.filter((r) => !matchesDelete(r, where));
      return Promise.resolve({ count: before - rows.length });
    }),
  };

  const prisma = {
    passwordResetRequest,
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const snapshotRows = rows.map((r) => ({ ...r }));
      const snapshotUsers = new Map(users);

      const tx = {
        passwordResetRequest: {
          deleteMany: jest.fn(({ where }: any) => {
            const before = rows.length;
            rows = rows.filter((r) => !matchesDelete(r, where));
            return Promise.resolve({ count: before - rows.length });
          }),
        },
        user: {
          update: jest.fn(({ where, data }: any) => {
            if (opts.userUpdateShouldThrow) {
              throw new Error('simulated user.update failure');
            }
            users.set(where.id, { ...(users.get(where.id) ?? {}), ...data });
            return Promise.resolve({ id: where.id, ...users.get(where.id) });
          }),
        },
      };

      try {
        return await fn(tx);
      } catch (e) {
        rows = snapshotRows;
        users.clear();
        snapshotUsers.forEach((v, k) => users.set(k, v));
        throw e;
      }
    }),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    rows: () => rows,
    users,
  };
}

describe('PasswordResetRequestRepository (concurrency & atomicity)', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');
  const future = new Date(now.getTime() + 30 * 60 * 1000);
  const past = new Date(now.getTime() - 1000);

  it('parallel consume of the same token: exactly one call succeeds, the other reports it as already used', async () => {
    const { prisma, rows, users } = makeFakePrisma([
      { id: 'req-1', userId: 42, tokenHash: 'hash-a', expiresAt: future },
    ]);
    const repo = new PasswordResetRequestRepository(prisma);

    const args = {
      id: 'req-1',
      tokenHash: 'hash-a',
      userId: 42,
      passwordHash: 'new-hash',
      now,
    };
    const [resultA, resultB] = await Promise.all([
      repo.consumeAndApplyPassword(args),
      repo.consumeAndApplyPassword(args),
    ]);

    const results = [resultA, resultB];
    expect(results.filter((r) => r === true)).toHaveLength(1);
    expect(results.filter((r) => r === false)).toHaveLength(1);

    // The request row is gone exactly once, and the user's password reflects
    // the single successful write — never a state where user.update ran twice.
    expect(rows()).toHaveLength(0);
    expect(users.get(42)).toEqual({
      passwordHash: 'new-hash',
      refreshTokenHash: null,
    });
  });

  it('a new forgot-password request is not affected by consuming/expiring the old link', async () => {
    const { prisma, rows } = makeFakePrisma([
      { id: 'req-1', userId: 42, tokenHash: 'old-hash', expiresAt: future },
    ]);
    const repo = new PasswordResetRequestRepository(prisma);

    // Same row (same id), new tokenHash — simulates a second forgot-password
    // call replacing the pending request.
    await repo.upsertForUser({
      userId: 42,
      tokenHash: 'new-hash',
      expiresAt: future,
    });
    expect(rows()).toEqual([
      expect.objectContaining({
        id: 'req-1',
        userId: 42,
        tokenHash: 'new-hash',
        expiresAt: future,
      }),
    ]);

    // The old emailed link (old-hash) must not be able to touch the row anymore.
    const consumedWithOldToken = await repo.consumeAndApplyPassword({
      id: 'req-1',
      tokenHash: 'old-hash',
      userId: 42,
      passwordHash: 'attacker-or-stale-hash',
      now,
    });
    expect(consumedWithOldToken).toBe(false);
    expect(rows()).toHaveLength(1); // untouched

    // The new link still works.
    const consumedWithNewToken = await repo.consumeAndApplyPassword({
      id: 'req-1',
      tokenHash: 'new-hash',
      userId: 42,
      passwordHash: 'real-new-hash',
      now,
    });
    expect(consumedWithNewToken).toBe(true);
    expect(rows()).toHaveLength(0);
  });

  it('rolls back the delete if writing the new password fails, leaving the token usable again', async () => {
    const { prisma, rows, users } = makeFakePrisma(
      [{ id: 'req-1', userId: 42, tokenHash: 'hash-a', expiresAt: future }],
      { userUpdateShouldThrow: true },
    );
    const repo = new PasswordResetRequestRepository(prisma);

    await expect(
      repo.consumeAndApplyPassword({
        id: 'req-1',
        tokenHash: 'hash-a',
        userId: 42,
        passwordHash: 'new-hash',
        now,
      }),
    ).rejects.toThrow('simulated user.update failure');

    // Rolled back: the request row is still there, and the password was
    // never (partially or fully) written.
    expect(rows()).toEqual([
      { id: 'req-1', userId: 42, tokenHash: 'hash-a', expiresAt: future },
    ]);
    expect(users.get(42)).toBeUndefined();
  });

  it('deleteExpired removes only the specific expired request, scoped by id + tokenHash', async () => {
    const { prisma, rows } = makeFakePrisma([
      { id: 'req-1', userId: 42, tokenHash: 'stale-hash', expiresAt: past },
    ]);
    const repo = new PasswordResetRequestRepository(prisma);

    await repo.deleteExpired({ id: 'req-1', tokenHash: 'stale-hash', now });

    expect(rows()).toHaveLength(0);
  });

  it('deleteExpired does not touch a request that was replaced by a newer, different tokenHash', async () => {
    const { prisma, rows } = makeFakePrisma([
      { id: 'req-1', userId: 42, tokenHash: 'new-hash', expiresAt: future },
    ]);
    const repo = new PasswordResetRequestRepository(prisma);

    // Attempt to clean up the *old*, now-stale tokenHash for this id — must
    // not remove the row, since it now belongs to a different, live request.
    await repo.deleteExpired({ id: 'req-1', tokenHash: 'old-hash', now });

    expect(rows()).toHaveLength(1);
    expect(rows()[0].tokenHash).toBe('new-hash');
  });
});
