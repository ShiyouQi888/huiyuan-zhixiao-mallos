import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';

/** 双端切换网关：同一账号按等级判定可进入的端 */
@Controller('api/access')
export class AccessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('roles')
  async roles(@CurrentUser() user: CurrentUserPayload) {
    const full = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { rankLevel: true, rankId: true, status: true, packageId: true, nickname: true },
    });
    if (!full) throw new BusinessException(4001, '用户不存在');

    const minLevel = await this.config.getNumber('access.partner_min_level', 1);
    const canPartner = full.rankLevel >= minLevel;

    return {
      userId: user.id.toString(),
      nickname: full.nickname,
      member: { available: true, label: '会员中心' },
      partner: {
        available: canPartner,
        label: '合伙人中心',
        minLevel,
        currentLevel: full.rankLevel,
        gap: canPartner ? 0 : minLevel - full.rankLevel,
        reason: canPartner ? null : `达到 Lv.${minLevel} 可进入合伙人中心`,
      },
      defaultEnd: canPartner ? 'partner' : 'member',
    };
  }

  /** 合伙人端页面加载时的准入校验，前端路由守卫也调用此接口 */
  @Get('partner/check')
  async checkPartner(@CurrentUser() user: CurrentUserPayload) {
    const roles = await this.roles(user);
    if (!roles.partner.available) {
      throw new BusinessException(2002, roles.partner.reason ?? '暂无合伙人端权限');
    }
    return { allowed: true, userId: roles.userId };
  }
}
