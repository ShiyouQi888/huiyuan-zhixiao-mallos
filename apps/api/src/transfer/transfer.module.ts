import { Module } from '@nestjs/common';
import { EquityModule } from '../equity/equity.module';
import { FeaturesModule } from '../features/features.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransferService } from './transfer.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [WalletModule, EquityModule, FeaturesModule, UserModule],
  providers: [TransferService],
  exports: [TransferService],
})
export class TransferModule {}
