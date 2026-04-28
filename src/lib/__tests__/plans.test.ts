/**
 * 集成测试 — 激励计划池（TEST_PLAN 3.2, PLAN-01..12）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import { GET as plansGET, POST as plansPOST } from "@/app/api/plans/route";
import {
  GET as planByIdGET,
  PUT as planByIdPUT,
  PATCH as planByIdPATCH,
} from "@/app/api/plans/[id]/route";
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

const validRSUBody = (overrides: Record<string, unknown> = {}) => ({
  title: "RSU-2026-A",
  type: "RSU",
  jurisdiction: "内地",
  deliveryMethods: ["SHARES"],
  poolSize: "10000",
  effectiveDate: "2026-01-01",
  ...overrides,
});

const validOptionBody = (overrides: Record<string, unknown> = {}) => ({
  title: "OPT-2026-A",
  type: "OPTION",
  jurisdiction: "海外",
  poolSize: "5000",
  effectiveDate: "2026-01-01",
  ...overrides,
});

describe("PLAN 激励计划池", () => {
  let grantAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let approvalAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let superAdmin: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    grantAdmin = await createTestUser("GRANT_ADMIN");
    approvalAdmin = await createTestUser("APPROVAL_ADMIN");
    superAdmin = await createTestUser("SUPER_ADMIN");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("PLAN-01 授予管理员创建 RSU 计划 → 200，状态 PENDING_APPROVAL", async () => {
    setSession(mockedGetSession, grantAdmin);
    const res = await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validRSUBody() })
    );
    const body = await readJson<ApiBody<{ id: string; status: string; type: string }>>(res);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.status).toBe("PENDING_APPROVAL");
    expect(body.data?.type).toBe("RSU");
  });

  test("PLAN-02 创建 Option 计划 → 交割方式自动为 OPTION_RIGHT", async () => {
    setSession(mockedGetSession, grantAdmin);
    const res = await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validOptionBody() })
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{
      id: string;
      type: string;
      deliveryMethod: { methods: string[]; label?: string };
    }>>(res);
    expect(body.data?.type).toBe("OPTION");
    expect(body.data?.deliveryMethod.methods).toEqual(["OPTION_RIGHT"]);
  });

  test("PLAN-03 审批管理员不能创建计划 → 403", async () => {
    setSession(mockedGetSession, approvalAdmin);
    const res = await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validRSUBody() })
    );
    expect(res.status).toBe(403);
  });

  test("PLAN-04 授予管理员不能审批计划 → 403", async () => {
    setSession(mockedGetSession, grantAdmin);
    const created = await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validRSUBody() })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, grantAdmin);
    const res = await planByIdPATCH(new Request(`http://localhost/api/plans/${cb.data!.id}`, { method: "PATCH" }), {
      params: { id: cb.data!.id },
    });
    expect(res.status).toBe(403);
  });

  test("PLAN-05 审批管理员审批通过 → 状态 APPROVED", async () => {
    setSession(mockedGetSession, grantAdmin);
    const created = await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validRSUBody() })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    setSession(mockedGetSession, approvalAdmin);
    const res = await planByIdPATCH(new Request(`http://localhost/api/plans/${cb.data!.id}`, { method: "PATCH" }), {
      params: { id: cb.data!.id },
    });
    expect(res.status).toBe(200);
    const after = await prisma.plan.findUnique({ where: { id: cb.data!.id } });
    expect(after?.status).toBe("APPROVED");
  });

  test("PLAN-06 已通过的计划不可再编辑 → 400", async () => {
    setSession(mockedGetSession, grantAdmin);
    const created = await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validRSUBody() })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    // 审批通过
    setSession(mockedGetSession, approvalAdmin);
    await planByIdPATCH(new Request(`http://localhost/api/plans/${cb.data!.id}`, { method: "PATCH" }), {
      params: { id: cb.data!.id },
    });
    // 再编辑
    setSession(mockedGetSession, grantAdmin);
    const res = await planByIdPUT(
      jsonRequest(`http://localhost/api/plans/${cb.data!.id}`, {
        method: "PUT",
        body: { title: "新标题" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(400);
  });

  test("PLAN-07 缺少必填字段 title → 400", async () => {
    setSession(mockedGetSession, grantAdmin);
    const body = validRSUBody();
    delete (body as Record<string, unknown>).title;
    const res = await plansPOST(
      jsonRequest("http://localhost/api/plans", { body })
    );
    expect(res.status).toBe(400);
  });

  test("PLAN-08 poolSize 非数字 → 400", async () => {
    setSession(mockedGetSession, grantAdmin);
    const res = await plansPOST(
      jsonRequest("http://localhost/api/plans", {
        body: validRSUBody({ poolSize: "abc" }),
      })
    );
    expect(res.status).toBe(400);
  });

  test("PLAN-09 搜索计划", async () => {
    setSession(mockedGetSession, grantAdmin);
    await plansPOST(
      jsonRequest("http://localhost/api/plans", {
        body: validRSUBody({ title: "RSU-Alpha" }),
      })
    );
    await plansPOST(
      jsonRequest("http://localhost/api/plans", {
        body: validOptionBody({ title: "OPT-Beta" }),
      })
    );
    setSession(mockedGetSession, superAdmin);
    const res = await plansGET(
      getRequest("http://localhost/api/plans", { search: "Alpha" })
    );
    const body = await readJson<ApiBody<{ items: { title: string }[] }>>(res);
    expect(body.data?.items.length).toBe(1);
    expect(body.data?.items[0].title).toBe("RSU-Alpha");
  });

  test("PLAN-10 按类型筛选", async () => {
    setSession(mockedGetSession, grantAdmin);
    await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validRSUBody() })
    );
    await plansPOST(
      jsonRequest("http://localhost/api/plans", { body: validOptionBody() })
    );
    setSession(mockedGetSession, superAdmin);
    const res = await plansGET(
      getRequest("http://localhost/api/plans", { type: "OPTION" })
    );
    const body = await readJson<ApiBody<{ items: { type: string }[] }>>(res);
    expect(body.data?.items.length).toBe(1);
    expect(body.data?.items[0].type).toBe("OPTION");
  });

  test("PLAN-11 分页", async () => {
    setSession(mockedGetSession, grantAdmin);
    for (let i = 0; i < 12; i++) {
      await plansPOST(
        jsonRequest("http://localhost/api/plans", {
          body: validRSUBody({ title: `RSU-P${i}` }),
        })
      );
    }
    setSession(mockedGetSession, superAdmin);
    const res = await plansGET(
      getRequest("http://localhost/api/plans", { page: 2, pageSize: 10 })
    );
    const body = await readJson<ApiBody<{
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
    }>>(res);
    expect(body.data?.total).toBe(12);
    expect(body.data?.page).toBe(2);
    expect(body.data?.items.length).toBe(2);
  });

  test("PLAN-12 已授予数量 — 包含非 Closed Grant 全量 + Closed Grant 已消耗", async () => {
    // 创建 RSU 计划并审批
    const plan = await prisma.plan.create({
      data: {
        title: "P-12",
        type: "RSU",
        jurisdiction: "内地",
        deliveryMethod: { methods: ["SHARES"] },
        poolSize: "10000",
        effectiveDate: new Date("2026-01-01"),
        status: "APPROVED",
      },
    });
    const u = await createTestUser("EMPLOYEE");
    // 非 Closed Grant：totalQuantity=1000 计入
    await prisma.grant.create({
      data: {
        planId: plan.id,
        userId: u.id,
        grantDate: new Date(),
        totalQuantity: "1000",
        vestingYears: 1,
        cliffMonths: 0,
        vestingFrequency: "MONTHLY",
        status: "GRANTED",
      },
    });
    // Closed Grant：totalQuantity=2000，但仅 1 条 SETTLED quantity=300 计入
    const g2 = await prisma.grant.create({
      data: {
        planId: plan.id,
        userId: u.id,
        grantDate: new Date(),
        totalQuantity: "2000",
        vestingYears: 1,
        cliffMonths: 0,
        vestingFrequency: "MONTHLY",
        status: "CLOSED",
      },
    });
    await prisma.vestingRecord.createMany({
      data: [
        { grantId: g2.id, vestingDate: new Date(), quantity: "300", status: "SETTLED" },
        { grantId: g2.id, vestingDate: new Date(), quantity: "1700", status: "CLOSED" },
      ],
    });

    setSession(mockedGetSession, superAdmin);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    const body = await readJson<ApiBody<{
      items: { id: string; grantedQuantity: string; remainingQuantity: string }[];
    }>>(res);
    const row = body.data!.items.find((p) => p.id === plan.id)!;
    // 1000 (open grant) + 300 (closed-consumed) = 1300
    expect(row.grantedQuantity).toBe("1300");
    expect(row.remainingQuantity).toBe("8700");
  });
});
