import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { BusinessException } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { EquityService } from '../equity/equity.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../token/token.service';
import { WalletService } from '../wallet/wallet.service';
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
  ) {}

  /* ============ 档位与商品 ============ */

  @Get('packages')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  packages() {
    return this.prisma.package.findMany({ orderBy: { level: 'asc' } });
  }

  @Post('packages')
  @Roles('SUPER_ADMIN')
  createPackage(@Body() body: { id: number; name: string; level: number; price: number; equityValue: number; durationDays?: number }) {
    return this.prisma.package.create({
      data: {
        id: body.id, name: body.name, level: body.level,
        price: BigInt(body.price), equityValue: BigInt(body.equityValue),
        durationDays: body.durationDays ?? 365,
      },
    });
  }

  @Put('packages/:id')
  @Roles('SUPER_ADMIN')
  updatePackage(@Param('id') id: string, @Body() body: Partial<{ name: string; price: number; equityValue: number; durationDays: number; status: number }>) {
    return this.prisma.package.update({
      where: { id: Number(id) },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.price !== undefined ? { price: BigInt(body.price) } : {}),
        ...(body.equityValue !== undefined ? { equityValue: BigInt(body.equityValue) } : {}),
        ...(body.durationDays !== undefined ? { durationDays: body.durationDays } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
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
  async deliver(@Param('no') no: string, @CurrentUser() user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { orderNo: no }, select: { id: true, status: true } });
      if (!order) throw new BusinessException(4003, '订单不存在');
      if (order.status !== 1) throw new BusinessException(3002, '仅已付款订单可以确认交付');
      const deliveredAt = new Date();
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: 1 },
        data: { status: 2, deliveredAt },
      });
      if (!updated.count) throw new BusinessException(3002, '订单状态已变化，请刷新后重试');
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: user.id, action: 'ORDER_DELIVER',
          targetType: 'ORDER', targetId: order.id,
          after: { orderNo: no, status: 2, deliveredAt: deliveredAt.toISOString() } as never,
        },
      });
      return tx.order.findUnique({ where: { id: order.id } });
    });
  }

  /* ============ 会员 ============ */

  @Get('members/:id')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT')
  async memberDetail(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true, phone: true, nickname: true, inviteCode: true, packageId: true,
        packageExpireAt: true, rankId: true, rankLevel: true, rankAchievedAt: true,
        totalTeamPerformance: true, parentId: true, depth: true, equityStatus: true,
        peerBonusLocked: true, realNameStatus: true, status: true, createdAt: true,
        rank: { select: { name: true, level: true } },
        package: { select: { name: true, level: true, price: true } },
        wallet: { select: { balance: true, frozen: true, totalIn: true, totalOut: true } },
        equityAccount: { select: { balance: true, totalGranted: true, totalUsed: true, totalExpired: true } },
        parent: { select: { id: true, nickname: true, phone: true } },
      },
    });
    if (!user) throw new BusinessException(4003, '会员不存在');
    return user;
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

  @Put('ranks/:id')
  @Roles('SUPER_ADMIN')
  updateRank(@Param('id') id: string, @Body() body: Partial<{ name: string; threshold: number; teamRate: number; poolRate: number }>) {
    return this.prisma.rank.update({
      where: { id: Number(id) },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.threshold !== undefined ? { threshold: BigInt(body.threshold) } : {}),
        ...(body.teamRate !== undefined ? { teamRate: body.teamRate } : {}),
        ...(body.poolRate !== undefined ? { poolRate: body.poolRate } : {}),
      },
    });
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

  /* ============ 钱包 / 权益值 / 数权 ============ */

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
  ) {
    return this.adjust.adjustWallet(BigInt(userId), BigInt(body.amount), body.reason, user.id);
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
  ) {
    return this.adjust.adjustEquity(BigInt(userId), BigInt(body.amount), body.reason, user.id);
  }

  @Get('tokens')
  @Roles('SUPER_ADMIN', 'OPERATOR', 'FINANCE')
  tokens(@Query('page') page = '1') {
    return this.prisma.tokenLot.groupBy({
      by: ['userId'],
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      skip: (Number(page) - 1) * 20, take: 20,
    });
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
    return this.prisma.config.findMany({ orderBy: { key: 'asc' } });
  }

  @Put('configs/:key')
  @Roles('SUPER_ADMIN')
  async updateConfig(@Param('key') key: string, @Body() body: { value: unknown }) {
    const result = await this.prisma.config.update({
      where: { key },
      data: { value: body.value as never, version: { increment: 1 } },
    });
    await this.config.invalidate(key);
    return result;
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
