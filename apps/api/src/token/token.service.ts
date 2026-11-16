import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 数权：只记账，不流转、不交易、不提供任何用户侧转出接口 */
@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}

  async credit(userId: bigint, amount: bigint, sourceBonusId: bigint | null): Promise<void> {
    if (amount <= 0n) return;
    await this.prisma.tokenLot.create({
      data: { userId, amount, sourceBonusId },
    });
  }

  async summary(userId: bigint) {
    const lots = await this.prisma.tokenLot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const total = lots.reduce((sum, l) => sum + l.amount, 0n);
    return { total, lots };
  }
}
