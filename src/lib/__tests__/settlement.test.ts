import { VestingRecordStatus } from "@prisma/client";
import { allocateByFIFO, type FIFOInputRecord } from "@/lib/settlement";

function mk(
  id: string,
  monthIdx: number,
  quantity: number,
  exercisable: number,
  status: VestingRecordStatus
): FIFOInputRecord {
  return {
    id,
    vestingDate: new Date(2025, monthIdx, 1),
    quantity,
    exercisableOptions: exercisable,
    status,
  };
}

describe("allocateByFIFO — PRD 3.8 场景", () => {
  test("场景 1：第 7 个月底行权 500，仅记录 1 被消耗", () => {
    // 第 7 个月底：记录 1（6月）、记录 2（7月）都已 Vested，其余仍 Pending
    const records: FIFOInputRecord[] = [
      mk("r1", 5, 600, 600, VestingRecordStatus.VESTED),
      mk("r2", 6, 100, 100, VestingRecordStatus.VESTED),
      mk("r3", 7, 100, 0, VestingRecordStatus.PENDING),
      mk("r4", 8, 100, 0, VestingRecordStatus.PENDING),
      mk("r5", 9, 100, 0, VestingRecordStatus.PENDING),
      mk("r6", 10, 100, 0, VestingRecordStatus.PENDING),
      mk("r7", 11, 100, 0, VestingRecordStatus.PENDING),
    ];

    const result = allocateByFIFO(records, 500);

    expect(result).toHaveLength(1);
    expect(result[0].recordId).toBe("r1");
    expect(result[0].consumed.toString()).toBe("500");
    expect(result[0].newExercisableOptions.toString()).toBe("100");
    expect(result[0].newStatus).toBe(VestingRecordStatus.PARTIALLY_SETTLED);
  });

  test("场景 2：第 12 个月底（已基于场景 1）再行权 550", () => {
    // 记录 1 之前已消耗 500，剩 100 + PARTIALLY_SETTLED
    const records: FIFOInputRecord[] = [
      mk("r1", 5, 600, 100, VestingRecordStatus.PARTIALLY_SETTLED),
      mk("r2", 6, 100, 100, VestingRecordStatus.VESTED),
      mk("r3", 7, 100, 100, VestingRecordStatus.VESTED),
      mk("r4", 8, 100, 100, VestingRecordStatus.VESTED),
      mk("r5", 9, 100, 100, VestingRecordStatus.VESTED),
      mk("r6", 10, 100, 100, VestingRecordStatus.VESTED),
      mk("r7", 11, 100, 100, VestingRecordStatus.VESTED),
    ];

    const result = allocateByFIFO(records, 550);

    expect(result.map((a) => a.recordId)).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
      "r5",
      "r6",
    ]);

    // r1~r5 各消耗 100，全部 Settled
    ["r1", "r2", "r3", "r4", "r5"].forEach((id, i) => {
      const a = result[i];
      expect(a.recordId).toBe(id);
      expect(a.consumed.toString()).toBe("100");
      expect(a.newExercisableOptions.toString()).toBe("0");
      expect(a.newStatus).toBe(VestingRecordStatus.SETTLED);
    });

    // r6 消耗 50，剩 50，PARTIALLY_SETTLED
    expect(result[5].consumed.toString()).toBe("50");
    expect(result[5].newExercisableOptions.toString()).toBe("50");
    expect(result[5].newStatus).toBe(VestingRecordStatus.PARTIALLY_SETTLED);
  });
});

describe("allocateByFIFO — 边界", () => {
  test("行权数量 == 可行权总量，一次清零，最后一条 Settled", () => {
    const records: FIFOInputRecord[] = [
      mk("r1", 5, 600, 100, VestingRecordStatus.PARTIALLY_SETTLED),
      mk("r2", 6, 100, 100, VestingRecordStatus.VESTED),
    ];
    const result = allocateByFIFO(records, 200);
    expect(result).toHaveLength(2);
    expect(result[0].newStatus).toBe(VestingRecordStatus.SETTLED);
    expect(result[1].newStatus).toBe(VestingRecordStatus.SETTLED);
  });

  test("行权数量超过可行权总量 → 抛错", () => {
    const records: FIFOInputRecord[] = [
      mk("r1", 5, 100, 100, VestingRecordStatus.VESTED),
    ];
    expect(() => allocateByFIFO(records, 200)).toThrow(/超过可行权总量/);
  });

  test("行权数量 ≤ 0 → 抛错", () => {
    const records: FIFOInputRecord[] = [
      mk("r1", 5, 100, 100, VestingRecordStatus.VESTED),
    ];
    expect(() => allocateByFIFO(records, 0)).toThrow(/大于 0/);
    expect(() => allocateByFIFO(records, -5)).toThrow(/大于 0/);
  });

  test("Pending / Settled 记录不参与 FIFO", () => {
    const records: FIFOInputRecord[] = [
      mk("r0", 4, 100, 0, VestingRecordStatus.SETTLED), // 已 Settled 跳过
      mk("r1", 5, 600, 600, VestingRecordStatus.VESTED),
      mk("r2", 6, 100, 0, VestingRecordStatus.PENDING), // Pending 跳过
    ];
    const result = allocateByFIFO(records, 300);
    expect(result).toHaveLength(1);
    expect(result[0].recordId).toBe("r1");
    expect(result[0].consumed.toString()).toBe("300");
  });

  test("Post-settlement 期权操作同样走 FIFO（PRD 3.8 最后一段）", () => {
    // 员工对已归属未行权的期权发起转让 150 份，按 FIFO 消耗
    const records: FIFOInputRecord[] = [
      mk("r1", 5, 600, 100, VestingRecordStatus.PARTIALLY_SETTLED),
      mk("r2", 6, 100, 100, VestingRecordStatus.VESTED),
      mk("r3", 7, 100, 100, VestingRecordStatus.VESTED),
    ];
    const result = allocateByFIFO(records, 150);
    // r1 消耗 100 → 0, Settled；r2 消耗 50 → 50, Partially Settled
    expect(result).toHaveLength(2);
    expect(result[0].recordId).toBe("r1");
    expect(result[0].newStatus).toBe(VestingRecordStatus.SETTLED);
    expect(result[1].recordId).toBe("r2");
    expect(result[1].consumed.toString()).toBe("50");
    expect(result[1].newStatus).toBe(VestingRecordStatus.PARTIALLY_SETTLED);
  });
});
