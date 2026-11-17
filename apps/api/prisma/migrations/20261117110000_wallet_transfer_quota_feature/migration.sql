INSERT INTO "FeatureFlag" (
  "code", "name", "module", "enabled", "platforms", "minRankLevel", "config", "updatedAt"
)
VALUES (
  'wallet.transfer_quota', '钱包转账额度', 'wallet', TRUE, '[]'::jsonb, 0, '{}'::jsonb, CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
