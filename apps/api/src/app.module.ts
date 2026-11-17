import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin/admin.controller';
import { AdminExtendedController } from './admin/admin-extended.controller';
import { AdminMemberController } from './admin/admin-member.controller';
import { AdminModule } from './admin/admin.module';
import { OperatorAccountsController } from './admin/operator-accounts.controller';
import { AccessModule } from './access/access.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ResponseInterceptor } from './common/response.interceptor';
import { TraceMiddleware } from './common/trace.middleware';
import { ConfigModule } from './config/config.module';
import { AuthController } from './auth/auth.controller';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { FilesModule } from './files/files.module';
import { BonusModule } from './bonus/bonus.module';
import { EquityModule } from './equity/equity.module';
import { FeaturesModule } from './features/features.module';
import { MemberController } from './member/member.controller';
import { OrderController } from './order/order.controller';
import { OrderModule } from './order/order.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RelationModule } from './relation/relation.module';
import { SettlementService } from './settlement/settlement.service';
import { TasksService } from './tasks/tasks.service';
import { TokenModule } from './token/token.module';
import { TransferModule } from './transfer/transfer.module';
import { TransferQuotaModule } from './transfer-quota/transfer-quota.module';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    RedisModule,
    AccessModule,
    FilesModule,
    CatalogModule,
    AuthModule,
    RelationModule,
    WalletModule,
    EquityModule,
    TokenModule,
    BonusModule,
    FeaturesModule,
    UserModule,
    OrderModule,
    TransferModule,
    TransferQuotaModule,
    AdminModule,
  ],
  controllers: [AuthController, MemberController, OrderController, AdminController, AdminExtendedController, AdminMemberController, OperatorAccountsController],
  providers: [
    SettlementService,
    TasksService,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
