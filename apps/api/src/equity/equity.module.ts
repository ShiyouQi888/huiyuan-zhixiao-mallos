import { Module } from '@nestjs/common';
import { EquityService } from './equity.service';

@Module({
  providers: [EquityService],
  exports: [EquityService],
})
export class EquityModule {}
