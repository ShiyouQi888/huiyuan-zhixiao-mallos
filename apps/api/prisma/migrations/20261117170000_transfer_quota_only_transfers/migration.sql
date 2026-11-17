--权益通仅用于约束会员间钱包转出；历史商城消费额度退回账户。
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
), corrections AS (
  SELECT q."userId", LEAST(q."used", s.amount) AS restored
  FROM "TransferQuotaAccount" q
  INNER JOIN product_spend s ON s."userId" = q."userId"
  WHERE q."used" > 0
), updated AS (
  UPDATE "TransferQuotaAccount" q
  SET "used" = q."used" - c.restored,
      "version" = q."version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  FROM corrections c
  WHERE q."userId" = c."userId"
    AND c.restored > 0
  RETURNING
    q."userId",
    c.restored,
    GREATEST(q."granted" - q."adjustedOut" - q."used" - q."reserved", 0)::bigint AS "balanceAfter"
)
INSERT INTO "TransferQuotaTransaction" (
  "userId", "type", "changeAmount", "balanceAfter", "bizType", "bizId", "remark", "createdAt"
)
SELECT
  u."userId",
  5,
  u.restored,
  u."balanceAfter",
  'wallet_product_spend_reversal',
  'quota-policy-20261117-' || u."userId"::text,
  '规则修订：商城消费不再消耗权益通，历史商城消费额度已退回',
  CURRENT_TIMESTAMP
FROM updated u
WHERE u.restored > 0
ON CONFLICT ("bizType", "bizId") DO NOTHING;

UPDATE "User" u
SET "transferQuotaStatus" = CASE
  WHEN u."packageId" IS NOT NULL AND q."granted" - q."adjustedOut" <= q."used" THEN 1
  ELSE 0
END
FROM "TransferQuotaAccount" q
WHERE q."userId" = u."id";
