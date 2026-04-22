import {
  GrantStatus,
  PlanType,
  VestingRecordStatus,
} from "@prisma/client";
import {
  computeGrantStatus,
  validateGrantTransition,
  validateVestingTransition,
} from "@/lib/state-machine";

describe("validateGrantTransition — RSU 完整生命周期", () => {
  const rsu = PlanType.RSU;
  test("Draft → Granted → Vesting → Fully Vested → All Settled", () => {
    expect(
      validateGrantTransition(GrantStatus.DRAFT, GrantStatus.GRANTED, rsu)
    ).toBe(true);
    expect(
      validateGrantTransition(GrantStatus.GRANTED, GrantStatus.VESTING, rsu)
    ).toBe(true);
    expect(
      validateGrantTransition(
        GrantStatus.VESTING,
        GrantStatus.FULLY_VESTED,
        rsu
      )
    ).toBe(true);
    expect(
      validateGrantTransition(
        GrantStatus.FULLY_VESTED,
        GrantStatus.ALL_SETTLED,
        rsu
      )
    ).toBe(true);
  });

  test("RSU 不允许进入 STILL_EXERCISABLE 或 CLOSING", () => {
    expect(
      validateGrantTransition(
        GrantStatus.FULLY_VESTED,
        GrantStatus.STILL_EXERCISABLE,
        rsu
      )
    ).toBe(false);
    expect(
      validateGrantTransition(GrantStatus.VESTING, GrantStatus.CLOSING, rsu)
    ).toBe(false);
  });

  test("RSU 任意状态可手动 → CLOSED", () => {
    expect(
      validateGrantTransition(GrantStatus.DRAFT, GrantStatus.CLOSED, rsu)
    ).toBe(true);
    expect(
      validateGrantTransition(GrantStatus.VESTING, GrantStatus.CLOSED, rsu)
    ).toBe(true);
    expect(
      validateGrantTransition(
        GrantStatus.FULLY_VESTED,
        GrantStatus.CLOSED,
        rsu
      )
    ).toBe(true);
  });
});

describe("validateGrantTransition — Option 完整生命周期", () => {
  const opt = PlanType.OPTION;

  test("Draft → Granted → Vesting → Fully Vested → Still Exercisable → All Settled", () => {
    expect(
      validateGrantTransition(GrantStatus.DRAFT, GrantStatus.GRANTED, opt)
    ).toBe(true);
    expect(
      validateGrantTransition(GrantStatus.GRANTED, GrantStatus.VESTING, opt)
    ).toBe(true);
    expect(
      validateGrantTransition(
        GrantStatus.VESTING,
        GrantStatus.FULLY_VESTED,
        opt
      )
    ).toBe(true);
    expect(
      validateGrantTransition(
        GrantStatus.FULLY_VESTED,
        GrantStatus.STILL_EXERCISABLE,
        opt
      )
    ).toBe(true);
    expect(
      validateGrantTransition(
        GrantStatus.STILL_EXERCISABLE,
        GrantStatus.ALL_SETTLED,
        opt
      )
    ).toBe(true);
  });

  test("Option 的 Closing 流程：任意非终态 → CLOSING → CLOSED", () => {
    // 任意阶段都能进 CLOSING
    expect(
      validateGrantTransition(GrantStatus.GRANTED, GrantStatus.CLOSING, opt)
    ).toBe(true);
    expect(
      validateGrantTransition(GrantStatus.VESTING, GrantStatus.CLOSING, opt)
    ).toBe(true);
    expect(
      validateGrantTransition(
        GrantStatus.STILL_EXERCISABLE,
        GrantStatus.CLOSING,
        opt
      )
    ).toBe(true);
    expect(
      validateGrantTransition(GrantStatus.CLOSING, GrantStatus.CLOSED, opt)
    ).toBe(true);
  });

  test("CLOSED 是终态，不允许再迁移", () => {
    expect(
      validateGrantTransition(GrantStatus.CLOSED, GrantStatus.VESTING, opt)
    ).toBe(false);
    expect(
      validateGrantTransition(GrantStatus.CLOSED, GrantStatus.CLOSED, opt)
    ).toBe(false);
  });
});

describe("validateGrantTransition — 非法跳转", () => {
  test("Draft 不能直接跳到 Vesting", () => {
    expect(
      validateGrantTransition(
        GrantStatus.DRAFT,
        GrantStatus.VESTING,
        PlanType.RSU
      )
    ).toBe(false);
    expect(
      validateGrantTransition(
        GrantStatus.DRAFT,
        GrantStatus.VESTING,
        PlanType.OPTION
      )
    ).toBe(false);
  });

  test("Granted 不能直接跳到 All Settled", () => {
    expect(
      validateGrantTransition(
        GrantStatus.GRANTED,
        GrantStatus.ALL_SETTLED,
        PlanType.RSU
      )
    ).toBe(false);
  });

  test("from === to 视为非法", () => {
    expect(
      validateGrantTransition(
        GrantStatus.VESTING,
        GrantStatus.VESTING,
        PlanType.RSU
      )
    ).toBe(false);
  });
});

