ALTER TABLE "User"
ADD COLUMN "transferPasswordHash" VARCHAR(255);

ALTER TABLE "Order"
ADD COLUMN "shippingAddress" JSONB;

CREATE UNIQUE INDEX "UserAddress_one_default_per_user"
ON "UserAddress" ("userId")
WHERE "isDefault" = true;

INSERT INTO "FeatureFlag" (
  "code", "name", "module", "enabled", "platforms", "minRankLevel", "config", "updatedAt"
)
VALUES
  ('address.manage', '收货地址管理', 'user', true, '[]'::jsonb, 0, '{}'::jsonb, CURRENT_TIMESTAMP),
  ('transfer.password', '转账支付密码', 'wallet', true, '[]'::jsonb, 0, '{}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
