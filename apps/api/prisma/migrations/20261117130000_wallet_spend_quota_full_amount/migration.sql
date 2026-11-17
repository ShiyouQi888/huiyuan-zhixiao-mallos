-- Quota consumption follows the full wallet outflow, even when it exceeds the
-- current grant. Available quota is clamped to zero; future grants offset the
-- accumulated spend instead of losing the excess at repurchase time.
UPDATE "TransferQuotaAccount" q
SET "used" = COALESCE((
      SELECT SUM(wt."amount")
      FROM "WalletTransfer" wt
      WHERE wt."fromUserId" = q."userId" AND wt."status" = 'COMPLETED'
    ), 0) + COALESCE((
      SELECT SUM(o."balanceDeduct")
      FROM "Order" o
      WHERE o."userId" = q."userId"
        AND o."type" = 4
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
    ), 0),
    "version" = q."version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "User" u
SET "transferQuotaStatus" = CASE
  WHEN u."packageId" IS NOT NULL AND q."granted" <= q."used" THEN 1
  ELSE 0
END
FROM "TransferQuotaAccount" q
WHERE q."userId" = u."id";
