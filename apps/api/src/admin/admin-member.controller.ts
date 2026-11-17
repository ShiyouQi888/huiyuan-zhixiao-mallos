import { Body, Controller, Headers, Param, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import bcrypt from 'bcryptjs';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RelationService } from '../relation/relation.service';
import { AdminAdjustService } from './admin-adjust.service';

@Controller('api/admin/members')
@Roles('SUPER_ADMIN', 'OPERATOR')
export class AdminMemberController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relation: RelationService,
    private readonly adjust: AdminAdjustService,
  ) {}

  @Post()
  async create(
    @Body() body: { nickname?: string; phone?: string; password?: string; referrer?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Req() request: Request,
  ) {
    const nickname = this.validateNickname(body.nickname);
    const phone = this.validatePhone(body.phone);
    const password = this.validatePassword(body.password);
    const referrerCode = body.referrer?.trim() ?? '';
    if (await this.prisma.user.findUnique({ where: { phone } })) throw Err.conflict('该手机号已注册');

    const parent = referrerCode
      ? await this.prisma.user.findFirst({ where: { OR: [{ phone: referrerCode }, { inviteCode: referrerCode }] } })
      : null;
    if (referrerCode && (!parent || parent.role !== 'MEMBER' || parent.status !== 0)) {
      throw Err.param('推荐人不存在或账号当前不可用');
    }
    const baseRank = await this.prisma.rank.findUnique({ where: { level: 0 } });
    if (!baseRank || baseRank.status !== 1) throw Err.conflict('系统普通会员等级不可用，暂时无法创建会员');
    const inviteCode = await this.relation.generateInviteCode();
    const path = parent ? `${parent.path}${parent.id},` : ',';
    const depth = parent ? parent.depth + 1 : 0;

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.user.create({
        data: {
          nickname,
          phone,
          passwordHash: bcrypt.hashSync(password, 10),
          inviteCode,
          parentId: parent?.id ?? null,
          path,
          depth,
          role: 'MEMBER',
          status: 0,
          rankId: baseRank.id,
          rankLevel: baseRank.level,
        },
        select: { id: true, nickname: true, phone: true, inviteCode: true, status: true, rankLevel: true, createdAt: true },
      });
      await tx.wallet.create({ data: { userId: member.id } });
      await tx.transferQuotaAccount.create({ data: { userId: member.id } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'MEMBER_CREATED', targetType: 'USER', targetId: member.id,
          after: { nickname, phone: this.maskPhone(phone), inviteCode, parentId: parent?.id.toString() ?? null } as never,
          ip: request.ip?.slice(0, 64), ua: request.headers['user-agent']?.slice(0, 512),
        },
      });
      return member;
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { nickname?: string; phone?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Req() request: Request,
  ) {
    const userId = this.parseId(id);
    const before = await this.findMember(userId);
    if (before.status === 2) throw Err.conflict('已注销会员的资料不可修改');
    const nickname = body.nickname === undefined ? before.nickname : this.validateNickname(body.nickname);
    const phone = body.phone === undefined ? before.phone : this.validatePhone(body.phone);
    if (!phone) throw Err.param('会员手机号不能为空');
    if (phone !== before.phone && await this.prisma.user.findUnique({ where: { phone } })) throw Err.conflict('该手机号已关联其他账号');

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.user.update({
        where: { id: userId },
        data: {
          nickname,
          phone,
          ...(phone !== before.phone ? { authVersion: { increment: 1 } } : {}),
        },
        select: { id: true, nickname: true, phone: true, inviteCode: true, status: true, rankLevel: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'MEMBER_PROFILE_UPDATED', targetType: 'USER', targetId: userId,
          before: { nickname: before.nickname, phone: before.phone ? this.maskPhone(before.phone) : null } as never,
          after: { nickname, phone: this.maskPhone(phone) } as never,
          ip: request.ip?.slice(0, 64), ua: request.headers['user-agent']?.slice(0, 512),
        },
      });
      return member;
    });
  }

  @Put(':id/password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Req() request: Request,
  ) {
    const userId = this.parseId(id);
    const member = await this.findMember(userId);
    if (member.status === 2) throw Err.conflict('已注销会员不能重设密码');
    const password = this.validatePassword(body.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: bcrypt.hashSync(password, 10), authVersion: { increment: 1 } } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'MEMBER_PASSWORD_RESET', targetType: 'USER', targetId: userId,
          after: { sessionsRevoked: true } as never,
          ip: request.ip?.slice(0, 64), ua: request.headers['user-agent']?.slice(0, 512),
        },
      });
    });
    return { updated: true, sessionsRevoked: true };
  }

  @Post(':id/wallet/recharge')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async rechargeWallet(
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = this.parseId(id);
    const member = await this.findMember(userId);
    if (member.status === 2) throw Err.conflict('已注销会员不能充值');
    if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
      throw Err.param('充值金额必须为大于 0 的整数元');
    }
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 2 || reason.length > 256) throw Err.param('请填写 2–256 个字符的充值原因');
    return this.adjust.adjustWallet(userId, BigInt(body.amount), `会员钱包充值：${reason}`, operator.id, idempotencyKey);
  }

  @Post(':id/wallet/adjust')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async adjustWallet(
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = this.parseId(id);
    const member = await this.findMember(userId);
    if (member.status === 2) throw Err.conflict('已注销会员不能调整钱包');
    if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount === 0) {
      throw Err.param('调整金额必须为非零整数元');
    }
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 2 || reason.length > 256) throw Err.param('请填写 2–256 个字符的调整原因');
    return this.adjust.adjustWallet(userId, BigInt(body.amount), reason, operator.id, idempotencyKey);
  }

  @Post(':id/wallet/clear-available')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async clearWalletAvailable(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = this.parseId(id);
    const member = await this.findMember(userId);
    if (member.status === 2) throw Err.conflict('已注销会员不能调整钱包');
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 2 || reason.length > 256) throw Err.param('请填写 2–256 个字符的清零原因');
    return this.adjust.clearWalletAvailable(userId, reason, operator.id, idempotencyKey);
  }

  @Post(':id/transfer-quota/grant')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async grantTransferQuota(
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = this.parseId(id);
    const member = await this.findMember(userId);
    if (member.status === 2) throw Err.conflict('已注销会员不能增加权益通');
    if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
      throw Err.param('权益通增加额度必须为大于 0 的整数元');
    }
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 2 || reason.length > 256) throw Err.param('请填写 2–256 个字符的增加原因');
    return this.adjust.grantTransferQuota(userId, BigInt(body.amount), reason, operator.id, idempotencyKey);
  }

  @Post(':id/transfer-quota/adjust')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async adjustTransferQuota(
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = this.parseId(id);
    const member = await this.findMember(userId);
    if (member.status === 2) throw Err.conflict('已注销会员不能调整权益通');
    if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount === 0) {
      throw Err.param('调整额度必须为非零整数元');
    }
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 2 || reason.length > 256) throw Err.param('请填写 2–256 个字符的调整原因');
    return this.adjust.adjustTransferQuota(userId, BigInt(body.amount), reason, operator.id, idempotencyKey);
  }

  @Post(':id/transfer-quota/clear-available')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async clearTransferQuotaAvailable(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const userId = this.parseId(id);
    const member = await this.findMember(userId);
    if (member.status === 2) throw Err.conflict('已注销会员不能调整权益通');
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 2 || reason.length > 256) throw Err.param('请填写 2–256 个字符的清零原因');
    return this.adjust.clearTransferQuotaAvailable(userId, reason, operator.id, idempotencyKey);
  }

  @Post(':id/delete')
  @Roles('SUPER_ADMIN')
  async remove(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() operator: CurrentUserPayload,
    @Req() request: Request,
  ) {
    const userId = this.parseId(id);
    const before = await this.findMember(userId);
    if (before.status === 2) throw Err.conflict('该会员已经注销');
    const reason = body.reason?.trim() ?? '';
    if (reason.length < 2 || reason.length > 256) throw Err.param('请填写注销原因（2–256 个字符）');

    return this.prisma.$transaction(async (tx) => {
      const pendingPlans = await tx.bonusPlan.findMany({
        where: { beneficiaryId: userId, status: { in: ['PENDING', 'RELEASING'] } },
        select: { id: true },
      });
      const pendingPlanIds = pendingPlans.map((plan) => plan.id);
      const cancelledStages = pendingPlanIds.length
        ? await tx.bonusStage.updateMany({ where: { planId: { in: pendingPlanIds }, status: 'PENDING' }, data: { status: 'CANCELLED' } })
        : { count: 0 };
      if (pendingPlanIds.length) {
        await tx.bonusPlan.updateMany({ where: { id: { in: pendingPlanIds } }, data: { status: 'CANCELLED' } });
      }
      const member = await tx.user.update({ where: { id: userId }, data: { status: 2, authVersion: { increment: 1 } } });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId: operator.id, action: 'MEMBER_DELETED', targetType: 'USER', targetId: userId,
          before: { status: before.status, nickname: before.nickname, phone: before.phone ? this.maskPhone(before.phone) : null } as never,
          after: { status: 2, reason, recordsRetained: true, cancelledBonusPlans: pendingPlanIds.length, cancelledBonusStages: cancelledStages.count } as never,
          remark: reason,
          ip: request.ip?.slice(0, 64), ua: request.headers['user-agent']?.slice(0, 512),
        },
      });
      return { id: member.id.toString(), status: member.status, recordsRetained: true };
    });
  }

  private async findMember(id: bigint) {
    const member = await this.prisma.user.findUnique({ where: { id } });
    if (!member || member.role !== 'MEMBER') throw Err.notFound('会员不存在');
    return member;
  }

  private parseId(value: string): bigint {
    if (!/^\d+$/.test(value)) throw Err.param('会员编号无效');
    return BigInt(value);
  }

  private validateNickname(value?: string): string {
    const nickname = value?.trim() ?? '';
    if (nickname.length < 2 || nickname.length > 64) throw Err.param('昵称需为 2–64 个字符');
    return nickname;
  }

  private validatePhone(value?: string): string {
    const phone = value?.trim() ?? '';
    if (!/^1[3-9]\d{9}$/.test(phone)) throw Err.param('请输入有效的 11 位大陆手机号');
    return phone;
  }

  private validatePassword(value?: string): string {
    if (!value || value.length < 8 || value.length > 64) throw Err.param('登录密码长度需为 8–64 位');
    return value;
  }

  private maskPhone(phone: string): string {
    return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }
}
