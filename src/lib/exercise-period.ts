/**
 * 行权截止日：vestingStartDate(或 grantDate) 加 N 年，落到当天 23:59:59.999。
 * 与 PRD 10「到期日当天 23:59:59 前员工仍可行权」一致。
 */
export function addYearsEndOfDay(base: Date, years: number): Date {
  const d = new Date(base.getTime());
  d.setFullYear(d.getFullYear() + years);
  d.setHours(23, 59, 59, 999);
  return d;
}
