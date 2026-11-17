import { createHash } from 'crypto';
import { Err } from './business.exception';

export function idempotencyScene(operation: string, payload: unknown): string {
  const fingerprint = createHash('sha256').update(JSON.stringify(payload ?? null, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  )).digest('hex').slice(0, Math.min(48, Math.max(16, 63 - operation.length)));
  return `${operation}:${fingerprint}`;
}

export function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 128 || !/^[\w:.-]+$/.test(key)) {
    throw Err.param('请求幂等键缺失或格式无效，请刷新后重试');
  }
  return key;
}
