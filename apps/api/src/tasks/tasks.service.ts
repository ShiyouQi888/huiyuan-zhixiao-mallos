import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EquityService } from '../equity/equity.service';
import { SettlementService } from '../settlement/settlement.service';
import { TransferService } from '../transfer/transfer.service';

/** 定时任务：日结 02:00 / 权益值过期 03:00 / 对账 04:00 / 转账超时每小时 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly settlement: SettlementService,
    private readonly transfer: TransferService,
    private readonly equity: EquityService,
  ) {}

  @Cron('0 2 * * *', { name: 'daily-settle' })
  async dailySettle(): Promise<void> {
    try {
      const result = await this.settlement.settle();
      this.logger.log(`日结完成: ${JSON.stringify(result)}`);
    } catch (e) {
      this.logger.error('日结失败', e as Error);
    }
  }

  @Cron('0 3 * * *', { name: 'expire-equity' })
  async expireEquity(): Promise<void> {
    // 权益值过期仅作废批次，不暂停计酬（复消仅由「转账额度用完」触发）
    const count = await this.equity.expireLots();
    if (count) this.logger.warn(`已过期 ${count} 个权益值批次`);
  }

  @Cron('0 4 * * *', { name: 'reconcile' })
  async reconcile(): Promise<void> {
    const result = await this.settlement.reconcile(new Date());
    if (!result.allPassed) this.logger.error(`对账不一致: ${JSON.stringify(result.checks)}`);
    else this.logger.log('每日对账通过');
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'expire-transfers' })
  async expireTransfers(): Promise<void> {
    const count = await this.transfer.expirePending();
    if (count) this.logger.log(`已自动退回 ${count} 笔超时转账`);
  }
}
