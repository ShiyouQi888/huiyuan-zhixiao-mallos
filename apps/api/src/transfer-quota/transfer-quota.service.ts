import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessException, Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/** 档位赋予的权益通；记录会员间钱包转出与商城钱包消费的已用金额。 */
@Injectable()
export class TransferQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensure(userId: bigint, tx: Tx = this.prisma) {
    return tx.transferQuotaAccount.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  private remaining(account: { granted: bigint; adjustedOut: bigint; used: bigint; reserved: bigint }) {
    const amount = account.granted - account.adjustedOut - account.used - account.reserved;
    return amount > 0n ? amount : 0n;
  }

  async getAccount(userId: bigint) {
    const account = await this.ensure(userId);
    return { ...account, available: this.remaining(account), repurchaseRequired: account.granted - account.adjustedOut <= account.used };
  }

  async transactions(userId: bigint, page = 1, pageSize = 20) {
    const currentPage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const [list, total] = await Promise.all([
      this.prisma.transferQuotaTransaction.findMany({
        where: { userId }, orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * safePageSize, take: safePageSize,
      }),
      this.prisma.transferQuotaTransaction.count({ where: { userId } }),
    ]);
    return { list, total, page: currentPage, pageSize: safePageSize };
  }

  async grant(
    userId: bigint,
    amount: bigint,
    bizType: string,
    bizId: string,
    remark: string,
    transaction?: Tx,
    transactionType = 1,
  ) {
    if (amount <= 0n) return this.getAccount(userId);
    const apply = async (tx: Tx) => {
      const duplicate = await tx.transferQuotaTransaction.findUnique({ where: { bizType_bizId: { bizType, bizId } } });
      if (duplicate) return this.getAccountInTransaction(userId, tx);
      const account = await this.ensure(userId, tx);
      const granted = account.granted + amount;
      const updated = await tx.transferQuotaAccount.updateMany({
        where: { userId, version: account.version },
        data: { granted, version: { increment: 1 } },
      });
      if (!updated.count) throw new BusinessException(3002, '权益通并发冲突，请重试');
      await tx.transferQuotaTransaction.create({
        data: {
          userId, type: transactionType, changeAmount: amount,
          balanceAfter: this.remaining({ ...account, granted }), bizType, bizId, remark,
        },
      });
      await tx.user.updateMany({ where: { id: userId }, data: { transferQuotaStatus: account.used >= granted - account.adjustedOut ? 1 : 0 } });
      return { ...account, granted, available: this.remaining({ ...account, granted }), repurchaseRequired: account.used >= granted - account.adjustedOut };
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** 手工减少可用权益通，不触碰已消耗额度或进行中的转账预占。 */
  async revoke(
    userId: bigint,
    amount: bigint,
    bizType: string,
    bizId: string,
    remark: string,
    transaction?: Tx,
  ) {
    if (amount <= 0n) return this.getAccount(userId);
    const apply = async (tx: Tx) => {
      const duplicate = await tx.transferQuotaTransaction.findUnique({ where: { bizType_bizId: { bizType, bizId } } });
      if (duplicate) return this.getAccountInTransaction(userId, tx);
      const account = await this.ensure(userId, tx);
      const available = this.remaining(account);
      if (amount > available) throw Err.conflict(`最多可减少 ${available} 元可用权益通`);
      const adjustedOut = account.adjustedOut + amount;
      const updated = await tx.transferQuotaAccount.updateMany({
        where: { userId, version: account.version },
        data: { adjustedOut, version: { increment: 1 } },
      });
      if (!updated.count) throw new BusinessException(3002, '权益通并发冲突，请重试');
      await tx.transferQuotaTransaction.create({
        data: {
          userId, type: 5, changeAmount: -amount,
          balanceAfter: this.remaining({ ...account, adjustedOut }), bizType, bizId, remark,
        },
      });
      await tx.user.updateMany({ where: { id: userId }, data: { transferQuotaStatus: account.used >= account.granted - adjustedOut ? 1 : 0 } });
      return { ...account, adjustedOut, available: this.remaining({ ...account, adjustedOut }), repurchaseRequired: account.used >= account.granted - adjustedOut };
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** 按账户当前版本清零可用权益通，已用与预占额度仍保留。 */
  async clearAvailable(userId: bigint, bizType: string, bizId: string, remark: string, transaction?: Tx) {
    const apply = async (tx: Tx) => {
      const duplicate = await tx.transferQuotaTransaction.findUnique({ where: { bizType_bizId: { bizType, bizId } } });
      if (duplicate) return { ...(await this.getAccountInTransaction(userId, tx)), changed: false, clearedAmount: 0n };
      const account = await this.ensure(userId, tx);
      const amount = this.remaining(account);
      if (amount <= 0n) return { ...account, available: 0n, repurchaseRequired: account.granted - account.adjustedOut <= account.used, changed: false, clearedAmount: 0n };
      const adjustedOut = account.adjustedOut + amount;
      const updated = await tx.transferQuotaAccount.updateMany({
        where: { userId, version: account.version },
        data: { adjustedOut, version: { increment: 1 } },
      });
      if (!updated.count) throw new BusinessException(3002, '权益通余额已变化，请刷新后重试');
      await tx.transferQuotaTransaction.create({
        data: {
          userId, type: 5, changeAmount: -amount, balanceAfter: 0n,
          bizType, bizId, remark,
        },
      });
      await tx.user.updateMany({ where: { id: userId }, data: { transferQuotaStatus: account.used >= account.granted - adjustedOut ? 1 : 0 } });
      return {
        ...account, adjustedOut, available: 0n, repurchaseRequired: account.granted - adjustedOut <= account.used,
        changed: true, clearedAmount: amount,
      };
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  async reserve(userId: bigint, amount: bigint, transferNo: string, transaction: Tx) {
    const bizType = 'wallet_transfer_quota_reserve';
    const duplicate = await transaction.transferQuotaTransaction.findUnique({ where: { bizType_bizId: { bizType, bizId: transferNo } } });
    if (duplicate) return;
    const account = await this.ensure(userId, transaction);
    if (this.remaining(account) < amount) {
      throw Err.conflict('权益通不足，请完成档位复消后继续转出');
    }
    const nextReserved = account.reserved + amount;
    const updated = await transaction.transferQuotaAccount.updateMany({
      where: { userId, version: account.version },
      data: { reserved: nextReserved, version: { increment: 1 } },
    });
    if (!updated.count) throw new BusinessException(3002, '权益通并发冲突，请重试');
    await transaction.transferQuotaTransaction.create({
      data: {
        userId, type: 2, changeAmount: -amount,
        balanceAfter: this.remaining({ ...account, reserved: nextReserved }),
        bizType, bizId: transferNo, remark: '钱包转账待确认，额度预占',
      },
    });
  }

  /** 商城商品订单以钱包支付时按实际扣款全额记入消耗；可用权益通最低为 0。 */
  async consumeWalletSpend(userId: bigint, amount: bigint, orderNo: string, transaction: Tx) {
    if (amount <= 0n) return;
    const bizType = 'wallet_product_spend';
    const duplicate = await transaction.transferQuotaTransaction.findUnique({
      where: { bizType_bizId: { bizType, bizId: orderNo } },
    });
    if (duplicate) return;

    const user = await transaction.user.findUnique({ where: { id: userId }, select: { packageId: true } });
    if (!user?.packageId) return;

    const account = await this.ensure(userId, transaction);
    const available = this.remaining(account);
    if (amount > available) {
      throw Err.conflict(`商城消费将超过可用权益通（当前可用 ${available.toLocaleString('zh-CN')} 元），请调整订单金额后重试`);
    }
    const used = account.used + amount;
    const updated = await transaction.transferQuotaAccount.updateMany({
      where: { userId, version: account.version },
      data: { used, version: { increment: 1 } },
    });
    if (!updated.count) throw new BusinessException(3002, '权益通并发冲突，请重试');

    await transaction.transferQuotaTransaction.create({
      data: {
        userId,
        type: 6,
        changeAmount: -amount,
        balanceAfter: this.remaining({ ...account, used }),
        bizType,
        bizId: orderNo,
        remark: `商城订单 ${orderNo} 钱包消费，消耗权益通 ${amount} 元`,
      },
    });
    await transaction.user.updateMany({
      where: { id: userId, packageId: { not: null } },
      data: { transferQuotaStatus: account.granted - account.adjustedOut <= used ? 1 : 0 },
    });
  }

  async consumeReserved(userId: bigint, amount: bigint, transferNo: string, transaction: Tx) {
    const bizType = 'wallet_transfer_quota_consume';
    const duplicate = await transaction.transferQuotaTransaction.findUnique({ where: { bizType_bizId: { bizType, bizId: transferNo } } });
    if (duplicate) return;
    const account = await this.ensure(userId, transaction);
    if (account.reserved < amount) throw new BusinessException(3002, '权益通预占记录不完整，暂无法确认转账');
    const used = account.used + amount;
    const reserved = account.reserved - amount;
    const updated = await transaction.transferQuotaAccount.updateMany({
      where: { userId, version: account.version },
      data: { used, reserved, version: { increment: 1 } },
    });
    if (!updated.count) throw new BusinessException(3002, '权益通并发冲突，请重试');
    await transaction.transferQuotaTransaction.create({
      data: {
        // Pre-reservation already reduced available quota; confirmation only moves
        // the amount from reserved to used, so it must not reduce the ledger again.
        userId, type: 4, changeAmount: 0n,
        balanceAfter: this.remaining({ ...account, used, reserved }),
        bizType, bizId: transferNo, remark: `钱包转出 ${amount} 元已确认，额度从预占转为已用`,
      },
    });
    await transaction.user.updateMany({ where: { id: userId }, data: { transferQuotaStatus: account.granted - account.adjustedOut <= used ? 1 : 0 } });
  }

  async release(userId: bigint, amount: bigint, transferNo: string, transaction: Tx) {
    const bizType = 'wallet_transfer_quota_release';
    const duplicate = await transaction.transferQuotaTransaction.findUnique({ where: { bizType_bizId: { bizType, bizId: transferNo } } });
    if (duplicate) return;
    const account = await this.ensure(userId, transaction);
    if (account.reserved < amount) throw new BusinessException(3002, '权益通预占记录不完整，暂无法返还');
    const reserved = account.reserved - amount;
    const updated = await transaction.transferQuotaAccount.updateMany({
      where: { userId, version: account.version },
      data: { reserved, version: { increment: 1 } },
    });
    if (!updated.count) throw new BusinessException(3002, '权益通并发冲突，请重试');
    await transaction.transferQuotaTransaction.create({
      data: {
        userId, type: 3, changeAmount: amount,
        balanceAfter: this.remaining({ ...account, reserved }),
        bizType, bizId: transferNo, remark: '钱包转账拒绝或超时，返还预占额度',
      },
    });
  }

  async getAccountInTransaction(userId: bigint, tx: Tx) {
    const account = await this.ensure(userId, tx);
    return { ...account, available: this.remaining(account), repurchaseRequired: account.granted - account.adjustedOut <= account.used };
  }
}
