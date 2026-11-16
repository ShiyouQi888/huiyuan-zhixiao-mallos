import { Injectable } from '@nestjs/common';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService } from '../relation/relation.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relation: RelationService,
  ) {}

  async me(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { rank: true, package: true, wallet: true, equityAccount: true },
    });
    if (!user) throw Err.notFound('用户不存在');
    const { passwordHash, idCardEncrypted, ...safe } = user;
    return {
      ...safe,
      inviteCode: user.inviteCode,
      directChildren: await this.prisma.user.count({ where: { parentId: userId } }),
      teamSize: (await this.relation.getDescendantIds(userId)).length,
    };
  }

  async rank(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { rank: true },
    });
    if (!user) throw Err.notFound('用户不存在');
    const ranks = await this.prisma.rank.findMany({ orderBy: { level: 'asc' } });
    const nextRank = ranks.find((r) => r.level === user.rankLevel + 1);
    return {
      rankName: user.rank.name,
      rankLevel: user.rankLevel,
      teamRate: Number(user.rank.teamRate),
      poolRate: Number(user.rank.poolRate),
      totalPerformance: user.totalTeamPerformance,
      peerBonusLocked: user.peerBonusLocked,
      ranks: ranks.map((rank) => ({
        id: rank.id,
        level: rank.level,
        name: rank.name,
        threshold: rank.threshold,
        teamRate: Number(rank.teamRate),
        poolRate: Number(rank.poolRate),
      })),
      nextRank: nextRank
        ? { name: nextRank.name, threshold: nextRank.threshold, gap: nextRank.threshold > user.totalTeamPerformance ? nextRank.threshold - user.totalTeamPerformance : 0n }
        : null,
    };
  }

  async rankLogs(userId: bigint, page = 1, pageSize = 20) {
    const currentPage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const [list, total, ranks] = await Promise.all([
      this.prisma.rankLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.rankLog.count({ where: { userId } }),
      this.prisma.rank.findMany({ select: { level: true, name: true } }),
    ]);
    const rankNames = new Map(ranks.map((rank) => [rank.level, rank.name]));
    return {
      list: list.map((log) => ({
        ...log,
        fromRankName: rankNames.get(log.fromLevel) ?? `Lv.${log.fromLevel}`,
        toRankName: rankNames.get(log.toLevel) ?? `Lv.${log.toLevel}`,
      })),
      total,
      page: currentPage,
      pageSize: safePageSize,
    };
  }

  async realname(userId: bigint, realName: string, idCard: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { realNameStatus: 1, realName, idCardEncrypted: Buffer.from(idCard).toString('base64') },
    });
  }

  async list(page = 1, pageSize = 20, keyword?: string, rankLevel?: number, status?: number) {
    const currentPage = Math.max(1, Number(page) || 1);
    const where = {
      role: 'MEMBER',
      ...(keyword?.trim() ? { OR: [
        { phone: { contains: keyword.trim() } },
        { nickname: { contains: keyword.trim() } },
        { inviteCode: { contains: keyword.trim() } },
      ] } : {}),
      ...(rankLevel !== undefined ? { rankLevel } : {}),
      ...(status !== undefined ? { status } : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, phone: true, nickname: true, inviteCode: true, rankLevel: true,
          packageId: true, equityStatus: true, status: true, totalTeamPerformance: true, createdAt: true,
          wallet: { select: { balance: true } },
          equityAccount: { select: { balance: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { list, total, page: currentPage, pageSize };
  }

  async adjustRank(userId: bigint, level: number) {
    const rank = await this.prisma.rank.findUnique({ where: { level } });
    if (!rank) throw Err.param('等级不存在');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw Err.notFound('用户不存在');
      await tx.user.update({ where: { id: userId }, data: { rankId: rank.id, rankLevel: rank.level, rankAchievedAt: new Date() } });
      await tx.rankLog.create({
        data: { userId, fromLevel: user.rankLevel, toLevel: rank.level, totalPerformance: user.totalTeamPerformance, triggerType: 'MANUAL' },
      });
      return { userId, level: rank.level };
    });
  }

  async freeze(userId: bigint, frozen: boolean) {
    return this.prisma.user.update({ where: { id: userId }, data: { status: frozen ? 1 : 0 } });
  }
}
