-- CreateTable
CREATE TABLE "User" (
    "id" BIGSERIAL NOT NULL,
    "unionid" VARCHAR(64),
    "phone" VARCHAR(20),
    "nickname" VARCHAR(64),
    "avatar" VARCHAR(512),
    "passwordHash" VARCHAR(255),
    "inviteCode" VARCHAR(32) NOT NULL,
    "packageId" INTEGER,
    "packageExpireAt" TIMESTAMP(3),
    "rankId" INTEGER NOT NULL DEFAULT 0,
    "rankLevel" INTEGER NOT NULL DEFAULT 0,
    "rankAchievedAt" TIMESTAMP(3),
    "totalTeamPerformance" BIGINT NOT NULL DEFAULT 0,
    "parentId" BIGINT,
    "path" VARCHAR(1024) NOT NULL DEFAULT ',',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "equityStatus" SMALLINT NOT NULL DEFAULT 0,
    "peerBonusLocked" BOOLEAN NOT NULL DEFAULT false,
    "peerBonusLockedAt" TIMESTAMP(3),
    "realNameStatus" SMALLINT NOT NULL DEFAULT 0,
    "realName" VARCHAR(256),
    "idCardEncrypted" VARCHAR(512),
    "status" SMALLINT NOT NULL DEFAULT 0,
    "role" VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
    "deviceFingerprint" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "receiver" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "province" VARCHAR(64) NOT NULL,
    "city" VARCHAR(64) NOT NULL,
    "district" VARCHAR(64) NOT NULL,
    "detail" VARCHAR(512) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuth" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "identifier" VARCHAR(128) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "level" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "equityValue" BIGINT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 365,
    "items" JSONB NOT NULL DEFAULT '[]',
    "status" SMALLINT NOT NULL DEFAULT 1,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "parentId" BIGINT,
    "icon" VARCHAR(255),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" SMALLINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "subtitle" VARCHAR(255),
    "description" TEXT,
    "categoryId" BIGINT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "details" JSONB NOT NULL DEFAULT '[]',
    "price" BIGINT NOT NULL,
    "originalPrice" BIGINT NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "status" SMALLINT NOT NULL DEFAULT 0,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPackage" (
    "id" BIGSERIAL NOT NULL,
    "productId" BIGINT NOT NULL,
    "packageId" INTEGER NOT NULL,
    "exclusivePrice" BIGINT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" BIGSERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "size" INTEGER NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "category" VARCHAR(32) NOT NULL DEFAULT 'OTHER',
    "refId" VARCHAR(64),
    "uploadedBy" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" BIGSERIAL NOT NULL,
    "orderNo" VARCHAR(32) NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" SMALLINT NOT NULL,
    "isRepurchase" BOOLEAN NOT NULL DEFAULT false,
    "packageId" INTEGER,
    "fromPackageId" INTEGER,
    "amount" BIGINT NOT NULL,
    "equityDeduct" BIGINT NOT NULL DEFAULT 0,
    "balanceDeduct" BIGINT NOT NULL DEFAULT 0,
    "cashPay" BIGINT NOT NULL DEFAULT 0,
    "status" SMALLINT NOT NULL DEFAULT 0,
    "parentIdSnapshot" BIGINT,
    "remark" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" BIGSERIAL NOT NULL,
    "orderId" BIGINT NOT NULL,
    "productId" BIGINT,
    "name" VARCHAR(128) NOT NULL,
    "price" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPerformance" (
    "id" BIGSERIAL NOT NULL,
    "orderId" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "occurDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityAccount" (
    "userId" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "totalGranted" BIGINT NOT NULL DEFAULT 0,
    "totalUsed" BIGINT NOT NULL DEFAULT 0,
    "totalExpired" BIGINT NOT NULL DEFAULT 0,
    "totalTransferIn" BIGINT NOT NULL DEFAULT 0,
    "totalTransferOut" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "EquityLot" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "remaining" BIGINT NOT NULL,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "sourceType" VARCHAR(32) NOT NULL,
    "sourceId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquityLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityTransaction" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" SMALLINT NOT NULL,
    "changeAmount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "lotId" BIGINT,
    "bizType" VARCHAR(64) NOT NULL,
    "bizId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquityTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityTransfer" (
    "id" BIGSERIAL NOT NULL,
    "transferNo" VARCHAR(64) NOT NULL,
    "fromUserId" BIGINT NOT NULL,
    "toUserId" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fromLotIds" JSONB NOT NULL,
    "toLotId" BIGINT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "riskFlag" SMALLINT NOT NULL DEFAULT 0,
    "remark" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EquityTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusPlan" (
    "id" BIGSERIAL NOT NULL,
    "orderId" BIGINT NOT NULL,
    "beneficiaryId" BIGINT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "dailyAmount" BIGINT NOT NULL,
    "periods" INTEGER NOT NULL DEFAULT 20,
    "releasedAmount" BIGINT NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "startAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusStage" (
    "id" BIGSERIAL NOT NULL,
    "planId" BIGINT NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "BonusStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusRecord" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" SMALLINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "cashAmount" BIGINT NOT NULL,
    "tokenAmount" BIGINT NOT NULL,
    "sourceUserId" BIGINT,
    "sourceOrderId" BIGINT,
    "planId" BIGINT,
    "stageId" BIGINT,
    "settleDate" DATE NOT NULL,
    "walletTransactionId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPerformance" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "statDate" DATE NOT NULL,
    "ownAmount" BIGINT NOT NULL DEFAULT 0,
    "teamAmount" BIGINT NOT NULL DEFAULT 0,
    "rankLevel" INTEGER NOT NULL DEFAULT 0,
    "rankJudged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeamPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rank" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "level" INTEGER NOT NULL,
    "threshold" BIGINT NOT NULL,
    "teamRate" DECIMAL(5,4) NOT NULL,
    "poolRate" DECIMAL(5,4) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Rank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "fromLevel" INTEGER NOT NULL,
    "toLevel" INTEGER NOT NULL,
    "totalPerformance" BIGINT NOT NULL,
    "triggerType" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "statDate" DATE NOT NULL,
    "rankId" INTEGER NOT NULL,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "totalPerformance" BIGINT NOT NULL DEFAULT 0,
    "poolAmount" BIGINT NOT NULL DEFAULT 0,
    "perCapita" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "RankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "statDate" DATE NOT NULL,
    "rankId" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "snapshotId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "userId" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "frozen" BIGINT NOT NULL DEFAULT 0,
    "totalIn" BIGINT NOT NULL DEFAULT 0,
    "totalOut" BIGINT NOT NULL DEFAULT 0,
    "totalTransferIn" BIGINT NOT NULL DEFAULT 0,
    "totalTransferOut" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" SMALLINT NOT NULL,
    "changeAmount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "bizType" VARCHAR(64) NOT NULL,
    "bizId" VARCHAR(64) NOT NULL,
    "remark" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransfer" (
    "id" BIGSERIAL NOT NULL,
    "transferNo" VARCHAR(64) NOT NULL,
    "fromUserId" BIGINT NOT NULL,
    "toUserId" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "riskFlag" SMALLINT NOT NULL DEFAULT 0,
    "remark" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenLot" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "sourceBonusId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" BIGSERIAL NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value" JSONB NOT NULL,
    "group" VARCHAR(64) NOT NULL,
    "description" VARCHAR(256),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "module" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "platforms" JSONB NOT NULL DEFAULT '[]',
    "minRankLevel" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "operatorType" VARCHAR(32) NOT NULL,
    "operatorId" BIGINT,
    "action" VARCHAR(128) NOT NULL,
    "targetType" VARCHAR(64),
    "targetId" BIGINT,
    "before" JSONB,
    "after" JSONB,
    "remark" VARCHAR(512),
    "ip" VARCHAR(64),
    "ua" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" BIGSERIAL NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "scene" VARCHAR(64) NOT NULL,
    "result" JSONB,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettleBatch" (
    "id" BIGSERIAL NOT NULL,
    "statDate" DATE NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SettleBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "applicantId" BIGINT NOT NULL,
    "applicantRole" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "reviewerId" BIGINT,
    "reviewedAt" TIMESTAMP(3),
    "remark" VARCHAR(512),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_unionid_key" ON "User"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- CreateIndex
CREATE INDEX "User_parentId_idx" ON "User"("parentId");

-- CreateIndex
CREATE INDEX "User_path_idx" ON "User"("path");

-- CreateIndex
CREATE INDEX "User_rankId_idx" ON "User"("rankId");

-- CreateIndex
CREATE INDEX "User_equityStatus_idx" ON "User"("equityStatus");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");

-- CreateIndex
CREATE INDEX "UserAuth_userId_idx" ON "UserAuth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAuth_provider_identifier_key" ON "UserAuth"("provider", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Package_level_key" ON "Package"("level");

-- CreateIndex
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

-- CreateIndex
CREATE INDEX "Product_categoryId_status_idx" ON "Product"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Product_status_sort_idx" ON "Product"("status", "sort");

-- CreateIndex
CREATE INDEX "ProductPackage_packageId_idx" ON "ProductPackage"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPackage_productId_packageId_key" ON "ProductPackage"("productId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_url_key" ON "FileAsset"("url");

-- CreateIndex
CREATE INDEX "FileAsset_category_createdAt_idx" ON "FileAsset"("category", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_finishedAt_idx" ON "Order"("finishedAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPerformance_orderId_key" ON "OrderPerformance"("orderId");

-- CreateIndex
CREATE INDEX "OrderPerformance_occurDate_idx" ON "OrderPerformance"("occurDate");

-- CreateIndex
CREATE INDEX "EquityLot_userId_expireAt_idx" ON "EquityLot"("userId", "expireAt");

-- CreateIndex
CREATE INDEX "EquityLot_status_remaining_idx" ON "EquityLot"("status", "remaining");

-- CreateIndex
CREATE INDEX "EquityTransaction_userId_createdAt_idx" ON "EquityTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EquityTransaction_bizType_bizId_lotId_key" ON "EquityTransaction"("bizType", "bizId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "EquityTransfer_transferNo_key" ON "EquityTransfer"("transferNo");

-- CreateIndex
CREATE INDEX "EquityTransfer_fromUserId_createdAt_idx" ON "EquityTransfer"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EquityTransfer_toUserId_createdAt_idx" ON "EquityTransfer"("toUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BonusPlan_orderId_key" ON "BonusPlan"("orderId");

-- CreateIndex
CREATE INDEX "BonusPlan_status_startAt_idx" ON "BonusPlan"("status", "startAt");

-- CreateIndex
CREATE INDEX "BonusStage_status_dueAt_idx" ON "BonusStage"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "BonusStage_planId_periodNo_key" ON "BonusStage"("planId", "periodNo");

-- CreateIndex
CREATE INDEX "BonusRecord_userId_settleDate_idx" ON "BonusRecord"("userId", "settleDate");

-- CreateIndex
CREATE INDEX "BonusRecord_type_settleDate_idx" ON "BonusRecord"("type", "settleDate");

-- CreateIndex
CREATE INDEX "TeamPerformance_statDate_idx" ON "TeamPerformance"("statDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPerformance_userId_statDate_key" ON "TeamPerformance"("userId", "statDate");

-- CreateIndex
CREATE UNIQUE INDEX "Rank_level_key" ON "Rank"("level");

-- CreateIndex
CREATE INDEX "RankLog_userId_createdAt_idx" ON "RankLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RankSnapshot_statDate_rankId_key" ON "RankSnapshot"("statDate", "rankId");

-- CreateIndex
CREATE INDEX "Dividend_rankId_statDate_idx" ON "Dividend"("rankId", "statDate");

-- CreateIndex
CREATE UNIQUE INDEX "Dividend_statDate_userId_key" ON "Dividend"("statDate", "userId");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_bizType_bizId_key" ON "WalletTransaction"("bizType", "bizId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransfer_transferNo_key" ON "WalletTransfer"("transferNo");

-- CreateIndex
CREATE INDEX "WalletTransfer_fromUserId_createdAt_idx" ON "WalletTransfer"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransfer_toUserId_createdAt_idx" ON "WalletTransfer"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenLot_userId_idx" ON "TokenLot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Config_key_key" ON "Config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_code_key" ON "FeatureFlag"("code");

-- CreateIndex
CREATE INDEX "FeatureFlag_module_idx" ON "FeatureFlag"("module");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_operatorId_createdAt_idx" ON "AuditLog"("operatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expireAt_idx" ON "IdempotencyKey"("expireAt");

-- CreateIndex
CREATE INDEX "RiskEvent_userId_createdAt_idx" ON "RiskEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskEvent_eventType_handled_idx" ON "RiskEvent"("eventType", "handled");

-- CreateIndex
CREATE UNIQUE INDEX "SettleBatch_statDate_key" ON "SettleBatch"("statDate");

-- CreateIndex
CREATE INDEX "Approval_status_createdAt_idx" ON "Approval"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_type_status_idx" ON "Approval"("type", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "Rank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuth" ADD CONSTRAINT "UserAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackage" ADD CONSTRAINT "ProductPackage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackage" ADD CONSTRAINT "ProductPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPerformance" ADD CONSTRAINT "OrderPerformance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPerformance" ADD CONSTRAINT "OrderPerformance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityAccount" ADD CONSTRAINT "EquityAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityLot" ADD CONSTRAINT "EquityLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityTransaction" ADD CONSTRAINT "EquityTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityTransaction" ADD CONSTRAINT "EquityTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "EquityLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityTransfer" ADD CONSTRAINT "EquityTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityTransfer" ADD CONSTRAINT "EquityTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityTransfer" ADD CONSTRAINT "EquityTransfer_toLotId_fkey" FOREIGN KEY ("toLotId") REFERENCES "EquityLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPlan" ADD CONSTRAINT "BonusPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPlan" ADD CONSTRAINT "BonusPlan_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusStage" ADD CONSTRAINT "BonusStage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BonusPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusRecord" ADD CONSTRAINT "BonusRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusRecord" ADD CONSTRAINT "BonusRecord_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusRecord" ADD CONSTRAINT "BonusRecord_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BonusPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusRecord" ADD CONSTRAINT "BonusRecord_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BonusStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPerformance" ADD CONSTRAINT "TeamPerformance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankLog" ADD CONSTRAINT "RankLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankSnapshot" ADD CONSTRAINT "RankSnapshot_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "Rank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "Rank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RankSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLot" ADD CONSTRAINT "TokenLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLot" ADD CONSTRAINT "TokenLot_sourceBonusId_fkey" FOREIGN KEY ("sourceBonusId") REFERENCES "BonusRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
