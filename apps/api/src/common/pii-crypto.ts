import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Err } from './business.exception';

function encryptionKeys(): Buffer[] {
  const secrets = [process.env.PII_ENCRYPTION_KEY, process.env.JWT_SECRET].filter((value): value is string => Boolean(value));
  const unique = [...new Set(secrets)];
  if (!unique.length) throw new Error('PII_ENCRYPTION_KEY or JWT_SECRET must be configured');
  return unique.map((secret) => createHash('sha256').update(secret).digest());
}

export function encryptPii(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKeys()[0], iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptPii(value: string): string {
  if (!value.startsWith('v1:')) return Buffer.from(value, 'base64').toString('utf8');
  const [, ivHex, tagHex, ciphertextHex] = value.split(':');
  for (const key of encryptionKeys()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      /* Try the previous configured key to support a controlled key rotation. */
    }
  }
  throw new Error('PII decryption failed');
}

export function normalizeChineseIdCard(value: string): string {
  const id = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^\d{17}[\dX]$/.test(id)) throw Err.param('请输入有效的 18 位身份证号');
  const dateText = id.slice(6, 14);
  const year = Number(dateText.slice(0, 4));
  const month = Number(dateText.slice(4, 6));
  const day = Number(dateText.slice(6, 8));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw Err.param('身份证号中的出生日期无效');
  }
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = weights.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
  if (checks[sum % 11] !== id[17]) throw Err.param('身份证号校验未通过，请检查后重试');
  return id;
}
