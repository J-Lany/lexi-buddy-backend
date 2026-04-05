import { Injectable } from '@nestjs/common';
import { PrismaService } from 'common/modules/prisma/prisma.service';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async touchUserLastVisit(userId: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000);

    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastVisit: null }, { lastVisit: { lt: cutoff } }],
      },
      data: { lastVisit: now },
    });
  }
}
