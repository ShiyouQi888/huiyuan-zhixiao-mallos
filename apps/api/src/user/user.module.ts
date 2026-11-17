import { Module } from '@nestjs/common';
import { RelationModule } from '../relation/relation.module';
import { TransferQuotaModule } from '../transfer-quota/transfer-quota.module';
import { UserService } from './user.service';

@Module({
  imports: [RelationModule, TransferQuotaModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
