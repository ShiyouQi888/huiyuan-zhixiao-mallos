import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { BonusService } from '../bonus/bonus.service';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Err } from '../common/business.exception';
import { EquityService } from '../equity/equity.service';
import { FeaturesService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService } from '../relation/relation.service';
import { TokenService } from '../token/token.service';
import { TransferService } from '../transfer/transfer.service';
import { UserService } from '../user/user.service';
import type { AddressInput } from '../user/user.service';
import { WalletService } from '../wallet/wallet.service';
import type { Platform } from '@solar/shared';

@Controller('api')
export class MemberController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly relation: RelationService,
    private readonly walletSvc: WalletService,
    private readonly equitySvc: EquityService,
    private readonly tokenSvc: TokenService,
    private readonly bonus: BonusService,
    private readonly transfer: TransferService,
    private readonly features: FeaturesService,
  ) {}

  @Get('packages')
  async packages(@CurrentUser() current: CurrentUserPayload) {
    const enabled = await Promise.all(['package.purchase', 'member.upgrade', 'member.repurchase']
      .map((code) => this.features.isAvailable(code, 'h5', current.rankLevel)));
    if (!enabled.some(Boolean)) throw Err.featureDisabled('礼包购买、升级与复消当前均不可用');
    const packages = await this.prisma.package.findMany({
      where: { status: 1 },
      orderBy: { level: 'asc' },
      include: {
        productBinds: {
          where: { product: { status: 1 } },
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
          include: {
            product: {
              select: {
                id: true, name: true, subtitle: true, images: true,
                price: true, originalPrice: true, stock: true,
              },
            },
          },
        },
      },
    });
    return packages.map(({ productBinds, ...item }) => ({
      ...item,
      products: productBinds.map(({ product, exclusivePrice }) => ({
        ...product,
        effectivePrice: exclusivePrice ?? product.price,
      })),
    }));
  }

  @Get('features')
  async featuresForUser(
    @CurrentUser() user: CurrentUserPayload,
    @Query('platform') platform: Platform = 'h5',
  ) {
    return { features: await this.features.listForUser(platform, user.rankLevel) };
  }

  @Get('me')
  async me(@CurrentUser() current: CurrentUserPayload) {
    const profile = await this.users.me(current.id);
    const [walletVisible, equityVisible] = await Promise.all([
      this.features.isAvailable('wallet.account', 'h5', current.rankLevel),
      this.features.isAvailable('equity.account', 'h5', current.rankLevel),
    ]);
    return {
      ...profile,
      wallet: walletVisible ? profile.wallet : null,
      equityAccount: equityVisible ? profile.equityAccount : null,
    };
  }

  @Get('me/rank')
  async rank(@CurrentUser() current: CurrentUserPayload) {
    const canViewRank = await this.features.isAvailable('rank.view', 'h5', current.rankLevel);
    const canViewDividend = await this.features.isAvailable('rank.dividend', 'h5', current.rankLevel);
    if (!canViewRank && !canViewDividend) throw Err.featureDisabled('等级与分红信息当前不可用');
    const rank = await this.users.rank(current.id);
    if (!canViewRank) return { poolRate: rank.poolRate };
    if (canViewDividend) return rank;
    return { ...rank, poolRate: 0, ranks: rank.ranks.map((item) => ({ ...item, poolRate: 0 })) };
  }

  @Get('me/rank/logs')
  async rankLogs(@CurrentUser() current: CurrentUserPayload, @Query('page') page = '1') {
    await this.features.assertEnabled('rank.view', 'h5', current.rankLevel);
    return this.users.rankLogs(current.id, Number(page));
  }

  @Post('me/realname')
  async realname(@CurrentUser() current: CurrentUserPayload, @Body() body: { realName: string; idCard: string }) {
    await this.features.assertEnabled('realname', 'h5', current.rankLevel);
    return this.users.realname(current.id, body.realName, body.idCard);
  }

  @Get('me/addresses')
  async addresses(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('address.manage', 'h5', current.rankLevel);
    return this.users.addresses(current.id);
  }

  @Post('me/addresses')
  async createAddress(@CurrentUser() current: CurrentUserPayload, @Body() body: AddressInput) {
    await this.features.assertEnabled('address.manage', 'h5', current.rankLevel);
    return this.users.createAddress(current.id, body);
  }

  @Put('me/addresses/:id')
  async updateAddress(@Param('id') id: string, @CurrentUser() current: CurrentUserPayload, @Body() body: AddressInput) {
    await this.features.assertEnabled('address.manage', 'h5', current.rankLevel);
    return this.users.updateAddress(current.id, this.parseId(id, '地址编号'), body);
  }

  @Delete('me/addresses/:id')
  async deleteAddress(@Param('id') id: string, @CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('address.manage', 'h5', current.rankLevel);
    return this.users.deleteAddress(current.id, this.parseId(id, '地址编号'));
  }

  @Get('me/security')
  async security(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('transfer.password', 'h5', current.rankLevel);
    return this.users.transferPasswordState(current.id);
  }

  @Post('me/transfer-password')
  async setTransferPassword(
    @CurrentUser() current: CurrentUserPayload,
    @Body() body: { currentPassword?: string; newPassword: string },
  ) {
    await this.features.assertEnabled('transfer.password', 'h5', current.rankLevel);
    return this.users.setTransferPassword(current.id, body.currentPassword, body.newPassword);
  }

  @Get('me/team')
  async team(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('team.view', 'h5', current.rankLevel);
    return this.relation.getDirectChildren(current.id);
  }

  @Get('me/team/tree')
  async teamTree(@CurrentUser() current: CurrentUserPayload, @Query('depth') depth = '5') {
    await this.features.assertEnabled('team.view', 'h5', current.rankLevel);
    return this.relation.getTree(current.id, Math.min(Number(depth), 10));
  }

  @Get('me/bonus')
  async bonusSummary(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('bonus.detail', 'h5', current.rankLevel);
    const includeDividend = await this.features.isAvailable('rank.dividend', 'h5', current.rankLevel);
    return this.bonus.summary(current.id, includeDividend);
  }

  @Get('me/bonus/periods')
  async bonusPeriods(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('bonus.detail', 'h5', current.rankLevel);
    const includeDividend = await this.features.isAvailable('rank.dividend', 'h5', current.rankLevel);
    return this.bonus.periodSummary(current.id, includeDividend);
  }

  @Get('me/bonus/records')
  async bonusRecords(
    @CurrentUser() current: CurrentUserPayload,
    @Query('page') page = '1',
    @Query('type') type?: string,
  ) {
    await this.features.assertEnabled('bonus.detail', 'h5', current.rankLevel);
    const includeDividend = await this.features.isAvailable('rank.dividend', 'h5', current.rankLevel);
    const requestedType = type === undefined ? undefined : Number(type);
    if (requestedType === 5) await this.features.assertEnabled('rank.dividend', 'h5', current.rankLevel);
    return this.bonus.records(current.id, Number(page), 20, requestedType, includeDividend);
  }

  @Get('me/wallet')
  async wallet(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('wallet.account', 'h5', current.rankLevel);
    return this.walletSvc.get(current.id);
  }

  @Get('me/wallet/transactions')
  async walletTransactions(@CurrentUser() current: CurrentUserPayload, @Query('page') page = '1') {
    await this.features.assertEnabled('wallet.account', 'h5', current.rankLevel);
    return this.walletSvc.transactions(current.id, Number(page));
  }

  @Post('me/wallet/transfers')
  async walletTransfer(
    @CurrentUser() current: CurrentUserPayload,
    @Body() body: { toPhone: string; amount: number; paymentPassword: string; remark?: string },
  ) {
    await this.features.assertEnabled('wallet.account', 'h5', current.rankLevel);
    await this.features.assertEnabled('transfer.password', 'h5', current.rankLevel);
    return this.transfer.createWalletTransfer(current.id, body.toPhone, BigInt(body.amount), body.paymentPassword, body.remark);
  }

  @Post('me/wallet/transfers/:id/accept')
  async acceptWalletTransfer(@Param('id') id: string, @CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('wallet.account', 'h5', current.rankLevel);
    await this.features.assertEnabled('wallet.transfer', 'h5', current.rankLevel);
    return this.transfer.acceptWalletTransfer(BigInt(id), current.id);
  }

  @Get('me/equity')
  async equity(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('equity.account', 'h5', current.rankLevel);
    return this.equitySvc.getAccount(current.id);
  }

  @Get('me/equity/transactions')
  async equityTransactions(@CurrentUser() current: CurrentUserPayload, @Query('page') page = '1') {
    await this.features.assertEnabled('equity.account', 'h5', current.rankLevel);
    return this.equitySvc.transactions(current.id, Number(page));
  }

  @Post('me/equity/transfers')
  async equityTransfer(
    @CurrentUser() current: CurrentUserPayload,
    @Body() body: { toPhone: string; amount: number; paymentPassword: string; remark?: string },
  ) {
    await this.features.assertEnabled('equity.account', 'h5', current.rankLevel);
    await this.features.assertEnabled('transfer.password', 'h5', current.rankLevel);
    return this.transfer.createEquityTransfer(current.id, body.toPhone, BigInt(body.amount), body.paymentPassword, body.remark);
  }

  @Post('me/equity/transfers/:id/accept')
  async acceptEquityTransfer(@Param('id') id: string, @CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('equity.account', 'h5', current.rankLevel);
    await this.features.assertEnabled('equity.transfer', 'h5', current.rankLevel);
    return this.transfer.acceptEquityTransfer(BigInt(id), current.id);
  }

  @Get('me/transfers/:platform')
  async transfers(
    @CurrentUser() current: CurrentUserPayload,
    @Param('platform') platform: 'wallet' | 'equity' | 'token',
    @Query('page') page = '1',
  ) {
    if (platform !== 'wallet' && platform !== 'equity' && platform !== 'token') throw Err.param('资产类型不合法');
    await this.features.assertEnabled(
      platform === 'wallet' ? 'wallet.account' : platform === 'equity' ? 'equity.account' : 'token.view',
      'h5',
      current.rankLevel,
    );
    return this.transfer.listTransfers(current.id, platform, Number(page));
  }

  private parseId(value: string, label: string): bigint {
    if (!/^\d+$/.test(value)) throw Err.param(`${label}格式不正确`);
    return BigInt(value);
  }

  @Get('me/token')
  async token(@CurrentUser() current: CurrentUserPayload) {
    await this.features.assertEnabled('token.view', 'h5', current.rankLevel);
    return this.tokenSvc.summary(current.id);
  }

  @Get('me/token/transactions')
  async tokenTransactions(@CurrentUser() current: CurrentUserPayload, @Query('page') page = '1') {
    await this.features.assertEnabled('token.view', 'h5', current.rankLevel);
    return this.tokenSvc.transactions(current.id, Number(page));
  }

  @Post('me/token/transfers')
  async tokenTransfer(
    @CurrentUser() current: CurrentUserPayload,
    @Body() body: { toPhone: string; amount: number; paymentPassword: string; remark?: string },
  ) {
    await this.features.assertEnabled('token.view', 'h5', current.rankLevel);
    await this.features.assertEnabled('transfer.password', 'h5', current.rankLevel);
    return this.transfer.createTokenTransfer(current.id, body.toPhone, BigInt(body.amount), body.paymentPassword, body.remark);
  }

  @Get('referral/qrcode')
  async referral(@CurrentUser() current: CurrentUserPayload) {
    const id = current.id;
    await this.features.assertEnabled('referral.center', 'h5', current.rankLevel);
    const user = await this.prisma.user.findUnique({ where: { id }, select: { inviteCode: true } });
    return {
      inviteCode: user?.inviteCode,
      url: `${process.env.H5_BASE_URL ?? 'http://localhost:5173'}/#/register?code=${user?.inviteCode}`,
      slogan: '扫码加入，共享成长',
    };
  }
}
