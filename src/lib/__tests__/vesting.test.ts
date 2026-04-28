import { Prisma } from "@prisma/client";
import { generateVestingSchedule } from "@/lib/vesting";

const D = Prisma.Decimal;

function at(year: number, month0Based: number, day = 1) {
  return new Date(year, month0Based, day);
}

function sum(records: { quantity: Prisma.Decimal }[]) {
  return records
    .reduce((acc, r) => acc.add(r.quantity), new D(0))
    .toString();
}

describe("generateVestingSchedule — 累计进位法", () => {
  test("PRD 示例：1200 / 6月 cliff / 月归属 / 1 年 → 7 条 [600, 100×6]", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1200,
      vestingStartDate: at(2025, 0, 1),
      vestingYears: 1,
      cliffMonths: 6,
      vestingFrequency: "MONTHLY",
    });

    expect(schedule).toHaveLength(7);
    expect(schedule[0].quantity.toString()).toBe("600");
    for (let i = 1; i < 7; i++) {
      expect(schedule[i].quantity.toString()).toBe("100");
    }
    expect(schedule[0].vestingDate).toEqual(at(2025, 6, 1));
    expect(schedule[6].vestingDate).toEqual(at(2026, 0, 1));
    expect(sum(schedule)).toBe("1200");
  });

  test("无 cliff：1200 / 月归属 / 1 年 → 12 条 × 100", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1200,
      vestingStartDate: at(2025, 0, 1),
      vestingYears: 1,
      cliffMonths: 0,
      vestingFrequency: "MONTHLY",
    });
    expect(schedule).toHaveLength(12);
    schedule.forEach((r) => expect(r.quantity.toString()).toBe("100"));
    expect(sum(schedule)).toBe("1200");
  });

  test("按年归属：1200 / 按年 / 4 年 / 无 cliff → 4 条 × 300", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1200,
      vestingStartDate: at(2025, 0, 1),
      vestingYears: 4,
      cliffMonths: 0,
      vestingFrequency: "YEARLY",
    });
    expect(schedule).toHaveLength(4);
    schedule.forEach((r) => expect(r.quantity.toString()).toBe("300"));
    expect(schedule[0].vestingDate).toEqual(at(2026, 0, 1));
    expect(schedule[3].vestingDate).toEqual(at(2029, 0, 1));
    expect(sum(schedule)).toBe("1200");
  });

  test("不整除：1000 / 6月 cliff / 月归属 / 1 年 → 7 条，累计进位保证整除", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1000,
      vestingStartDate: at(2025, 0, 1),
      vestingYears: 1,
      cliffMonths: 6,
      vestingFrequency: "MONTHLY",
    });

    // 累计进位（banker's rounding）：
    //   cum(6)=500, cum(7)=583, cum(8)=667, cum(9)=750, cum(10)=833, cum(11)=917
    //   diffs: 500, 83, 84, 83, 83, 84, (last forced) = 83
    expect(schedule).toHaveLength(7);
    expect(schedule.map((r) => r.quantity.toString())).toEqual([
      "500",
      "83",
      "84",
      "83",
      "83",
      "84",
      "83",
    ]);
    expect(sum(schedule)).toBe("1000");
  });

  test("200 / 6月 cliff / 月归属 / 2 年（24 期）→ 19 条记录，全部整数且总和 = 200", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 200,
      vestingStartDate: at(2025, 0, 1),
      vestingYears: 2,
      cliffMonths: 6,
      vestingFrequency: "MONTHLY",
    });

    // 1 条 cliff + (24-6) = 19 条
    expect(schedule).toHaveLength(19);
    // cliff 段：cum(6) = 200*6/24 = 50
    expect(schedule[0].quantity.toString()).toBe("50");
    // 全部为整数
    schedule.forEach((r) =>
      expect(new D(r.quantity).mod(1).toNumber()).toBe(0)
    );
    expect(sum(schedule)).toBe("200");
  });

  // VEST-06: 累计进位公平性 — 任意截断点的已归属总量与「严格按比例」的差不超过 1
  test("累计进位公平性：200 / 24 期，任意截断点累计偏差 ≤ 1（PRD 3.5）", () => {
    const total = 200;
    const periods = 24; // 2 年 × 12 月
    const schedule = generateVestingSchedule({
      totalQuantity: total,
      vestingStartDate: at(2025, 0, 1),
      vestingYears: 2,
      cliffMonths: 0,
      vestingFrequency: "MONTHLY",
    });
    expect(schedule).toHaveLength(periods);

    // 任意第 k 期（1..periods）的实际累计 vs 理论累计 = total*k/periods
    let cum = new D(0);
    for (let k = 1; k <= periods; k++) {
      cum = cum.add(schedule[k - 1].quantity);
      const ideal = new D(total).mul(k).div(periods);
      const diff = cum.sub(ideal).abs().toNumber();
      expect(diff).toBeLessThanOrEqual(1);
    }
    // 终值严格相等
    expect(cum.toString()).toBe(String(total));
  });

  test("边界：授予数量为 1，1 年（12 期），累计进位后仅第 7 期获得 1 份", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1,
      vestingStartDate: at(2025, 0, 1),
      vestingYears: 1,
      cliffMonths: 0,
      vestingFrequency: "MONTHLY",
    });

    // cumAt(n) = round(n/12, banker's)：前 6 期为 0，第 7 期首次 ≥ 0.5 → 1；之后都保持 1
    // 期 1..6：都是 0；期 7：1；期 8..11：0；期 12（强制）= 1 - Σ = 0
    expect(schedule).toHaveLength(12);
    expect(schedule.map((r) => r.quantity.toString())).toEqual([
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "1",
      "0",
      "0",
      "0",
      "0",
      "0",
    ]);
    expect(sum(schedule)).toBe("1");
  });
});
