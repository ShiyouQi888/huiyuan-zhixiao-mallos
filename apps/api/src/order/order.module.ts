import { Module } from '@nestjs/common';
import { BonusModule } from '../bonus/bonus.module';
import { FeaturesModule } from '../features/features.module';
import { TransferQuotaModule } from '../transfer-quota/transfer-quota.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrderService } from './order.service';

@Module({
  imports: [BonusModule, TransferQuotaModule, WalletModule, FeaturesModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
