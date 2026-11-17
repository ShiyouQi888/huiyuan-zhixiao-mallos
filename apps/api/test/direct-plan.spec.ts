import { describe, expect, it } from 'vitest';
import { allocateDirectStages, splitDirectBonus } from '../src/bonus/direct-plan';

const sum = (list: bigint[]): bigint => list.reduce((acc, item) => acc + item, 0n);

describe('直推奖「先拆」splitDirectBonus', () => {
  it('默认 70% 现金 / 30% 太阳值，两部分之和恒等于奖金总额', () => {
    expect(splitDirectBonus(2000n)).toEqual({ cashTotal: 1400n, tokenTotal: 600n });
    expect(splitDirectBonus(1000n)).toEqual({ cashTotal: 700n, tokenTotal: 300n });
    // 不能被 10 整除时，太阳值吸收四舍五入的差额，总额不丢分
    for (const total of [20n, 31n, 52n, 103n, 999n, 12345n]) {
      const { cashTotal, tokenTotal } = splitDirectBonus(total);
      expect(cashTotal + tokenTotal).toBe(total);
    }
  });

  it('比例可配置：ratio=1 时全额现金，ratio=0.5 时对半', () => {
    expect(splitDirectBonus(2000n, 1)).toEqual({ cashTotal: 2000n, tokenTotal: 0n });
    expect(splitDirectBonus(2001n, 0.5)).toEqual({ cashTotal: 1001n, tokenTotal: 1000n });
  });

  it('非法比例回落到默认 0.7，奖金非正数时返回全 0', () => {
    expect(splitDirectBonus(1000n, 0).cashTotal).toBe(700n);
    expect(splitDirectBonus(1000n, Number.NaN).cashTotal).toBe(700n);
    expect(splitDirectBonus(0n)).toEqual({ cashTotal: 0n, tokenTotal: 0n });
  });
});

describe('直推奖「后分期」allocateDirectStages', () => {
  it('用户示例：2000 奖金 → 现金 1400 → 20 期，每期 70，总额不丢', () => {
    const { cashTotal } = splitDirectBonus(2000n);
    const stages = allocateDirectStages(cashTotal, 20);
    expect(stages).toHaveLength(20);
    expect(stages.every((amount) => amount === 70n)).toBe(true);
    expect(sum(stages)).toBe(1400n);
  });

  it('余数补最后一期，Σ各期恒等于现金总额', () => {
    // 报告中的真实场景：3 期，20 / 52 / 31 三笔直推奖
    expect(allocateDirectStages(20n, 3)).toEqual([6n, 6n, 8n]);
    expect(allocateDirectStages(52n, 3)).toEqual([17n, 17n, 18n]);
    expect(allocateDirectStages(31n, 3)).toEqual([10n, 10n, 11n]);

    for (const cashTotal of [1n, 2n, 7n, 100n, 1400n, 99999n]) {
      for (const periods of [1, 3, 7, 20, 30]) {
        const stages = allocateDirectStages(cashTotal, periods);
        expect(stages).toHaveLength(periods);
        expect(sum(stages)).toBe(cashTotal);
        // 除最后一期外，各期金额相同且不超过均值
        const base = stages[0];
        expect(stages.slice(0, -1).every((amount) => amount === base)).toBe(true);
        expect(stages[periods - 1]).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it('不能整除时末期为基数加余数，而不是被截断丢弃', () => {
    const stages = allocateDirectStages(100n, 3);
    expect(stages).toEqual([33n, 33n, 34n]);
    expect(sum(stages)).toBe(100n);
  });

  it('期数非法或金额为负时直接报错，避免静默少发', () => {
    expect(() => allocateDirectStages(100n, 0)).toThrow('释放期数必须是正整数');
    expect(() => allocateDirectStages(100n, 2.5)).toThrow('释放期数必须是正整数');
    expect(() => allocateDirectStages(-1n, 3)).toThrow('分期金额不能为负');
  });
});

describe('先拆后分期 · 全链路恒等式', () => {
  it('钱包分期总额 + 太阳值一次性入账 === 直推奖总额', () => {
    const total = 2000n;
    const { cashTotal, tokenTotal } = splitDirectBonus(total, 0.7);
    const stages = allocateDirectStages(cashTotal, 20);
    expect(sum(stages) + tokenTotal).toBe(total);
  });

  it('20/52/31 三笔 3 期：旧实现实发 99（少付 4），新实现分文不差', () => {
    const totals = [20n, 52n, 31n];
    const periods = 3;
    const expected = totals.reduce((acc, item) => acc + item, 0n); // 103
    let oldReleased = 0n;
    let newReleased = 0n;
    for (const total of totals) {
      // 旧实现：每期 floor(总额 / 期数)，余数被截断丢弃
      oldReleased += (total / BigInt(periods)) * BigInt(periods);
      const { cashTotal, tokenTotal } = splitDirectBonus(total, 0.7);
      newReleased += sum(allocateDirectStages(cashTotal, periods)) + tokenTotal;
    }
    expect(expected).toBe(103n);
    expect(oldReleased).toBe(99n);   // 18 + 51 + 30，少付 4
    expect(newReleased).toBe(103n);  // 现金 72 分期足额 + 太阳值 31 一次性入账
  });
});
