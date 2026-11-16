import { Module } from '@nestjs/common';
import { CatalogController, MemberProductController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController, MemberProductController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
