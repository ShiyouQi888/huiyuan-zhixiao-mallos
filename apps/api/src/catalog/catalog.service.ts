import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface ProductInput {
  name: string;
  subtitle?: string;
  description?: string;
  categoryId?: bigint | null;
  images?: string[];
  details?: string[];
  price: number;
  pv?: number;
  originalPrice?: number;
  stock?: number;
  status?: number;
  isNew?: boolean;
  isFeatured?: boolean;
  sort?: number;
  packageIds?: number[];
  exclusivePrices?: Record<number, number>;
}

/** 商品目录：分类、商品上架、会员档绑定 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 商品 PV 校验（一）：**不允许为 0**。
   * 「消费即累计」是硬规则，PV=0 的商品下单后不产生任何业绩、不参与等级晋升，
   * 也无法据此计算复消直推奖，因此必须在保存阶段就拦截。
   */
  private normalizePv(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new BusinessException(1001, '商品PV须为大于 0 的整数（PV 为 0 的商品不产生业绩，不允许保存）');
    }
    return value;
  }

  /**
   * 商品 PV 校验（二）：**PV 不得超过售价**。
   * 权益通按订单 PV×3 发放，用作会员间钱包转账的额度上限。若 PV 高于售价，
   * 就能用较低金额换取超额转账额度（例如售价 100 / PV 10000 → 换 30000 额度），
   * 属于参数配反导致的套利口子。正常 1:1 或 PV 低于售价的商品不受影响。
   */
  private assertPvNotAbovePrice(pv: number, price: number): void {
    if (Number.isFinite(price) && pv > price) {
      throw new BusinessException(1001, `商品PV（${pv}）不得超过售价（${price}），否则可用低售价换取超额权益通额度`);
    }
  }

  /* ---------- 分类 ---------- */

  async categories(includeDisabled = false) {
    return this.prisma.productCategory.findMany({
      where: includeDisabled ? {} : { status: 1 },
      orderBy: [{ parentId: 'asc' }, { sort: 'asc' }],
    });
  }

  async createCategory(data: { name: string; parentId?: bigint | null; icon?: string; sort?: number }) {
    return this.prisma.productCategory.create({
      data: {
        name: data.name,
        parentId: data.parentId ?? null,
        icon: data.icon,
        sort: data.sort ?? 0,
        status: 1,
      },
    });
  }

  async updateCategory(id: bigint, data: Partial<{ name: string; parentId: bigint | null; icon: string; sort: number; status: number }>) {
    if (data.parentId === id) throw new BusinessException(1001, '分类不能以自己为上级');
    return this.prisma.productCategory.update({ where: { id }, data });
  }

  async removeCategory(id: bigint) {
    const [childCount, productCount] = await Promise.all([
      this.prisma.productCategory.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);
    if (childCount > 0) throw new BusinessException(3002, '该分类下有子分类，请先删除子分类');
    if (productCount > 0) throw new BusinessException(3002, '该分类下有商品，请先转移商品');
    return this.prisma.productCategory.delete({ where: { id } });
  }

  /* ---------- 商品 ---------- */

  async products(params: {
    keyword?: string; categoryId?: bigint; status?: number;
    packageId?: number; page?: number; pageSize?: number;
  }) {
    const { keyword, categoryId, status, packageId, page = 1, pageSize = 20 } = params;
    const where: Record<string, unknown> = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { subtitle: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    if (categoryId) {
      // 同时包含子分类商品
      const children = await this.prisma.productCategory.findMany({
        where: { parentId: categoryId }, select: { id: true },
      });
      where.categoryId = { in: [categoryId, ...children.map((c) => c.id)] };
    }
    if (status !== undefined) where.status = status;
    if (packageId) where.packageBinds = { some: { packageId } };

    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where: where as never,
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: true, packageBinds: { include: { package: true } } },
      }),
      this.prisma.product.count({ where: where as never }),
    ]);
    return { list, total, page, pageSize };
  }

  async productDetail(id: bigint) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, packageBinds: { include: { package: true } } },
    });
    if (!product) throw new BusinessException(4003, '商品不存在');
    return product;
  }

  async createProduct(data: ProductInput) {
    const price = data.price;
    const pv = this.normalizePv(data.pv ?? price);
    this.assertPvNotAbovePrice(pv, price);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: data.name,
          subtitle: data.subtitle,
          description: data.description,
          categoryId: data.categoryId ?? null,
          images: (data.images ?? []) as never,
          details: (data.details ?? []) as never,
          price: BigInt(price),
          pv: BigInt(pv),
          originalPrice: BigInt(data.originalPrice ?? 0),
          stock: data.stock ?? 0,
          status: data.status ?? 0,
          isNew: data.isNew ?? false,
          isFeatured: data.isFeatured ?? false,
          sort: data.sort ?? 0,
        },
      });
      await this.syncBinds(tx, product.id, data.packageIds ?? [], data.exclusivePrices);
      // 事务内直接组装返回，避免未提交时在事务外查不到
      const binds = await tx.productPackage.findMany({
        where: { productId: product.id }, include: { package: true },
      });
      return { ...product, category: null, packageBinds: binds };
    });
  }

  async updateProduct(id: bigint, data: Partial<ProductInput>) {
    const existing = await this.productDetail(id);
    // 上架前兜底：历史 PV=0 的商品不允许重新上架（否则下单后不产生业绩）
    if (data.status === 1 && data.pv === undefined && existing.pv <= 0n) {
      throw new BusinessException(1001, `商品「${existing.name}」PV 为 0，不能上架；请先配置大于 0 的 PV`);
    }
    // PV 与售价必须成对校验：只改其中一个时，另一侧取现值参与比较
    const nextPrice = data.price !== undefined ? Number(data.price) : Number(existing.price);
    const nextPv = data.pv !== undefined ? this.normalizePv(Number(data.pv)) : Number(existing.pv);
    this.assertPvNotAbovePrice(nextPv, nextPrice);
    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
          ...(data.images !== undefined ? { images: data.images as never } : {}),
          ...(data.details !== undefined ? { details: data.details as never } : {}),
          ...(data.price !== undefined ? { price: BigInt(data.price) } : {}),
          ...(data.pv !== undefined ? { pv: BigInt(nextPv) } : {}),
          ...(data.originalPrice !== undefined ? { originalPrice: BigInt(data.originalPrice) } : {}),
          ...(data.stock !== undefined ? { stock: data.stock } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.isNew !== undefined ? { isNew: data.isNew } : {}),
          ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
          ...(data.sort !== undefined ? { sort: data.sort } : {}),
        },
      });
      if (data.packageIds !== undefined) {
        await this.syncBinds(tx, id, data.packageIds, data.exclusivePrices);
      }
      const updated = await tx.product.findUniqueOrThrow({ where: { id } });
      const [binds, category] = await Promise.all([
        tx.productPackage.findMany({ where: { productId: id }, include: { package: true } }),
        updated.categoryId ? tx.productCategory.findUnique({ where: { id: updated.categoryId } }) : Promise.resolve(null),
      ]);
      return { ...updated, category, packageBinds: binds };
    });
  }

  /** 同步商品-档位绑定：全量替换，保留已有专属价 */
  private async syncBinds(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    productId: bigint,
    packageIds: number[],
    exclusivePrices?: Record<number, number>,
  ) {
    await tx.productPackage.deleteMany({ where: { productId } });
    for (const packageId of packageIds) {
      await tx.productPackage.create({
        data: {
          productId,
          packageId,
          exclusivePrice: exclusivePrices?.[packageId] !== undefined
            ? BigInt(exclusivePrices[packageId]) : null,
        },
      });
    }
  }

  async removeProduct(id: bigint) {
    await this.productDetail(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.productPackage.deleteMany({ where: { productId: id } });
      return tx.product.delete({ where: { id } });
    });
  }

  /** 批量上下架 */
  async batchStatus(ids: bigint[], status: number) {
    // 上架前兜底：PV=0 的商品不允许上架
    if (status === 1) {
      const invalid = await this.prisma.product.findFirst({
        where: { id: { in: ids }, pv: { lte: 0n } },
        select: { name: true },
      });
      if (invalid) {
        throw new BusinessException(1001, `商品「${invalid.name}」PV 为 0，不能上架；请先配置大于 0 的 PV`);
      }
    }
    return this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }

  /** 会员端可见商品：已上架 + 按档位过滤 + 专属价 */
  async memberProducts(packageId: number | null, categoryId?: bigint) {
    const where: Record<string, unknown> = { status: 1 };
    if (categoryId) where.categoryId = categoryId;
    if (packageId) {
      where.OR = [
        { packageBinds: { some: { packageId } } },
        { packageBinds: { none: {} } }, // 未绑定任何档位的商品全档可见
      ];
    }
    const products = await this.prisma.product.findMany({
      where: where as never,
      orderBy: [{ isFeatured: 'desc' }, { sort: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        packageBinds: { select: { packageId: true, exclusivePrice: true } },
      },
    });
    return products.map((p) => {
      const bind = packageId ? p.packageBinds.find((b) => b.packageId === packageId) : null;
      return {
        ...p,
        effectivePrice: bind?.exclusivePrice ?? p.price,
      };
    });
  }
}
