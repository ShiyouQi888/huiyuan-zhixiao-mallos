-- 直推奖「先拆，后分期」：
--   计划创建时先按 bonus.cash_ratio 拆出「现金部分」（进钱包、参与分期释放）
--   与「太阳值部分」（一次性入账、不分期），现金部分再均分到各期，余数补最后一期。
-- 该字段记录拆分完成时间，用于区分两类计划：
--   非空 → 新规则，分期阶段只发「现金」，日结释放时不再二次拆分（cashOnly）
--   为空 → 历史计划，分期阶段仍按 bonus.cash_ratio 逐期拆分，避免重复发放太阳值
ALTER TABLE "BonusPlan" ADD COLUMN "splitAt" TIMESTAMP(3);
