import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// BigInt 安全序列化：安全整数转 number，其余转字符串，避免 JSON.stringify 抛错
// eslint-disable-next-line no-extend-native
(BigInt.prototype as unknown as { toJSON(): number | string }).toJSON = function (this: bigint) {
  const n = Number(this);
  return Number.isSafeInteger(n) ? n : this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`太阳线会员系统 API 已启动: http://localhost:${port}/api`);
}

bootstrap();
