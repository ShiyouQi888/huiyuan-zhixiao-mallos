import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import QRCode from 'qrcode';
import {
  DEFAULT_REFERRAL_POSTER_TEMPLATE,
  DEFAULT_BRAND_SETTINGS,
  type BrandSettings,
  type ReferralPosterLayer,
  type ReferralPosterTemplate,
} from '@solar/shared';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { BusinessException } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { EquityService } from '../equity/equity.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../token/token.service';
import { WalletService } from '../wallet/wallet.service';
import { TransferQuotaService } from '../transfer-quota/transfer-quota.service';
import { UserService } from '../user/user.service';
import { AdminAdjustService } from './admin-adjust.service';
import { ApprovalService, type ApprovalType } from './approval.service';

@Controller('api/admin')
@Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
export class AdminExtendedController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly adjust: AdminAdjustService,
    private readonly approvalSvc: ApprovalService,
    private readonly wallet: WalletService,
    private readonly equity: EquityService,
    private readonly token: TokenService,
    private readonly transferQuota: TransferQuotaService,
    private readonly users: UserService,
  ) {}

  /* ============ 档位与商品 ============ */

  @Get('packages')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  packages() {
    return this.prisma.package.findMany({ orderBy: { level: 'asc' } });
  }

  @Post('packages')
  @Roles('SUPER_ADMIN')
  async createPackage(@Body() body: { id: number; name: string; level: number; price: number; pv?: number; transferQuota?: number; durationDays?: number }) {
    const pv = this.packagePv(body.pv ?? body.price);
    await this.assertPackagePvOrder(body.level, pv);
    return this.prisma.package.create({
      data: {
        id: body.id, name: body.name, level: body.level,
        price: BigInt(body.price), pv, transferQuota: pv * 3n,
        durationDays: body.durationDays ?? 365,
      },
    });
  }

  @Put('packages/:id')
  @Roles('SUPER_ADMIN')
  async updatePackage(
    @Param('id') id: string,
    @Body() body: Partial<{
      name: string; price: number; pv: number; transferQuota: number; durationDays: number; status: number;
      directRewardRate: number | null; repurchaseRewardRate: number | null; directReleaseDays: number | null;
    }>,
    @CurrentUser() operator: CurrentUserPayload,
  ) {
    const packageId = Number(id);
    if (!Number.isSafeInteger(packageId) || packageId < 1) throw new BusinessException(1001, '礼包档位编号无效');
    const before = await this.prisma.package.findUnique({ where: { id: packageId } });
    if (!before) throw new BusinessException(4003, '礼包档位不存在');
    const pv = body.pv === undefined ? undefined : this.packagePv(body.pv);
    const quotaPv = pv ?? before.pv;
    const transferQuota = quotaPv * 3n;
    if (pv !== undefined) await this.assertPackagePvOrder(before.level, pv, packageId);
    const directRewardRate = this.packageBonusRate(body.directRewardRate, '新购/升级直推比例');
    const repurchaseRewardRate = this.packageBonusRate(body.repurchaseRewardRate, '复消直推比例');
    if (body.directReleaseDays !== undefined && body.directReleaseDays !== null
      && (!Number.isInteger(body.directReleaseDays) || body.directReleaseDays < 1 || body.directReleaseDays > 365)) {
      throw new BusinessException(1001, '直推奖释放天数须为 1-365 的整数，或留空继承全局值');
    }

    const data = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.price !== undefined ? { price: BigInt(body.price) } : {}),
      ...(pv !== undefined ? { pv } : {}),
      transferQuota,
      ...(body.durationDays !== undefined ? { durationDays: body.durationDays } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(directRewardRate !== undefined ? { directRewardRate } : {}),
      ...(repurchaseRewardRate !== undefined ? { repurchaseRewardRate } : {}),
      ...(body.directReleaseDays !== undefined ? { directReleaseDays: body.directReleaseDays } : {}),
    };
    const after = {
      ...data,
      ...(body.price !== undefined ? { price: body.price } : {}),
      ...(pv !== undefined ? { pv: pv.toString() } : {}),
      transferQuota: transferQuota.toString(),
      directRewardRate: directRewardRate === undefined ? undefined : directRewardRate === null ? null : Number(directRewardRate),
      repurchaseRewardRate: repurchaseRewardRate === undefined ? undefined : repurchaseRewardRate === null ? null : Number(repurchaseRewardRate),
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({ where: { id: packageId }, data });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'PACKAGE_UPDATED',
          targetType: 'PACKAGE', targetId: BigInt(packageId),
          before: {
            pv: before.pv.toString(),
            transferQuota: before.transferQuota.toString(),
            directRewardRate: before.directRewardRate === null ? null : Number(before.directRewardRate),
            repurchaseRewardRate: before.repurchaseRewardRate === null ? null : Number(before.repurchaseRewardRate),
            directReleaseDays: before.directReleaseDays,
          } as never,
          after: after as never,
        },
      });
      return updated;
    });
  }

  /** 管理端按百分数输入，数据库按 0-1 比例存储；null 表示继承全局值。 */
  private packageBonusRate(value: number | null | undefined, label: string): number | null | undefined {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new BusinessException(1001, `${label}须在 0-100% 之间，或留空继承全局值`);
    }
    return value / 100;
  }

  private packagePv(value: number): bigint {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new BusinessException(1001, '档位PV须为大于或等于 0 的整数');
    }
    return BigInt(value);
  }

  private async assertPackagePvOrder(level: number, pv: bigint, excludeId?: number): Promise<void> {
    const where = excludeId === undefined ? {} : { id: { not: excludeId } };
    const [lower, higher] = await Promise.all([
      this.prisma.package.findFirst({ where: { ...where, level: { lt: level } }, orderBy: { level: 'desc' } }),
      this.prisma.package.findFirst({ where: { ...where, level: { gt: level } }, orderBy: { level: 'asc' } }),
    ]);
    if (lower && pv < lower.pv) throw new BusinessException(1001, '档位PV不得低于更低等级的PV，否则无法计算升级PV差额');
    if (higher && pv > higher.pv) throw new BusinessException(1001, '档位PV不得高于更高等级的PV，否则无法计算升级PV差额');
  }

  @Get('products')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  products(@Query('page') page = '1') {
    return this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
    });
  }

  @Post('products')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  createProduct(@Body() body: { name: string; description?: string; price: number; stock?: number }) {
    return this.prisma.product.create({
      data: { name: body.name, description: body.description, price: BigInt(body.price), stock: body.stock ?? 0 },
    });
  }

  @Put('products/:id')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  updateProduct(@Param('id') id: string, @Body() body: Partial<{ name: string; price: number; stock: number; status: number }>) {
    return this.prisma.product.update({
      where: { id: BigInt(id) },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.price !== undefined ? { price: BigInt(body.price) } : {}),
        ...(body.stock !== undefined ? { stock: body.stock } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
  }

  /* ============ 订单 ============ */

  @Get('orders/:no')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  orderDetail(@Param('no') no: string) {
    return this.prisma.order.findUnique({
      where: { orderNo: no },
      include: {
        user: { select: { id: true, nickname: true, phone: true } },
        items: true,
      },
    });
  }

  @Post('orders/:no/deliver')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  async deliver(
    @Param('no') no: string,
    @Body() body: { trackingNo?: unknown; shippingCarrier?: unknown },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const trackingNo = typeof body?.trackingNo === 'string' ? body.trackingNo.trim() : '';
    const shippingCarrier = typeof body?.shippingCarrier === 'string' ? body.shippingCarrier.trim() : '';
    if (!trackingNo) throw new BusinessException(1001, '请填写快递单号后再确认交付');
    if (trackingNo.length > 128) throw new BusinessException(1001, '快递单号不能超过128个字符');
    if (shippingCarrier.length > 64) throw new BusinessException(1001, '快递公司名称不能超过64个字符');
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { orderNo: no }, select: { id: true, status: true } });
      if (!order) throw new BusinessException(4003, '订单不存在');
      if (order.status !== 1) throw new BusinessException(3002, '仅已付款订单可以确认交付');
      const deliveredAt = new Date();
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: 1 },
        data: { status: 2, deliveredAt, trackingNo, shippingCarrier: shippingCarrier || null },
      });
      if (!updated.count) throw new BusinessException(3002, '订单状态已变化，请刷新后重试');
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: user.id, action: 'ORDER_DELIVER',
          targetType: 'ORDER', targetId: order.id,
          after: { orderNo: no, status: 2, deliveredAt: deliveredAt.toISOString(), trackingNo, shippingCarrier: shippingCarrier || null } as never,
        },
      });
      return tx.order.findUnique({ where: { id: order.id } });
    });
  }

  /* ============ 会员 ============ */

  @Get('members/:id')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  async memberDetail(@Param('id') id: string, @CurrentUser() operator: CurrentUserPayload) {
    if (!/^\d{1,18}$/.test(id)) throw new BusinessException(1001, '会员编号格式不正确');
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true, phone: true, nickname: true, inviteCode: true, packageId: true,
        packageExpireAt: true, rankId: true, rankLevel: true, rankAchievedAt: true,
        totalTeamPerformance: true, parentId: true, depth: true, transferQuotaStatus: true,
        peerBonusLocked: true, realNameStatus: true, status: true, createdAt: true,
        rank: { select: { name: true, level: true } },
        package: { select: { name: true, level: true, price: true } },
        wallet: { select: { balance: true, frozen: true, totalIn: true, totalOut: true } },
        transferQuotaAccount: { select: { granted: true, adjustedOut: true, used: true, reserved: true } },
        parent: { select: { id: true, nickname: true, phone: true } },
      },
    });
    if (!user) throw new BusinessException(4003, '会员不存在');
    const identity = await this.users.realnameAdminView(BigInt(id));
    const canReviewIdentity = operator.role === 'SUPER_ADMIN' || operator.role === 'OPERATOR';
    return {
      ...user,
      ...identity,
      realName: canReviewIdentity ? identity.realName : null,
      maskedIdCard: canReviewIdentity ? identity.maskedIdCard : null,
    };
  }

  @Post('members/:id/realname/review')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  reviewRealname(
    @Param('id') id: string,
    @Body() body: { approved: boolean; remark?: string },
    @CurrentUser() operator: CurrentUserPayload,
  ) {
    if (!/^\d+$/.test(id)) throw new BusinessException(1001, '会员编号格式不正确');
    if (!body || typeof body.approved !== 'boolean') throw new BusinessException(1001, '审核结果无效');
    return this.users.realnameReview(BigInt(id), body.approved, operator.id, body.remark);
  }

  @Post('members/:id/rebind')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  async rebind(@Param('id') id: string, @Body() body: { parentId?: string; remark?: string }, @CurrentUser() user: CurrentUserPayload) {
    const requestedParentId = body.parentId?.trim();
    if (requestedParentId && !/^\d+$/.test(requestedParentId)) {
      throw new BusinessException(1001, '新推荐人 ID 格式不正确');
    }
    const targetMember = await this.prisma.user.findUnique({ where: { id: BigInt(id) }, select: { id: true, role: true } });
    if (!targetMember || targetMember.role !== 'MEMBER') throw new BusinessException(4003, '会员不存在');
    if (requestedParentId) {
      if (requestedParentId === id) throw new BusinessException(1001, '不能将会员绑定到自己名下');
      const parent = await this.prisma.user.findUnique({ where: { id: BigInt(requestedParentId) }, select: { id: true, role: true, status: true, path: true } });
      if (!parent || parent.role !== 'MEMBER' || parent.status !== 0) throw new BusinessException(4003, '新推荐人不存在或状态不可用');
      if (parent.path.includes(`,${id},`)) throw new BusinessException(1001, '不能绑定到当前会员的下级，避免形成循环关系');
    }
    return this.approvalSvc.apply('REBIND', { userId: id, parentId: requestedParentId || null }, user, body.remark);
  }

  /* ============ 奖金 ============ */

  @Get('bonus/plans')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  bonusPlans(@Query('page') page = '1') {
    return this.prisma.bonusPlan.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
      include: { beneficiary: { select: { nickname: true, phone: true } }, order: { select: { orderNo: true, amount: true } } },
    });
  }

  @Post('bonus/adjust')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  bonusAdjust(
    @Body() body: { userId: string; amount: number; reason: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.approvalSvc.apply('BONUS_ADJUST', body, user, body.reason);
  }

  @Get('dividend/pools')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  dividendPools(@Query('date') date?: string) {
    return this.prisma.rankSnapshot.findMany({
      where: date ? { statDate: new Date(date) } : {},
      orderBy: [{ statDate: 'desc' }, { rankId: 'asc' }],
      include: { rank: { select: { name: true } } },
      take: 200,
    });
  }

  /* ============ 等级 ============ */

  @Get('ranks')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  ranks() {
    return this.prisma.rank.findMany({ orderBy: { level: 'asc' } });
  }

  @Post('ranks')
  @Roles('SUPER_ADMIN')
  async createRank(
    @Body() body: { name?: string; threshold?: number; transferQuotaGrant?: number; teamRate?: number; poolRate?: number },
    @CurrentUser() operator: CurrentUserPayload,
  ) {
    const name = body.name?.trim() ?? '';
    if (name.length < 2 || name.length > 64) throw new BusinessException(1001, '等级名称需为 2–64 个字符');
    const threshold = this.rankThreshold(body.threshold);
    const transferQuotaGrant = this.rankTransferQuotaGrant(body.transferQuotaGrant);
    const teamRate = this.rankRate(body.teamRate, '团队奖费率');
    const poolRate = this.rankRate(body.poolRate, '分红池比例');
    const highest = await this.prisma.rank.findFirst({ orderBy: { level: 'desc' } });
    if (highest && threshold <= highest.threshold) throw new BusinessException(1001, '新等级门槛必须高于现有最高等级');
    const level = (highest?.level ?? -1) + 1;

    return this.prisma.$transaction(async (tx) => {
      const rank = await tx.rank.create({
        data: { name, level, threshold, transferQuotaGrant, teamRate, poolRate, sort: level, status: 1 },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'RANK_CREATED', targetType: 'RANK', targetId: BigInt(rank.id),
          after: { id: rank.id, level, name, threshold: threshold.toString(), transferQuotaGrant: transferQuotaGrant.toString(), teamRate, poolRate, status: 1 } as never,
        },
      });
      return rank;
    });
  }

  @Put('ranks/:id')
  @Roles('SUPER_ADMIN')
  async updateRank(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; threshold: number; transferQuotaGrant: number; teamRate: number; poolRate: number }>,
    @CurrentUser() operator: CurrentUserPayload,
  ) {
    const rankId = this.rankId(id);
    const before = await this.prisma.rank.findUnique({ where: { id: rankId } });
    if (!before) throw new BusinessException(4003, '等级不存在');
    const name = body.name === undefined ? before.name : (body.name ?? '').trim();
    if (name.length < 2 || name.length > 64) throw new BusinessException(1001, '等级名称需为 2–64 个字符');
    const threshold = body.threshold === undefined ? before.threshold : this.rankThreshold(body.threshold);
    const transferQuotaGrant = body.transferQuotaGrant === undefined
      ? before.transferQuotaGrant
      : this.rankTransferQuotaGrant(body.transferQuotaGrant);
    const teamRate = body.teamRate === undefined ? Number(before.teamRate) : this.rankRate(body.teamRate, '团队奖费率');
    const poolRate = body.poolRate === undefined ? Number(before.poolRate) : this.rankRate(body.poolRate, '分红池比例');
    const [previous, next] = await Promise.all([
      this.prisma.rank.findFirst({ where: { level: { lt: before.level } }, orderBy: { level: 'desc' } }),
      this.prisma.rank.findFirst({ where: { level: { gt: before.level } }, orderBy: { level: 'asc' } }),
    ]);
    if (previous && threshold <= previous.threshold) throw new BusinessException(1001, '累计PV门槛必须高于前一等级');
    if (next && threshold >= next.threshold) throw new BusinessException(1001, '累计PV门槛必须低于后一等级');

    return this.prisma.$transaction(async (tx) => {
      const rank = await tx.rank.update({ where: { id: rankId }, data: { name, threshold, transferQuotaGrant, teamRate, poolRate } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'RANK_UPDATED', targetType: 'RANK', targetId: BigInt(rank.id),
          before: { name: before.name, threshold: before.threshold.toString(), transferQuotaGrant: before.transferQuotaGrant.toString(), teamRate: Number(before.teamRate), poolRate: Number(before.poolRate) } as never,
          after: { name, threshold: threshold.toString(), transferQuotaGrant: transferQuotaGrant.toString(), teamRate, poolRate } as never,
        },
      });
      return rank;
    });
  }

  @Put('ranks/:id/status')
  @Roles('SUPER_ADMIN')
  async updateRankStatus(
    @Param('id') id: string,
    @Body() body: { status?: number },
    @CurrentUser() operator: CurrentUserPayload,
  ) {
    const rankId = this.rankId(id);
    if (body.status !== 0 && body.status !== 1) throw new BusinessException(1001, '等级状态无效');
    const before = await this.prisma.rank.findUnique({ where: { id: rankId } });
    if (!before) throw new BusinessException(4003, '等级不存在');
    if (before.level === 0 && body.status === 0) throw new BusinessException(3002, '普通会员等级是系统基础等级，不能停用');
    if (before.status === body.status) return before;

    return this.prisma.$transaction(async (tx) => {
      const rank = await tx.rank.update({ where: { id: rankId }, data: { status: body.status } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id,
          action: body.status === 1 ? 'RANK_ENABLED' : 'RANK_DISABLED', targetType: 'RANK', targetId: BigInt(rank.id),
          before: { status: before.status } as never, after: { status: body.status } as never,
        },
      });
      return rank;
    });
  }

  @Delete('ranks/:id')
  @Roles('SUPER_ADMIN')
  async deleteRank(@Param('id') id: string, @CurrentUser() operator: CurrentUserPayload) {
    const rankId = this.rankId(id);
    const rank = await this.prisma.rank.findUnique({ where: { id: rankId } });
    if (!rank) throw new BusinessException(4003, '等级不存在');
    if (rank.level === 0) throw new BusinessException(3002, '普通会员等级是系统基础等级，不能删除');
    const [users, snapshots, dividends, logs] = await Promise.all([
      this.prisma.user.count({ where: { rankId } }),
      this.prisma.rankSnapshot.count({ where: { rankId } }),
      this.prisma.dividend.count({ where: { rankId } }),
      this.prisma.rankLog.count({ where: { OR: [{ fromLevel: rank.level }, { toLevel: rank.level }] } }),
    ]);
    if (users || snapshots || dividends || logs) {
      throw new BusinessException(3002, '该等级已有会员或历史记录，不能删除；请停用以保留账务与升级历史');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rank.delete({ where: { id: rankId } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'RANK_DELETED', targetType: 'RANK', targetId: BigInt(rank.id),
          before: { id: rank.id, level: rank.level, name: rank.name, threshold: rank.threshold.toString() } as never,
        },
      });
      return { deleted: true, id: rank.id };
    });
  }

  private rankId(value: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 0) throw new BusinessException(1001, '等级编号无效');
    return id;
  }

  private rankThreshold(value?: number): bigint {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new BusinessException(1001, '累计PV门槛必须是非负整数');
    return BigInt(value!);
  }

  private rankRate(value: number | undefined, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new BusinessException(1001, `${label}必须在 0 至 1 之间`);
    }
    return value;
  }

  private rankTransferQuotaGrant(value?: number): bigint {
    if (value === undefined) return 0n;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new BusinessException(1001, '晋升新增权益通额度必须是非负整数');
    }
    return BigInt(value);
  }

  @Get('ranks/logs')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  rankLogs(@Query('page') page = '1') {
    return this.prisma.rankLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
      include: { user: { select: { nickname: true, phone: true } } },
    });
  }

  /* ============ 钱包 / 权益值 / 太阳值 ============ */

  @Get('wallets')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  wallets(@Query('page') page = '1', @Query('keyword') keyword?: string) {
    const where = keyword
      ? { user: { OR: [{ phone: { contains: keyword } }, { nickname: { contains: keyword } }] } }
      : {};
    return this.prisma.wallet.findMany({
      where,
      orderBy: { balance: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
      include: { user: { select: { nickname: true, phone: true, rankLevel: true } } },
    });
  }

  @Get('wallets/:userId/transactions')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  walletTransactions(@Param('userId') userId: string, @Query('page') page = '1') {
    return this.wallet.transactions(BigInt(userId), Number(page));
  }

  @Post('wallets/:userId/adjust')
  @Roles('SUPER_ADMIN', 'FINANCE')
  walletAdjust(
    @Param('userId') userId: string,
    @Body() body: { amount: number; reason: string },
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.adjust.adjustWallet(BigInt(userId), BigInt(body.amount), body.reason, user.id, idempotencyKey);
  }

  @Get('transfer-quotas')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  async transferQuotas(@Query('page') page = '1', @Query('keyword') keyword?: string) {
    const currentPage = Math.max(1, Number(page) || 1);
    const where = keyword
      ? { user: { OR: [{ phone: { contains: keyword } }, { nickname: { contains: keyword } }] } }
      : {};
    const [list, total] = await Promise.all([
      this.prisma.transferQuotaAccount.findMany({
        where, orderBy: { granted: 'desc' }, skip: (currentPage - 1) * 20, take: 20,
        include: { user: { select: { nickname: true, phone: true, rankLevel: true, packageId: true } } },
      }),
      this.prisma.transferQuotaAccount.count({ where }),
    ]);
    return { list: list.map((row) => ({ ...row, available: row.granted > row.adjustedOut + row.used + row.reserved ? row.granted - row.adjustedOut - row.used - row.reserved : 0n })), total, page: currentPage, pageSize: 20 };
  }

  @Get('transfer-quotas/:userId/transactions')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  transferQuotaTransactions(@Param('userId') userId: string, @Query('page') page = '1') {
    return this.transferQuota.transactions(BigInt(userId), Number(page));
  }

  @Get('equity/accounts')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  equityAccounts(@Query('page') page = '1', @Query('keyword') keyword?: string) {
    const where = keyword
      ? { user: { OR: [{ phone: { contains: keyword } }, { nickname: { contains: keyword } }] } }
      : {};
    return this.prisma.equityAccount.findMany({
      where,
      orderBy: { balance: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
      include: { user: { select: { nickname: true, phone: true, rankLevel: true } } },
    });
  }

  @Get('equity/:userId/lots')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  equityLots(@Param('userId') userId: string) {
    return this.prisma.equityLot.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { expireAt: 'asc' },
    });
  }

  @Get('equity/transfers')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  equityTransfers(@Query('page') page = '1') {
    return this.prisma.equityTransfer.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
      include: {
        fromUser: { select: { id: true, nickname: true, phone: true } },
        toUser: { select: { id: true, nickname: true, phone: true } },
      },
    });
  }

  @Get('equity/expired')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  equityExpired(@Query('page') page = '1') {
    return this.prisma.equityLot.findMany({
      where: { status: 'EXPIRED' },
      orderBy: { expireAt: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
    });
  }

  @Post('equity/:userId/adjust')
  @Roles('SUPER_ADMIN', 'FINANCE')
  equityAdjust(
    @Param('userId') userId: string,
    @Body() body: { amount: number; reason: string },
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.adjust.adjustEquity(BigInt(userId), BigInt(body.amount), body.reason, user.id, idempotencyKey);
  }

  @Get('tokens')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  tokens(@Query('page') page = '1') {
    return this.prisma.tokenAccount
      .findMany({
        orderBy: { balance: 'desc' },
        skip: (Number(page) - 1) * 20,
        take: 20,
        include: { user: { select: { id: true, phone: true, nickname: true } } },
      })
      .then((rows) =>
        rows.map((r) => ({
          userId: r.userId,
          balance: r.balance,
          totalGranted: r.totalGranted,
          totalTransferIn: r.totalTransferIn,
          totalTransferOut: r.totalTransferOut,
          user: r.user,
        })),
      );
  }

  /* ============ 风控 ============ */

  @Get('risk/events')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  riskEvents(@Query('page') page = '1', @Query('handled') handled?: string) {
    const where = handled !== undefined ? { handled: handled === 'true' } : {};
    return this.prisma.riskEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
      include: { user: { select: { nickname: true, phone: true } } },
    });
  }

  @Post('risk/events/:id/handle')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  handleRisk(@Param('id') id: string, @Body() body: { handled: boolean }) {
    return this.prisma.riskEvent.update({
      where: { id: BigInt(id) },
      data: { handled: !!body.handled },
    });
  }

  @Get('risk/devices')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  riskDevices() {
    return this.prisma.user.groupBy({
      by: ['deviceFingerprint'],
      where: { deviceFingerprint: { not: null } },
      _count: { _all: true },
      orderBy: { deviceFingerprint: 'asc' },
      take: 50,
    });
  }

  /* ============ 报表 ============ */

  @Get('reports/bonus')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  async reportBonus(@Query('days') days = '30') {
    const since = new Date(Date.now() - Number(days) * 86400_000);
    const rows = await this.prisma.bonusRecord.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since } },
      _sum: { amount: true, cashAmount: true, tokenAmount: true },
      _count: { _all: true },
    });
    return rows.map((r) => ({ type: r.type, ...r._sum, count: r._count._all }));
  }

  @Get('reports/hierarchy')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  reportHierarchy() {
    return this.prisma.user.groupBy({
      by: ['depth'],
      _count: { _all: true },
      orderBy: { depth: 'asc' },
    });
  }

  /* ============ 系统 ============ */

  @Get('configs')
  @Roles('SUPER_ADMIN')
  configs() {
    return this.prisma.config.findMany({ where: { key: { not: 'brand.settings' } }, orderBy: { key: 'asc' } });
  }

  @Put('configs/:key')
  @Roles('SUPER_ADMIN')
  async updateConfig(@Param('key') key: string, @Body() body: { value: unknown }) {
    if (key === 'brand.settings') throw new BusinessException(1001, '品牌设置请通过「品牌与备案」页面修改');
    const result = await this.prisma.config.update({
      where: { key },
      data: { value: body.value as never, version: { increment: 1 } },
    });
    await this.config.invalidate(key);
    return result;
  }

  @Get('brand')
  @Roles('SUPER_ADMIN')
  async getBrandSettings() {
    const settings = await this.config.get<Partial<BrandSettings>>('brand.settings', DEFAULT_BRAND_SETTINGS);
    return { ...DEFAULT_BRAND_SETTINGS, ...settings };
  }

  @Put('brand')
  @Roles('SUPER_ADMIN')
  async updateBrandSettings(
    @Body() body: unknown,
    @CurrentUser() operator: CurrentUserPayload,
  ) {
    const settings = this.normalizeBrandSettings(body);
    const previous = await this.config.get<BrandSettings>('brand.settings', DEFAULT_BRAND_SETTINGS);
    await this.prisma.$transaction(async (tx) => {
      await tx.config.upsert({
        where: { key: 'brand.settings' },
        create: {
          key: 'brand.settings', group: 'brand', description: '会员端与合伙人端品牌及备案信息',
          value: settings as never,
        },
        update: { value: settings as never, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'BRAND_SETTINGS_UPDATED',
          targetType: 'CONFIG', before: previous as never, after: settings as never,
          remark: '品牌及双备案信息设置',
        },
      });
    });
    await this.config.invalidate('brand.settings');
    return settings;
  }

  private normalizeBrandSettings(input: unknown): BrandSettings {
    const invalid = (message: string): never => { throw new BusinessException(1001, `品牌设置无效：${message}`); };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('缺少品牌信息');
    const value = input as Record<string, unknown>;
    const fields: Array<keyof BrandSettings> = [
      'brandName', 'storeName', 'tagline', 'logoUrl', 'footerText',
      'icpFilingNumber', 'icpFilingUrl', 'publicSecurityFilingNumber', 'publicSecurityFilingUrl',
    ];
    const limits: Record<keyof BrandSettings, number> = {
      brandName: 40, storeName: 40, tagline: 100, logoUrl: 500, footerText: 120,
      icpFilingNumber: 80, icpFilingUrl: 500, publicSecurityFilingNumber: 100, publicSecurityFilingUrl: 500,
    };
    const result = { ...DEFAULT_BRAND_SETTINGS };
    for (const key of fields) {
      const raw = value[key] ?? DEFAULT_BRAND_SETTINGS[key];
      if (typeof raw !== 'string') return invalid(`${key} 必须是文本`);
      const text = raw.trim();
      if (text.length > limits[key]) return invalid(`${key} 最多 ${limits[key]} 个字符`);
      result[key] = text;
    }
    if (!result.brandName) return invalid('品牌名称不能为空');
    if (!result.storeName) return invalid('商城名称不能为空');
    if (result.logoUrl) {
      const localUpload = result.logoUrl.startsWith('/uploads/');
      let secureRemote = false;
      try {
        const url = new URL(result.logoUrl);
        secureRemote = url.protocol === 'https:' || url.protocol === 'http:';
      } catch { /* only absolute HTTP URLs and local uploads are accepted */ }
      if (!localUpload && !secureRemote) return invalid('Logo 仅支持文件库素材或 HTTP(S) 图片地址');
    }
    if (result.icpFilingUrl) {
      try {
        const url = new URL(result.icpFilingUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return invalid('ICP备案查询链接必须使用 HTTP(S)');
      } catch { return invalid('ICP备案查询链接格式无效'); }
    }
    if (result.publicSecurityFilingUrl) {
      try {
        const url = new URL(result.publicSecurityFilingUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return invalid('公安备案查询链接必须使用 HTTP(S)');
      } catch { return invalid('公安备案查询链接格式无效'); }
    }
    return result;
  }

  @Get('referral/poster')
  @Roles('SUPER_ADMIN')
  async getReferralPoster() {
    const template = await this.config.get<ReferralPosterTemplate>('referral.poster', DEFAULT_REFERRAL_POSTER_TEMPLATE);
    const h5BaseUrl = (process.env.H5_BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    const sampleUrl = `${h5BaseUrl}/#/register?code=SL-DEMO`;
    const sampleQrCode = await QRCode.toDataURL(sampleUrl, {
      errorCorrectionLevel: 'H', margin: 1, width: 384,
      color: { dark: '#111826', light: '#FFFFFFFF' },
    });
    return { template, sampleQrCode, sampleData: { nickname: '演示会员', inviteCode: 'SL-DEMO', url: sampleUrl } };
  }

  @Put('referral/poster')
  @Roles('SUPER_ADMIN')
  async saveReferralPoster(
    @Body() body: { template?: unknown },
    @CurrentUser() operator: CurrentUserPayload,
  ) {
    const template = this.normalizeReferralPoster(body?.template);
    const previous = await this.prisma.config.findUnique({ where: { key: 'referral.poster' } });
    await this.prisma.$transaction(async (tx) => {
      await tx.config.upsert({
        where: { key: 'referral.poster' },
        create: { key: 'referral.poster', group: 'referral', description: 'H5 邀请海报模板', value: template as never },
        update: { value: template as never, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'REFERRAL_POSTER_UPDATED',
          targetType: 'CONFIG', before: { template: previous?.value ?? null } as never,
          after: { template } as never,
        },
      });
    });
    await this.config.invalidate('referral.poster');
    return { template };
  }

  private normalizeReferralPoster(input: unknown): ReferralPosterTemplate {
    const invalid = (message: string): never => { throw new BusinessException(1001, `邀请海报配置无效：${message}`); };
    if (!input || typeof input !== 'object') return invalid('缺少模板数据');
    const value = input as Record<string, unknown>;
    const width = Number(value.width);
    const height = Number(value.height);
    if (width !== 360 || height !== 640) return invalid('画布尺寸须为 360 × 640');
    const backgroundColor = value.backgroundColor;
    if (typeof backgroundColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(backgroundColor)) {
      return invalid('背景颜色格式错误');
    }
    const backgroundImageUrl = value.backgroundImageUrl;
    if (backgroundImageUrl !== null && backgroundImageUrl !== undefined && backgroundImageUrl !== '') {
      if (typeof backgroundImageUrl !== 'string'
        || (!backgroundImageUrl.startsWith('/uploads/') && !/^https:\/\//i.test(backgroundImageUrl))) {
        return invalid('背景图须从文件管理选择，或使用 HTTPS 图片地址');
      }
    }
    if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 32) {
      return invalid('图层数量须为 1-32 个');
    }
    const ids = new Set<string>();
    const layers: ReferralPosterLayer[] = value.layers.map((raw, index) => {
      if (!raw || typeof raw !== 'object') return invalid(`第 ${index + 1} 个图层数据错误`);
      const layer = raw as Record<string, unknown>;
      const id = typeof layer.id === 'string' ? layer.id : '';
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || ids.has(id)) return invalid(`第 ${index + 1} 个图层编号无效或重复`);
      ids.add(id);
      const x = Number(layer.x);
      const y = Number(layer.y);
      const layerWidth = Number(layer.width);
      const layerHeight = Number(layer.height);
      if (![x, y, layerWidth, layerHeight].every(Number.isFinite)
        || x < 0 || y < 0 || layerWidth < 1 || layerHeight < 1
        || x + layerWidth > 360 || y + layerHeight > 640) {
        return invalid(`第 ${index + 1} 个图层位置或尺寸超出画布`);
      }
      if (layer.type === 'qrcode') {
        if (Math.min(layerWidth, layerHeight) < 64) return invalid('二维码图层至少须为 64 × 64');
        return { id, type: 'qrcode', x, y, width: layerWidth, height: layerHeight };
      }
      if (layer.type === 'image') {
        const src = layer.src;
        if (typeof src !== 'string' || (!src.startsWith('/uploads/') && !/^https:\/\//i.test(src))) {
          return invalid(`第 ${index + 1} 个图片图层须从文件管理选择`);
        }
        const fit = layer.fit;
        const opacity = layer.opacity === undefined ? 1 : Number(layer.opacity);
        if (!['contain', 'cover'].includes(String(fit)) || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
          return invalid(`第 ${index + 1} 个图片图层适配方式或透明度无效`);
        }
        return { id, type: 'image', x, y, width: layerWidth, height: layerHeight, src, fit: fit as 'contain' | 'cover', opacity };
      }
      if (layer.type !== 'text') return invalid(`第 ${index + 1} 个图层类型不支持`);
      if (typeof layer.text !== 'string' || !layer.text.trim() || layer.text.length > 240) {
        return invalid(`第 ${index + 1} 个文字图层须填写 1-240 个字符`);
      }
      const fontSize = Number(layer.fontSize);
      const fontWeight = Number(layer.fontWeight);
      if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 128
        || ![400, 500, 600, 700].includes(fontWeight)) return invalid(`第 ${index + 1} 个图层字体设置无效`);
      if (typeof layer.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(layer.color)) {
        return invalid(`第 ${index + 1} 个图层文字颜色格式错误`);
      }
      if (!['left', 'center', 'right'].includes(String(layer.align))) return invalid(`第 ${index + 1} 个图层对齐方式无效`);
      return {
        id, type: 'text', x, y, width: layerWidth, height: layerHeight,
        text: layer.text, fontSize, fontWeight: fontWeight as 400 | 500 | 600 | 700,
        color: layer.color, align: layer.align as 'left' | 'center' | 'right',
      };
    });
    if (layers.filter((layer) => layer.type === 'qrcode').length === 0) return invalid('至少需要一个二维码图层');
    return {
      version: 1, width: 360, height: 640, backgroundColor,
      backgroundImageUrl: typeof backgroundImageUrl === 'string' && backgroundImageUrl ? backgroundImageUrl : null,
      layers,
    };
  }

  /* ============ 奖金参数设置 ============ */

  /** 百分比型参数（前端传 0-100，落库为小数） */
  private static readonly BONUS_PERCENT_KEYS = [
    'bonus.reward_rate',
    'bonus.repurchase_rate',
    'bonus.peer_rate',
    'bonus.leader_rate',
    'bonus.cash_ratio',
    'bonus.token_ratio',
    'bonus.team_exclude_ratio',
  ];

  @Put('bonus/settings')
  @Roles('SUPER_ADMIN')
  async updateBonusSettings(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const percentKeys = AdminExtendedController.BONUS_PERCENT_KEYS;
    const entries = Object.entries(body ?? {});
    if (entries.length === 0) throw new BusinessException(1001, '未提供有效的奖金参数');

    const patch: Record<string, number | boolean> = {};
    for (const [key, value] of entries) {
      if (key === 'bonus.team_exclude_enabled') {
        if (typeof value !== 'boolean') throw new BusinessException(1003, '团队奖最大推广线剔除开关必须为布尔值');
        patch[key] = value;
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BusinessException(1003, `${key} 必须是有效数字`);
      }
      if (percentKeys.includes(key)) {
        if (value < 0 || value > 100) throw new BusinessException(1003, `${key} 必须在 0-100 之间`);
        patch[key] = value / 100;
      } else if (key === 'bonus.direct_periods') {
        if (!Number.isInteger(value) || value < 1 || value > 365) {
          throw new BusinessException(1003, '释放期数必须是 1-365 的整数');
        }
        patch[key] = value;
      } else {
        throw new BusinessException(1001, `不支持的配置项：${key}`);
      }
    }

    const before: Record<string, unknown> = {};
    const after = await this.prisma.$transaction(async (tx) => {
      // 未提交的比例项按库中现值补齐，保证「钱包 + 太阳值 = 100%」校验完整
      const merged: Record<string, number | boolean> = { ...patch };
      for (const key of ['bonus.cash_ratio', 'bonus.token_ratio']) {
        if (merged[key] === undefined) {
          const row = await tx.config.findUnique({ where: { key } });
          if (row) merged[key] = Number(row.value);
        }
      }
      const cashRatio = merged['bonus.cash_ratio'];
      const tokenRatio = merged['bonus.token_ratio'];
      if (typeof cashRatio === 'number' && typeof tokenRatio === 'number'
        && Math.abs(cashRatio + tokenRatio - 1) > 1e-9) {
        throw new BusinessException(1003, '钱包与太阳值分成比例之和必须等于 100%');
      }

      for (const [key, value] of Object.entries(patch)) {
        const existing = await tx.config.findUnique({ where: { key } });
        before[key] = existing?.value ?? null;
        await tx.config.upsert({
          where: { key },
          create: { key, value: value as never, group: 'bonus' },
          update: { value: value as never, version: { increment: 1 } },
        });
      }

      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN',
          operatorId: user.id,
          action: 'BONUS_SETTINGS',
          targetType: 'CONFIG',
          targetId: user.id,
          before: before as never,
          after: patch as never,
          remark: '奖金参数设置',
        },
      });
      return patch;
    });

    for (const key of Object.keys(patch)) await this.config.invalidate(key);
    return after;
  }

  @Get('audit-logs')
  @Roles('SUPER_ADMIN')
  auditLogs(@Query('page') page = '1', @Query('action') action?: string) {
    return this.prisma.auditLog.findMany({
      where: action ? { action: { contains: action } } : {},
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * 20, take: 20,
    });
  }

  @Get('tasks')
  @Roles('SUPER_ADMIN', 'FINANCE')
  tasks() {
    return this.prisma.settleBatch.findMany({ orderBy: { startedAt: 'desc' }, take: 10 });
  }

  @Get('roles')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  roles() {
    return [
      { code: 'SUPER_ADMIN', name: '超级管理员', desc: '全部权限，可单人执行敏感操作' },
      { code: 'OPERATOR', name: '运营', desc: '日常运营，敏感操作需提交申请' },
      { code: 'FINANCE', name: '财务', desc: '复核敏感操作，查看财务报表' },
      { code: 'SUPPORT', name: '客服', desc: '查看会员与订单，仅业绩报表' },
    ];
  }

  /* ============ 审批流 ============ */

  @Get('approvals')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  approvals(@Query('status') status: string | undefined, @Query('page') page: string, @CurrentUser() user: CurrentUserPayload) {
    return this.approvalSvc.list(status, Number(page ?? '1'), 20, user.role === 'OPERATOR' ? user.id : undefined);
  }

  @Post('approvals')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  applyApproval(
    @Body() body: { type: ApprovalType; payload: Record<string, unknown>; remark?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.approvalSvc.apply(body.type, body.payload, user, body.remark);
  }

  @Post('approvals/:id/review')
  @Roles('SUPER_ADMIN', 'FINANCE')
  reviewApproval(
    @Param('id') id: string,
    @Body() body: { pass: boolean; remark?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.approvalSvc.approve(BigInt(id), user, !!body.pass, body.remark);
  }
}
