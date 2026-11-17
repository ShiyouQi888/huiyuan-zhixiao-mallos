import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessException } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransferQuotaService } from '../transfer-quota/transfer-quota.service';
import { idempotencyScene, requireIdempotencyKey } from '../common/idempotency';

type Tx = Prisma.TransactionClient;

/** 管理端手工调整：所有调整都写流水 + 审计，不直接改余额 */
@Injectable()
export class AdminAdjustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transferQuota: TransferQuotaService,
  ) {}

  private async runIdempotent<T>(
    rawKey: string | undefined,
    operation: string,
    payload: unknown,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    if (!rawKey) return this.prisma.$transaction(work);
    const key = requireIdempotencyKey(rawKey);
    const scene = idempotencyScene(operation, payload);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = await tx.idempotencyKey.findUnique({ where: { key } });
        if (previous && previous.expireAt > new Date()) {
          if (previous.scene !== scene) throw new BusinessException(3003, '该请求幂等键已用于其他财务操作，请重新提交');
          if (previous.result === null) throw new BusinessException(3003, '财务操作正在处理中，请稍后刷新流水');
          return previous.result as T;
        }
        if (previous) await tx.idempotencyKey.delete({ where: { key } });
        await tx.idempotencyKey.create({ data: { key, scene, expireAt: new Date(Date.now() + 86400_000) } });
        const result = await work(tx);
        const resultJson = JSON.parse(JSON.stringify(result, (_name, value) => {
          if (typeof value !== 'bigint') return value;
          const number = Number(value);
          return Number.isSafeInteger(number) ? number : value.toString();
        })) as Prisma.InputJsonValue;
        await tx.idempotencyKey.update({ where: { key }, data: { result: resultJson } });
        return result;
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const previous = await this.prisma.idempotencyKey.findUnique({ where: { key } });
      if (!previous || previous.scene !== scene) throw error;
      if (previous.result === null) throw new BusinessException(3003, '财务操作正在处理中，请稍后刷新流水');
      return previous.result as T;
    }
  }

  /** 钱包余额手工调整（正负均可），写 wallet_transactions 保账 */
  async adjustWallet(userId: bigint, amount: bigint, reason: string, operatorId: bigint, rawKey?: string) {
    if (amount === 0n) throw new BusinessException(1003, '调整金额不能为 0');
    const bizId = `admin_adj_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    return this.runIdempotent(rawKey, 'admin.wallet.adjust', { userId, amount, reason, operatorId },
      (tx) => this.applyWalletAdjustment(tx, userId, amount, reason, operatorId, bizId));
  }

  /** 将可用钱包余额清零，冻结金额保留以覆盖待处理业务。 */
  async clearWalletAvailable(userId: bigint, reason: string, operatorId: bigint, rawKey?: string) {
    const bizId = `admin_wallet_clear_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    return this.runIdempotent(rawKey, 'admin.wallet.clear', { userId, reason, operatorId }, async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
      const available = wallet.balance - wallet.frozen;
      if (available <= 0n) return { balance: wallet.balance, frozen: wallet.frozen, changed: false };
      const updated = await tx.wallet.updateMany({
        where: { userId, version: wallet.version },
        data: { balance: wallet.frozen, totalOut: { increment: available }, version: { increment: 1 } },
      });
      if (!updated.count) throw new BusinessException(3002, '钱包余额已变化，请刷新后重试');
      const transaction = await tx.walletTransaction.create({
        data: { userId, type: 5, changeAmount: -available, balanceAfter: wallet.frozen, bizType: 'admin_clear_available', bizId, remark: reason },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId, action: 'WALLET_CLEARED', targetType: 'USER', targetId: userId,
          after: { amount: (-available).toString(), reason, balanceAfter: wallet.frozen.toString(), frozen: wallet.frozen.toString() } as never,
          remark: reason,
        },
      });
      return {
        balance: wallet.frozen, frozen: wallet.frozen, totalIn: wallet.totalIn,
        totalOut: wallet.totalOut + available, changed: true, transaction,
      };
    });
  }

  private async applyWalletAdjustment(
    tx: Tx,
    userId: bigint,
    amount: bigint,
    reason: string,
    operatorId: bigint,
    bizId: string,
    auditAction = 'WALLET_ADJUST',
  ) {
    const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
    const balanceAfter = wallet.balance + amount;
    if (balanceAfter < wallet.frozen) throw new BusinessException(3001, '调整后余额不能低于冻结金额');

    const updated = await tx.wallet.updateMany({
      where: { userId, version: wallet.version },
      data: {
        balance: balanceAfter,
        ...(amount > 0n ? { totalIn: { increment: amount } } : { totalOut: { increment: -amount } }),
        version: { increment: 1 },
      },
    });
    if (!updated.count) throw new BusinessException(3002, '钱包并发冲突');

    const txRow = await tx.walletTransaction.create({
      data: { userId, type: 5, changeAmount: amount, balanceAfter, bizType: 'admin_adjust', bizId, remark: reason },
    });
    await tx.auditLog.create({
      data: {
        operatorType: 'ADMIN', operatorId, action: auditAction, targetType: 'USER', targetId: userId,
        after: { amount: amount.toString(), reason, balanceAfter: balanceAfter.toString(), frozen: wallet.frozen.toString() } as never,
        remark: reason,
      },
    });
    return {
      balance: balanceAfter,
      frozen: wallet.frozen,
      totalIn: amount > 0n ? wallet.totalIn + amount : wallet.totalIn,
      totalOut: amount < 0n ? wallet.totalOut - amount : wallet.totalOut,
      changed: true,
      transaction: txRow,
    };
  }

  /** 后台增加会员权益通额度，写额度流水与管理审计。 */
  async grantTransferQuota(userId: bigint, amount: bigint, reason: string, operatorId: bigint, rawKey?: string) {
    if (amount <= 0n) throw new BusinessException(1003, '增加额度必须大于 0');
    return this.adjustTransferQuota(userId, amount, reason, operatorId, rawKey);
  }

  /** 正数增加额度，负数减少可用额度；已使用与预占额度不可扣除。 */
  async adjustTransferQuota(userId: bigint, amount: bigint, reason: string, operatorId: bigint, rawKey?: string) {
    if (amount === 0n) throw new BusinessException(1003, '调整额度不能为 0');
    const bizId = `admin_quota_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return this.runIdempotent(rawKey, 'admin.transfer-quota.adjust', { userId, amount, reason, operatorId }, async (tx) => {
      const account = await this.applyQuotaAdjustment(tx, userId, amount, reason, operatorId, bizId);
      return account;
    });
  }

  /** 清零当前可用权益通，不清除已用和预占记录。 */
  async clearTransferQuotaAvailable(userId: bigint, reason: string, operatorId: bigint, rawKey?: string) {
    const bizId = `admin_quota_clear_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    return this.runIdempotent(rawKey, 'admin.transfer-quota.clear', { userId, reason, operatorId }, async (tx) => {
      const account = await this.transferQuota.clearAvailable(userId, 'admin_manual_clear', bizId, reason, tx);
      if (!account.changed) return account;
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN', operatorId, action: 'TRANSFER_QUOTA_CLEARED',
          targetType: 'USER', targetId: userId,
          after: {
            amount: (-account.clearedAmount).toString(), reason,
            granted: account.granted.toString(), adjustedOut: account.adjustedOut.toString(), used: account.used.toString(),
            reserved: account.reserved.toString(), available: account.available.toString(),
          } as never,
          remark: reason,
        },
      });
      return account;
    });
  }

  private async applyQuotaAdjustment(
    tx: Tx,
    userId: bigint,
    amount: bigint,
    reason: string,
    operatorId: bigint,
    bizId: string,
    auditAction?: string,
  ) {
    const account = amount > 0n
      ? await this.transferQuota.grant(userId, amount, 'admin_manual_adjust', bizId, reason, tx, 5)
      : await this.transferQuota.revoke(userId, -amount, 'admin_manual_adjust', bizId, reason, tx);
    await tx.auditLog.create({
      data: {
        operatorType: 'ADMIN', operatorId,
        action: auditAction ?? (amount > 0n ? 'TRANSFER_QUOTA_GRANT' : 'TRANSFER_QUOTA_REDUCE'),
        targetType: 'USER', targetId: userId,
        after: {
          amount: amount.toString(), reason,
          granted: account.granted.toString(), adjustedOut: account.adjustedOut.toString(), used: account.used.toString(),
          reserved: account.reserved.toString(), available: account.available.toString(),
        } as never,
        remark: reason,
      },
    });
    return { ...account, changed: true };
  }

  /** 权益值手工调整：发放用 grant 批次，扣减走 FIFO */
  async adjustEquity(userId: bigint, amount: bigint, reason: string, operatorId: bigint, rawKey?: string) {
    if (amount === 0n) throw new BusinessException(1003, '调整数量不能为 0');
    const bizId = `admin_eq_adj_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return this.runIdempotent(rawKey, 'admin.equity.adjust', { userId, amount, reason, operatorId }, async (tx) => {
      const account = await tx.equityAccount.upsert({ where: { userId }, create: { userId }, update: {} });
      const balanceAfter = account.balance + amount;
      if (balanceAfter < 0n) throw new BusinessException(3001, '调整后权益值不能为负');

      let lotId: bigint | null = null;
      if (amount > 0n) {
        const expireAt = new Date();
        expireAt.setMonth(expireAt.getMonth() + Number(await this.config.getNumber('equity.expire_months', 12)));
        const lot = await tx.equityLot.create({
          data: { userId, amount, remaining: amount, expireAt, status: 'ACTIVE', sourceType: 'GRANT', sourceId: bizId },
        });
        lotId = lot.id;
      } else {
        // FIFO 扣减：从最早到期批次开始
        const deduct = -amount;
        let remain = deduct;
        const lots = await tx.equityLot.findMany({
          where: { userId, status: 'ACTIVE', remaining: { gt: 0n } },
          orderBy: [{ expireAt: 'asc' }, { id: 'asc' }],
        });
        for (const lot of lots) {
          if (remain <= 0n) break;
          const take = lot.remaining < remain ? lot.remaining : remain;
          await tx.equityLot.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } });
          remain -= take;
        }
        if (remain > 0n) throw new BusinessException(3001, '权益值余额不足');
      }

      const updated = await tx.equityAccount.updateMany({
        where: { userId, version: account.version },
        data: {
          balance: balanceAfter,
          version: { increment: 1 },
          ...(amount > 0n ? { totalGranted: { increment: amount } } : { totalUsed: { increment: -amount } }),
        },
      });
      if (!updated.count) throw new BusinessException(3002, '权益值并发冲突');

      await tx.equityTransaction.create({
        data: {
          userId,
          type: 6,
          changeAmount: amount,
          balanceAfter,
          lotId,
          bizType: 'admin_adjust',
          bizId,
        },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN',
          operatorId,
          action: 'EQUITY_ADJUST',
          targetType: 'USER',
          targetId: userId,
          after: { amount: amount.toString(), reason, balanceAfter: balanceAfter.toString() } as never,
        },
      });
      return { userId, amount, balanceAfter };
    });
  }

  /** 奖金手工调整：走 bonus_record 记账 + 钱包入账 */
  async adjustBonus(userId: bigint, amount: bigint, reason: string, operatorId: bigint, rawKey?: string) {
    if (amount <= 0n) throw new BusinessException(1003, '调整金额必须大于 0');
    const now = new Date();
    const bizId = `admin_bonus_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return this.runIdempotent(rawKey, 'admin.bonus.adjust', { userId, amount, reason, operatorId }, async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
      const balanceAfter = wallet.balance + amount;
      await tx.wallet.updateMany({
        where: { userId, version: wallet.version },
        data: { balance: balanceAfter, totalIn: { increment: amount }, version: { increment: 1 } },
      });
      await tx.walletTransaction.create({
        data: { userId, type: 5, changeAmount: amount, balanceAfter, bizType: 'admin_bonus_adjust', bizId, remark: reason },
      });
      const record = await tx.bonusRecord.create({
        data: {
          userId,
          type: 6,
          amount,
          cashAmount: amount,
          tokenAmount: 0n,
          settleDate: now,
        },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN',
          operatorId,
          action: 'BONUS_ADJUST',
          targetType: 'USER',
          targetId: userId,
          after: { amount: amount.toString(), reason, recordId: record.id.toString() } as never,
        },
      });
      return record;
    });
  }
}
