ALTER TABLE "Order"
  ADD COLUMN "shippingCarrier" VARCHAR(64),
  ADD COLUMN "trackingNo" VARCHAR(128),
  ADD COLUMN "businessEffectsAppliedAt" TIMESTAMP(3);

-- COMPLETED orders have already received the former completion-time effects.
-- Keep them out of the paid-order recovery pass to prevent duplicate ledgers.
UPDATE "Order"
SET "businessEffectsAppliedAt" = COALESCE("paidAt", "finishedAt", "createdAt")
WHERE "status" = 3;
