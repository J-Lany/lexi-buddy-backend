import { UserRepository } from './user.repository';
import { PrismaService } from 'common/modules/prisma/prisma.service';

type UserRow = {
  id: number;
  verified: boolean;
  passwordHash: string | null;
  activationToken: string | null;
  activationExpires: Date | null;
  pendingPasswordHash: string | null;
};

/**
 * Minimal stateful fake of the slice of PrismaService that
 * consumeActivation/reissueActivation use.
 *
 * Mirrors the same two Postgres guarantees the PasswordResetRequestRepository
 * fake relies on: a conditional updateMany's row mutation is atomic and
 * immediately visible, and a transaction that throws rolls back every write
 * made inside it. This verifies the repository's *logic* — what gets
 * written, in what order, and under what where-clause — not genuine
 * concurrent-transaction row locking.
 */
function makeFakePrisma(initialRows: UserRow[]) {
  let rows: UserRow[] = initialRows.map((r) => ({ ...r }));
  // Test-controlled hook fired at the top of updateMany, before it reads
  // `rows` — lets a test simulate a write from a concurrent request landing
  // in the gap between consumeActivation's findFirst read and its own
  // updateMany write, without needing real concurrent transactions.
  let onBeforeUpdateMany: (() => void) | null = null;

  const matchesActivationUpdate = (r: UserRow, where: any) =>
    r.id === where.id &&
    r.verified === where.verified &&
    r.activationToken === where.activationToken;

  const matchesReissue = (r: UserRow, where: any) =>
    r.id === where.id && r.verified === where.verified;

  const findFirst = jest.fn(
    ({ where }: { where: { activationToken: string } }) => {
      return Promise.resolve(
        rows.find((r) => r.activationToken === where.activationToken) ?? null,
      );
    },
  );

  const updateMany = jest.fn(
    ({ where, data }: { where: any; data: Partial<UserRow> }) => {
      onBeforeUpdateMany?.();
      // reissueActivation's where-clause has no activationToken key;
      // consumeActivation's does. Route to the matching predicate.
      const matcher =
        'activationToken' in where ? matchesActivationUpdate : matchesReissue;
      let count = 0;
      rows = rows.map((r) => {
        if (!matcher(r, where)) return r;
        count += 1;
        return { ...r, ...data };
      });
      return Promise.resolve({ count });
    },
  );

  const prisma = {
    user: { findFirst, updateMany },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const snapshot = rows.map((r) => ({ ...r }));
      const tx = { user: { findFirst, updateMany } };
      try {
        return await fn(tx);
      } catch (e) {
        rows = snapshot;
        throw e;
      }
    }),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    rows: () => rows,
    setOnBeforeUpdateMany: (fn: () => void) => {
      onBeforeUpdateMany = fn;
    },
  };
}

