import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Err } from '../common/business.exception';
import { FeaturesService } from '../features/features.service';
import { OrderService } from './order.service';

@Controller('api/orders')
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly features: FeaturesService,
  ) {}

  @Post()
  async create(@CurrentUser() current: CurrentUserPayload, @Body() body: {
    type: number;
    packageId?: number;
    productId?: number;
    addressId?: string;
    quantity?: number;
    useEquity?: boolean;
    useBalance?: boolean;
    remark?: string;
  }) {
    if (![1, 2, 3, 4].includes(body.type)) throw Err.param('订单类型不合法');
    // 按订单类型校验对应功能开关，防止绕过前端直接调用
    const flag = body.type === 4 ? 'product.mall'
      : body.type === 2 ? 'member.upgrade'
      : body.type === 3 ? 'member.repurchase'
      : 'package.purchase';
    await this.features.assertEnabled(flag, 'h5', current.rankLevel);
    if (body.useBalance !== false) await this.features.assertEnabled('wallet.account', 'h5', current.rankLevel);

    if (body.addressId !== undefined && !/^\d+$/.test(body.addressId)) throw Err.param('收货地址编号格式不正确');
    const params = {
      ...body,
      userId: current.id,
      productId: body.productId ? BigInt(body.productId) : undefined,
      addressId: body.addressId ? BigInt(body.addressId) : undefined,
    };
    return this.orders.create(params);
  }

  @Get()
  list(
    @Query('userId') userId: string | undefined,
    @CurrentUser() current: CurrentUserPayload,
    @Query('page') page = '1',
  ) {
    const onlyMine = current.role === 'MEMBER';
    return this.orders.list(onlyMine ? current.id : userId ? BigInt(userId) : undefined, Number(page));
  }

  @Get(':no')
  detail(@Param('no') no: string, @CurrentUser() current: CurrentUserPayload) {
    return this.orders.detail(no, current.role === 'MEMBER' ? current.id : undefined);
  }

  @Post(':no/confirm')
  confirm(@Param('no') no: string, @CurrentUser('id') userId: bigint) {
    return this.orders.complete(no, userId);
  }
}
