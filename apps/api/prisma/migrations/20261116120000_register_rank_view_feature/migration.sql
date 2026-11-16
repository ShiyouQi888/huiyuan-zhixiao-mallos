INSERT INTO "FeatureFlag" (
  "code",
  "name",
  "module",
  "enabled",
  "platforms",
  "minRankLevel",
  "config",
  "updatedAt"
)
VALUES (
  'rank.view',
  '等级信息',
  'rank',
  true,
  '[]'::jsonb,
  0,
  '{}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
