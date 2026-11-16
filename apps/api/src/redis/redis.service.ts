import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

/** Redis 封装：缓存 + 分布式锁 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    this.client.on('error', (e) => this.logger.warn(`Redis 连接异常: ${e.message}`));
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length) await this.client.del(...keys);
  }

  /**
   * 获取分布式锁。返回 token，释放时需传回。
   * 日结锁 TTL 默认 2 小时（7200 秒）。
   */
  async acquireLock(key: string, ttlSeconds = 7200): Promise<string | null> {
    const token = randomUUID();
    // ioredis 类型重载对 NX+EX 组合声明不全，用 eval 保证原子性
    const ok = (await this.client.eval(
      "return redis.call('set', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])",
      1,
      key,
      token,
      String(ttlSeconds),
    )) as string | null;
    return ok === 'OK' ? token : null;
  }

  /** Lua 保证「校验 token + 删除」原子性，防止误删他人的锁 */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    const result = (await this.client.eval(script, 1, key, token)) as number;
    return result === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
