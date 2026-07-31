import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';

@Injectable()
export class PasswordResetRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One active reset request per user — a new request replaces the previous
   * one (same row, new tokenHash), so an old emailed link stops matching any
   * row as soon as a newer one is requested. */
  async upsertForUser(data: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }) {
    await this.prisma.passwordResetRequest.upsert({
      where: { userId: data.userId },
      create: data,
      update: {
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      },
    });
  }

  /** Read-only lookup used only to classify the error (invalid vs expired) —
   * never the source of truth for whether a reset is applied. */
  async findByTokenHash(tokenHash: string) {
    return this.prisma.passwordResetRequest.findUnique({
      where: { tokenHash },
    });
  }

  /** Best-effort cleanup of a specific expired request. Scoped by id + tokenHash
   * so it can never remove a request that has since been replaced by a newer
   * forgot-password call for the same user. The delete count is not checked —
   * if the row was already gone (raced by another request), there is nothing
   * left to clean up. */
  async deleteExpired(args: { id: string; tokenHash: string; now: Date }) {
    await this.prisma.passwordResetRequest.deleteMany({
      where: {
        id: args.id,
        tokenHash: args.tokenHash,
        expiresAt: { lte: args.now },
      },
    });
  }

  /** Atomically consumes the given reset request and applies the new password
   * in the same transaction. Returns true only if this call is the one that
   * consumed the token — a concurrent call, a request already replaced by a
   * newer forgot-password call, or an expired request all resolve to false.
   *
   * The conditional `deleteMany` (scoped by id + tokenHash + not-expired) is
   * the only source of truth: under Postgres's default READ COMMITTED
   * isolation it takes a row lock, so a second concurrent call blocks until
   * the first commits, then re-reads and finds no matching row (count 0).
   * passwordHash and refreshTokenHash are written in a single `user.update`
   * so a partial state (password changed but session not invalidated, or vice
   * versa) cannot occur. Consuming the token before writing the user means a
   * failed write rolls back the delete too, leaving the token usable again. */
  async consumeAndApplyPassword(args: {
    id: string;
    tokenHash: string;
    userId: number;
    passwordHash: string;
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetRequest.deleteMany({
        where: {
          id: args.id,
          tokenHash: args.tokenHash,
          expiresAt: { gt: args.now },
        },
      });

      if (count !== 1) return false;

      await tx.user.update({
        where: { id: args.userId },
        data: { passwordHash: args.passwordHash, refreshTokenHash: null },
      });

      return true;
    });
  }
}
