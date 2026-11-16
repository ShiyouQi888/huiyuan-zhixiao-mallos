import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { CatalogService, type ProductInput } from './catalog.service';

/** 管理端商品目录 */
@Controller('api/admin/catalog')
@Roles('SUPER_ADMIN', 'OPERATOR')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /* 分类 */
  @Get('categories')
  categories(@Query('all') all?: string) {
    return this.catalog.categories(all === 'true');
  }

  @Post('categories')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  createCategory(@Body() body: { name: string; parentId?: string; icon?: string; sort?: number }) {
    return this.catalog.createCategory({
      name: body.name,
      parentId: body.parentId ? BigInt(body.parentId) : null,
      icon: body.icon,
      sort: body.sort,
    });
  }

  @Put('categories/:id')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  updateCategory(@Param('id') id: string, @Body() body: { name?: string; parentId?: string | null; icon?: string; sort?: number; status?: number }) {
    return this.catalog.updateCategory(BigInt(id), {
      ...body,
      ...(body.parentId !== undefined ? { parentId: body.parentId ? BigInt(body.parentId) : null } : {}),
    } as never);
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  removeCategory(@Param('id') id: string) {
    return this.catalog.removeCategory(BigInt(id));
  }

  /* 商品 */
  @Get('products')
  products(
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('packageId') packageId?: string,
    @Query('page') page = '1',
  ) {
    return this.catalog.products({
      keyword,
      categoryId: categoryId ? BigInt(categoryId) : undefined,
      status: status !== undefined ? Number(status) : undefined,
      packageId: packageId ? Number(packageId) : undefined,
      page: Number(page),
    });
  }

  @Get('products/:id')
  product(@Param('id') id: string) {
    return this.catalog.productDetail(BigInt(id));
  }

  @Post('products')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  createProduct(@Body() body: any) {
    return this.catalog.createProduct(this.toProductInput(body) as unknown as ProductInput);
  }

  @Put('products/:id')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  updateProduct(@Param('id') id: string, @Body() body: any) {
    return this.catalog.updateProduct(BigInt(id), this.toProductInput(body, true));
  }

  @Delete('products/:id')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  removeProduct(@Param('id') id: string) {
    return this.catalog.removeProduct(BigInt(id));
  }

  @Patch('products/status')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  batchStatus(@Body() body: { ids: string[]; status: number }) {
    return this.catalog.batchStatus(body.ids.map(BigInt), Number(body.status));
  }

  /* 档位绑定 */
  @Get('packages/:packageId/products')
  packageProducts(@Param('packageId') packageId: string) {
    return this.catalog.products({ packageId: Number(packageId) });
  }

  @Post('products/:id/packages')
  @Roles('SUPER_ADMIN', 'OPERATOR')
  bindPackages(
    @Param('id') id: string,
    @Body() body: { packageIds: number[]; exclusivePrices?: Record<number, number> },
  ) {
    return this.catalog.updateProduct(BigInt(id), {
      packageIds: body.packageIds,
      exclusivePrices: body.exclusivePrices,
    });
  }

  private toProductInput(body: any, partial = false): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const str = ['name', 'subtitle', 'description'];
    const num = ['price', 'originalPrice', 'stock', 'status', 'sort'];
    const bool = ['isNew', 'isFeatured'];
    for (const k of str) if (body[k] !== undefined) out[k] = body[k];
    for (const k of num) if (body[k] !== undefined) out[k] = Number(body[k]);
    for (const k of bool) if (body[k] !== undefined) out[k] = !!body[k];
    for (const k of ['images', 'details']) if (body[k] !== undefined) out[k] = body[k];
    if (body.categoryId !== undefined) out.categoryId = body.categoryId ? BigInt(body.categoryId) : null;
    if (body.packageIds !== undefined) out.packageIds = body.packageIds.map(Number);
    if (body.exclusivePrices !== undefined) out.exclusivePrices = body.exclusivePrices;
    if (!partial && out.name === undefined) out.name = '';
    if (!partial && out.price === undefined) out.price = 0;
    return out;
  }
}

/** 会员端商品浏览 */
@Controller('api/products')
export class MemberProductController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(
    @Query('categoryId') categoryId?: string,
    @CurrentUser('id') userId?: bigint,
    @Query('packageId') packageId?: string,
  ) {
    let resolvedPackageId = packageId ? Number(packageId) : null;
    if (!resolvedPackageId && userId) {
      const user = await this.catalog['prisma'].user.findUnique({
        where: { id: userId }, select: { packageId: true },
      });
      resolvedPackageId = user?.packageId ?? null;
    }
    return this.catalog.memberProducts(resolvedPackageId, categoryId ? BigInt(categoryId) : undefined);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.catalog.productDetail(BigInt(id));
  }
}
