import { Prisma } from "@prisma/client";

type Decimal = Prisma.Decimal;
const D = Prisma.Decimal;

export type VestingFrequency = "MONTHLY" | "YEARLY";

export interface GenerateVestingScheduleParams {
  totalQuantity: Decimal | number | string;
  vestingStartDate: Date;
  vestingYears: number;
  cliffMonths: number;
  vestingFrequency: VestingFrequency;
}

export interface GeneratedVestingRecord {
  vestingDate: Date;
  quantity: Decimal;
}

/**
 * 生成归属计划。
 *
 * 策略（PRD 3.8 + 6.2 注释）：
 * - 每期按 floor(totalQuantity / totalPeriods) 截断；
 * - 剩余零头一次性并入最后一期，保证 Σquantity === totalQuantity。
 * - cliff 段合并为单条记录（quantity = perPeriod × cliffPeriods），
 *   归属日期 = start + cliffPeriods × 周期长度；
 *   之后按周期逐期生成直到 totalPeriods。
 */
export function generateVestingSchedule(
  params: GenerateVestingScheduleParams
): GeneratedVestingRecord[] {
  const {
    totalQuantity,
    vestingStartDate,
    vestingYears,
    cliffMonths,
    vestingFrequency,
  } = params;

  if (vestingYears <= 0) {
    throw new Error("vestingYears 必须为正整数");
  }
  if (cliffMonths < 0) {
    throw new Error("cliffMonths 不能为负数");
  }

  const total = new D(totalQuantity);
  if (total.lte(0)) {
    throw new Error("totalQuantity 必须大于 0");
  }

  const periodMonths = vestingFrequency === "MONTHLY" ? 1 : 12;
  const totalPeriods =
    vestingFrequency === "MONTHLY" ? vestingYears * 12 : vestingYears;
  const cliffPeriods = Math.floor(cliffMonths / periodMonths);

  if (cliffPeriods >= totalPeriods) {
    // cliff 覆盖或超过整个归属期：退化为单期一次性归属
    return [
      {
        vestingDate: addMonths(vestingStartDate, totalPeriods * periodMonths),
        quantity: total,
      },
    ];
  }

  // 截断（Decimal.floor 默认是向下取整）
  const perPeriod = total.div(totalPeriods).floor();

  const records: GeneratedVestingRecord[] = [];

  if (cliffPeriods >= 1) {
    records.push({
      vestingDate: addMonths(vestingStartDate, cliffPeriods * periodMonths),
      quantity: perPeriod.mul(cliffPeriods),
    });
    for (let i = cliffPeriods + 1; i <= totalPeriods; i++) {
      records.push({
        vestingDate: addMonths(vestingStartDate, i * periodMonths),
        quantity: perPeriod,
      });
    }
  } else {
    for (let i = 1; i <= totalPeriods; i++) {
      records.push({
        vestingDate: addMonths(vestingStartDate, i * periodMonths),
        quantity: perPeriod,
      });
    }
  }

  // 余数并入最后一期
  const sumOfFloors = records.reduce(
    (acc, r) => acc.add(r.quantity),
    new D(0)
  );
  const remainder = total.sub(sumOfFloors);
  if (!remainder.isZero()) {
    const last = records[records.length - 1];
    last.quantity = last.quantity.add(remainder);
  }

  return records;
}

/**
 * 基于日历月的月份加法：保留日分量，跨月时若目标月份无对应日则回退到该月最后一天。
 */
function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  const targetMonth = d.getMonth() + months;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(targetMonth);
  const lastDayOfMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0
  ).getDate();
  d.setDate(Math.min(day, lastDayOfMonth));
  return d;
}
