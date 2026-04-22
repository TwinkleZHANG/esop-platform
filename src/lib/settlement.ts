import { Prisma, VestingRecordStatus } from "@prisma/client";

type Decimal = Prisma.Decimal;
const D = Prisma.Decimal;

export interface FIFOInputRecord {
  id: string;
  vestingDate: Date;
  /** 本期归属总数量（期权） */
  quantity: Decimal | number | string;
  /** 剩余可行权期权数 */
  exercisableOptions: Decimal | number | string;
  status: VestingRecordStatus;
}

export interface FIFOAllocation {
  recordId: string;
  /** 本次从该记录消耗的数量 */
  consumed: Decimal;
  /** 消耗后剩余可行权期权数 */
  newExercisableOptions: Decimal;
  /** 消耗后应有的新状态 */
  newStatus: VestingRecordStatus;
}

/**
 * FIFO 行权/期权 post-settlement 分配（PRD 3.8）。
 *
 * - 按传入顺序消耗（调用方保证按 vestingDate 升序）；
 * - 仅 VESTED 或 PARTIALLY_SETTLED 的记录参与；
 * - 返回只包含本次被消耗的记录（consumed > 0）；
 * - 消耗后状态：
 *   · exercisableOptions == 0 → SETTLED
 *   · 原 VESTED 且消耗后 > 0 → PARTIALLY_SETTLED
 *   · 原 PARTIALLY_SETTLED 且消耗后 > 0 → 仍为 PARTIALLY_SETTLED
 */
export function allocateByFIFO(
  records: FIFOInputRecord[],
  exerciseQuantity: Decimal | number | string
): FIFOAllocation[] {
  const qty = new D(exerciseQuantity);
  if (qty.lte(0)) {
    throw new Error("行权数量必须大于 0");
  }

  const eligible = records.filter(
    (r) =>
      r.status === VestingRecordStatus.VESTED ||
      r.status === VestingRecordStatus.PARTIALLY_SETTLED
  );

  const totalAvailable = eligible.reduce(
    (acc, r) => acc.add(new D(r.exercisableOptions)),
    new D(0)
  );
  if (qty.gt(totalAvailable)) {
    throw new Error(
      `行权数量 ${qty.toString()} 超过可行权总量 ${totalAvailable.toString()}`
    );
  }

  const allocations: FIFOAllocation[] = [];
  let remaining = qty;

  for (const rec of eligible) {
    if (remaining.lte(0)) break;
    const available = new D(rec.exercisableOptions);
    if (available.lte(0)) continue;

    const consumed = D.min(available, remaining);
    const newExercisable = available.sub(consumed);

    let newStatus: VestingRecordStatus;
    if (newExercisable.isZero()) {
      newStatus = VestingRecordStatus.SETTLED;
    } else {
      // 部分消耗：无论原先是 VESTED 还是 PARTIALLY_SETTLED，结果都是 PARTIALLY_SETTLED
      newStatus = VestingRecordStatus.PARTIALLY_SETTLED;
    }

    allocations.push({
      recordId: rec.id,
      consumed,
      newExercisableOptions: newExercisable,
      newStatus,
    });

    remaining = remaining.sub(consumed);
  }

  return allocations;
}
