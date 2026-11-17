import { Module } from '@nestjs/common';
import { EquityModule } from '../equity/equity.module';
import { FeaturesModule } from '../features/features.module';
import { TokenModule } from '../token/token.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransferService } from './transfer.service';
import { UserModule } from '../user/user.module';
import { TransferQuotaModule } from '../transfer-quota/transfer-quota.module';

@Module({
  imports: [WalletModule, EquityModule, TokenModule, FeaturesModule, UserModule, TransferQuotaModule],
  providers: [TransferService],
  exports: [TransferService],
})
export class TransferModule {}
