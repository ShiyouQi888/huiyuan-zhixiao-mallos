import { Module } from '@nestjs/common';
import { EquityModule } from '../equity/equity.module';
import { FeaturesModule } from '../features/features.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrderService } from './order.service';

@Module({
  imports: [EquityModule, WalletModule, FeaturesModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
