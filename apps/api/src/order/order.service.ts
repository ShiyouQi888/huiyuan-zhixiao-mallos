import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BusinessException, Err } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransferQuotaService } from '../transfer-quota/transfer-quota.service';
import { WalletService } from '../wallet/wallet.service';
import { idempotencyScene, requireIdempotencyKey } from '../common/idempotency';

export interface CreateOrderParams {
  userId: bigint;
  type: number;              // 1 新购 2 升级 3 复消 4 普通商品
  packageId?: number;
  productId?: bigint;
  addressId?: bigint;
  quantity?: number;
  useBalance?: boolean;
  remark?: string;
}

/** 订单：状态机 CREATED → PAID → DELIVERED → COMPLETED（无退款） */
@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transferQuota: TransferQuotaService,
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
  ) {}

  private orderNo(): string {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  /** 订单由钱包余额支付；商品消费会扣减权益通，礼包订单仅发放权益通。 */
  async create(params: CreateOrderParams, rawIdempotencyKey?: string) {
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    const scene = idempotencyScene('order.create', params);
    const no = this.orderNo();
    const createInTransaction = async (tx: Prisma.TransactionClient) => {
      const previous = await tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (previous && previous.expireAt > new Date()) {
        if (previous.scene !== scene) throw Err.conflict('该请求幂等键已用于其他订单内容，请重新提交');
        const orderNo = (previous.result as { orderNo?: string } | null)?.orderNo;
        if (!orderNo) throw Err.conflict('订单请求正在处理中，请稍后刷新订单列表');
        return tx.order.findUniqueOrThrow({ where: { orderNo } });
      }
      if (previous) await tx.idempotencyKey.delete({ where: { key: idempotencyKey } });
      await tx.idempotencyKey.create({
        data: { key: idempotencyKey, scene, expireAt: new Date(Date.now() + 24 * 60 * 60_000) },
      });
      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user || user.role !== 'MEMBER' || user.status !== 0) throw Err.notFound('会员不存在或账号不可用');
      let rewardParentId = user.parentId;
      if (rewardParentId) {
        const parent = await tx.user.findUnique({ where: { id: rewardParentId }, select: { status: true } });
        if (!parent || parent.status === 2) rewardParentId = null;
      }

      let amount = 0n;
      let packageRow: { id: number; level: number; price: bigint; transferQuota: bigint; durationDays: number } | null = null;
      let shippingAddress: { receiver: string; phone: string; province: string; city: string; district: string; detail: string } | null = null;
      let productName: string | null = null;
      const quantity = Number(params.quantity ?? 1);

      if (params.type === 1 || params.type === 2 || params.type === 3) {
        const pkg = await tx.package.findUnique({ where: { id: params.packageId ?? 0 } });
        if (!pkg || pkg.status !== 1) throw Err.notFound('礼包不存在或已停用');
        packageRow = pkg;
        if (params.type === 1) {
          if (user.packageId !== null) throw Err.conflict('该会员已购买礼包，请使用升级或复消流程');
          amount = pkg.price;
        } else if (params.type === 2) {
          if (user.packageId === null) throw Err.conflict('尚未购买礼包的会员不能升级');
          const currentPackage = await tx.package.findUnique({ where: { id: user.packageId } });
          if (!currentPackage) throw Err.conflict('当前礼包档案不存在，无法计算升级差价');
          if (pkg.level <= currentPackage.level || pkg.price <= currentPackage.price) throw Err.param('升级档位必须高于当前档位且价格更高');
          amount = pkg.price - currentPackage.price;
        } else {
          if (user.packageId === null) throw Err.conflict('尚未购买礼包的会员不能复消');
          const quota = await tx.transferQuotaAccount.findUnique({ where: { userId: params.userId } });
          if (quota && quota.granted - quota.adjustedOut > quota.used) throw Err.conflict('权益通尚未用完，当前不能复消');
          amount = pkg.price;
        }
      } else if (params.type === 4) {
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw Err.param('商品数量须为 1 至 99 件');
        const product = await tx.product.findUnique({
          where: { id: params.productId ?? 0n },
          include: { packageBinds: { select: { packageId: true, exclusivePrice: true } } },
        });
        if (!product || product.status !== 1) throw Err.notFound('商品不存在或已下架');
        if (product.stock < quantity) throw Err.conflict('商品库存不足');
        if (product.packageBinds.length > 0 && (!user.packageId || !product.packageBinds.some((bind) => bind.packageId === user.packageId))) {
          throw Err.forbidden('当前会员等级不可购买该商品');
        }
        const priceBind = user.packageId ? product.packageBinds.find((bind) => bind.packageId === user.packageId) : undefined;
        amount = (priceBind?.exclusivePrice ?? product.price) * BigInt(quantity);
        productName = product.name;
        if (!params.addressId) throw Err.param('购买实物商品前请先选择收货地址');
        const address = await tx.userAddress.findFirst({ where: { id: params.addressId, userId: params.userId } });
        if (!address) throw Err.notFound('收货地址不存在，请刷新后重新选择');
        shippingAddress = {
          receiver: address.receiver,
          phone: address.phone,
          province: address.province,
          city: address.city,
          district: address.district,
          detail: address.detail,
        };
      } else {
        throw Err.param('订单类型不合法');
      }

      let balanceDeduct = 0n;
      if (params.useBalance !== false) {
        const account = await this.wallet.get(params.userId, tx);
        const available = account.balance - account.frozen;
        balanceDeduct = available < amount ? available : amount;
        if (params.type === 4 && user.packageId !== null && balanceDeduct > 0n) {
          const quota = await tx.transferQuotaAccount.findUnique({ where: { userId: params.userId } });
          const quotaAvailable = quota
            ? quota.granted - quota.adjustedOut - quota.used - quota.reserved
            : 0n;
          const safeQuotaAvailable = quotaAvailable > 0n ? quotaAvailable : 0n;
          if (balanceDeduct > safeQuotaAvailable) {
            throw Err.conflict(`本次钱包消费将超过可用权益通，当前可用 ${safeQuotaAvailable.toLocaleString('zh-CN')} 元，请减少购买金额或完成复消后再下单`);
          }
        }
        if (balanceDeduct > 0n) await this.wallet.debit(params.userId, balanceDeduct, 'order_balance', no, `订单 ${no} 余额抵扣`, tx);
      }
      const cashPay = amount - balanceDeduct;
      if (cashPay > 0n) {
        throw Err.conflict('订单仍需现金支付，但系统尚未配置现金支付渠道。请补足钱包余额后重试');
      }
      const order = await tx.order.create({
        data: {
          orderNo: no,
          userId: params.userId,
          type: params.type,
          isRepurchase: params.type === 3,
          packageId: packageRow?.id ?? null,
          fromPackageId: params.type === 2 ? user.packageId : null,
          amount,
          equityDeduct: 0n,
          balanceDeduct,
          cashPay,
          ...(shippingAddress ? { shippingAddress: shippingAddress as never } : {}),
          status: 1,
          parentIdSnapshot: rewardParentId,
          remark: params.remark,
          paidAt: new Date(),
          items: params.type === 4 && params.productId
            ? { create: { productId: params.productId, name: productName ?? '商品', price: amount / BigInt(quantity), quantity, amount } }
            : undefined,
        },
      });

      if (params.type === 4 && balanceDeduct > 0n) {
        await this.transferQuota.consumeWalletSpend(params.userId, balanceDeduct, order.orderNo, tx);
      }

      if (params.type === 4 && params.productId) {
        const updated = await tx.product.updateMany({
          where: { id: params.productId, stock: { gte: quantity }, status: 1 },
          data: { stock: { decrement: quantity } },
        });
        if (!updated.count) throw Err.conflict('商品库存不足，请刷新后重试');
      }
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { result: { orderNo: order.orderNo } } });
      return order;
    };
    try {
      return await this.prisma.$transaction(createInTransaction);
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const previous = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (!previous || previous.scene !== scene) throw error;
      const orderNo = (previous.result as { orderNo?: string } | null)?.orderNo;
      if (!orderNo) throw Err.conflict('订单请求正在处理中，请稍后刷新订单列表');
      return this.prisma.order.findUniqueOrThrow({ where: { orderNo } });
    }
  }

  /** 确认收货 → COMPLETED：写业绩、发放权益通、建直推奖计划并更新档位 */
  async complete(orderNo: string, userId?: bigint) {
    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order) throw Err.notFound('订单不存在');
    if (userId && order.userId !== userId) throw Err.forbidden();
    if (order.status === 3) return order; // 幂等
    if (order.status !== 2) throw Err.conflict('订单状态不允许确认');

    const now = new Date();
    const pkg = order.packageId ? await this.prisma.package.findUnique({ where: { id: order.packageId } }) : null;
    const isPackage = order.type === 1 || order.type === 2 || order.type === 3;

    const completed = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: 2 },
        data: { status: 3, finishedAt: now },
      });
      if (!claimed.count) {
        const current = await tx.order.findUnique({ where: { id: order.id } });
        if (current?.status === 3) return current;
        throw Err.conflict('订单状态已变化，请刷新后重试');
      }

      // 业绩 = 订单总额（全额，不区分现金还是抵扣）
      await tx.orderPerformance.create({
        data: { orderId: order.id, userId: order.userId, amount: order.amount, occurDate: now },
      });

      if (!isPackage || !pkg) return tx.order.findUniqueOrThrow({ where: { id: order.id } });

      // 更新用户档位与计酬状态
      await tx.user.update({
        where: { id: order.userId },
        data: {
          packageId: pkg.id,
          packageExpireAt: new Date(now.getTime() + pkg.durationDays * 86400_000),
          transferQuotaStatus: 0,
        },
      });

      // 权益通：新购/复消发放所选档位额度，升级仅补档位差额。
      let grantAmount = pkg.transferQuota;
      if (order.type === 2 && order.fromPackageId) {
        const oldPkg = await tx.package.findUnique({ where: { id: order.fromPackageId } });
        grantAmount = pkg.transferQuota - (oldPkg?.transferQuota ?? 0n);
      }
      if (grantAmount > 0n) {
        await this.transferQuota.grant(
          order.userId,
          grantAmount,
          `package_${order.type}`,
          order.orderNo,
          order.type === 3 ? '会员复消，新增权益通' : order.type === 2 ? '会员升级，补充权益通差额' : '会员开通档位，获得权益通',
          tx,
        );
      }

      // 直推奖按礼包档位覆盖值计算，未设置时继承全局参数；生成后由计划和期次快照锁定
      const rewardRecipient = order.parentIdSnapshot
        ? await tx.user.findUnique({ where: { id: order.parentIdSnapshot }, select: { status: true } })
        : null;
      if (order.parentIdSnapshot && rewardRecipient?.status === 0) {
        const rate = order.type === 3
          ? Number(pkg.repurchaseRewardRate ?? await this.config.getNumber('bonus.repurchase_rate', 0.1))
          : Number(pkg.directRewardRate ?? await this.config.getNumber('bonus.reward_rate', 1.0));
        const total = BigInt(Math.round(Number(order.amount) * rate));
        const periods = Number(pkg.directReleaseDays ?? await this.config.getNumber('bonus.direct_periods', 20));
        if (total > 0n) {
          // 统一 UTC 口径：第 1 期到期 = 订单完成日次日 UTC 00:00（与结算日 UTC 00:00 对齐，避免时区边界漂移）
          const startAt = new Date(now);
          startAt.setUTCHours(0, 0, 0, 0);
          startAt.setUTCDate(startAt.getUTCDate() + 1);
          const plan = await tx.bonusPlan.create({
            data: {
              orderId: order.id,
              beneficiaryId: order.parentIdSnapshot,
              totalAmount: total,
              dailyAmount: total / BigInt(periods),
              periods,
              status: 'PENDING',
              startAt,
            },
          });
          for (let i = 1; i <= periods; i++) {
            const due = new Date(startAt);
            due.setUTCDate(due.getUTCDate() + i - 1);
            await tx.bonusStage.create({
              data: { planId: plan.id, periodNo: i, amount: total / BigInt(periods), dueAt: due, status: 'PENDING' },
            });
          }
        }
      }
      return tx.order.findUniqueOrThrow({ where: { id: order.id } });
    });

    return completed;
  }

  async detail(orderNo: string, userId?: bigint) {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
      include: { items: true, performance: true, bonusPlan: true },
    });
    if (!order) throw Err.notFound('订单不存在');
    if (userId && order.userId !== userId) throw Err.forbidden('无权查看该订单');
    return order;
  }

  async list(userId?: bigint, page = 1, pageSize = 20) {
    const where = userId ? { userId } : {};
    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, nickname: true, phone: true } },
          package: { select: { name: true, level: true } },
          items: { select: { name: true, price: true, quantity: true, amount: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }
}
