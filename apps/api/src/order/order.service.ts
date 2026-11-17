import { Injectable, OnModuleInit } from '@nestjs/common';
import { Order as PrismaOrder, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BonusService } from '../bonus/bonus.service';
import { allocateDirectStages, splitDirectBonus } from '../bonus/direct-plan';
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
export class OrderService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transferQuota: TransferQuotaService,
    private readonly wallet: WalletService,
    private readonly bonus: BonusService,
    private readonly config: ConfigService,
  ) {}

  private orderNo(): string {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  /** Recover paid orders created before payment-time accounting was enabled. */
  async onModuleInit() {
    while (true) {
      const pending = await this.prisma.order.findMany({
        where: { status: { in: [1, 2] }, businessEffectsAppliedAt: null },
        orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      if (!pending.length) break;
      for (const order of pending) {
        await this.prisma.$transaction(async (tx) => {
          const current = await tx.order.findUnique({ where: { id: order.id } });
          if (!current || ![1, 2].includes(current.status) || current.businessEffectsAppliedAt) return;
          await this.applyPaidEffects(tx, current);
        });
      }
      if (pending.length < 100) break;
    }
  }

  /** Book PV, package rights and direct-reward plans atomically with successful payment. */
  private async applyPaidEffects(tx: Prisma.TransactionClient, order: PrismaOrder) {
    if (order.businessEffectsAppliedAt) return;
    const paidAt = order.paidAt ?? order.createdAt;
    await tx.orderPerformance.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, userId: order.userId, amount: order.pvAmount, occurDate: paidAt },
      update: {},
    });

    if (order.type === 4) {
      // 普通商品：已购卡会员的商品消费视为「复消」——发权益通 + 按复消比例发直推奖；
      // 未购卡会员的商品消费只累计 PV（与 type=3 复消的前置条件保持一致）。
      if (order.isRepurchase && order.pvAmount > 0n) {
        await this.transferQuota.grant(
          order.userId,
          order.pvAmount * 3n,
          'product_repurchase',
          order.orderNo,
          '会员普通商品订单支付成功，按订单PV的3倍发放权益通',
          tx,
        );
        await this.createDirectPlan(
          tx,
          order,
          paidAt,
          Number(await this.config.getNumber('bonus.repurchase_rate', 0.1)),
          Number(await this.config.getNumber('bonus.direct_periods', 20)),
        );
      }
      await tx.order.update({ where: { id: order.id }, data: { businessEffectsAppliedAt: new Date() } });
      return;
    }

    const pkg = order.packageId ? await tx.package.findUnique({ where: { id: order.packageId } }) : null;
    if (!pkg) throw Err.conflict('订单档位信息不存在，无法登记支付权益');
    await tx.user.update({
      where: { id: order.userId },
      data: {
        packageId: pkg.id,
        packageExpireAt: new Date(paidAt.getTime() + pkg.durationDays * 86400_000),
        transferQuotaStatus: 0,
      },
    });

    let grantAmount = pkg.pv * 3n;
    if (order.type === 2 && order.fromPackageId) {
      const oldPkg = await tx.package.findUnique({ where: { id: order.fromPackageId } });
      grantAmount = (pkg.pv - (oldPkg?.pv ?? 0n)) * 3n;
    }
    if (grantAmount > 0n) {
      await this.transferQuota.grant(
        order.userId,
        grantAmount,
        `package_${order.type}`,
        order.orderNo,
        order.type === 3 ? '会员复消支付成功，新增权益通' : order.type === 2 ? '会员升级支付成功，补充权益通差额' : '会员开通档位支付成功，获得权益通',
        tx,
      );
    }

    const rate = order.type === 3
      ? Number(pkg.repurchaseRewardRate ?? await this.config.getNumber('bonus.repurchase_rate', 0.1))
      : Number(pkg.directRewardRate ?? await this.config.getNumber('bonus.reward_rate', 1.0));
    const periods = Number(pkg.directReleaseDays ?? await this.config.getNumber('bonus.direct_periods', 20));
    await this.createDirectPlan(tx, order, paidAt, rate, periods);
    await tx.order.update({ where: { id: order.id }, data: { businessEffectsAppliedAt: new Date() } });
  }

  /**
   * 创建直推奖计划：**先拆，后分期**。
   * 1) 先按 bonus.cash_ratio 把奖金总额拆成现金（分期释放）与太阳值（一次性入账）；
   * 2) 现金部分再均分到各期，余数补最后一期，保证 Σ各期 === 现金部分。
   * 幂等：同一订单只建一个计划（orderId 唯一），已有计划或推荐人不可用时直接跳过。
   */
  private async createDirectPlan(
    tx: Prisma.TransactionClient,
    order: PrismaOrder,
    paidAt: Date,
    rate: number,
    periods: number,
  ) {
    if (!order.parentIdSnapshot) return;
    const total = BigInt(Math.round(Number(order.pvAmount) * rate));
    if (total <= 0n) return;
    if (await tx.bonusPlan.findUnique({ where: { orderId: order.id } })) return;
    const recipient = await tx.user.findUnique({ where: { id: order.parentIdSnapshot }, select: { status: true } });
    if (recipient?.status !== 0) return;

    const safePeriods = Number.isSafeInteger(periods) && periods > 0 ? periods : 20;
    const cashRatio = await this.config.getNumber('bonus.cash_ratio', 0.7);
    const { cashTotal, tokenTotal } = splitDirectBonus(total, cashRatio);
    const stageAmounts = allocateDirectStages(cashTotal, safePeriods);
    const startAt = new Date(paidAt);
    startAt.setUTCHours(0, 0, 0, 0);
    startAt.setUTCDate(startAt.getUTCDate() + 1);
    const plan = await tx.bonusPlan.create({
      data: {
        orderId: order.id,
        beneficiaryId: order.parentIdSnapshot,
        // 计划总额只统计「参与分期释放的现金部分」，太阳值不占用分期额度
        totalAmount: cashTotal,
        dailyAmount: cashTotal / BigInt(safePeriods),
        periods: safePeriods,
        status: 'PENDING',
        startAt,
        splitAt: new Date(),
      },
    });
    if (tokenTotal > 0n) {
      // 太阳值部分支付成功即到账（不参与分期），按 planId 幂等
      await this.bonus.creditDirectTokenPortion(
        {
          userId: order.parentIdSnapshot,
          amount: tokenTotal,
          settleDate: paidAt,
          sourceOrderId: order.id,
          planId: plan.id,
        },
        tx,
      );
    }
    for (let i = 1; i <= safePeriods; i++) {
      const dueAt = new Date(startAt);
      dueAt.setUTCDate(dueAt.getUTCDate() + i - 1);
      await tx.bonusStage.create({
        data: { planId: plan.id, periodNo: i, amount: stageAmounts[i - 1], dueAt, status: 'PENDING' },
      });
    }
  }

  /** 订单由钱包余额支付；权益通仅用于约束会员间钱包转出。 */
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
        const order = await tx.order.findUniqueOrThrow({ where: { orderNo } });
        if ([1, 2].includes(order.status) && !order.businessEffectsAppliedAt) await this.applyPaidEffects(tx, order);
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
      let pvAmount = 0n;
      let itemPv = 0n;
      let packageRow: { id: number; level: number; price: bigint; transferQuota: bigint; durationDays: number } | null = null;
      let shippingAddress: { receiver: string; phone: string; province: string; city: string; district: string; detail: string } | null = null;
      let productName: string | null = null;
      const quantity = Number(params.quantity ?? 1);
      let isRepurchase = false;

      if (params.type === 1 || params.type === 2 || params.type === 3) {
        const pkg = await tx.package.findUnique({ where: { id: params.packageId ?? 0 } });
        if (!pkg || pkg.status !== 1) throw Err.notFound('礼包不存在或已停用');
        packageRow = pkg;
        if (params.type === 1) {
          if (user.packageId !== null) throw Err.conflict('该会员已购买礼包，请使用升级或复消流程');
          amount = pkg.price;
          pvAmount = pkg.pv;
        } else if (params.type === 2) {
          if (user.packageId === null) throw Err.conflict('尚未购买礼包的会员不能升级');
          const currentPackage = await tx.package.findUnique({ where: { id: user.packageId } });
          if (!currentPackage) throw Err.conflict('当前礼包档案不存在，无法计算升级差价');
          if (pkg.level <= currentPackage.level || pkg.price <= currentPackage.price) throw Err.param('升级档位必须高于当前档位且价格更高');
          if (pkg.pv < currentPackage.pv) throw Err.param('目标档位PV低于当前档位，无法按PV差额升级');
          amount = pkg.price - currentPackage.price;
          pvAmount = pkg.pv - currentPackage.pv;
        } else {
          isRepurchase = true;
          if (user.packageId === null) throw Err.conflict('尚未购买礼包的会员不能复消');
          const quota = await tx.transferQuotaAccount.findUnique({ where: { userId: params.userId } });
          if (quota && quota.granted - quota.adjustedOut > quota.used) throw Err.conflict('权益通尚未用完，当前不能复消');
          amount = pkg.price;
          pvAmount = pkg.pv;
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
        itemPv = product.pv;
        pvAmount = itemPv * BigInt(quantity);
        productName = product.name;
        // 会员普通商品购买均记作复消订单；权益通随支付成功即时入账。
        isRepurchase = user.packageId !== null;
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
          isRepurchase,
          packageId: packageRow?.id ?? null,
          fromPackageId: params.type === 2 ? user.packageId : null,
          amount,
          pvAmount,
          equityDeduct: 0n,
          balanceDeduct,
          cashPay,
          ...(shippingAddress ? { shippingAddress: shippingAddress as never } : {}),
          status: 1,
          parentIdSnapshot: rewardParentId,
          remark: params.remark,
          paidAt: new Date(),
          items: params.type === 4 && params.productId
            ? { create: { productId: params.productId, name: productName ?? '商品', price: amount / BigInt(quantity), pv: itemPv, quantity, amount } }
            : undefined,
        },
      });

      if (params.type === 4 && params.productId) {
        const updated = await tx.product.updateMany({
          where: { id: params.productId, stock: { gte: quantity }, status: 1 },
          data: { stock: { decrement: quantity } },
        });
        if (!updated.count) throw Err.conflict('商品库存不足，请刷新后重试');
      }
      await this.applyPaidEffects(tx, order);
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { result: { orderNo: order.orderNo } } });
      return tx.order.findUniqueOrThrow({ where: { id: order.id } });
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

  /** 确认收货只更新订单状态；业务效果已在支付成功时记账。 */
  async complete(orderNo: string, userId?: bigint) {
    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order) throw Err.notFound('订单不存在');
    if (userId && order.userId !== userId) throw Err.forbidden();
    if (order.status === 3) return order; // 幂等
    if (order.status !== 2) throw Err.conflict('订单状态不允许确认');

    const completed = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: 2 },
        data: { status: 3, finishedAt: new Date() },
      });
      if (!claimed.count) {
        const current = await tx.order.findUnique({ where: { id: order.id } });
        if (current?.status === 3) return current;
        throw Err.conflict('订单状态已变化，请刷新后重试');
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
          items: { select: { name: true, price: true, pv: true, quantity: true, amount: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }
}
