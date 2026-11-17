import { Module } from '@nestjs/common';
import { TransferQuotaService } from './transfer-quota.service';

@Module({
  providers: [TransferQuotaService],
  exports: [TransferQuotaService],
})
export class TransferQuotaModule {}
