-- Every member ordinary-product order created after PV accounting began earns
-- transfer quota on completion: order PV × 3. Product spend itself never uses quota.
-- Backfill completed eligible orders from the PV cutover that missed the grant,
-- and mark still-open orders so completion applies the same rule.
DO $$
BEGIN
  CREATE TEMP TABLE _member_product_quota_backfill ON COMMIT DROP AS
  SELECT
    o."id" AS "orderId",
    o."userId",
    o."orderNo",
    o."pvAmount" * 3 AS "grantAmount",
    COALESCE(o."finishedAt", o."paidAt", o."createdAt") AS "occurredAt"
  FROM "Order" o
  WHERE o."type" = 4
    AND o."status" = 3
    AND o."pvAmount" > 0
    AND o."createdAt" >= TIMESTAMPTZ '2026-11-17 09:42:04+00'
    AND EXISTS (
      SELECT 1
      FROM "User" u
      JOIN "Order" package_order ON package_order."userId" = u."id"
      WHERE u."id" = o."userId"
        AND u."role" = 'MEMBER'
        AND package_order."type" IN (1, 2, 3)
        AND package_order."status" = 3
        AND COALESCE(package_order."finishedAt", package_order."paidAt", package_order."createdAt")
          <= COALESCE(o."paidAt", o."createdAt")
    )
    AND NOT EXISTS (
      SELECT 1 FROM "TransferQuotaTransaction" t
      WHERE t."bizType" = 'product_repurchase'
        AND t."bizId" = o."orderNo"
    );

  INSERT INTO "TransferQuotaAccount" ("userId", "updatedAt")
  SELECT DISTINCT b."userId", CURRENT_TIMESTAMP FROM _member_product_quota_backfill b
  ON CONFLICT ("userId") DO NOTHING;

  WITH totals AS (
    SELECT b."userId", SUM(b."grantAmount")::bigint AS amount
    FROM _member_product_quota_backfill b
    GROUP BY b."userId"
  )
  UPDATE "TransferQuotaAccount" q
  SET "granted" = q."granted" + totals.amount,
      "version" = q."version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  FROM totals
  WHERE q."userId" = totals."userId";

  INSERT INTO "TransferQuotaTransaction" (
    "userId", "type", "changeAmount", "balanceAfter", "bizType", "bizId", "remark", "createdAt"
  )
  SELECT
    b."userId",
    1,
    b."grantAmount",
    GREATEST(
      q."granted" - totals.amount - q."adjustedOut" - q."used" - q."reserved"
        + SUM(b."grantAmount") OVER (
          PARTITION BY b."userId"
          ORDER BY b."occurredAt", b."orderId"
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ),
      0
    )::bigint,
    'product_repurchase',
    b."orderNo",
    '普通商品订单历史补发权益通，按订单PV的3倍计',
    CURRENT_TIMESTAMP
  FROM _member_product_quota_backfill b
  JOIN "TransferQuotaAccount" q ON q."userId" = b."userId"
  JOIN (
    SELECT "userId" AS user_id, SUM("grantAmount")::bigint AS amount
    FROM _member_product_quota_backfill
    GROUP BY "userId"
  ) totals ON totals.user_id = b."userId"
  ON CONFLICT ("bizType", "bizId") DO NOTHING;

  UPDATE "Order" o
  SET "isRepurchase" = TRUE
  WHERE o."type" = 4
    AND o."status" IN (1, 2, 3)
    AND o."createdAt" >= TIMESTAMPTZ '2026-11-17 09:42:04+00'
    AND EXISTS (
      SELECT 1
      FROM "User" u
      JOIN "Order" package_order ON package_order."userId" = u."id"
      WHERE u."id" = o."userId"
        AND u."role" = 'MEMBER'
        AND package_order."type" IN (1, 2, 3)
        AND package_order."status" = 3
        AND COALESCE(package_order."finishedAt", package_order."paidAt", package_order."createdAt")
          <= COALESCE(o."paidAt", o."createdAt")
    );

  UPDATE "User" u
  SET "transferQuotaStatus" = CASE
    WHEN u."packageId" IS NOT NULL AND q."granted" - q."adjustedOut" <= q."used" THEN 1
    ELSE 0
  END
  FROM "TransferQuotaAccount" q
  WHERE q."userId" = u."id";

  DROP TABLE _member_product_quota_backfill;
END $$;
