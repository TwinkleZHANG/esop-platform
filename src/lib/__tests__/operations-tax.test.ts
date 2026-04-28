/**
 * 集成测试 — 申请审批 + 税务事件 + 自审拦截（TEST_PLAN 3.9 / 3.10 / 3.15）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import { POST as opsPOST } from "@/app/api/operations/route";
import { PATCH as opsPATCH } from "@/app/api/operations/[id]/route";
import { PATCH as taxPATCH } from "@/app/api/tax-events/[id]/route";
import { POST as taxUploadPOST } from "@/app/api/tax-events/[id]/upload/route";
import { PATCH as grantPATCH } from "@/app/api/grants/[id]/route";
import { POST as grantsPOST } from "@/app/api/grants/route";
import {
  cleanDatabase,
  createTestUser,
  disconnect,
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

async function makeApprovedRSUPlan() {
  return prisma.plan.create({
    data: {
      title: `P-RSU-${Date.now()}`,
      type: "RSU",
      jurisdiction: "内地",
      deliveryMethod: { methods: ["SHARES"] },
      poolSize: "10000",
      effectiveDate: new Date("2026-01-01"),
      status: "APPROVED",
    },
  });
}
async function makeApprovedOptionPlan() {
  return prisma.plan.create({
    data: {
      title: `P-OPT-${Date.now()}`,
      type: "OPTION",
      jurisdiction: "内地",
      deliveryMethod: { methods: ["OPTION_RIGHT"] },
      poolSize: "10000",
      effectiveDate: new Date("2026-01-01"),
      status: "APPROVED",
    },
  });
}

async function makeFmv(date = new Date("2025-01-01"), fmv = "100") {
  return prisma.valuation.create({ data: { valuationDate: date, fmv } });
}

describe("OP 申请与审批", () => {
  let approver: Awaited<ReturnType<typeof createTestUser>>;
  let grantAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let employee: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    approver = await createTestUser("APPROVAL_ADMIN");
    grantAdmin = await createTestUser("GRANT_ADMIN");
    employee = await createTestUser("EMPLOYEE");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("OP-01 RSU 售出申请（qty ≤ operableShares）→ 200, PENDING", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const res = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "30" },
      })
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ status: string }>>(res);
    expect(body.data?.status).toBe("PENDING");
  });

  test("OP-02 RSU 申请超额 → 400", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const res = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "9999" },
      })
    );
    expect(res.status).toBe(400);
  });

  test("OP-03 Option 行权申请（qty ≤ operableOptions）→ 200", async () => {
    const plan = await makeApprovedOptionPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableOptions: "100", strikePrice: "5",
      },
    });
    setSession(mockedGetSession, employee);
    const res = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: {
          grantId: g.id, requestType: "EXERCISE",
          requestTarget: "OPTIONS", quantity: "50",
        },
      })
    );
    expect(res.status).toBe(200);
  });

  test("OP-04 Option 不能售出期权 → 400", async () => {
    const plan = await makeApprovedOptionPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableOptions: "100", strikePrice: "5",
      },
    });
    setSession(mockedGetSession, employee);
    const res = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: {
          grantId: g.id, requestType: "SELL",
          requestTarget: "OPTIONS", quantity: "10",
        },
      })
    );
    expect(res.status).toBe(400);
  });

  test("OP-05 RSU 不能行权 → 400", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    setSession(mockedGetSession, employee);
    const res = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "EXERCISE", quantity: "10" },
      })
    );
    expect(res.status).toBe(400);
  });

  test("OP-06 审批通过 → 200, APPROVED + 生成税务事件", async () => {
    await makeFmv();
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approver);
    const res = await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "APPROVE" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
    const tax = await prisma.taxEvent.findFirst({
      where: { operationRequestId: cb.data!.id },
    });
    expect(tax).toBeTruthy();
    expect(tax?.eventType).toBe("POST_SETTLEMENT_TAX");
  });

  test("OP-07 审批驳回 → 200, REJECTED + notes", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approver);
    const res = await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "REJECT", approverNotes: "材料不全" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
    const after = await prisma.operationRequest.findUnique({
      where: { id: cb.data!.id },
    });
    expect(after?.status).toBe("REJECTED");
    expect(after?.approverNotes).toBe("材料不全");
  });

  test("OP-08 授予管理员不能审批 → 403", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, grantAdmin);
    const res = await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "APPROVE" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(403);
  });

  test("OP-09 驳回后可重新申请 → 200", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approver);
    await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "REJECT" },
      }),
      { params: { id: cb.data!.id } }
    );
    setSession(mockedGetSession, employee);
    const res2 = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "8" },
      })
    );
    expect(res2.status).toBe(200);
  });

  test("OP-10 无估值时审批通过 → 拒绝（提示先录入估值）", async () => {
    // 不创建任何估值
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approver);
    const res = await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "APPROVE" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect([400, 500]).toContain(res.status);
  });
});

describe("TAX 税务事件", () => {
  let approver: Awaited<ReturnType<typeof createTestUser>>;
  let grantAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let employee: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    approver = await createTestUser("APPROVAL_ADMIN");
    grantAdmin = await createTestUser("GRANT_ADMIN");
    employee = await createTestUser("EMPLOYEE");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  // TAX-01..04 由 cron 触发，统一在 cron 测试中验证

  test("TAX-02 Option 行权审批后 → 生成 EXERCISE_TAX", async () => {
    await makeFmv();
    const plan = await makeApprovedOptionPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableOptions: "100", strikePrice: "5",
      },
    });
    setSession(mockedGetSession, employee);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: {
          grantId: g.id, requestType: "EXERCISE",
          requestTarget: "OPTIONS", quantity: "50",
        },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approver);
    await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "APPROVE" },
      }),
      { params: { id: cb.data!.id } }
    );
    const tax = await prisma.taxEvent.findFirst({
      where: { operationRequestId: cb.data!.id },
    });
    expect(tax?.eventType).toBe("EXERCISE_TAX");
  });

  test("TAX-03 Post-settlement 售出审批后 → 生成 POST_SETTLEMENT_TAX", async () => {
    await makeFmv();
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, employee);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approver);
    await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "APPROVE" },
      }),
      { params: { id: cb.data!.id } }
    );
    const tax = await prisma.taxEvent.findFirst({
      where: { operationRequestId: cb.data!.id },
    });
    expect(tax?.eventType).toBe("POST_SETTLEMENT_TAX");
  });

  test("TAX-05 税务确认 — 授予管理员应被拒（403）", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "POST_SETTLEMENT_TAX",
        operationType: "售出", quantity: "10",
        eventDate: new Date(), fmvAtEvent: "100",
        status: "RECEIPT_UPLOADED",
      },
    });
    setSession(mockedGetSession, grantAdmin);
    const res = await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${t.id}`, {
        method: "PATCH",
        body: { action: "CONFIRM" },
      }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(403);
  });

  test("TAX-06 RSU 归属税务确认 → operableShares += qty，归属 → SETTLED", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "0",
      },
    });
    const vr = await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date(),
        quantity: "100", status: "VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "100", eventDate: new Date(),
        fmvAtEvent: "100", vestingRecordId: vr.id,
        status: "RECEIPT_UPLOADED",
      },
    });
    setSession(mockedGetSession, approver);
    const res = await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${t.id}`, {
        method: "PATCH",
        body: { action: "CONFIRM" },
      }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(200);
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    const vrAfter = await prisma.vestingRecord.findUnique({ where: { id: vr.id } });
    expect(gAfter?.operableShares.toFixed(0)).toBe("100");
    expect(vrAfter?.status).toBe("SETTLED");
  });

  test("TAX-07 Option 行权确认 → operableOptions-=, operableShares+= , FIFO", async () => {
    const plan = await makeApprovedOptionPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "300", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "STILL_EXERCISABLE",
        operableOptions: "300", operableShares: "0", strikePrice: "5",
      },
    });
    // 两条 VESTED 归属：300 = 200 + 100
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2025-06-01"),
        quantity: "200", exercisableOptions: "200", status: "VESTED",
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2025-07-01"),
        quantity: "100", exercisableOptions: "100", status: "VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "EXERCISE_TAX", operationType: "行权",
        quantity: "150", eventDate: new Date(),
        fmvAtEvent: "100", strikePrice: "5",
        status: "RECEIPT_UPLOADED",
      },
    });
    setSession(mockedGetSession, approver);
    const res = await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${t.id}`, {
        method: "PATCH",
        body: { action: "CONFIRM" },
      }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(200);
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    expect(gAfter?.operableOptions.toFixed(0)).toBe("150");
    expect(gAfter?.operableShares.toFixed(0)).toBe("150");
    // FIFO 第一条消耗 150（剩 50, PARTIALLY_SETTLED）
    const records = await prisma.vestingRecord.findMany({
      where: { grantId: g.id }, orderBy: { vestingDate: "asc" },
    });
    expect(records[0].exercisableOptions.toFixed(0)).toBe("50");
    expect(records[0].status).toBe("PARTIALLY_SETTLED");
    expect(records[1].exercisableOptions.toFixed(0)).toBe("100");
  });

  test("TAX-08 PS 实股确认 → operableShares -= qty", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "ALL_SETTLED",
        operableShares: "50",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "POST_SETTLEMENT_TAX", operationType: "售出",
        operationTarget: "SHARES",
        quantity: "20", eventDate: new Date(),
        fmvAtEvent: "100", status: "RECEIPT_UPLOADED",
      },
    });
    setSession(mockedGetSession, approver);
    const res = await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${t.id}`, {
        method: "PATCH",
        body: { action: "CONFIRM" },
      }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(200);
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    expect(gAfter?.operableShares.toFixed(0)).toBe("30");
  });

  test("TAX-09 PS 期权确认 → operableOptions -= qty (FIFO)", async () => {
    const plan = await makeApprovedOptionPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "STILL_EXERCISABLE",
        operableOptions: "100", strikePrice: "5",
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2025-06-01"),
        quantity: "100", exercisableOptions: "100", status: "VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "POST_SETTLEMENT_TAX", operationType: "转让",
        operationTarget: "OPTIONS",
        quantity: "30", eventDate: new Date(),
        fmvAtEvent: "100", status: "RECEIPT_UPLOADED",
      },
    });
    setSession(mockedGetSession, approver);
    const res = await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${t.id}`, {
        method: "PATCH",
        body: { action: "CONFIRM" },
      }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(200);
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    expect(gAfter?.operableOptions.toFixed(0)).toBe("70");
  });

  test("TAX-10 不可手动创建（路由无 POST 导出）", async () => {
    const mod = await import("@/app/api/tax-events/route");
    expect((mod as Record<string, unknown>).POST).toBeUndefined();
  });

  test("TAX-11 凭证上传 — JPG/PNG/PDF, ≤10MB, ≤3 个", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "PENDING_PAYMENT",
      },
    });
    const fd = new FormData();
    fd.append("files", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    fd.append("files", new File([new Uint8Array([4, 5, 6])], "b.pdf", { type: "application/pdf" }));
    setSession(mockedGetSession, employee);
    const req = new Request(`http://localhost/api/tax-events/${t.id}/upload`, {
      method: "POST",
      body: fd,
    });
    const res = await taxUploadPOST(req, { params: { id: t.id } });
    expect(res.status).toBe(200);
    const after = await prisma.taxEvent.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe("RECEIPT_UPLOADED");
    expect(after?.receiptFiles.length).toBe(2);
  });

  test("TAX-12 凭证类型限制 — .exe → 400", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "PENDING_PAYMENT",
      },
    });
    const fd = new FormData();
    fd.append("files", new File([new Uint8Array([1])], "x.exe", { type: "application/octet-stream" }));
    setSession(mockedGetSession, employee);
    const res = await taxUploadPOST(
      new Request(`http://localhost/api/tax-events/${t.id}/upload`, { method: "POST", body: fd }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(400);
  });

  test("TAX-13 凭证大小限制 — > 10MB → 400", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "PENDING_PAYMENT",
      },
    });
    const big = new Uint8Array(11 * 1024 * 1024);
    const fd = new FormData();
    fd.append("files", new File([big], "big.png", { type: "image/png" }));
    setSession(mockedGetSession, employee);
    const res = await taxUploadPOST(
      new Request(`http://localhost/api/tax-events/${t.id}/upload`, { method: "POST", body: fd }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(400);
  });

  test("TAX-14 确认后不可替换凭证 → 400", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "CONFIRMED",
      },
    });
    const fd = new FormData();
    fd.append("files", new File([new Uint8Array([1])], "a.png", { type: "image/png" }));
    setSession(mockedGetSession, employee);
    const res = await taxUploadPOST(
      new Request(`http://localhost/api/tax-events/${t.id}/upload`, { method: "POST", body: fd }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(400);
  });
});

describe("SELF 自审拦截", () => {
  let superAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let employee: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    superAdmin = await createTestUser("SUPER_ADMIN");
    employee = await createTestUser("EMPLOYEE");
    void employee;
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("SELF-01 不能推进自己的授予 Draft → Granted", async () => {
    const plan = await prisma.plan.create({
      data: {
        title: "P", type: "RSU", jurisdiction: "内地",
        deliveryMethod: { methods: ["SHARES"] },
        poolSize: "1000", effectiveDate: new Date(), status: "APPROVED",
      },
    });
    setSession(mockedGetSession, superAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: {
          planId: plan.id, userId: superAdmin.id,
          grantDate: "2026-01-01", totalQuantity: "100",
          vestingYears: 1, cliffMonths: 0, vestingFrequency: "MONTHLY",
        },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    const res = await grantPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "X" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect([400, 403]).toContain(res.status);
  });

  test("SELF-02 不能审批自己的申请", async () => {
    await makeFmv();
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: superAdmin.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, superAdmin);
    const created = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    const res = await opsPATCH(
      jsonRequest(`http://localhost/api/operations/${cb.data!.id}`, {
        method: "PATCH",
        body: { decision: "APPROVE" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect([400, 403]).toContain(res.status);
  });

  test("SELF-03 不能确认自己的税务事件", async () => {
    const plan = await makeApprovedRSUPlan();
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: superAdmin.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: superAdmin.id,
        eventType: "POST_SETTLEMENT_TAX", operationType: "售出",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "RECEIPT_UPLOADED",
      },
    });
    setSession(mockedGetSession, superAdmin);
    const res = await taxPATCH(
      jsonRequest(`http://localhost/api/tax-events/${t.id}`, {
        method: "PATCH",
        body: { action: "CONFIRM" },
      }),
      { params: { id: t.id } }
    );
    expect([400, 403]).toContain(res.status);
  });
});
