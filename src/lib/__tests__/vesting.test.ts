import { Prisma } from "@prisma/client";
import { generateVestingSchedule } from "@/lib/vesting";

const D = Prisma.Decimal;

function qtyAt(year: number, month0Based: number, day = 1) {
  return new Date(year, month0Based, day);
}

describe("generateVestingSchedule", () => {
  test("PRD 示例：1200 / 6月 cliff / 月归属 / 1 年 → 7 条 [600, 100×6]", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1200,
      vestingStartDate: qtyAt(2025, 0, 1), // 2025-01-01
      vestingYears: 1,
      cliffMonths: 6,
      vestingFrequency: "MONTHLY",
    });

    expect(schedule).toHaveLength(7);
    expect(schedule[0].quantity.toString()).toBe("600");
    for (let i = 1; i < 7; i++) {
      expect(schedule[i].quantity.toString()).toBe("100");
    }

    // 日期校验：第 1 条 = 第 6 个月末，第 7 条 = 第 12 个月末
    expect(schedule[0].vestingDate).toEqual(qtyAt(2025, 6, 1));
    expect(schedule[6].vestingDate).toEqual(qtyAt(2026, 0, 1));

    // 总和校验
    const sum = schedule.reduce(
      (acc, r) => acc.add(r.quantity),
      new D(0)
    );
    expect(sum.toString()).toBe("1200");
  });

  test("无 cliff：1200 / 月归属 / 1 年 → 12 条 × 100", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1200,
      vestingStartDate: qtyAt(2025, 0, 1),
      vestingYears: 1,
      cliffMonths: 0,
      vestingFrequency: "MONTHLY",
    });

    expect(schedule).toHaveLength(12);
    schedule.forEach((r) => expect(r.quantity.toString()).toBe("100"));
  });

  test("按年归属：1200 / 按年 / 4 年 / 无 cliff → 4 条 × 300", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1200,
      vestingStartDate: qtyAt(2025, 0, 1),
      vestingYears: 4,
      cliffMonths: 0,
      vestingFrequency: "YEARLY",
    });

    expect(schedule).toHaveLength(4);
    schedule.forEach((r) => expect(r.quantity.toString()).toBe("300"));
    expect(schedule[0].vestingDate).toEqual(qtyAt(2026, 0, 1));
    expect(schedule[3].vestingDate).toEqual(qtyAt(2029, 0, 1));
  });

  test("不整除：1000 / 6月 cliff / 月归属 / 1 年 → 余数并入最后一期", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1000,
      vestingStartDate: qtyAt(2025, 0, 1),
      vestingYears: 1,
      cliffMonths: 6,
      vestingFrequency: "MONTHLY",
    });

    // 7 条记录：[498, 83×5, 87]
    expect(schedule).toHaveLength(7);
    expect(schedule[0].quantity.toString()).toBe("498"); // 83 * 6
    for (let i = 1; i <= 5; i++) {
      expect(schedule[i].quantity.toString()).toBe("83");
    }
    expect(schedule[6].quantity.toString()).toBe("87"); // 83 + 余数 4

    const sum = schedule.reduce(
      (acc, r) => acc.add(r.quantity),
      new D(0)
    );
    expect(sum.toString()).toBe("1000");
  });

  test("边界：授予数量为 1，12 期，每期截断为 0，余数 1 全部并入最后一期", () => {
    const schedule = generateVestingSchedule({
      totalQuantity: 1,
      vestingStartDate: qtyAt(2025, 0, 1),
      vestingYears: 1,
      cliffMonths: 0,
      vestingFrequency: "MONTHLY",
    });

    expect(schedule).toHaveLength(12);
    for (let i = 0; i < 11; i++) {
      expect(schedule[i].quantity.toString()).toBe("0");
    }
    expect(schedule[11].quantity.toString()).toBe("1");
  });
});
