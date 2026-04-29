/**
 * Phase 4 — 端到端业务流程测试（TEST_PLAN 第 4 节）
 *
 * 4.1 RSU 完整生命周期（26 步）
 * 4.2 Option 完整生命周期（18 步）
 * 4.3 员工离职级联（10 步）
 * 4.4 Option Closing 窗口期到期（8 步）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import { POST as plansPOST } from "@/app/api/plans/route";
import { PATCH as planPATCH } from "@/app/api/plans/[id]/route";
import { POST as valuationsPOST } from "@/app/api/valuations/route";
import { POST as employeesPOST } from "@/app/api/employees/route";
import { PUT as employeePUT } from "@/app/api/employees/[id]/route";
import { POST as grantsPOST } from "@/app/api/grants/route";
import { PATCH as grantPATCH } from "@/app/api/grants/[id]/route";
import { POST as cronPOST } from "@/app/api/cron/daily/route";
import { POST as opsPOST } from "@/app/api/operations/route";
import { PATCH as opsPATCH } from "@/app/api/operations/[id]/route";
import { PATCH as taxPATCH } from "@/app/api/tax-events/[id]/route";
import { POST as taxUploadPOST } from "@/app/api/tax-events/[id]/upload/route";
import { GET as empTaxGET } from "@/app/api/employee/tax-records/route";
import {
  cleanDatabase,
  createTestUser,
  disconnect,
  getRequest,
  jsonRequest,
  prisma,
  readJson,
  setSession,
} from "@/lib/__tests__/test-helpers";

const mockedGetSession = getServerSession as jest.Mock;

interface ApiBody<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function uploadRequest(taxEventId: string) {
  const fd = new FormData();
  fd.append("files", new File([new Uint8Array([1, 2, 3])], "p.png", { type: "image/png" }));
  return new Request(`http://localhost/api/tax-events/${taxEventId}/upload`, {
    method: "POST",
    body: fd,
  });
}

const cronReq = () =>
  new Request("http://localhost/api/cron/daily", { method: "POST" });

describe("E2E 4.1 RSU 完整生命周期", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("RSU 全链路：创建 → 审批 → 估值 → 授予员工 → 推进 → 归属 → 缴税 → 售出 → ALL_SETTLED", async () => {
    // 角色用户
    const grantAdmin = await createTestUser("GRANT_ADMIN");
    const approver = await createTestUser("APPROVAL_ADMIN");
    const superAdmin = await createTestUser("SUPER_ADMIN");

    // 1. 授予管理员创建 RSU 计划
    setSession(mockedGetSession, grantAdmin);
    const planRes = await plansPOST(
      jsonRequest("http://localhost/api/plans", {
        body: {
          title: "RSU-E2E", type: "RSU", jurisdiction: "内地",
          deliveryMethods: ["SHARES"], poolSize: "10000",
          effectiveDate: "2025-01-01",
        },
      })
    );
    const plan = (await readJson<ApiBody<{ id: string }>>(planRes)).data!;

    // 2. 审批管理员审批通过
    setSession(mockedGetSession, approver);
    const approveRes = await planPATCH(
      new Request(`http://localhost/api/plans/${plan.id}`, { method: "PATCH" }),
      { params: { id: plan.id } }
    );
    expect(approveRes.status).toBe(200);

    // 3. 添加估值（valuationDate=2025-01-01, fmv=100）
    setSession(mockedGetSession, approver);
    await valuationsPOST(
      jsonRequest("http://localhost/api/valuations", {
        body: { valuationDate: "2025-01-01", fmv: "100" },
      })
    );

    // 4. 添加员工 D
    setSession(mockedGetSession, grantAdmin);
    const empRes = await employeesPOST(
      jsonRequest("http://localhost/api/employees", {
        body: {
          name: "员工D", employeeId: `EMP-D-${Date.now()}`,
          email: `emp-d-${Date.now()}@test.com`,
          legalIdentity: "MAINLAND", taxResidence: "MAINLAND",
        },
      })
    );
    const empData = (await readJson<ApiBody<{ id: string; email: string }>>(empRes)).data!;
    const employee = (await prisma.user.findUnique({ where: { id: empData.id } }))!;

    // 5. 创建 RSU 授予（quantity=1200, 6月cliff, 按月, 1年, vestingStartDate=2025-01-01）
    setSession(mockedGetSession, grantAdmin);
    const grantRes = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: {
          planId: plan.id, userId: employee.id,
          grantDate: "2025-01-01", vestingStartDate: "2025-01-01",
          totalQuantity: "1200", vestingYears: 1, cliffMonths: 6,
          vestingFrequency: "MONTHLY",
        },
      })
    );
    const grant = (await readJson<ApiBody<{ id: string }>>(grantRes)).data!;

    // 6. 审批管理员推进 Draft → Granted（补协议 ID）
    setSession(mockedGetSession, approver);
    const advanceRes = await grantPATCH(
      jsonRequest(`http://localhost/api/grants/${grant.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "AG-RSU-E2E-001" },
      }),
      { params: { id: grant.id } }
    );
    expect(advanceRes.status).toBe(200);

    // 7. 应有 7 条归属记录，全部 PENDING
    let records = await prisma.vestingRecord.findMany({
      where: { grantId: grant.id }, orderBy: { vestingDate: "asc" },
    });
    expect(records.length).toBe(7);
    records.forEach((r) => expect(r.status).toBe("PENDING"));

    // 8. Grant=GRANTED, 9. operableShares=0/operableOptions=0
    let g = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(g?.status).toBe("GRANTED");
    expect(g?.operableShares.toFixed(0)).toBe("0");
    expect(g?.operableOptions.toFixed(0)).toBe("0");

    // 10. 模拟到期：把所有归属日期推到过去
    await prisma.vestingRecord.updateMany({
      where: { grantId: grant.id },
      data: { vestingDate: new Date("2025-12-31") },
    });

    // POST cron
    await cronPOST(cronReq());

    // 11. 到期归属 → VESTED
    records = await prisma.vestingRecord.findMany({
      where: { grantId: grant.id }, orderBy: { vestingDate: "asc" },
    });
    records.forEach((r) => expect(r.status).toBe("VESTED"));

    // 12. Grant 推进（VESTING 或 FULLY_VESTED） — 全部 Vested 应到 FULLY_VESTED
    g = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(g?.status).toBe("FULLY_VESTED");

    // 13. 自动生成 7 条 VESTING_TAX
    const vestingTaxes = await prisma.taxEvent.findMany({
      where: { grantId: grant.id, eventType: "VESTING_TAX" },
    });
    expect(vestingTaxes.length).toBe(7);

    // 14. operableShares 仍为 0（税务未确认）
    expect(g?.operableShares.toFixed(0)).toBe("0");

    // 15. 员工查看待缴款记录
    setSession(mockedGetSession, employee);
    const taxList = await empTaxGET(getRequest("http://localhost/api/employee/tax-records"));
    expect(taxList.status).toBe(200);

    // 16. 员工上传凭证（取第一条）→ 17. 状态 → RECEIPT_UPLOADED
    const firstTax = vestingTaxes[0];
    const uploadRes = await taxUploadPOST(uploadRequest(firstTax.id), {
      params: { id: firstTax.id },
    });
    expect(uploadRes.status).toBe(200);
    let after = await prisma.taxEvent.findUnique({ where: { id: firstTax.id } });
    expect(after?.status).toBe("RECEIPT_UPLOADED");

    // 18-21. 管理员确认税务 → CONFIRMED → operableShares += qty → 归属 → SETTLED
    setSession(mockedGetSession, approver);
    const confirmRes = await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${firstTax.id}`, {
        method: "PATCH", body: { action: "CONFIRM" },
      }),
      { params: { id: firstTax.id } }
    );
    expect(confirmRes.status).toBe(200);
    after = await prisma.taxEvent.findUnique({ where: { id: firstTax.id } });
    expect(after?.status).toBe("CONFIRMED");
    g = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(g?.operableShares.toFixed(0)).toBe("600"); // cliff 期数量
    const vrAfter = await prisma.vestingRecord.findUnique({
      where: { id: firstTax.vestingRecordId! },
    });
    expect(vrAfter?.status).toBe("SETTLED");

    // 22. 员工 post-settlement 申请（SELL 200 股 ≤ 600）
    setSession(mockedGetSession, employee);
    const sellRes = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: grant.id, requestType: "SELL", quantity: "200" },
      })
    );
    expect(sellRes.status).toBe(200);
    const sellOp = (await readJson<ApiBody<{ id: string }>>(sellRes)).data!;

    // 23. 审批通过 → 生成 POST_SETTLEMENT_TAX
    setSession(mockedGetSession, approver);
    await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${sellOp.id}`, {
        method: "PATCH", body: { decision: "APPROVE" },
      }),
      { params: { id: sellOp.id } }
    );
    const psTax = await prisma.taxEvent.findFirst({
      where: { operationRequestId: sellOp.id },
    });
    expect(psTax?.eventType).toBe("POST_SETTLEMENT_TAX");

    // 24. 员工上传凭证 → 管理员确认 → 25. operableShares -= 售出数量
    setSession(mockedGetSession, employee);
    await taxUploadPOST(uploadRequest(psTax!.id), { params: { id: psTax!.id } });
    setSession(mockedGetSession, approver);
    await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${psTax!.id}`, {
        method: "PATCH", body: { action: "CONFIRM" },
      }),
      { params: { id: psTax!.id } }
    );
    g = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(g?.operableShares.toFixed(0)).toBe("400"); // 600 - 200

    // 26. 把剩余 6 条 VESTING_TAX 全部确认完成 + 卖空所有股票 → ALL_SETTLED
    for (let i = 1; i < vestingTaxes.length; i++) {
      const t = vestingTaxes[i];
      setSession(mockedGetSession, employee);
      await taxUploadPOST(uploadRequest(t.id), { params: { id: t.id } });
      setSession(mockedGetSession, approver);
      await taxPATCH(
        jsonRequest(`http://localhost/api/tax-events/${t.id}`, {
          method: "PATCH", body: { action: "CONFIRM" },
        }),
        { params: { id: t.id } }
      );
    }
    g = await prisma.grant.findUnique({ where: { id: grant.id } });
    // 此时所有归属 SETTLED；但 operableShares > 0；Grant 应仍在 FULLY_VESTED 或 ALL_SETTLED
    // ALL_SETTLED 仅在所有归属 == SETTLED（聚合规则）。检查归属状态：
    const allRecords = await prisma.vestingRecord.findMany({
      where: { grantId: grant.id },
    });
    allRecords.forEach((r) => expect(r.status).toBe("SETTLED"));
    void superAdmin;
    // ALL_SETTLED 取决于聚合（已通过单测覆盖）：所有 SETTLED → ALL_SETTLED
    expect(g?.status).toBe("ALL_SETTLED");
  });
});

describe("E2E 4.2 Option 完整生命周期", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("Option 全链路：归属 → 行权 → 售出实股", async () => {
    const grantAdmin = await createTestUser("GRANT_ADMIN");
    const approver = await createTestUser("APPROVAL_ADMIN");

    // 1. 创建 Option 计划并审批
    setSession(mockedGetSession, grantAdmin);
    const planRes = await plansPOST(
      jsonRequest("http://localhost/api/plans", {
        body: {
          title: "OPT-E2E", type: "OPTION", jurisdiction: "内地",
          poolSize: "10000", effectiveDate: "2025-01-01",
        },
      })
    );
    const plan = (await readJson<ApiBody<{ id: string }>>(planRes)).data!;
    setSession(mockedGetSession, approver);
    await planPATCH(
      new Request(`http://localhost/api/plans/${plan.id}`, { method: "PATCH" }),
      { params: { id: plan.id } }
    );

    // 估值
    await valuationsPOST(
      jsonRequest("http://localhost/api/valuations", {
        body: { valuationDate: "2024-01-01", fmv: "100" },
      })
    );

    // 员工 + 授予
    const employee = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, grantAdmin);
    const grantRes = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: {
          planId: plan.id, userId: employee.id,
          grantDate: "2025-01-01", vestingStartDate: "2025-01-01",
          totalQuantity: "1200", strikePrice: "50",
          vestingYears: 1, cliffMonths: 6, vestingFrequency: "MONTHLY",
          exercisePeriodYears: 5,
        },
      })
    );
    const grant = (await readJson<ApiBody<{ id: string }>>(grantRes)).data!;

    // 推进
    setSession(mockedGetSession, approver);
    await grantPATCH(
      jsonRequest(`http://localhost/api/grants/${grant.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "AG-OPT-001" },
      }),
      { params: { id: grant.id } }
    );

    // 7. 模拟全部到期
    await prisma.vestingRecord.updateMany({
      where: { grantId: grant.id },
      data: { vestingDate: new Date("2025-12-31") },
    });
    await cronPOST(cronReq());

    // 8. VESTED + 9. operableOptions = 1200 + 10. 不自动生成税务
    let g = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(g?.operableOptions.toFixed(0)).toBe("1200");
    expect(g?.operableShares.toFixed(0)).toBe("0");
    const taxBeforeExercise = await prisma.taxEvent.findMany({
      where: { grantId: grant.id, eventType: "EXERCISE_TAX" },
    });
    expect(taxBeforeExercise.length).toBe(0);

    // 11. 员工行权 500
    setSession(mockedGetSession, employee);
    const exRes = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: {
          grantId: grant.id, requestType: "EXERCISE",
          requestTarget: "OPTIONS", quantity: "500",
        },
      })
    );
    expect(exRes.status).toBe(200);
    const exOp = (await readJson<ApiBody<{ id: string }>>(exRes)).data!;

    // 12. 审批通过 → 生成 EXERCISE_TAX
    setSession(mockedGetSession, approver);
    await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${exOp.id}`, {
        method: "PATCH", body: { decision: "APPROVE" },
      }),
      { params: { id: exOp.id } }
    );
    const exTax = await prisma.taxEvent.findFirst({
      where: { operationRequestId: exOp.id },
    });
    expect(exTax?.eventType).toBe("EXERCISE_TAX");

    // 13. 员工凭证 → 管理员确认
    setSession(mockedGetSession, employee);
    await taxUploadPOST(uploadRequest(exTax!.id), { params: { id: exTax!.id } });
    setSession(mockedGetSession, approver);
    await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${exTax!.id}`, {
        method: "PATCH", body: { action: "CONFIRM" },
      }),
      { params: { id: exTax!.id } }
    );

    // 14. operableOptions -= 500, operableShares += 500
    g = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(g?.operableOptions.toFixed(0)).toBe("700");
    expect(g?.operableShares.toFixed(0)).toBe("500");

    // 15. FIFO 消耗：cliff 那条 600 被消耗 500，剩 100 → PARTIALLY_SETTLED
    const records = await prisma.vestingRecord.findMany({
      where: { grantId: grant.id },
    });
    const partial = records.find((r) => r.status === "PARTIALLY_SETTLED");
    expect(partial).toBeTruthy();
    expect(partial?.exercisableOptions.toFixed(0)).toBe("100");
    // 总剩余可行权 = 1200 - 500 = 700
    const totalExercisable = records.reduce(
      (acc, r) => acc + Number(r.exercisableOptions.toFixed(0)),
      0
    );
    expect(totalExercisable).toBe(700);

    // 16. 员工售出实股 200
    setSession(mockedGetSession, employee);
    const sellRes = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: {
          grantId: grant.id, requestType: "SELL",
          requestTarget: "SHARES", quantity: "200",
        },
      })
    );
    const sellOp = (await readJson<ApiBody<{ id: string }>>(sellRes)).data!;

    // 17. 审批 → 税务 → 确认
    setSession(mockedGetSession, approver);
    await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${sellOp.id}`, {
        method: "PATCH", body: { decision: "APPROVE" },
      }),
      { params: { id: sellOp.id } }
    );
    const psTax = await prisma.taxEvent.findFirst({
      where: { operationRequestId: sellOp.id },
    });
    setSession(mockedGetSession, employee);
    await taxUploadPOST(uploadRequest(psTax!.id), { params: { id: psTax!.id } });
    setSession(mockedGetSession, approver);
    await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${psTax!.id}`, {
        method: "PATCH", body: { action: "CONFIRM" },
      }),
      { params: { id: psTax!.id } }
    );

    // 18. operableShares -= 200 → 300
    g = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(g?.operableShares.toFixed(0)).toBe("300");
    expect(g?.operableOptions.toFixed(0)).toBe("700");
  });
});

describe("E2E 4.3 员工离职级联", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("离职级联：PENDING 申请关闭 + RSU/Option Grant 处理 + 已 SETTLED 不变", async () => {
    const approver = await createTestUser("APPROVAL_ADMIN");
    const employee = await createTestUser("EMPLOYEE");

    // 准备 RSU Grant（VESTING：部分 PENDING + 部分 VESTED）
    const rsuPlan = await prisma.plan.create({
      data: {
        title: "RSU-Off", type: "RSU", jurisdiction: "内地",
        deliveryMethod: { methods: ["SHARES"] },
        poolSize: "10000", effectiveDate: new Date(), status: "APPROVED",
      },
    });
    const rsuGrant = await prisma.grant.create({
      data: {
        planId: rsuPlan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "VESTING",
      },
    });
    const rsuVested = await prisma.vestingRecord.create({
      data: { grantId: rsuGrant.id, vestingDate: new Date("2024-01-01"), quantity: "40", status: "VESTED" },
    });
    const rsuPending = await prisma.vestingRecord.create({
      data: { grantId: rsuGrant.id, vestingDate: new Date("2099-01-01"), quantity: "60", status: "PENDING" },
    });

    // Option Grant（operableOptions > 0）
    const optPlan = await prisma.plan.create({
      data: {
        title: "OPT-Off", type: "OPTION", jurisdiction: "内地",
        deliveryMethod: { methods: ["OPTION_RIGHT"] },
        poolSize: "10000", effectiveDate: new Date(), status: "APPROVED",
      },
    });
    const optGrant = await prisma.grant.create({
      data: {
        planId: optPlan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "200", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "STILL_EXERCISABLE",
        operableOptions: "200", strikePrice: "5",
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: optGrant.id, vestingDate: new Date("2024-01-01"),
        quantity: "200", exercisableOptions: "200", status: "VESTED",
      },
    });

    // PENDING 行权申请
    const pendingReq = await prisma.operationRequest.create({
      data: {
        grantId: optGrant.id, userId: employee.id,
        requestType: "EXERCISE", requestTarget: "OPTIONS",
        quantity: "50", status: "PENDING",
      },
    });

    // 4. 设置员工 D 为离职（窗口期 30 天）
    setSession(mockedGetSession, approver);
    const offRes = await employeePUT(
      jsonRequest(`http://localhost/api/employees/${employee.id}`, {
        method: "PUT",
        body: {
          employmentStatus: "离职",
          offboardReason: "主动辞职",
          exerciseWindowDays: 30,
        },
      }),
      { params: { id: employee.id } }
    );
    expect(offRes.status).toBe(200);

    // 5. PENDING 申请 → CLOSED
    const reqAfter = await prisma.operationRequest.findUnique({
      where: { id: pendingReq.id },
    });
    expect(reqAfter?.status).toBe("CLOSED");

    // 6. RSU Grant → CLOSED, PENDING 归属 → CLOSED
    const rsuAfter = await prisma.grant.findUnique({ where: { id: rsuGrant.id } });
    expect(rsuAfter?.status).toBe("CLOSED");
    const rsuPendingAfter = await prisma.vestingRecord.findUnique({ where: { id: rsuPending.id } });
    expect(rsuPendingAfter?.status).toBe("CLOSED");

    // 7. Option Grant → CLOSING（截止日 = 今天 + 30）
    const optAfter = await prisma.grant.findUnique({ where: { id: optGrant.id } });
    expect(optAfter?.status).toBe("CLOSING");
    expect(optAfter?.exerciseWindowDeadline).toBeTruthy();
    expect(optAfter?.exerciseWindowDays).toBe(30);

    // 8. 已 VESTED 归属不受影响（RSU 的 VESTED 仍 VESTED）
    const rsuVestedAfter = await prisma.vestingRecord.findUnique({ where: { id: rsuVested.id } });
    expect(rsuVestedAfter?.status).toBe("VESTED");

    // 9. operableShares 保持不变（这两个 Grant 的 operableShares 都是 0）
    expect(rsuAfter?.operableShares.toFixed(0)).toBe("0");
    expect(optAfter?.operableShares.toFixed(0)).toBe("0");

    // 10. 员工状态 = 离职
    const userAfter = await prisma.user.findUnique({ where: { id: employee.id } });
    expect(userAfter?.employmentStatus).toBe("离职");
  });
});

describe("E2E 4.4 Option Closing 窗口期到期", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("Closing 到期：operableOptions=0, 归属→CLOSED, Grant→CLOSED, 申请→CLOSED, 额度释放", async () => {
    const employee = await createTestUser("EMPLOYEE");
    const plan = await prisma.plan.create({
      data: {
        title: "OPT-Close", type: "OPTION", jurisdiction: "内地",
        deliveryMethod: { methods: ["OPTION_RIGHT"] },
        poolSize: "10000", effectiveDate: new Date(), status: "APPROVED",
      },
    });

    // 1. 构造 CLOSING 状态的 Option Grant
    const grant = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "300", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "CLOSING",
        operableOptions: "300", strikePrice: "5",
        exerciseWindowDeadline: new Date("2024-01-01"),  // 已过期
        exerciseWindowDays: 30,
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: grant.id, vestingDate: new Date("2023-12-01"),
        quantity: "300", exercisableOptions: "300", status: "VESTED",
      },
    });
    const pendingReq = await prisma.operationRequest.create({
      data: {
        grantId: grant.id, userId: employee.id,
        requestType: "EXERCISE", requestTarget: "OPTIONS",
        quantity: "100", status: "PENDING",
      },
    });

    // 2/3. cron 触发
    await cronPOST(cronReq());

    // 4. operableOptions → 0
    const gAfter = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(gAfter?.operableOptions.toFixed(0)).toBe("0");

    // 5. VESTED → CLOSED
    const records = await prisma.vestingRecord.findMany({ where: { grantId: grant.id } });
    records.forEach((r) => expect(r.status).toBe("CLOSED"));

    // 6. Grant → CLOSED
    expect(gAfter?.status).toBe("CLOSED");

    // 7. 计划剩余额度增加 — Closed Grant 仅 SETTLED 计入已消耗，本例无 SETTLED → 全部释放
    const granted = await (await import("@/lib/plan-quantity")).computePlanGrantedQuantity(plan.id, "OPTION");
    expect(granted.toFixed(0)).toBe("0");

    // 8. PENDING 申请 → CLOSED
    const reqAfter = await prisma.operationRequest.findUnique({ where: { id: pendingReq.id } });
    expect(reqAfter?.status).toBe("CLOSED");
  });
});
