import { Module } from '@nestjs/common';
import { EquityModule } from '../equity/equity.module';
import { FeaturesModule } from '../features/features.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransferService } from './transfer.service';

@Module({
  imports: [WalletModule, EquityModule, FeaturesModule],
  providers: [TransferService],
  exports: [TransferService],
})
export class TransferModule {}
