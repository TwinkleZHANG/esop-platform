import {
  GrantStatus,
  PlanType,
  VestingRecordStatus,
} from "@prisma/client";

// ========== Grant 聚合 ==========

interface GrantForAggregate {
  status: GrantStatus;
  planType: PlanType;
}

interface VestingRecordForAggregate {
  status: VestingRecordStatus;
}

/**
 * 按 PRD 3.2 的聚合规则，从归属记录状态推导出 Grant 的"自动"状态。
 *
 * 手动状态不由聚合决定，直接返回当前值：
 *   - DRAFT（尚未生成归属记录）
 *   - CLOSING / CLOSED（由管理员手动触发）
 *
 * 其余情况基于归属记录分布：
 *   - 全部 Pending → GRANTED
 *   - 有 Vested+ 也有 Pending → VESTING
 *   - 无 Pending：
 *     - 全部 Settled → ALL_SETTLED
 *     - 否则（至少一条 Vested / Partially Settled）：
 *       - RSU → FULLY_VESTED
 *       - Option → STILL_EXERCISABLE
 */
export function computeGrantStatus(
  grant: GrantForAggregate,
  vestingRecords: VestingRecordForAggregate[]
): GrantStatus {
  if (
    grant.status === GrantStatus.CLOSING ||
    grant.status === GrantStatus.CLOSED
  ) {
    return grant.status;
  }

  if (vestingRecords.length === 0) {
    return GrantStatus.DRAFT;
  }

  const hasPending = vestingRecords.some(
    (r) => r.status === VestingRecordStatus.PENDING
  );
  const nonClosed = vestingRecords.filter(
    (r) => r.status !== VestingRecordStatus.CLOSED
  );
  const allPending = nonClosed.every(
    (r) => r.status === VestingRecordStatus.PENDING
  );
  const allSettled = nonClosed.every(
    (r) => r.status === VestingRecordStatus.SETTLED
  );

  if (allPending) return GrantStatus.GRANTED;
  if (hasPending) return GrantStatus.VESTING;
  if (allSettled) return GrantStatus.ALL_SETTLED;

  // 无 Pending 且非全 Settled：RSU → Fully Vested；Option → Still Exercisable
  return grant.planType === PlanType.OPTION
    ? GrantStatus.STILL_EXERCISABLE
    : GrantStatus.FULLY_VESTED;
}

// ========== Grant 合法状态流转 ==========

const COMMON_TRANSITIONS: Record<GrantStatus, GrantStatus[]> = {
  DRAFT: [GrantStatus.GRANTED, GrantStatus.CLOSED],
  GRANTED: [GrantStatus.VESTING, GrantStatus.CLOSED],
  VESTING: [GrantStatus.FULLY_VESTED, GrantStatus.CLOSED],
  FULLY_VESTED: [GrantStatus.ALL_SETTLED, GrantStatus.CLOSED],
  STILL_EXERCISABLE: [GrantStatus.ALL_SETTLED, GrantStatus.CLOSED],
  ALL_SETTLED: [GrantStatus.CLOSED],
  CLOSING: [GrantStatus.CLOSED],
  CLOSED: [],
};

/**
 * 校验 Grant 状态流转是否合法。
 * - RSU：不允许进入 STILL_EXERCISABLE / CLOSING
 * - Option：FULLY_VESTED 可进入 STILL_EXERCISABLE；任意非 CLOSED 可进入 CLOSING
 */
export function validateGrantTransition(
  from: GrantStatus,
  to: GrantStatus,
  planType: PlanType
): boolean {
  if (from === to) return false;

  const allowed = new Set<GrantStatus>(COMMON_TRANSITIONS[from]);

  if (planType === PlanType.OPTION) {
    // Option 特有：FULLY_VESTED → STILL_EXERCISABLE
    if (from === GrantStatus.FULLY_VESTED) {
      allowed.add(GrantStatus.STILL_EXERCISABLE);
    }
    // Option 任意非 CLOSED 状态都可进入 CLOSING
    if (from !== GrantStatus.CLOSED && from !== GrantStatus.CLOSING) {
      allowed.add(GrantStatus.CLOSING);
    }
  } else {
    // RSU 不允许 STILL_EXERCISABLE / CLOSING
    allowed.delete(GrantStatus.STILL_EXERCISABLE);
    allowed.delete(GrantStatus.CLOSING);
  }

  return allowed.has(to);
}

// ========== VestingRecord 合法状态流转 ==========

/**
 * 校验 VestingRecord 状态流转是否合法。
 * RSU: PENDING → VESTED → SETTLED；PENDING → CLOSED
 * Option: PENDING → VESTED → (PARTIALLY_SETTLED →) SETTLED；PENDING → CLOSED
 *   - Option 允许 VESTED → SETTLED（一次性行权全部）
 */
export function validateVestingTransition(
  from: VestingRecordStatus,
  to: VestingRecordStatus,
  planType: PlanType
): boolean {
  if (from === to) return false;

  if (planType === PlanType.RSU) {
    const rsu: Record<VestingRecordStatus, VestingRecordStatus[]> = {
      PENDING: [VestingRecordStatus.VESTED, VestingRecordStatus.CLOSED],
      VESTED: [VestingRecordStatus.SETTLED],
      PARTIALLY_SETTLED: [], // RSU 不使用
      SETTLED: [],
      CLOSED: [],
    };
    return rsu[from].includes(to);
  }

  // Option
  const opt: Record<VestingRecordStatus, VestingRecordStatus[]> = {
    PENDING: [VestingRecordStatus.VESTED, VestingRecordStatus.CLOSED],
    VESTED: [
      VestingRecordStatus.PARTIALLY_SETTLED,
      VestingRecordStatus.SETTLED,
    ],
    PARTIALLY_SETTLED: [VestingRecordStatus.SETTLED],
    SETTLED: [],
    CLOSED: [],
  };
  return opt[from].includes(to);
}
