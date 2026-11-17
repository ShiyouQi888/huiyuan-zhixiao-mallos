-- Existing eligible商城 wallet purchases consume any quota that remained after wallet transfers.
WITH product_spend AS (
  SELECT o."userId", SUM(o."balanceDeduct")::bigint AS amount
  FROM "Order" o
  WHERE o."type" = 4
    AND o."status" IN (1, 2, 3)
    AND o."balanceDeduct" > 0
    AND EXISTS (
      SELECT 1
      FROM "Order" p
      WHERE p."userId" = o."userId"
        AND p."type" IN (1, 2, 3)
        AND p."status" = 3
        AND COALESCE(p."finishedAt", p."paidAt", p."createdAt") <= COALESCE(o."paidAt", o."createdAt")
    )
  GROUP BY o."userId"
)
UPDATE "TransferQuotaAccount" q
SET "used" = q."used" + LEAST(GREATEST(q."granted" - q."used" - q."reserved", 0), s.amount),
    "version" = q."version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM product_spend s
JOIN "User" u ON u."id" = s."userId"
WHERE q."userId" = s."userId"
  AND u."packageId" IS NOT NULL
  AND q."granted" > q."used" + q."reserved";

UPDATE "User" u
SET "transferQuotaStatus" = CASE
  WHEN u."packageId" IS NOT NULL AND q."granted" <= q."used" THEN 1
  ELSE 0
END
FROM "TransferQuotaAccount" q
WHERE q."userId" = u."id";

UPDATE "FeatureFlag"
SET "name" = CASE "code"
  WHEN 'wallet.transfer_quota' THEN '权益通'
  WHEN 'token.view' THEN '太阳值查看'
  WHEN 'token.transfer' THEN '太阳值转账'
  ELSE "name"
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('wallet.transfer_quota', 'token.view', 'token.transfer');

UPDATE "Config"
SET "description" = CASE "key"
  WHEN 'bonus.token_ratio' THEN '奖金拆分到太阳值比例'
  WHEN 'token.transfer_enabled' THEN '太阳值转账开关（即时到账）'
  WHEN 'token.transfer_limit' THEN '太阳值单笔转账限额，0=不限'
  ELSE "description"
END
WHERE "key" IN ('bonus.token_ratio', 'token.transfer_enabled', 'token.transfer_limit');
