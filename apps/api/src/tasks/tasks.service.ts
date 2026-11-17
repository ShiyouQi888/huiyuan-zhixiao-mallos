import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettlementService } from '../settlement/settlement.service';
import { TransferService } from '../transfer/transfer.service';
import { PrismaService } from '../prisma/prisma.service';

/** 定时任务：日结 02:00 / 对账 04:00 / 转账超时每小时 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly settlement: SettlementService,
    private readonly transfer: TransferService,
    private readonly prisma: PrismaService,
  ) {}

  private async recordSystemIssue(kind: 'RECONCILIATION' | 'SETTLEMENT', key: string, detail: unknown, resolved = false) {
    const action = kind === 'RECONCILIATION'
      ? resolved ? 'SYSTEM_RECONCILIATION_RESOLVED' : 'SYSTEM_RECONCILIATION_ALERT'
      : 'SYSTEM_SETTLEMENT_ALERT';
    const remark = `${kind}:${key}`;
    const existing = await this.prisma.auditLog.findFirst({
      where: { remark, action: { in: ['SYSTEM_RECONCILIATION_ALERT', 'SYSTEM_RECONCILIATION_RESOLVED', 'SYSTEM_SETTLEMENT_ALERT'] } },
      orderBy: { createdAt: 'desc' },
    });
    const data = {
      operatorType: 'SYSTEM',
      action,
      targetType: kind,
      before: existing?.after ?? undefined,
      after: detail as never,
      remark,
    };
    if (existing) await this.prisma.auditLog.update({ where: { id: existing.id }, data });
    else await this.prisma.auditLog.create({ data });
  }

  @Cron('0 2 * * *', { name: 'daily-settle' })
  async dailySettle(): Promise<void> {
    try {
      const result = await this.settlement.settle();
      this.logger.log(`日结完成: ${JSON.stringify(result)}`);
    } catch (e) {
      this.logger.error('日结失败', e as Error);
      await this.recordSystemIssue('SETTLEMENT', new Date().toISOString().slice(0, 10), {
        message: e instanceof Error ? e.message : String(e),
        occurredAt: new Date().toISOString(),
      }).catch((recordError) => this.logger.error('记录日结异常失败', recordError as Error));
    }
  }

  @Cron('0 4 * * *', { name: 'reconcile' })
  async reconcile(): Promise<void> {
    const statDate = new Date().toISOString().slice(0, 10);
    try {
      const result = await this.settlement.reconcile(new Date());
      if (!result.allPassed) {
        this.logger.error(`对账不一致: ${JSON.stringify(result.checks)}`);
        await this.recordSystemIssue('RECONCILIATION', result.statDate, result.checks);
      } else {
        await this.recordSystemIssue('RECONCILIATION', result.statDate, { checks: result.checks, resolvedAt: new Date().toISOString() }, true);
        this.logger.log('每日对账通过');
      }
    } catch (error) {
      this.logger.error('对账任务执行失败', error as Error);
      await this.recordSystemIssue('RECONCILIATION', statDate, {
        message: error instanceof Error ? error.message : String(error),
        occurredAt: new Date().toISOString(),
      }).catch((recordError) => this.logger.error('记录对账异常失败', recordError as Error));
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'expire-transfers' })
  async expireTransfers(): Promise<void> {
    try {
      const count = await this.transfer.expirePending();
      if (count) this.logger.log(`已自动退回 ${count} 笔超时转账`);
    } catch (error) {
      this.logger.error('转账超时处理失败', error as Error);
      await this.recordSystemIssue('SETTLEMENT', `transfer-expiry:${new Date().toISOString().slice(0, 10)}`, {
        message: error instanceof Error ? error.message : String(error),
        occurredAt: new Date().toISOString(),
      }).catch((recordError) => this.logger.error('记录转账超时异常失败', recordError as Error));
    }
  }
}
