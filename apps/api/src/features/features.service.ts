import { Injectable } from '@nestjs/common';
import { FeatureFlag } from '@prisma/client';
import { Err } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { Platform } from '@solar/shared';

const CACHE_KEY = 'features:all';
const SUPPORTED_PLATFORMS: readonly Platform[] = ['h5', 'app'];
const UNIMPLEMENTED_FEATURES = new Set(['notify.subscribe', 'customer.service', 'equity.account', 'equity.transfer']);

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
  async listForUser(platform: string = 'h5', rankLevel = 0) {
    this.validatePlatform(platform);
    const flags = await this.all();
    return flags
      .filter((f) => {
        if (UNIMPLEMENTED_FEATURES.has(f.code)) return false;
        if (!f.enabled) return false;
        const platforms = f.platforms as string[];
        if (Array.isArray(platforms) && platforms.length > 0 && !platforms.includes(platform)) return false;
        return rankLevel >= f.minRankLevel;
      })
      .map((f) => ({ code: f.code, name: f.name, enabled: true }));
  }

  async allForAdmin() {
    return (await this.all()).map((flag) => UNIMPLEMENTED_FEATURES.has(flag.code)
      ? { ...flag, enabled: false, locked: true }
      : { ...flag, locked: false });
  }

  /** 后端写接口二次校验，防止绕过前端直接调用 */
  async assertEnabled(code: string, platform: Platform = 'h5', rankLevel = 0): Promise<void> {
    this.validatePlatform(platform);
    if (UNIMPLEMENTED_FEATURES.has(code)) throw Err.featureDisabled(`功能「${code}」尚未接入真实服务，当前不可用`);
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
    return !UNIMPLEMENTED_FEATURES.has(code) && !!flag?.enabled;
  }

  async isAvailable(code: string, platform: Platform = 'h5', rankLevel = 0): Promise<boolean> {
    this.validatePlatform(platform);
    if (UNIMPLEMENTED_FEATURES.has(code)) return false;
    const flag = (await this.all()).find((f) => f.code === code);
    if (!flag?.enabled || rankLevel < flag.minRankLevel) return false;
    const platforms = flag.platforms as string[];
    return !Array.isArray(platforms) || platforms.length === 0 || platforms.includes(platform);
  }

  private validatePlatform(platform: string): asserts platform is Platform {
    if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
      throw Err.param('平台标识仅支持 h5 或 app');
    }
  }

  /** 切换开关，立即失效缓存 */
  async toggle(code: string, enabled: boolean, platforms?: string[], minRankLevel?: number, operatorId?: bigint) {
    if (enabled && UNIMPLEMENTED_FEATURES.has(code)) throw Err.featureDisabled('该功能尚无可用服务端能力，不能开启');
    if (typeof enabled !== 'boolean') throw Err.param('功能状态必须为布尔值');
    if (platforms !== undefined) {
      if (!Array.isArray(platforms) || platforms.some((platform) => !SUPPORTED_PLATFORMS.includes(platform as Platform))) {
        throw Err.param('开放平台仅支持 h5 或 app');
      }
      platforms = [...new Set(platforms)];
      if (platforms.length === SUPPORTED_PLATFORMS.length) platforms = [];
    }
    if (minRankLevel !== undefined && (!Number.isInteger(minRankLevel) || minRankLevel < 0 || minRankLevel > 6)) {
      throw Err.param('最低可见等级必须为 0 至 6 的整数');
    }
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
