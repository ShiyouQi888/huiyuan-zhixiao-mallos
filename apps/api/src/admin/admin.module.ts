import { Module } from '@nestjs/common';
import { BonusModule } from '../bonus/bonus.module';
import { ConfigModule } from '../config/config.module';
import { EquityModule } from '../equity/equity.module';
import { SettlementService } from '../settlement/settlement.service';
import { TokenModule } from '../token/token.module';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { ApprovalService } from './approval.service';
import { AdminAdjustService } from './admin-adjust.service';

@Module({
  imports: [UserModule, WalletModule, EquityModule, TokenModule, ConfigModule, BonusModule],
  providers: [ApprovalService, AdminAdjustService, SettlementService],
  exports: [ApprovalService, AdminAdjustService],
})
export class AdminModule {}
