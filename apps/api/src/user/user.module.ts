import { Module } from '@nestjs/common';
import { RelationModule } from '../relation/relation.module';
import { UserService } from './user.service';

@Module({
  imports: [RelationModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
