import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { BusinessException } from '../common/business.exception';
import { FeaturesService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService } from '../relation/relation.service';
import { SettlementService } from '../settlement/settlement.service';
import { TransferService } from '../transfer/transfer.service';
import { UserService } from '../user/user.service';
import { ApprovalService } from './approval.service';

@Controller('api/admin')
@Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly relation: RelationService,
    private readonly featureFlags: FeaturesService,
    private readonly settlement: SettlementService,
    private readonly transfer: TransferService,
    private readonly approvals: ApprovalService,
  ) {}

  @Get('dashboard')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  async dashboard(@CurrentUser() current: CurrentUserPayload) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const canReviewOperations = current.role === 'SUPER_ADMIN' || current.role === 'OPERATOR';
    const pendingApprovalWhere = current.role === 'OPERATOR'
      ? { status: 'PENDING', applicantId: current.id }
      : { status: 'PENDING' };
    const [memberCount, todayOrders, todayPerformance, totalBonus, pendingWallet, pendingEquity, rankDistribution, recentOrders, pendingDeliveryOrders, pendingApprovals, pendingRiskEvents] =
      await Promise.all([
        this.prisma.user.count({ where: { role: 'MEMBER' } }),
        this.prisma.order.count({ where: { createdAt: { gte: today } } }),
        this.prisma.orderPerformance.aggregate({ where: { occurDate: today }, _sum: { amount: true } }),
        this.prisma.bonusRecord.aggregate({ _sum: { amount: true } }),
        this.prisma.walletTransfer.count({ where: { status: 'PENDING', riskFlag: 1 } }),
        this.prisma.equityTransfer.count({ where: { status: 'PENDING', riskFlag: 1 } }),
        this.prisma.user.groupBy({ by: ['rankLevel'], _count: { _all: true }, orderBy: { rankLevel: 'asc' } }),
        this.prisma.order.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { user: { select: { nickname: true, phone: true } } },
        }),
        canReviewOperations ? this.prisma.order.count({ where: { status: 1 } }) : Promise.resolve(0),
        this.prisma.approval.count({ where: pendingApprovalWhere }),
        canReviewOperations ? this.prisma.riskEvent.count({ where: { handled: false } }) : Promise.resolve(0),
      ]);

    return {
      memberCount,
      todayOrders,
      todayPerformance: todayPerformance._sum.amount ?? 0n,
      totalBonus: totalBonus._sum.amount ?? 0n,
      pendingTransfers: canReviewOperations ? pendingWallet + pendingEquity : 0,
      pendingDeliveryOrders,
      pendingApprovals,
      pendingRiskEvents,
      rankDistribution: rankDistribution.map((r) => ({ level: r.rankLevel, count: r._count._all })),
      recentOrders,
    };
  }

  @Get('members')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  members(
    @Query('page') page = '1',
    @Query('keyword') keyword?: string,
    @Query('rankLevel') rankLevel?: string,
    @Query('status') status?: string,
  ) {
    return this.users.list(
      Number(page), 20, keyword,
      rankLevel !== undefined && Number.isInteger(Number(rankLevel)) ? Number(rankLevel) : undefined,
      status !== undefined && Number.isInteger(Number(status)) ? Number(status) : undefined,
    );
  }

  @Get('members/:id/team')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  memberTeam(@Param('id') id: string) {
    return this.relation.getTree(BigInt(id), 6);
  }

  @Post('members/:id/rank')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  adjustRank(
    @Param('id') id: string,
    @Body() body: { level: number },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.approvals.apply('RANK_ADJUST', { userId: id, level: body.level }, user);
  }

  @Post('members/:id/freeze')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  freeze(@Param('id') id: string, @Body() body: { frozen: boolean }) {
    return this.users.freeze(BigInt(id), !!body.frozen);
  }

  @Get('orders')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  async orders(
    @Query('page') page = '1',
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    const currentPage = Math.max(1, Number(page) || 1);
    const where = {
      ...(status !== undefined && Number.isInteger(Number(status)) ? { status: Number(status) } : {}),
      ...(type !== undefined && Number.isInteger(Number(type)) ? { type: Number(type) } : {}),
      ...(keyword?.trim() ? {
        OR: [
          { orderNo: { contains: keyword.trim() } },
          { user: { is: { nickname: { contains: keyword.trim() } } } },
          { user: { is: { phone: { contains: keyword.trim() } } } },
        ],
      } : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * 20,
        take: 20,
        include: { user: { select: { nickname: true, phone: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { list, total, page: currentPage, pageSize: 20 };
  }

  @Get('bonus/records')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  async bonusRecords(@Query('page') page = '1', @Query('type') type?: string) {
    const currentPage = Math.max(1, Number(page) || 1);
    const where = type && Number.isInteger(Number(type)) ? { type: Number(type) } : {};
    const [list, total] = await Promise.all([
      this.prisma.bonusRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * 20,
        take: 20,
        include: {
          user: { select: { nickname: true, phone: true } },
          sourceUser: { select: { nickname: true, phone: true } },
        },
      }),
      this.prisma.bonusRecord.count({ where }),
    ]);
    return { list, total, page: currentPage, pageSize: 20 };
  }

  @Get('settlements/daily')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  settlements(@Query('page') page = '1') {
    return this.prisma.settleBatch.findMany({
      orderBy: { statDate: 'desc' },
      skip: (Number(page) - 1) * 20,
      take: 20,
    });
  }

  @Post('settlements/daily/rerun')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  rerun(@Body() body: { date?: string }, @CurrentUser() user: CurrentUserPayload) {
    return this.approvals.apply('SETTLEMENT_RERUN', { date: body.date }, user);
  }

  @Post('settlements/reconcile')
  @Roles('SUPER_ADMIN', 'FINANCE')
  reconcile(@Body() body: { date?: string }) {
    return this.settlement.reconcile(body.date ? new Date(body.date) : new Date());
  }

  @Get('dividends')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  dividends(@Query('date') date?: string) {
    return this.prisma.dividend.findMany({
      where: date ? { statDate: new Date(date) } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { nickname: true, phone: true } } },
    });
  }

  @Get('transfers')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  transfers(@Query('page') page = '1') {
    const pageNumber = Math.max(1, Number(page) || 1);
    return this.prisma.walletTransfer.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (pageNumber - 1) * 20,
      take: 20,
      include: {
        fromUser: { select: { id: true, nickname: true, phone: true } },
        toUser: { select: { id: true, nickname: true, phone: true } },
      },
    });
  }

  @Post('transfers/:id/review')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  async reviewTransfer(
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; platform: 'wallet' | 'equity' },
    @CurrentUser() current: CurrentUserPayload,
  ) {
    if (!['APPROVE', 'REJECT'].includes(body.action) || !['wallet', 'equity'].includes(body.platform)) {
      throw new BusinessException(1001, '转账审核参数不正确');
    }
    if (!/^\d+$/.test(id)) throw new BusinessException(1001, '转账记录 ID 不正确');
    const transferId = BigInt(id);
    if (body.platform === 'wallet') {
      const t = await this.prisma.walletTransfer.findUnique({ where: { id: transferId } });
      if (!t) throw new BusinessException(4003, '转账记录不存在');
      if (t.status !== 'PENDING' || t.riskFlag !== 1) throw new BusinessException(3002, '该转账不需要风险复核或已处理');
      const result = body.action === 'APPROVE'
        ? await this.transfer.acceptWalletTransfer(transferId, t.toUserId, true)
        : await this.transfer.rejectWalletTransfer(transferId, t.fromUserId);
      await this.prisma.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: current.id,
          action: body.action === 'APPROVE' ? 'WALLET_TRANSFER_APPROVE' : 'WALLET_TRANSFER_REJECT',
          targetType: 'WALLET_TRANSFER', targetId: transferId,
          before: { status: 'PENDING', riskFlag: t.riskFlag } as never,
          after: { status: body.action === 'APPROVE' ? 'COMPLETED' : 'REJECTED', transferNo: t.transferNo } as never,
        },
      });
      return result;
    }
    const t = await this.prisma.equityTransfer.findUnique({ where: { id: transferId } });
    if (!t) throw new BusinessException(4003, '转账记录不存在');
    if (t.status !== 'PENDING' || t.riskFlag !== 1) throw new BusinessException(3002, '该转账不需要风险复核或已处理');
    const result = body.action === 'APPROVE'
      ? await this.transfer.acceptEquityTransfer(transferId, t.toUserId, true)
      : await this.transfer.rejectEquityTransfer(transferId, t.fromUserId);
    await this.prisma.auditLog.create({
      data: {
        operatorType: 'ADMIN', operatorId: current.id,
        action: body.action === 'APPROVE' ? 'EQUITY_TRANSFER_APPROVE' : 'EQUITY_TRANSFER_REJECT',
        targetType: 'EQUITY_TRANSFER', targetId: transferId,
        before: { status: 'PENDING', riskFlag: t.riskFlag } as never,
        after: { status: body.action === 'APPROVE' ? 'COMPLETED' : 'REJECTED', transferNo: t.transferNo } as never,
      },
    });
    return result;
  }

  @Get('features')
  @Roles('SUPER_ADMIN')
  features() {
    return this.featureFlags.allForAdmin();
  }

  @Put('features/:code')
  @Roles('SUPER_ADMIN')
  toggleFeature(
    @Param('code') code: string,
    @Body() body: { enabled: boolean; platforms?: string[]; minRankLevel?: number },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.featureFlags.toggle(code, !!body.enabled, body.platforms, body.minRankLevel, user.id);
  }

  /** 虚拟货币发行总账：累计发行 / 流通 / 已消费或过期 / 沉淀 */
  @Get('reports/issuance')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  async issuance() {
    const [equityGranted, equityUsed, equityExpired, equityBalance, cashIn, cashOut, walletBalance, tokenTotal] =
      await Promise.all([
        this.prisma.equityAccount.aggregate({ _sum: { totalGranted: true } }),
        this.prisma.equityAccount.aggregate({ _sum: { totalUsed: true } }),
        this.prisma.equityAccount.aggregate({ _sum: { totalExpired: true } }),
        this.prisma.equityAccount.aggregate({ _sum: { balance: true } }),
        this.prisma.walletTransaction.aggregate({ where: { changeAmount: { gt: 0n } }, _sum: { changeAmount: true } }),
        this.prisma.walletTransaction.aggregate({ where: { changeAmount: { lt: 0n } }, _sum: { changeAmount: true } }),
        this.prisma.wallet.aggregate({ _sum: { balance: true, frozen: true } }),
        this.prisma.tokenLot.aggregate({ _sum: { amount: true } }),
      ]);

    const eqIssued = equityGranted._sum.totalGranted ?? 0n;
    const eqCirculating = equityBalance._sum.balance ?? 0n;
    const eqConsumed = (equityUsed._sum.totalUsed ?? 0n) + (equityExpired._sum.totalExpired ?? 0n);
    const cashIssued = cashIn._sum.changeAmount ?? 0n;
    const cashCirculating = (walletBalance._sum.balance ?? 0n) + (walletBalance._sum.frozen ?? 0n);

    return {
      equity: {
        issued: eqIssued,
        circulating: eqCirculating,
        consumed: eqConsumed,
        sunk: eqIssued - eqCirculating - eqConsumed,
      },
      wallet: {
        issued: cashIssued,
        circulating: cashCirculating,
        consumed: -(cashOut._sum.changeAmount ?? 0n),
        sunk: cashIssued - cashCirculating + (cashOut._sum.changeAmount ?? 0n),
      },
      token: { issued: tokenTotal._sum.amount ?? 0n, circulating: 0n, transferable: false },
    };
  }

  @Get('reports/performance')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  performance(@Query('days') days = '30') {
    const dayCount = Math.max(1, Math.min(90, Number(days) || 30));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = new Date(today);
    since.setDate(since.getDate() - dayCount + 1);
    return this.prisma.teamPerformance.groupBy({
      by: ['statDate'],
      where: { statDate: { gte: since } },
      _sum: { ownAmount: true },
      orderBy: { statDate: 'asc' },
    }).then((rows) => rows.map((row) => ({
      statDate: row.statDate,
      performance: row._sum.ownAmount ?? 0n,
    })));
  }
}
