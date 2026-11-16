import { Module } from '@nestjs/common';
import { TokenModule } from '../token/token.module';
import { BonusService } from './bonus.service';

@Module({
  imports: [TokenModule],
  providers: [BonusService],
  exports: [BonusService],
})
export class BonusModule {}
