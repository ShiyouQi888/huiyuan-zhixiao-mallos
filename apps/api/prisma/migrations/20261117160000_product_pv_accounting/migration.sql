ALTER TABLE "Package"
ADD COLUMN "pv" BIGINT NOT NULL DEFAULT 0;

UPDATE "Package"
SET "pv" = "price";

ALTER TABLE "Product"
ADD COLUMN "pv" BIGINT NOT NULL DEFAULT 0;

UPDATE "Product"
SET "pv" = "price";

ALTER TABLE "Order"
ADD COLUMN "pvAmount" BIGINT NOT NULL DEFAULT 0;

UPDATE "Order"
SET "pvAmount" = "amount";

ALTER TABLE "OrderItem"
ADD COLUMN "pv" BIGINT NOT NULL DEFAULT 0;

UPDATE "OrderItem"
SET "pv" = "price";
