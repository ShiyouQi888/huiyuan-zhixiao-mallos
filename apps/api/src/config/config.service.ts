import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** 系统配置服务：读 configs 表，Redis 缓存 5 分钟，后台修改后主动失效 */
@Injectable()
export class ConfigService {
  private readonly PREFIX = 'config:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const cached = await this.redis.get(this.PREFIX + key);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        /* 缓存损坏则回源 */
      }
    }
    const row = await this.prisma.config.findUnique({ where: { key } });
    const value = row ? (row.value as T) : fallback;
    await this.redis.set(this.PREFIX + key, JSON.stringify(value), 300);
    return value;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const value = await this.get<number>(key, fallback);
    return Number(value);
  }

  async set<T>(key: string, value: T, group = 'general', description?: string): Promise<void> {
    await this.prisma.config.upsert({
      where: { key },
      create: { key, value: value as never, group, description },
      update: { value: value as never, version: { increment: 1 } },
    });
    await this.invalidate(key);
  }

  async invalidate(key: string): Promise<void> {
    await this.redis.del(this.PREFIX + key);
  }

  async invalidateAll(): Promise<void> {
    await this.redis.delPattern(this.PREFIX + '*');
  }
}