describe("validateVestingTransition", () => {
  test("RSU: Pending → Vested → Settled", () => {
    expect(
      validateVestingTransition(
        VestingRecordStatus.PENDING,
        VestingRecordStatus.VESTED,
        PlanType.RSU
      )
    ).toBe(true);
    expect(
      validateVestingTransition(
        VestingRecordStatus.VESTED,
        VestingRecordStatus.SETTLED,
        PlanType.RSU
      )
    ).toBe(true);
  });

  test("RSU 不允许经过 PARTIALLY_SETTLED", () => {
    expect(
      validateVestingTransition(
        VestingRecordStatus.VESTED,
        VestingRecordStatus.PARTIALLY_SETTLED,
        PlanType.RSU
      )
    ).toBe(false);
  });

  test("Option: Vested 可直接 → Settled（一次性行权）", () => {
    expect(
      validateVestingTransition(
        VestingRecordStatus.VESTED,
        VestingRecordStatus.SETTLED,
        PlanType.OPTION
      )
    ).toBe(true);
  });

  test("Option: Vested → Partially Settled → Settled", () => {
    expect(
      validateVestingTransition(
        VestingRecordStatus.VESTED,
        VestingRecordStatus.PARTIALLY_SETTLED,
        PlanType.OPTION
      )
    ).toBe(true);
    expect(
      validateVestingTransition(
        VestingRecordStatus.PARTIALLY_SETTLED,
        VestingRecordStatus.SETTLED,
        PlanType.OPTION
      )
    ).toBe(true);
  });

  test("Pending → Closed（跟随 Grant 关闭）", () => {
    expect(
      validateVestingTransition(
        VestingRecordStatus.PENDING,
        VestingRecordStatus.CLOSED,
        PlanType.RSU
      )
    ).toBe(true);
    expect(
      validateVestingTransition(
        VestingRecordStatus.PENDING,
        VestingRecordStatus.CLOSED,
        PlanType.OPTION
      )
    ).toBe(true);
  });

  test("已 Settled 不能回退", () => {
    expect(
      validateVestingTransition(
        VestingRecordStatus.SETTLED,
        VestingRecordStatus.VESTED,
        PlanType.OPTION
      )
    ).toBe(false);
  });
});

// ========== computeGrantStatus 聚合 ==========

function mkRecord(status: VestingRecordStatus) {
  return { status };
}

describe("computeGrantStatus 聚合", () => {
  test("无归属记录 → DRAFT", () => {
    expect(
      computeGrantStatus(
        { status: GrantStatus.DRAFT, planType: PlanType.RSU },
        []
      )
    ).toBe(GrantStatus.DRAFT);
  });

  test("全部 Pending → GRANTED", () => {
    const recs = [
      mkRecord(VestingRecordStatus.PENDING),
      mkRecord(VestingRecordStatus.PENDING),
    ];
    expect(
      computeGrantStatus(
        { status: GrantStatus.GRANTED, planType: PlanType.RSU },
        recs
      )
    ).toBe(GrantStatus.GRANTED);
  });

  test("混合：Vested + Pending → VESTING（RSU 和 Option 一致）", () => {
    const recs = [
      mkRecord(VestingRecordStatus.VESTED),
      mkRecord(VestingRecordStatus.PENDING),
    ];
    expect(
      computeGrantStatus(
        { status: GrantStatus.VESTING, planType: PlanType.RSU },
        recs
      )
    ).toBe(GrantStatus.VESTING);
    expect(
      computeGrantStatus(
        { status: GrantStatus.VESTING, planType: PlanType.OPTION },
        recs
      )
    ).toBe(GrantStatus.VESTING);
  });

  test("RSU：所有记录 ≥ Vested 且至少一条未 Settled → FULLY_VESTED", () => {
    const recs = [
      mkRecord(VestingRecordStatus.VESTED),
      mkRecord(VestingRecordStatus.SETTLED),
    ];
    expect(
      computeGrantStatus(
        { status: GrantStatus.VESTING, planType: PlanType.RSU },
        recs
      )
    ).toBe(GrantStatus.FULLY_VESTED);
  });

  test("Option：所有记录 ≥ Vested 且至少一条未 Settled → STILL_EXERCISABLE", () => {
    const recs = [
      mkRecord(VestingRecordStatus.VESTED),
      mkRecord(VestingRecordStatus.PARTIALLY_SETTLED),
    ];
    expect(
      computeGrantStatus(
        { status: GrantStatus.VESTING, planType: PlanType.OPTION },
        recs
      )
    ).toBe(GrantStatus.STILL_EXERCISABLE);
  });

  test("所有记录 Settled → ALL_SETTLED（RSU 和 Option 一致）", () => {
    const recs = [
      mkRecord(VestingRecordStatus.SETTLED),
      mkRecord(VestingRecordStatus.SETTLED),
    ];
    expect(
      computeGrantStatus(
        { status: GrantStatus.FULLY_VESTED, planType: PlanType.RSU },
        recs
      )
    ).toBe(GrantStatus.ALL_SETTLED);
    expect(
      computeGrantStatus(
        { status: GrantStatus.STILL_EXERCISABLE, planType: PlanType.OPTION },
        recs
      )
    ).toBe(GrantStatus.ALL_SETTLED);
  });

  test("CLOSING / CLOSED 是手动状态，不被聚合覆盖", () => {
    const recs = [
      mkRecord(VestingRecordStatus.VESTED),
      mkRecord(VestingRecordStatus.CLOSED),
    ];
    expect(
      computeGrantStatus(
        { status: GrantStatus.CLOSING, planType: PlanType.OPTION },
        recs
      )
    ).toBe(GrantStatus.CLOSING);
    expect(
      computeGrantStatus(
        { status: GrantStatus.CLOSED, planType: PlanType.RSU },
        recs
      )
    ).toBe(GrantStatus.CLOSED);
  });
});
