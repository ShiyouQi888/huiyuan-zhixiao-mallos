/**
 * 历史直推奖计划补偿：修复整数除法截断导致的「分期少付」。
 *
 * 背景：旧实现在创建计划时对每一期用 `总额 / 期数` 整数除法，余数被直接丢弃，
 * 导致 Σ各期 < 计划总额，静默少发（例：总额 20 / 3 期 → 6+6+6 = 18，少 2）。
 *
 * 修复原则（不改动已发事实）：
 *   - 已 RELEASED 的期次金额保持不变（钱已到账，不回滚）；
 *   - 把「计划总额 - 已释放金额」重新均分到仍为 PENDING 的期次，余数补最后一个待释放期；
 *   - 已全部释放、无法通过调整期次补齐的计划，输出「待人工补发」清单。
 *
 * 用法：
 *   pnpm --filter @solar/api exec ts-node scripts/backfill-direct-plan.ts                  # 仅预览
 *   pnpm --filter @solar/api exec ts-node scripts/backfill-direct-plan.ts --apply          # 调整待释放期次
 *   pnpm --filter @solar/api exec ts-node scripts/backfill-direct-plan.ts --apply --compensate
 *        # 另外对「已全部释放」的计划，按原 70/30 规则补发差额（走 BonusService，幂等）
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BonusService } from '../src/bonus/bonus.service';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const COMPENSATE = process.argv.includes('--compensate');

function allocate(remaining: bigint, count: number): bigint[] {
  const base = remaining / BigInt(count);
  const rest = remaining % BigInt(count);
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? base + rest : base));
}

/** 延迟创建 Nest 上下文：只有需要真正补发时才加载依赖 */
let bonusService: BonusService | null = null;
let appContext: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
async function getBonusService(): Promise<BonusService> {
  if (!bonusService) {
    appContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    const resolved = appContext.get(BonusService);
    bonusService = resolved;
    return resolved;
  }
  return bonusService;
}

async function main(): Promise<void> {
  console.log(`=== 直推奖历史计划补偿（${APPLY ? '写库模式' : '预览模式，加 --apply 生效'}）===\n`);

  const plans = await prisma.bonusPlan.findMany({
    orderBy: { id: 'asc' },
    include: { stages: { orderBy: { periodNo: 'asc' } }, order: { select: { orderNo: true } } },
  });

  let fixed = 0;
  let skipped = 0;
  let compensated = 0;
  const manual: Array<{ planId: string; orderNo: string; shortfall: bigint }> = [];

  for (const plan of plans) {
    const total = plan.totalAmount;
    const stageSum = plan.stages.reduce((acc, stage) => acc + stage.amount, 0n);
    if (stageSum === total) {
      skipped += 1;
      continue;
    }

    const released = plan.stages.filter((stage) => stage.status === 'RELEASED');
    const pending = plan.stages.filter((stage) => stage.status === 'PENDING');
    const releasedSum = released.reduce((acc, stage) => acc + stage.amount, 0n);
    const remaining = total - releasedSum;

    console.log(`计划 #${plan.id}（订单 ${plan.order.orderNo}）`);
    console.log(`  总额 ${total}｜各期之和 ${stageSum}｜差额 ${total - stageSum}`);
    console.log(`  已释放 ${releasedSum}（${released.length} 期）｜待释放 ${pending.length} 期｜待分配 ${remaining}`);

    if (remaining <= 0n) {
      console.log('  → 已释放金额已覆盖计划总额，无需调整\n');
      skipped += 1;
      continue;
    }
    if (pending.length === 0) {
      if (APPLY && COMPENSATE) {
        // 期次已全部释放：钱已按截断金额到账，无法回改期次，
        // 只能按原 70/30 拆分规则对差额做一次性补发（幂等键按计划固定）。
        const bonus = await getBonusService();
        await bonus.creditBonus({
          userId: plan.beneficiaryId,
          type: 1,
          amount: remaining,
          settleDate: new Date(),
          sourceOrderId: plan.orderId,
          planId: plan.id,
          idempotencyKey: `direct:backfill:${plan.id}`,
        });
        console.log(`  → 已补发差额 ${remaining}（按 70% 钱包 / 30% 太阳值拆分）\n`);
        compensated += 1;
        continue;
      }
      manual.push({ planId: plan.id.toString(), orderNo: plan.order.orderNo, shortfall: remaining });
      console.log(`  → 全部期次已释放，需补发 ${remaining}${COMPENSATE ? '（预览模式未执行）' : '（加 --apply --compensate 执行补发）'}\n`);
      continue;
    }

    const amounts = allocate(remaining, pending.length);
    const after = releasedSum + amounts.reduce((acc, item) => acc + item, 0n);
    console.log(`  → 待释放各期调整为 [${amounts.join(', ')}]，调整后合计 ${after}${after === total ? '（与总额一致）' : '（仍不一致）'}`);

    if (APPLY) {
      for (let i = 0; i < pending.length; i++) {
        await prisma.bonusStage.update({ where: { id: pending[i].id }, data: { amount: amounts[i] } });
      }
      await prisma.auditLog.create({
        data: {
          operatorType: 'SYSTEM',
          action: 'DIRECT_PLAN_BACKFILL',
          targetType: 'BONUS_PLAN',
          targetId: plan.id,
          after: {
            before: pending.map((stage) => stage.amount.toString()),
            after: amounts.map((amount) => amount.toString()),
            totalAmount: total.toString(),
            releasedSum: releasedSum.toString(),
          } as never,
        },
      });
    }
    fixed += 1;
    console.log('');
  }

  console.log(`--- 汇总：已一致 ${skipped} 个，${APPLY ? '已修复' : '可修复'} ${fixed} 个，${
    compensated > 0 ? `已补发 ${compensated} 个，` : ''}待处理 ${manual.length} 个 ---`);
  for (const item of manual) {
    console.log(`  待补发：计划 #${item.planId} 订单 ${item.orderNo} 金额 ${item.shortfall}`);
  }
  if (!APPLY && (fixed > 0 || manual.length > 0)) {
    console.log('\n（预览模式未写库，确认无误后加 --apply[ --compensate] 执行）');
  }
}

main()
  .catch((error) => {
    console.error('补偿中断：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await appContext?.close();
    await prisma.$disconnect();
  });
