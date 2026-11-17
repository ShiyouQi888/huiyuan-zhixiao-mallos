/**
 * 直推奖分配规则：**先拆，后分期**。
 *
 * 1. 计划创建时先按 `bonus.cash_ratio`（默认 0.7）把奖金拆成
 *    现金部分（进钱包、参与分期释放）与太阳值部分（一次性入账，不分期）；
 * 2. 现金部分再按释放期数均分，**余数补到最后一期**，保证 Σ各期 = 现金部分总额。
 *
 * 金额单位为整型（最小货币单位），整数除法会截断，因此必须显式分配余数；
 * 否则计划总额与各期之和会不相等，造成静默少发。
 */

export interface DirectBonusSplit {
  /** 进入分期释放的现金部分 */
  cashTotal: bigint;
  /** 计划创建时一次性入账的太阳值部分 */
  tokenTotal: bigint;
}

const DEFAULT_CASH_RATIO = 0.7;

/** 先拆：按现金比例拆出现金部分与太阳值部分；太阳值吸收四舍五入的余数 */
export function splitDirectBonus(total: bigint, cashRatio = DEFAULT_CASH_RATIO): DirectBonusSplit {
  if (total <= 0n) return { cashTotal: 0n, tokenTotal: 0n };
  const ratio = Number.isFinite(cashRatio) && cashRatio > 0 && cashRatio <= 1 ? cashRatio : DEFAULT_CASH_RATIO;
  const cashTotal = BigInt(Math.round(Number(total) * ratio));
  return { cashTotal, tokenTotal: total - cashTotal };
}

/**
 * 后分期：把现金部分均分到各期，余数补到最后一期。
 * 返回长度为 periods 的数组，满足 Σ = cashTotal。
 */
export function allocateDirectStages(cashTotal: bigint, periods: number): bigint[] {
  if (!Number.isInteger(periods) || periods <= 0) throw new Error('释放期数必须是正整数');
  if (cashTotal < 0n) throw new Error('分期金额不能为负');
  const divisor = BigInt(periods);
  const base = cashTotal / divisor;
  const remainder = cashTotal % divisor;
  return Array.from({ length: periods }, (_, index) =>
    index === periods - 1 ? base + remainder : base,
  );
}
