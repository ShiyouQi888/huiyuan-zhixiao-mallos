import { Module } from '@nestjs/common';
import { CatalogController, MemberProductController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { FeaturesModule } from '../features/features.module';

@Module({
  controllers: [CatalogController, MemberProductController],
  imports: [FeaturesModule],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
