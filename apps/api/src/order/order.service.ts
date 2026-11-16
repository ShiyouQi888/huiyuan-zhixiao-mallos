import { Injectable } from '@nestjs/common';
import { BusinessException, Err } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { EquityService } from '../equity/equity.service';
import { PACKAGE_SEEDS } from '@solar/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

export interface CreateOrderParams {
  userId: bigint;
  type: number;              // 1 新购 2 升级 3 复消 4 普通商品
  packageId?: number;
  productId?: bigint;
  addressId?: bigint;
  quantity?: number;
  useEquity?: boolean;
  useBalance?: boolean;
  remark?: string;
}

/** 订单：状态机 CREATED → PAID → DELIVERED → COMPLETED（无退款） */
@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly equity: EquityService,
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
  ) {}

  private orderNo(): string {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${date}${Math.floor(Math.random() * 900000 + 100000)}`;
  }

  /** 下单：权益值（FIFO）→ 钱包余额 → 现金差额，扣款成功后订单直接为 PAID */
  async create(params: CreateOrderParams) {
    const user = await this.prisma.user.findUnique({ where: { id: params.userId } });
    if (!user || user.status !== 0) throw Err.notFound('用户不存在或已冻结');

    let amount = 0n;
    let packageRow: { id: number; price: bigint; equityValue: bigint; durationDays: number } | null = null;
    let shippingAddress: { receiver: string; phone: string; province: string; city: string; district: string; detail: string } | null = null;

    if (params.type === 1 || params.type === 2 || params.type === 3) {
      const pkg = await this.prisma.package.findUnique({ where: { id: params.packageId ?? 0 } });
      if (!pkg || pkg.status !== 1) throw Err.notFound('档位不存在或已停用');
      packageRow = pkg;
      if (params.type === 2) {
        if (!user.packageId || pkg.price <= (await this.prisma.package.findUnique({ where: { id: user.packageId } }))!.price) {
          throw Err.param('升级档位必须高于当前档位');
        }
        amount = pkg.price - (await this.prisma.package.findUnique({ where: { id: user.packageId } }))!.price;
      } else {
        amount = pkg.price;
      }
    } else if (params.type === 4) {
      const product = await this.prisma.product.findUnique({
        where: { id: params.productId ?? 0n },
        include: { packageBinds: { select: { packageId: true, exclusivePrice: true } } },
      });
      if (!product || product.status !== 1) throw Err.notFound('商品不存在或已下架');
      const quantity = Number(params.quantity ?? 1);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw Err.param('商品数量不合法');
      if (product.stock < quantity) throw Err.conflict('商品库存不足');
      if (product.packageBinds.length > 0 && (!user.packageId || !product.packageBinds.some((bind) => bind.packageId === user.packageId))) {
        throw Err.forbidden('当前会员等级不可购买该商品');
      }
      const priceBind = user.packageId ? product.packageBinds.find((bind) => bind.packageId === user.packageId) : undefined;
      const productPrice = priceBind?.exclusivePrice ?? product.price;
      amount = productPrice * BigInt(quantity);
      if (!params.addressId) throw Err.param('购买实物商品前请先选择收货地址');
      const address = await this.prisma.userAddress.findFirst({ where: { id: params.addressId, userId: params.userId } });
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

    const no = this.orderNo();

    // 扣款顺序：权益值 → 钱包余额 → 现金差额（幂等键均为订单号）
    let equityDeduct = 0n;
    let balanceDeduct = 0n;
    if (params.useEquity !== false) {
      const usages = await this.equity.deductFIFO(params.userId, amount, 'order_equity', no, 2);
      equityDeduct = usages.reduce((s, u) => s + u.amount, 0n);
    }
    const rest = amount - equityDeduct;
    if (rest > 0n && params.useBalance !== false) {
      const acc = await this.wallet.get(params.userId);
      const usable = acc.balance - acc.frozen < rest ? acc.balance - acc.frozen : rest;
      if (usable > 0n) {
        await this.wallet.debit(params.userId, usable, 'order_balance', no, `订单 ${no} 余额抵扣`);
        balanceDeduct = usable;
      }
    }
    const cashPay = amount - equityDeduct - balanceDeduct;

    const order = await this.prisma.order.create({
      data: {
        orderNo: no,
        userId: params.userId,
        type: params.type,
        isRepurchase: params.type === 3,
        packageId: packageRow?.id ?? null,
        fromPackageId: params.type === 2 ? user.packageId : null,
        amount,
        equityDeduct,
        balanceDeduct,
        cashPay,
        ...(shippingAddress ? { shippingAddress: shippingAddress as never } : {}),
        status: 1, // PAID
        parentIdSnapshot: user.parentId,
        remark: params.remark,
        paidAt: new Date(),
        items: params.type === 4 && params.productId
          ? {
              create: {
                productId: params.productId,
                name: (await this.prisma.product.findUnique({ where: { id: params.productId } }))?.name ?? '商品',
                price: amount / BigInt(params.quantity ?? 1),
                quantity: params.quantity ?? 1,
                amount,
              },
            }
          : undefined,
      },
    });

    // 订单进入 PAID 后等待管理端交付；会员确认或自动确认后才结算业绩。
    return order;
  }

  /** 确认收货 → COMPLETED：写业绩、发权益值、建直推奖计划、更新档位与计酬状态 */
  async complete(orderNo: string, userId?: bigint) {
    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order) throw Err.notFound('订单不存在');
    if (userId && order.userId !== userId) throw Err.forbidden();
    if (order.status === 3) return order; // 幂等
    if (order.status !== 2) throw Err.conflict('订单状态不允许确认');

    const now = new Date();
    const pkg = order.packageId ? await this.prisma.package.findUnique({ where: { id: order.packageId } }) : null;
    const isPackage = order.type === 1 || order.type === 2 || order.type === 3;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 3, finishedAt: now },
      });

      // 业绩 = 订单总额（全额，不区分现金还是抵扣）
      await tx.orderPerformance.create({
        data: { orderId: order.id, userId: order.userId, amount: order.amount, occurDate: now },
      });

      if (!isPackage || !pkg) return;

      // 更新用户档位与计酬状态
      await tx.user.update({
        where: { id: order.userId },
        data: {
          packageId: pkg.id,
          packageExpireAt: new Date(now.getTime() + pkg.durationDays * 86400_000),
          equityStatus: 0, // 复购恢复计酬
        },
      });

      // 权益值 = 礼包价 × 3；升级只补差额，不回收已用部分
      let grantAmount = pkg.equityValue;
      if (order.type === 2 && order.fromPackageId) {
        const oldPkg = await tx.package.findUnique({ where: { id: order.fromPackageId } });
        grantAmount = pkg.equityValue - (oldPkg?.equityValue ?? 0n);
      }
      if (grantAmount > 0n) {
        const expireAt = new Date(now);
        expireAt.setMonth(expireAt.getMonth() + Number(await this.config.getNumber('equity.expire_months', 12)));
        await this.equity.grant(
          order.userId,
          grantAmount,
          order.type === 2 ? 'UPGRADE' : 'GRANT',
          order.orderNo,
          expireAt,
          `order_${order.type}_${order.orderNo}`,
        );
      }

      // 直推奖计划：新购/升级 100%，复消 10%，分 20 期
      if (order.parentIdSnapshot) {
        const rate = await this.config.getNumber(
          order.type === 3 ? 'bonus.repurchase_rate' : 'bonus.reward_rate',
          order.type === 3 ? 0.1 : 1.0,
        );
        const total = BigInt(Math.round(Number(order.amount) * rate));
        const periods = await this.config.getNumber('bonus.direct_periods', 20);
        if (total > 0n) {
          const startAt = new Date(now);
          startAt.setHours(0, 0, 0, 0);
          startAt.setDate(startAt.getDate() + 1);
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
            due.setDate(due.getDate() + i - 1);
            await tx.bonusStage.create({
              data: { planId: plan.id, periodNo: i, amount: total / BigInt(periods), dueAt: due, status: 'PENDING' },
            });
          }
        }
      }
    });

    return this.prisma.order.findUnique({ where: { id: order.id } });
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