describe('UserRepository — activation (concurrency & atomicity)', () => {
  const now = new Date('2026-07-31T12:00:00.000Z');
  const future = new Date(now.getTime() + 60_000);
  const past = new Date(now.getTime() - 1000);

  describe('consumeActivation', () => {
    it('activates on a valid, unexpired token and promotes the pending password hash', async () => {
      const { prisma, rows } = makeFakePrisma([
        {
          id: 1,
          verified: false,
          passwordHash: 'old-hash',
          activationToken: 'tok-1',
          activationExpires: future,
          pendingPasswordHash: 'pending-hash',
        },
      ]);
      const repo = new UserRepository(prisma);

      const result = await repo.consumeActivation({ token: 'tok-1', now });

      expect(result).toBe('activated');
      expect(rows()[0]).toMatchObject({
        verified: true,
        passwordHash: 'pending-hash',
        activationToken: null,
        activationExpires: null,
        pendingPasswordHash: null,
      });
    });

    it('activates on a valid token with no pending password hash, leaving passwordHash untouched', async () => {
      const { prisma, rows } = makeFakePrisma([
        {
          id: 1,
          verified: false,
          passwordHash: 'original-hash',
          activationToken: 'tok-1',
          activationExpires: future,
          pendingPasswordHash: null,
        },
      ]);
      const repo = new UserRepository(prisma);

      const result = await repo.consumeActivation({ token: 'tok-1', now });

      expect(result).toBe('activated');
      expect(rows()[0]).toMatchObject({
        verified: true,
        passwordHash: 'original-hash',
        activationToken: null,
        activationExpires: null,
      });
    });

    it('reports "not_found" for a token that never existed', async () => {
      const { prisma, rows } = makeFakePrisma([]);
      const repo = new UserRepository(prisma);

      const result = await repo.consumeActivation({
        token: 'unknown',
        now,
      });

      expect(result).toBe('not_found');
      expect(rows()).toHaveLength(0);
    });

    it('reports "expired" for a token past activationExpires, without writing anything', async () => {
      const { prisma, rows } = makeFakePrisma([
        {
          id: 1,
          verified: false,
          passwordHash: 'old-hash',
          activationToken: 'tok-1',
          activationExpires: past,
          pendingPasswordHash: 'pending-hash',
        },
      ]);
      const repo = new UserRepository(prisma);

      const result = await repo.consumeActivation({ token: 'tok-1', now });

      expect(result).toBe('expired');
      // No delete, no verification flip, no promotion — row is untouched.
      expect(rows()[0]).toEqual({
        id: 1,
        verified: false,
        passwordHash: 'old-hash',
        activationToken: 'tok-1',
        activationExpires: past,
        pendingPasswordHash: 'pending-hash',
      });
    });

    it('single-use: re-consuming an already-activated (nulled) token reports "not_found"', async () => {
      const { prisma } = makeFakePrisma([
        {
          id: 1,
          verified: false,
          passwordHash: 'old-hash',
          activationToken: 'tok-1',
          activationExpires: future,
          pendingPasswordHash: null,
        },
      ]);
      const repo = new UserRepository(prisma);

      const first = await repo.consumeActivation({ token: 'tok-1', now });
      expect(first).toBe('activated');

      const second = await repo.consumeActivation({ token: 'tok-1', now });
      expect(second).toBe('not_found');
    });

    it('a token superseded by a re-registration no longer activates the account', async () => {
      const { prisma, rows } = makeFakePrisma([
        {
          id: 1,
          verified: false,
          passwordHash: 'old-hash',
          activationToken: 'old-tok',
          activationExpires: future,
          pendingPasswordHash: 'old-pending-hash',
        },
      ]);
      const repo = new UserRepository(prisma);

      // Simulates register() re-issuing while the old link is still unused.
      const reissued = await repo.reissueActivation({
        userId: 1,
        activationToken: 'new-tok',
        activationExpires: future,
        pendingPasswordHash: 'new-pending-hash',
        consentAcceptedAt: now,
        consentVersion: 1,
      });
      expect(reissued).toBe(true);

      const oldTokenResult = await repo.consumeActivation({
        token: 'old-tok',
        now,
      });
      expect(oldTokenResult).toBe('not_found');

      const newTokenResult = await repo.consumeActivation({
        token: 'new-tok',
        now,
      });
      expect(newTokenResult).toBe('activated');
      expect(rows()[0]).toMatchObject({
        verified: true,
        passwordHash: 'new-pending-hash',
      });
    });

    it('reports "not_found" when the account was activated concurrently between the read and the write', async () => {
      const { prisma, rows, setOnBeforeUpdateMany } = makeFakePrisma([
        {
          id: 1,
          verified: false,
          passwordHash: 'old-hash',
          activationToken: 'tok-1',
          activationExpires: future,
          pendingPasswordHash: null,
        },
      ]);
      const repo = new UserRepository(prisma);

      // Simulate a concurrent activation flipping verified between
      // consumeActivation's findFirst read and its own conditional
      // updateMany write.
      setOnBeforeUpdateMany(() => {
        rows()[0].verified = true;
      });

      const result = await repo.consumeActivation({ token: 'tok-1', now });

      expect(result).toBe('not_found');
    });
  });

  describe('reissueActivation', () => {
    it('overwrites activation fields and the pending password hash for an unverified user', async () => {
      const { prisma, rows } = makeFakePrisma([
        {
          id: 1,
          verified: false,
          passwordHash: 'live-hash',
          activationToken: 'old-tok',
          activationExpires: past,
          pendingPasswordHash: 'stale-pending',
        },
      ]);
      const repo = new UserRepository(prisma);

      const result = await repo.reissueActivation({
        userId: 1,
        activationToken: 'new-tok',
        activationExpires: future,
        pendingPasswordHash: 'fresh-pending',
        consentAcceptedAt: now,
        consentVersion: 2,
      });

      expect(result).toBe(true);
      expect(rows()[0]).toMatchObject({
        activationToken: 'new-tok',
        activationExpires: future,
        pendingPasswordHash: 'fresh-pending',
        // The live passwordHash is never written by reissueActivation.
        passwordHash: 'live-hash',
      });
    });

    it('returns false and writes nothing for an already-verified user', async () => {
      const { prisma, rows } = makeFakePrisma([
        {
          id: 1,
          verified: true,
          passwordHash: 'live-hash',
          activationToken: null,
          activationExpires: null,
          pendingPasswordHash: null,
        },
      ]);
      const repo = new UserRepository(prisma);

      const result = await repo.reissueActivation({
        userId: 1,
        activationToken: 'new-tok',
        activationExpires: future,
        pendingPasswordHash: 'attacker-or-stale-hash',
        consentAcceptedAt: now,
        consentVersion: 1,
      });

      expect(result).toBe(false);
      expect(rows()[0]).toMatchObject({
        activationToken: null,
        pendingPasswordHash: null,
      });
    });
  });
});
