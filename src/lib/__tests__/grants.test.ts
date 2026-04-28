/**
 * 集成测试 — 授予管理与状态机（TEST_PLAN 3.6, GRANT-01..17）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import { POST as grantsPOST } from "@/app/api/grants/route";
import {
  PUT as grantByIdPUT,
  PATCH as grantByIdPATCH,
} from "@/app/api/grants/[id]/route";
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

const baseGrantBody = (over: Record<string, unknown> = {}) => ({
  grantDate: "2026-01-01",
  totalQuantity: "1200",
  vestingYears: 1,
  cliffMonths: 6,
  vestingFrequency: "MONTHLY",
  ...over,
});

async function makeApprovedPlan(type: "RSU" | "OPTION" = "RSU", poolSize = "10000") {
  return prisma.plan.create({
    data: {
      title: `P-${type}-${Date.now()}`,
      type,
      jurisdiction: "内地",
      deliveryMethod:
        type === "RSU" ? { methods: ["SHARES"] } : { methods: ["OPTION_RIGHT"] },
      poolSize,
      effectiveDate: new Date("2026-01-01"),
      status: "APPROVED",
    },
  });
}

describe("GRANT 授予管理与状态机", () => {
  let grantAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let approvalAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let employee: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    grantAdmin = await createTestUser("GRANT_ADMIN");
    approvalAdmin = await createTestUser("APPROVAL_ADMIN");
    employee = await createTestUser("EMPLOYEE");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("GRANT-01 创建 RSU 授予 → 200，DRAFT，strikePrice=0", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const res = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ id: string }>>(res);
    const g = await prisma.grant.findUnique({ where: { id: body.data!.id } });
    expect(g?.status).toBe("DRAFT");
    expect(g?.strikePrice.toFixed(2)).toBe("0.00");
  });

  test("GRANT-02 创建 Option 授予（含 strikePrice）→ 200, DRAFT", async () => {
    const plan = await makeApprovedPlan("OPTION");
    setSession(mockedGetSession, grantAdmin);
    const res = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id, strikePrice: "5.00" }),
      })
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ id: string }>>(res);
    const g = await prisma.grant.findUnique({ where: { id: body.data!.id } });
    expect(g?.status).toBe("DRAFT");
    expect(g?.strikePrice.toFixed(2)).toBe("5.00");
  });

  test("GRANT-03 引用未通过计划 → 400", async () => {
    const plan = await prisma.plan.create({
      data: {
        title: "Pending", type: "RSU", jurisdiction: "内地",
        deliveryMethod: { methods: ["SHARES"] },
        poolSize: "1000", effectiveDate: new Date(), status: "PENDING_APPROVAL",
      },
    });
    setSession(mockedGetSession, grantAdmin);
    const res = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    expect(res.status).toBe(400);
  });

  test("GRANT-04 引用离职员工 → 400", async () => {
    const plan = await makeApprovedPlan("RSU");
    await prisma.user.update({
      where: { id: employee.id },
      data: { employmentStatus: "离职" },
    });
    setSession(mockedGetSession, grantAdmin);
    const res = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    expect(res.status).toBe(400);
  });

  test("GRANT-05 引用停用持股主体 → 400", async () => {
    const plan = await makeApprovedPlan("RSU");
    const entity = await prisma.holdingEntity.create({
      data: {
        name: "X", entityCode: `INA-${Date.now()}`, type: "OFFSHORE_SPV",
        registrationNo: "R", taxJurisdiction: "内地", status: "INACTIVE",
      },
    });
    setSession(mockedGetSession, grantAdmin);
    const res = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({
          planId: plan.id,
          userId: employee.id,
          holdingEntityId: entity.id,
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  test("GRANT-06 超过计划剩余额度 → 400 + 提示额度不足", async () => {
    const plan = await makeApprovedPlan("RSU", "1000");
    setSession(mockedGetSession, grantAdmin);
    const res = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({
          planId: plan.id,
          userId: employee.id,
          totalQuantity: "9999",
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await readJson<ApiBody>(res);
    expect(body.error).toMatch(/剩余/);
  });

  test("GRANT-07 Draft → Granted（无协议 ID）→ 400", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    const res = await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(400);
  });

  test("GRANT-08 Draft → Granted（有协议 ID）→ 200，生成归属记录全部 PENDING", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({
          planId: plan.id,
          userId: employee.id,
          totalQuantity: "1200",
          cliffMonths: 6,
          vestingYears: 1,
          vestingFrequency: "MONTHLY",
        }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    const res = await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "AGREE-001" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
    const records = await prisma.vestingRecord.findMany({
      where: { grantId: cb.data!.id },
    });
    expect(records.length).toBe(7);
    records.forEach((r) => expect(r.status).toBe("PENDING"));
  });

  test("GRANT-09 Draft 状态可编辑 → 200", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    const res = await grantByIdPUT(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PUT",
        body: { totalQuantity: "500" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
  });

  test("GRANT-10 Granted 状态不可编辑 → 400", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "X" },
      }),
      { params: { id: cb.data!.id } }
    );
    setSession(mockedGetSession, grantAdmin);
    const res = await grantByIdPUT(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PUT",
        body: { totalQuantity: "500" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(400);
  });

  test("GRANT-11 非法状态跳转 Draft → VESTING → 400（schema 拒绝或转换校验拒绝）", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    const res = await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "VESTING" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(400);
  });

  test("GRANT-12 关闭 RSU Grant → 200，PENDING 归属 → CLOSED", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "X" },
      }),
      { params: { id: cb.data!.id } }
    );
    const res = await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "CLOSED", closedReason: "测试关闭" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
    const after = await prisma.grant.findUnique({ where: { id: cb.data!.id } });
    expect(after?.status).toBe("CLOSED");
    const records = await prisma.vestingRecord.findMany({
      where: { grantId: cb.data!.id },
    });
    records.forEach((r) => expect(r.status).toBe("CLOSED"));
  });

  test("GRANT-13 关闭 Option（有未行权）→ 200, CLOSING + 截止日", async () => {
    const plan = await makeApprovedPlan("OPTION");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({
          planId: plan.id, userId: employee.id, strikePrice: "5",
        }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    // 推进到 GRANTED 后手动设置 operableOptions > 0
    setSession(mockedGetSession, approvalAdmin);
    await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "X" },
      }),
      { params: { id: cb.data!.id } }
    );
    await prisma.grant.update({
      where: { id: cb.data!.id },
      data: { operableOptions: "100" },
    });
    const res = await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "CLOSING", closedReason: "员工离职", exerciseWindowDays: 30 },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
    const after = await prisma.grant.findUnique({ where: { id: cb.data!.id } });
    expect(after?.status).toBe("CLOSING");
    expect(after?.exerciseWindowDeadline).toBeTruthy();
  });

  test("GRANT-14 关闭 Option（无未行权）→ 200, 直接 CLOSED", async () => {
    const plan = await makeApprovedPlan("OPTION");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({
          planId: plan.id, userId: employee.id, strikePrice: "5",
        }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "X" },
      }),
      { params: { id: cb.data!.id } }
    );
    // operableOptions = 0
    const res = await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "CLOSED", closedReason: "无运营" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
    const after = await prisma.grant.findUnique({ where: { id: cb.data!.id } });
    expect(after?.status).toBe("CLOSED");
  });

  test("GRANT-15 授予管理员不能推进状态 → 403", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, grantAdmin);
    const res = await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "X" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(403);
  });

  test("GRANT-16 状态变更后有 StatusChangeLog 记录", async () => {
    const plan = await makeApprovedPlan("RSU");
    setSession(mockedGetSession, grantAdmin);
    const created = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: baseGrantBody({ planId: plan.id, userId: employee.id }),
      })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${cb.data!.id}`, {
        method: "PATCH",
        body: { to: "GRANTED", agreementId: "X" },
      }),
      { params: { id: cb.data!.id } }
    );
    const logs = await prisma.statusChangeLog.findMany({
      where: { grantId: cb.data!.id },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.find((l) => l.toStatus === "GRANTED")).toBeTruthy();
  });

  test("GRANT-17 Closed 后仍可对实股操作（数据契约：operableShares 不被关闭流程清零）", async () => {
    // 直接构造一个 RSU CLOSED Grant，operableShares > 0，验证数据契约
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
        operableShares: "50",
      },
    });
    // 关闭通过 API（应保留 operableShares）
    setSession(mockedGetSession, approvalAdmin);
    await grantByIdPATCH(
      jsonRequest(`http://localhost/api/grants/${g.id}`, {
        method: "PATCH",
        body: { to: "CLOSED", closedReason: "员工离职" },
      }),
      { params: { id: g.id } }
    );
    const after = await prisma.grant.findUnique({ where: { id: g.id } });
    expect(after?.status).toBe("CLOSED");
    expect(after?.operableShares.toFixed(0)).toBe("50");
  });
});
