import { Injectable } from '@nestjs/common';
import { FeatureFlag } from '@prisma/client';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { Platform } from '@solar/shared';

const CACHE_KEY = 'features:all';

/**
 * 功能开关中心：三层控制
 * ① enabled 全局  ② platforms 分端  ③ minRankLevel 分级
 * 变更立即生效：后台修改后主动失效 Redis 缓存。
 */
@Injectable()
export class FeaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private async all(): Promise<FeatureFlag[]> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as FeatureFlag[];
      } catch {
        /* 回源 */
      }
    }
    const flags = await this.prisma.featureFlag.findMany({ orderBy: { id: 'asc' } });
    await this.redis.set(CACHE_KEY, JSON.stringify(flags), 300);
    return flags;
  }

  /** 前端启动时下发：已按 platform + rankLevel 过滤 */
  async listForUser(platform: Platform = 'h5', rankLevel = 0) {
    const flags = await this.all();
    return flags
      .filter((f) => {
        if (!f.enabled) return false;
        const platforms = f.platforms as string[];
        if (Array.isArray(platforms) && platforms.length > 0 && !platforms.includes(platform)) return false;
        return rankLevel >= f.minRankLevel;
      })
      .map((f) => ({ code: f.code, name: f.name, enabled: true }));
  }

  async allForAdmin() {
    return this.all();
  }

  /** 后端写接口二次校验，防止绕过前端直接调用 */
  async assertEnabled(code: string, platform: Platform = 'h5', rankLevel = 0): Promise<void> {
    const flag = (await this.all()).find((f) => f.code === code);
    if (!flag || !flag.enabled) throw Err.featureDisabled(`功能「${code}」已关闭`);
    const platforms = flag.platforms as string[];
    if (Array.isArray(platforms) && platforms.length > 0 && !platforms.includes(platform)) {
      throw Err.featureDisabled(`功能「${code}」不在当前端开放`);
    }
    if (rankLevel < flag.minRankLevel) {
      throw Err.featureDisabled(`功能「${code}」需要更高等级`);
    }
  }

  async isEnabled(code: string): Promise<boolean> {
    const flag = (await this.all()).find((f) => f.code === code);
    return !!flag?.enabled;
  }

  /** 切换开关，立即失效缓存 */
  async toggle(code: string, enabled: boolean, platforms?: string[], minRankLevel?: number, operatorId?: bigint) {
    const before = await this.prisma.featureFlag.findUnique({ where: { code } });
    const flag = await this.prisma.featureFlag.update({
      where: { code },
      data: {
        enabled,
        ...(platforms !== undefined ? { platforms: platforms as never } : {}),
        ...(minRankLevel !== undefined ? { minRankLevel } : {}),
      },
    });
    await this.redis.del(CACHE_KEY);
    await this.prisma.auditLog.create({
      data: {
        operatorType: 'ADMIN',
        operatorId: operatorId ?? null,
        action: 'FEATURE_TOGGLE',
        targetType: 'FEATURE_FLAG',
        before: { enabled: before?.enabled, platforms: before?.platforms, minRankLevel: before?.minRankLevel } as never,
        after: { enabled: flag.enabled, platforms: flag.platforms, minRankLevel: flag.minRankLevel } as never,
        remark: code,
      },
    });
    return flag;
  }
}
