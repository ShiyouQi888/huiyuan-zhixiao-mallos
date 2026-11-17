-- 档位（会员礼包）是「一次买断、终身有效」的身份，不存在过期。
-- 因此移除失效相关的两个字段：
--   User.packageExpireAt  —— 此前按支付日 + durationDays 写入，但全系统从未读取，
--                             属于「记录了却没人执行」的错误概念，删除以避免误解。
--   Package.durationDays  —— 唯一用途就是计算上面的到期时间，一并删除。
-- 档位身份仅由 User.packageId 表达：为空表示未购卡，非空表示已持有该档位。
ALTER TABLE "User" DROP COLUMN IF EXISTS "packageExpireAt";
ALTER TABLE "Package" DROP COLUMN IF EXISTS "durationDays";
