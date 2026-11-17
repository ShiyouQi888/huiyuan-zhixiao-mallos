import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RelationService } from '../relation/relation.service';
import { TransferQuotaService } from '../transfer-quota/transfer-quota.service';
import { decryptPii, encryptPii, normalizeChineseIdCard } from '../common/pii-crypto';

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
    private readonly transferQuota: TransferQuotaService,
  ) {}

  async me(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { rank: true, package: true },
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
    const nextRank = ranks.find((r) => r.status === 1 && r.level > user.rankLevel);
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
        status: rank.status,
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
    const name = typeof realName === 'string' ? realName.trim() : '';
    if (name.length < 2 || name.length > 64) throw Err.param('真实姓名长度须为 2 至 64 个字符');
    const normalizedId = normalizeChineseIdCard(idCard);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { realNameStatus: true } });
    if (!user) throw Err.notFound('用户不存在');
    if (user.realNameStatus === 1) throw Err.conflict('该账号已完成实名认证');
    if (user.realNameStatus === 2) throw Err.conflict('实名认证正在审核中');
    await this.prisma.user.update({
      where: { id: userId },
      data: { realNameStatus: 2, realName: name, idCardEncrypted: encryptPii(normalizedId) },
    });
    return { realNameStatus: 2, submitted: true };
  }

  async realnameReview(userId: bigint, approved: boolean, operatorId: bigint, remark?: string) {
    if (typeof approved !== 'boolean') throw Err.param('审核结果无效');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, realNameStatus: true } });
      if (!user || user.role !== 'MEMBER') throw Err.notFound('会员不存在');
      if (user.realNameStatus !== 2) throw Err.conflict('该实名认证申请已处理或不在待审核状态');
      const status = approved ? 1 : 3;
      await tx.user.update({ where: { id: userId }, data: { realNameStatus: status } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId,
          action: approved ? 'REALNAME_APPROVED' : 'REALNAME_REJECTED',
          targetType: 'USER', targetId: userId,
          before: { realNameStatus: 2 } as never,
          after: { realNameStatus: status, remark: remark?.trim().slice(0, 255) || null } as never,
        },
      });
      return { userId, realNameStatus: status };
    });
  }

  async realnameAdminView(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { realName: true, idCardEncrypted: true, realNameStatus: true },
    });
    if (!user) throw Err.notFound('会员不存在');
    let maskedIdCard: string | null = null;
    if (user.idCardEncrypted) {
      try {
        const idCard = decryptPii(user.idCardEncrypted);
        maskedIdCard = `${idCard.slice(0, 3)}***********${idCard.slice(-4)}`;
      } catch {
        maskedIdCard = '证件信息无法解密';
      }
    }
    return { realName: user.realName, maskedIdCard, realNameStatus: user.realNameStatus };
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

  async resetTransferPassword(userId: bigint, realName: string, idCard: string, newPassword: string) {
    if (!/^\d{6}$/.test(newPassword ?? '')) throw Err.param('转账支付密码必须为 6 位数字');
    const normalizedId = normalizeChineseIdCard(idCard);
    const attemptsKey = `security:transfer-password-reset:${userId}`;
    const attempts = Number(await this.redis.get(attemptsKey) ?? 0);
    if (attempts >= 5) throw Err.param('身份核验失败次数过多，请 15 分钟后重试');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { realName: true, realNameStatus: true, idCardEncrypted: true },
    });
    let matches = false;
    try {
      matches = user?.realNameStatus === 1
        && user.realName?.trim() === realName?.trim()
        && !!user.idCardEncrypted
        && decryptPii(user.idCardEncrypted) === normalizedId;
    } catch {
      matches = false;
    }
    if (!matches) {
      const client = this.redis.getClient();
      const failures = await client.incr(attemptsKey);
      if (failures === 1) await client.expire(attemptsKey, 900);
      throw Err.forbidden(failures >= 5 ? '身份核验失败次数过多，请 15 分钟后重试' : '身份信息不匹配，请核实后重试');
    }
    await this.redis.del(attemptsKey);
    const transferPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { transferPasswordHash } });
    await this.redis.del(`security:transfer-password:${userId}`);
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
          packageId: true, transferQuotaStatus: true, status: true, totalTeamPerformance: true, createdAt: true,
          wallet: { select: { balance: true, frozen: true } },
          transferQuotaAccount: { select: { granted: true, adjustedOut: true, used: true, reserved: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { list, total, page: currentPage, pageSize };
  }

  async adjustRank(userId: bigint, level: number) {
    const rank = await this.prisma.rank.findUnique({ where: { level } });
    if (!rank || rank.status !== 1) throw Err.param('等级不存在或已停用');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.role !== 'MEMBER' || user.status === 2) throw Err.notFound('会员不存在');
      if (user.rankLevel === rank.level) return { userId, level: rank.level, quotaGranted: 0n };
      const changed = await tx.user.updateMany({
        where: { id: userId, rankLevel: user.rankLevel },
        data: { rankId: rank.id, rankLevel: rank.level, rankAchievedAt: new Date() },
      });
      if (!changed.count) throw Err.conflict('会员等级刚刚发生变化，请刷新后重试');
      const rankLog = await tx.rankLog.create({
        data: { userId, fromLevel: user.rankLevel, toLevel: rank.level, totalPerformance: user.totalTeamPerformance, triggerType: 'MANUAL' },
      });
      let quotaGranted = 0n;
      if (rank.level > user.rankLevel) {
        const crossedRanks = await tx.rank.findMany({
          where: { level: { gt: user.rankLevel, lte: rank.level }, status: 1 },
          orderBy: { level: 'asc' },
          select: { transferQuotaGrant: true },
        });
        quotaGranted = crossedRanks.reduce((total, item) => total + item.transferQuotaGrant, 0n);
        if (quotaGranted > 0n) {
          await this.transferQuota.grant(
            userId,
            quotaGranted,
            'manual_rank_adjustment',
            rankLog.id.toString(),
            `后台调级晋升至${rank.name}，新增权益通`,
            tx,
            5,
          );
        }
      }
      return { userId, level: rank.level, quotaGranted };
    });
  }

  async freeze(userId: bigint, frozen: boolean, operatorId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId } });
      if (!before || before.role !== 'MEMBER') throw Err.notFound('会员不存在');
      if (before.status === 2) throw Err.conflict('已注销账号不能冻结或解冻');
      const status = frozen ? 1 : 0;
      if (before.status === status) return before;
      const updated = await tx.user.update({ where: { id: userId }, data: { status, authVersion: { increment: 1 } } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId,
          action: frozen ? 'MEMBER_FROZEN' : 'MEMBER_UNFROZEN',
          targetType: 'USER', targetId: userId,
          before: { status: before.status } as never,
          after: { status } as never,
        },
      });
      return updated;
    });
  }
}
