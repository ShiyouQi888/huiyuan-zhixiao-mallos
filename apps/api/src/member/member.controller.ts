import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BonusService } from '../bonus/bonus.service';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { EquityService } from '../equity/equity.service';
import { FeaturesService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService } from '../relation/relation.service';
import { TokenService } from '../token/token.service';
import { TransferService } from '../transfer/transfer.service';
import { UserService } from '../user/user.service';
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

  @Public()
  @Get('packages')
  packages() {
    return this.prisma.package.findMany({ where: { status: 1 }, orderBy: { level: 'asc' } });
  }

  @Get('features')
  async featuresForUser(
    @CurrentUser() user: CurrentUserPayload,
    @Query('platform') platform: Platform = 'h5',
  ) {
    return { features: await this.features.listForUser(platform, user.rankLevel) };
  }

  @Get('me')
  me(@CurrentUser('id') id: bigint) {
    return this.users.me(id);
  }

  @Get('me/rank')
  rank(@CurrentUser('id') id: bigint) {
    return this.users.rank(id);
  }

  @Get('me/rank/logs')
  rankLogs(@CurrentUser('id') id: bigint, @Query('page') page = '1') {
    return this.users.rankLogs(id, Number(page));
  }

  @Post('me/realname')
  realname(@CurrentUser('id') id: bigint, @Body() body: { realName: string; idCard: string }) {
    return this.users.realname(id, body.realName, body.idCard);
  }

  @Get('me/team')
  team(@CurrentUser('id') id: bigint) {
    return this.relation.getDirectChildren(id);
  }

  @Get('me/team/tree')
  teamTree(@CurrentUser('id') id: bigint, @Query('depth') depth = '5') {
    return this.relation.getTree(id, Math.min(Number(depth), 10));
  }

  @Get('me/bonus')
  bonusSummary(@CurrentUser('id') id: bigint) {
    return this.bonus.summary(id);
  }

  @Get('me/bonus/records')
  bonusRecords(
    @CurrentUser('id') id: bigint,
    @Query('page') page = '1',
    @Query('type') type?: string,
  ) {
    return this.bonus.records(id, Number(page), 20, type === undefined ? undefined : Number(type));
  }

  @Get('me/wallet')
  wallet(@CurrentUser('id') id: bigint) {
    return this.walletSvc.get(id);
  }

  @Get('me/wallet/transactions')
  walletTransactions(@CurrentUser('id') id: bigint, @Query('page') page = '1') {
    return this.walletSvc.transactions(id, Number(page));
  }

  @Post('me/wallet/transfers')
  walletTransfer(
    @CurrentUser('id') id: bigint,
    @Body() body: { toPhone: string; amount: number; remark?: string },
  ) {
    return this.transfer.createWalletTransfer(id, body.toPhone, BigInt(body.amount), body.remark);
  }

  @Post('me/wallet/transfers/:id/accept')
  acceptWalletTransfer(@Param('id') id: string, @CurrentUser('id') userId: bigint) {
    return this.transfer.acceptWalletTransfer(BigInt(id), userId);
  }

  @Get('me/equity')
  equity(@CurrentUser('id') id: bigint) {
    return this.equitySvc.getAccount(id);
  }

  @Get('me/equity/transactions')
  equityTransactions(@CurrentUser('id') id: bigint, @Query('page') page = '1') {
    return this.equitySvc.transactions(id, Number(page));
  }

  @Post('me/equity/transfers')
  equityTransfer(
    @CurrentUser('id') id: bigint,
    @Body() body: { toPhone: string; amount: number; remark?: string },
  ) {
    return this.transfer.createEquityTransfer(id, body.toPhone, BigInt(body.amount), body.remark);
  }

  @Post('me/equity/transfers/:id/accept')
  acceptEquityTransfer(@Param('id') id: string, @CurrentUser('id') userId: bigint) {
    return this.transfer.acceptEquityTransfer(BigInt(id), userId);
  }

  @Get('me/transfers/:platform')
  transfers(
    @CurrentUser('id') id: bigint,
    @Param('platform') platform: 'wallet' | 'equity',
    @Query('page') page = '1',
  ) {
    return this.transfer.listTransfers(id, platform, Number(page));
  }

  @Get('me/token')
  token(@CurrentUser('id') id: bigint) {
    return this.tokenSvc.summary(id);
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
