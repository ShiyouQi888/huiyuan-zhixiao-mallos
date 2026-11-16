import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RelationService } from '../relation/relation.service';

export interface AddressInput {
  receiver: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault?: boolean;
}

interface NormalizedAddress extends AddressInput {
  isDefault?: boolean;
}

const CITIES_WITHOUT_COUNTY = new Set(['东莞市', '中山市', '儋州市', '嘉峪关市']);

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relation: RelationService,
    private readonly redis: RedisService,
  ) {}

  async me(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { rank: true, package: true, wallet: true, equityAccount: true },
    });
    if (!user) throw Err.notFound('用户不存在');
    const { passwordHash, transferPasswordHash, idCardEncrypted, ...safe } = user;
    return {
      ...safe,
      transferPasswordSet: Boolean(transferPasswordHash),
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

  async addresses(userId: bigint) {
    return this.prisma.userAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: bigint, input: AddressInput) {
    const address = this.normalizeAddress(input);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.userAddress.count({ where: { userId } });
      const isDefault = address.isDefault === true || count === 0;
      if (isDefault) await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.userAddress.create({ data: { userId, ...address, isDefault } });
    });
  }

  async updateAddress(userId: bigint, addressId: bigint, input: AddressInput) {
    const address = this.normalizeAddress(input);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userAddress.findFirst({ where: { id: addressId, userId } });
      if (!existing) throw Err.notFound('收货地址不存在');

      let isDefault = address.isDefault ?? existing.isDefault;
      if (isDefault) {
        await tx.userAddress.updateMany({ where: { userId, id: { not: addressId } }, data: { isDefault: false } });
      } else if (existing.isDefault) {
        // 先释放唯一的默认标记，再把它转交给其他地址，避免部分唯一索引冲突。
        await tx.userAddress.update({ where: { id: addressId }, data: { isDefault: false } });
        const replacement = await tx.userAddress.findFirst({
          where: { userId, id: { not: addressId } }, orderBy: { createdAt: 'desc' },
        });
        if (replacement) await tx.userAddress.update({ where: { id: replacement.id }, data: { isDefault: true } });
        else isDefault = true;
      }
      return tx.userAddress.update({
        where: { id: addressId },
        data: { ...address, isDefault },
      });
    });
  }

  async deleteAddress(userId: bigint, addressId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userAddress.findFirst({ where: { id: addressId, userId } });
      if (!existing) throw Err.notFound('收货地址不存在');
      await tx.userAddress.delete({ where: { id: addressId } });
      if (existing.isDefault) {
        const replacement = await tx.userAddress.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        if (replacement) await tx.userAddress.update({ where: { id: replacement.id }, data: { isDefault: true } });
      }
      return { success: true };
    });
  }

  async transferPasswordState(userId: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { transferPasswordHash: true } });
    if (!user) throw Err.notFound('用户不存在');
    return { transferPasswordSet: Boolean(user.transferPasswordHash) };
  }

  async setTransferPassword(userId: bigint, currentPassword: string | undefined, newPassword: string) {
    if (!/^\d{6}$/.test(newPassword ?? '')) throw Err.param('转账支付密码必须为 6 位数字');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { transferPasswordHash: true } });
    if (!user) throw Err.notFound('用户不存在');
    if (user.transferPasswordHash) {
      if (!currentPassword) throw Err.param('请输入当前转账支付密码');
      await this.checkTransferPassword(userId, currentPassword, user.transferPasswordHash);
      if (await bcrypt.compare(newPassword, user.transferPasswordHash)) throw Err.param('新密码不能与当前密码相同');
    }
    const transferPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { transferPasswordHash } });
    return { transferPasswordSet: true };
  }

  async verifyTransferPassword(userId: bigint, password: string) {
    if (typeof password !== 'string' || !/^\d{6}$/.test(password)) throw Err.param('请输入 6 位转账支付密码');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { transferPasswordHash: true } });
    if (!user) throw Err.notFound('用户不存在');
    if (!user.transferPasswordHash) throw Err.featureDisabled('请先设置转账支付密码');
    await this.checkTransferPassword(userId, password, user.transferPasswordHash);
  }

  private async checkTransferPassword(userId: bigint, password: string, passwordHash: string) {
    const attemptsKey = `security:transfer-password:${userId}`;
    const attempts = Number(await this.redis.get(attemptsKey) ?? 0);
    if (attempts >= 5) throw Err.param('连续验证失败，请 15 分钟后重试');
    if (!await bcrypt.compare(password, passwordHash)) {
      const client = this.redis.getClient();
      const failures = await client.incr(attemptsKey);
      if (failures === 1) await client.expire(attemptsKey, 900);
      throw Err.param(failures >= 5 ? '连续验证失败，请 15 分钟后重试' : '转账支付密码不正确');
    }
    await this.redis.del(attemptsKey);
  }

  private normalizeAddress(input: AddressInput): NormalizedAddress {
    const fields: Array<[keyof Omit<AddressInput, 'isDefault'>, string, number]> = [
      ['receiver', '收货人', 64], ['phone', '联系电话', 20], ['province', '省份', 64],
      ['city', '城市', 64], ['district', '区县', 64], ['detail', '详细地址', 512],
    ];
    const normalized = {} as NormalizedAddress;
    for (const [key, label, maxLength] of fields) {
      const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
      if (!value && key === 'district') {
        Object.assign(normalized, { [key]: '' });
        continue;
      }
      if (!value) throw Err.param(`${label}不能为空`);
      if (value.length > maxLength) throw Err.param(`${label}长度不能超过 ${maxLength} 个字符`);
      Object.assign(normalized, { [key]: value });
    }
    if (!normalized.district && !CITIES_WITHOUT_COUNTY.has(normalized.city)) throw Err.param('请选择区县');
    if (!/^1[3-9]\d{9}$/.test(normalized.phone)) throw Err.param('请输入有效的 11 位大陆手机号');
    normalized.isDefault = typeof input.isDefault === 'boolean' ? input.isDefault : undefined;
    return normalized;
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
