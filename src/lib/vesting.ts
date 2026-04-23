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
 * 策略（PRD 3）：累计进位法（cumulative rounding），保证整数归属并严格整除到 totalQuantity。
 *
 * 算法：
 *   cumN  = round(totalQuantity × N / totalPeriods)
 *   本期归属 quantityN = cumN - cum(N-1)
 *   最后一期强制 = totalQuantity - Σ(前几期)，避免浮点累积误差
 *
 * cliff 段合并：把前 cliffPeriods 期合成单条记录（qty = cum(cliffPeriods)）。
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

  // 累计进位：cumAt(N) = round(total * N / totalPeriods)
  const cumAt = (n: number): Decimal =>
    total.mul(n).div(totalPeriods).toDecimalPlaces(0, D.ROUND_HALF_EVEN);

  const records: GeneratedVestingRecord[] = [];

  // 起始期：cliff 段合并为单条（qty = cumAt(cliffPeriods)），或无 cliff 时第一期 = cumAt(1)
  const startPeriod = cliffPeriods >= 1 ? cliffPeriods : 1;

  const firstQty = cumAt(startPeriod);
  records.push({
    vestingDate: addMonths(vestingStartDate, startPeriod * periodMonths),
    quantity: firstQty,
  });

  for (let n = startPeriod + 1; n <= totalPeriods; n++) {
    const qty = cumAt(n).sub(cumAt(n - 1));
    records.push({
      vestingDate: addMonths(vestingStartDate, n * periodMonths),
      quantity: qty,
    });
  }

  // 最后一期强制等于 total - Σ(前面) —— 防止累计舍入误差
  const sumExceptLast = records
    .slice(0, -1)
    .reduce((acc, r) => acc.add(r.quantity), new D(0));
  records[records.length - 1].quantity = total.sub(sumExceptLast);

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
