ALTER TABLE "Package" RENAME COLUMN "equityValue" TO "transferQuota";
ALTER TABLE "User" RENAME COLUMN "equityStatus" TO "transferQuotaStatus";
ALTER INDEX "User_equityStatus_idx" RENAME TO "User_transferQuotaStatus_idx";

CREATE TABLE "TransferQuotaAccount" (
    "userId" BIGINT NOT NULL,
    "granted" BIGINT NOT NULL DEFAULT 0,
    "used" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferQuotaAccount_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "TransferQuotaTransaction" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" SMALLINT NOT NULL,
    "changeAmount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "bizType" VARCHAR(64) NOT NULL,
    "bizId" VARCHAR(64) NOT NULL,
    "remark" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferQuotaTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransferQuotaTransaction_bizType_bizId_key"
    ON "TransferQuotaTransaction"("bizType", "bizId");
CREATE INDEX "TransferQuotaTransaction_userId_createdAt_idx"
    ON "TransferQuotaTransaction"("userId", "createdAt");

ALTER TABLE "TransferQuotaAccount"
    ADD CONSTRAINT "TransferQuotaAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferQuotaTransaction"
    ADD CONSTRAINT "TransferQuotaTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

WITH package_grants AS (
    SELECT o."userId",
        SUM(CASE
            WHEN o."type" IN (1, 3) THEN COALESCE(p."transferQuota", 0)
            WHEN o."type" = 2 THEN GREATEST(COALESCE(p."transferQuota", 0) - COALESCE(previous."transferQuota", 0), 0)
            ELSE 0
        END)::BIGINT AS granted
    FROM "Order" o
    LEFT JOIN "Package" p ON p."id" = o."packageId"
    LEFT JOIN "Package" previous ON previous."id" = o."fromPackageId"
    WHERE o."status" = 3 AND o."type" IN (1, 2, 3)
    GROUP BY o."userId"
), wallet_transfers AS (
    SELECT "fromUserId" AS "userId",
        COALESCE(SUM("amount") FILTER (WHERE "status" = 'COMPLETED'), 0)::BIGINT AS used,
        COALESCE(SUM("amount") FILTER (WHERE "status" = 'PENDING'), 0)::BIGINT AS reserved
    FROM "WalletTransfer"
    GROUP BY "fromUserId"
)
INSERT INTO "TransferQuotaAccount" ("userId", "granted", "used", "reserved", "version", "updatedAt")
SELECT u."id", COALESCE(g.granted, 0), COALESCE(t.used, 0), COALESCE(t.reserved, 0), 0, CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN package_grants g ON g."userId" = u."id"
LEFT JOIN wallet_transfers t ON t."userId" = u."id"
WHERE u."role" = 'MEMBER';

UPDATE "User" u SET "transferQuotaStatus" = CASE
    WHEN u."packageId" IS NOT NULL AND q."granted" <= q."used" THEN 1
    ELSE 0
END
FROM "TransferQuotaAccount" q
WHERE q."userId" = u."id";

UPDATE "FeatureFlag" AS target
SET "enabled" = source."enabled",
    "platforms" = source."platforms",
    "minRankLevel" = source."minRankLevel"
FROM "FeatureFlag" AS source
WHERE target."code" = 'wallet.transfer_quota' AND source."code" = 'equity.account';

DELETE FROM "FeatureFlag" AS legacy
WHERE legacy."code" = 'equity.account'
  AND EXISTS (SELECT 1 FROM "FeatureFlag" WHERE "code" = 'wallet.transfer_quota');

UPDATE "FeatureFlag"
SET "code" = 'wallet.transfer_quota', "name" = '钱包转账额度', "module" = 'wallet'
WHERE "code" = 'equity.account';
UPDATE "FeatureFlag"
SET "enabled" = FALSE
WHERE "code" = 'equity.transfer';

DELETE FROM "Config" WHERE "key" = 'equity.expire_months';
