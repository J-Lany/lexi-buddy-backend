import { GroupInviteStatus } from '@prisma/client';
import { GroupInviteRepository } from './group-invite.repository';

describe('GroupInviteRepository teacher-request lifecycle', () => {
  function createRepository(txOverrides: Record<string, unknown> = {}) {
    const tx = {
      group: { create: jest.fn().mockResolvedValue({ id: 10 }) },
      groupInvite: {
        create: jest.fn().mockResolvedValue({
          id: 20,
          status: GroupInviteStatus.PENDING,
        }),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      groupMember: { upsert: jest.fn().mockResolvedValue({ id: 30 }) },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 4 }) },
      ...txOverrides,
    } as any;
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    } as any;
    return { repository: new GroupInviteRepository(prisma), prisma, tx };
  }

  it('creates teaching requests without an expiration timestamp', async () => {
    const { repository, tx } = createRepository();

    await repository.createIndividualGroupWithInvite({
      teacherId: 1,
      studentId: 2,
      teacherGroupRoleId: 3,
      message: 'hello',
    });

    expect(tx.groupInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: GroupInviteStatus.PENDING,
        expiresAt: null,
      }),
    });
  });

  it.each([new Date(Date.now() + 60_000), new Date(Date.now() - 60_000)])(
    'accepts PENDING regardless of historical expiresAt=%s',
    async (expiresAt) => {
      const { repository, prisma, tx } = createRepository();
      tx.groupInvite.findFirst.mockResolvedValue({
        id: 20,
        groupId: 10,
        status: GroupInviteStatus.PENDING,
        expiresAt,
      });

      await expect(
        repository.respondToPendingTeacherRequest({
          inviteId: 20,
          studentId: 2,
          accept: true,
        }),
      ).resolves.toEqual({ outcome: 'accepted', groupId: 10 });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.groupMember.upsert).toHaveBeenCalledTimes(1);
      expect(tx.groupInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 20, status: GroupInviteStatus.PENDING },
        data: {
          status: GroupInviteStatus.ACCEPTED,
          respondedAt: expect.any(Date),
        },
      });
    },
  );

  it('declines a past-dated PENDING request without reading expiresAt', async () => {
    const { repository, tx } = createRepository();
    tx.groupInvite.findFirst.mockResolvedValue({
      id: 20,
      groupId: 10,
      status: GroupInviteStatus.PENDING,
      expiresAt: new Date(0),
    });

    await expect(
      repository.respondToPendingTeacherRequest({
        inviteId: 20,
        studentId: 2,
        accept: false,
      }),
    ).resolves.toEqual({ outcome: 'declined' });
    expect(tx.groupMember.upsert).not.toHaveBeenCalled();
  });

  it('keeps membership and ACCEPTED transition in the same transaction', async () => {
    const membershipError = new Error('membership failed');
    const { repository, prisma, tx } = createRepository();
    tx.groupInvite.findFirst.mockResolvedValue({
      id: 20,
      groupId: 10,
      status: GroupInviteStatus.PENDING,
    });
    tx.groupMember.upsert.mockRejectedValue(membershipError);

    await expect(
      repository.respondToPendingTeacherRequest({
        inviteId: 20,
        studentId: 2,
        accept: true,
      }),
    ).rejects.toBe(membershipError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.groupInvite.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.groupMember.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    [GroupInviteStatus.ACCEPTED, 'already_accepted'],
    [GroupInviteStatus.DECLINED, 'already_declined'],
  ] as const)(
    'returns deterministic state for repeated %s callback',
    async (status, outcome) => {
      const { repository, tx } = createRepository();
      tx.groupInvite.findFirst.mockResolvedValue({
        id: 20,
        groupId: 10,
        status,
      });

      await expect(
        repository.respondToPendingTeacherRequest({
          inviteId: 20,
          studentId: 2,
          accept: true,
        }),
      ).resolves.toEqual({ outcome });
      expect(tx.groupInvite.updateMany).not.toHaveBeenCalled();
      expect(tx.groupMember.upsert).not.toHaveBeenCalled();
    },
  );
});
