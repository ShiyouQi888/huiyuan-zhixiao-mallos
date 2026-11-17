-- 补齐历史遗漏：太阳值（数权）账本表、TokenLot 来源字段、User.path 改为 TEXT 并改 depth 索引
-- 这些变更此前只在开发库用 db push 应用，未生成迁移，导致全新数据库缺少表结构

-- DropIndex
DROP INDEX "User_path_idx";

-- AlterTable
ALTER TABLE "TokenLot" ADD COLUMN     "sourceId" VARCHAR(64),
ADD COLUMN     "sourceType" VARCHAR(16) NOT NULL DEFAULT 'BONUS';

-- AlterTable
ALTER TABLE "TransferQuotaAccount" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "path" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "TokenAccount" (
    "userId" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "totalGranted" BIGINT NOT NULL DEFAULT 0,
    "totalTransferIn" BIGINT NOT NULL DEFAULT 0,
    "totalTransferOut" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TokenTransaction" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" SMALLINT NOT NULL,
    "changeAmount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "bizType" VARCHAR(64) NOT NULL,
    "bizId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenTransfer" (
    "id" BIGSERIAL NOT NULL,
    "transferNo" VARCHAR(64) NOT NULL,
    "fromUserId" BIGINT NOT NULL,
    "toUserId" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'COMPLETED',
    "riskFlag" SMALLINT NOT NULL DEFAULT 0,
    "remark" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TokenTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenTransaction_userId_createdAt_idx" ON "TokenTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransaction_bizType_bizId_key" ON "TokenTransaction"("bizType", "bizId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransfer_transferNo_key" ON "TokenTransfer"("transferNo");

-- CreateIndex
CREATE INDEX "TokenTransfer_fromUserId_createdAt_idx" ON "TokenTransfer"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenTransfer_toUserId_createdAt_idx" ON "TokenTransfer"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenLot_userId_sourceType_idx" ON "TokenLot"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "User_depth_idx" ON "User"("depth");

-- AddForeignKey
ALTER TABLE "TokenAccount" ADD CONSTRAINT "TokenAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransfer" ADD CONSTRAINT "TokenTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransfer" ADD CONSTRAINT "TokenTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

