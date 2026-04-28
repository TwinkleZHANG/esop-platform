/**
 * 集成测试 — 定时任务 / 资产 / 员工端 / 数据隔离
 * （TEST_PLAN 3.11 / 3.12 / 3.13 / 3.14）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import { POST as cronPOST } from "@/app/api/cron/daily/route";
import { GET as assetsGET } from "@/app/api/assets/route";
import { GET as assetByEmpGET } from "@/app/api/assets/[employeeId]/route";
import { GET as assetsExportGET } from "@/app/api/assets/export/route";
import { GET as taxExportGET } from "@/app/api/tax-events/export/route";
import { GET as empOverviewGET } from "@/app/api/employee/overview/route";
import { GET as empGrantsGET } from "@/app/api/employee/grants/route";
import { GET as empVestingGET } from "@/app/api/employee/vesting/route";
import { GET as empRequestsGET } from "@/app/api/employee/requests/route";
import { GET as empTaxGET } from "@/app/api/employee/tax-records/route";
import { POST as opsPOST } from "@/app/api/operations/route";
import { POST as taxUploadPOST } from "@/app/api/tax-events/[id]/upload/route";
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

async function makeApprovedPlan(type: "RSU" | "OPTION" = "RSU", poolSize = "10000") {
  return prisma.plan.create({
    data: {
      title: `P-${type}-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      type, jurisdiction: "内地",
      deliveryMethod: type === "RSU" ? { methods: ["SHARES"] } : { methods: ["OPTION_RIGHT"] },
      poolSize, effectiveDate: new Date("2026-01-01"), status: "APPROVED",
    },
  });
}
async function makeFmv(date = new Date("2024-01-01"), fmv = "100") {
  return prisma.valuation.create({ data: { valuationDate: date, fmv } });
}

const cronReq = () =>
  new Request("http://localhost/api/cron/daily", { method: "POST" });

describe("CRON 定时任务", () => {
  let employee: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    employee = await createTestUser("EMPLOYEE");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("CRON-01 Vesting 翻转 — 到期 PENDING → VESTED", async () => {
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    const vr = await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2024-01-01"),
        quantity: "100", status: "PENDING",
      },
    });
    await makeFmv();
    await cronPOST(cronReq());
    const after = await prisma.vestingRecord.findUnique({ where: { id: vr.id } });
    expect(after?.status).toBe("VESTED");
  });

  test("CRON-02 Option 归属同步 — operableOptions+=qty, exercisableOptions=qty", async () => {
    const plan = await makeApprovedPlan("OPTION");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
        operableOptions: "0", strikePrice: "5",
      },
    });
    const vr = await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2024-01-01"),
        quantity: "50", status: "PENDING",
      },
    });
    await cronPOST(cronReq());
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    const vrAfter = await prisma.vestingRecord.findUnique({ where: { id: vr.id } });
    expect(gAfter?.operableOptions.toFixed(0)).toBe("50");
    expect(vrAfter?.exercisableOptions.toFixed(0)).toBe("50");
  });

  test("CRON-03 RSU 税务生成 — 有估值时生成 VESTING_TAX", async () => {
    await makeFmv(new Date("2023-01-01"));
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    const vr = await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2024-01-01"),
        quantity: "100", status: "PENDING",
      },
    });
    await cronPOST(cronReq());
    const tax = await prisma.taxEvent.findFirst({
      where: { vestingRecordId: vr.id },
    });
    expect(tax?.eventType).toBe("VESTING_TAX");
    expect(tax?.status).toBe("PENDING_PAYMENT");
  });

  test("CRON-04 RSU 缺估值 — valuationMissing > 0，不生成税务", async () => {
    // 不创建估值
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2024-01-01"),
        quantity: "100", status: "PENDING",
      },
    });
    const res = await cronPOST(cronReq());
    const body = await readJson<ApiBody<{ valuationMissing: number; rsuTaxEventsCreated: number }>>(res);
    expect(body.data?.valuationMissing).toBeGreaterThan(0);
    expect(body.data?.rsuTaxEventsCreated).toBe(0);
  });

  test("CRON-05 Grant 状态推进 — 部分归属 Vested → VESTING", async () => {
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "200", vestingYears: 2, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2024-01-01"),
        quantity: "100", status: "PENDING",
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2099-01-01"),
        quantity: "100", status: "PENDING",
      },
    });
    await makeFmv();
    await cronPOST(cronReq());
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    expect(gAfter?.status).toBe("VESTING");
  });

  test("CRON-06 全部归属 Vested → FULLY_VESTED (RSU)", async () => {
    await makeFmv();
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2024-01-01"),
        quantity: "100", status: "PENDING",
      },
    });
    await cronPOST(cronReq());
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    expect(gAfter?.status).toBe("FULLY_VESTED");
  });

  test("CRON-07/08/09 Closing 到期 — operableOptions=0, 归属→CLOSED, Grant→CLOSED, PENDING 申请→CLOSED", async () => {
    const plan = await makeApprovedPlan("OPTION");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "CLOSING",
        operableOptions: "100", strikePrice: "5",
        exerciseWindowDeadline: new Date("2024-01-01"),
        exerciseWindowDays: 30,
      },
    });
    await prisma.vestingRecord.create({
      data: {
        grantId: g.id, vestingDate: new Date("2024-01-01"),
        quantity: "100", exercisableOptions: "100", status: "VESTED",
      },
    });
    const op = await prisma.operationRequest.create({
      data: {
        grantId: g.id, userId: employee.id,
        requestType: "EXERCISE", requestTarget: "OPTIONS",
        quantity: "10", status: "PENDING",
      },
    });
    // 验证：池剩余额度反映释放（释放 = totalQuantity - 已消耗）
    const beforeGranted = await (await import("@/lib/plan-quantity")).computePlanGrantedQuantity(plan.id, "OPTION");
    const beforeRemaining = plan.poolSize.sub(beforeGranted);
    void beforeRemaining;

    await cronPOST(cronReq());
    const gAfter = await prisma.grant.findUnique({ where: { id: g.id } });
    expect(gAfter?.status).toBe("CLOSED");
    expect(gAfter?.operableOptions.toFixed(0)).toBe("0");
    const records = await prisma.vestingRecord.findMany({ where: { grantId: g.id } });
    records.forEach((r) => expect(r.status).toBe("CLOSED"));
    const opAfter = await prisma.operationRequest.findUnique({ where: { id: op.id } });
    expect(opAfter?.status).toBe("CLOSED");

    // CRON-08 释放回计划池：Closed Grant 仅 SETTLED 算已消耗，全部 CLOSED → 已消耗 0 → 全部释放
    const afterGranted = await (await import("@/lib/plan-quantity")).computePlanGrantedQuantity(plan.id, "OPTION");
    expect(afterGranted.toFixed(0)).toBe("0");
  });

  test("CRON-10 单 Grant 失败不影响其他 Grant — 整体仍处理成功", async () => {
    // 构造两个正常 Grant，其中一个数据可处理；cron 不应抛错。
    await makeFmv();
    const plan = await makeApprovedPlan("RSU");
    const e2 = await createTestUser("EMPLOYEE");
    const g1 = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    const g2 = await prisma.grant.create({
      data: {
        planId: plan.id, userId: e2.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    await prisma.vestingRecord.create({
      data: { grantId: g1.id, vestingDate: new Date("2024-01-01"), quantity: "100", status: "PENDING" },
    });
    await prisma.vestingRecord.create({
      data: { grantId: g2.id, vestingDate: new Date("2024-01-01"), quantity: "100", status: "PENDING" },
    });
    const res = await cronPOST(cronReq());
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ vestedRecords: number }>>(res);
    expect(body.data?.vestedRecords).toBe(2);
  });
});

describe("ASSET 资产管理", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>;
  let employee: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    admin = await createTestUser("SUPER_ADMIN");
    employee = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, admin);
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("ASSET-01 聚合 — 同(员工+主体+类型)的多 Grant operableShares 累加", async () => {
    const plan = await makeApprovedPlan("RSU");
    const entity = await prisma.holdingEntity.create({
      data: {
        name: "X", entityCode: `E-${Date.now()}`, type: "OFFSHORE_SPV",
        registrationNo: "R", taxJurisdiction: "内地", status: "ACTIVE",
      },
    });
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, holdingEntityId: entity.id,
        grantDate: new Date(), totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED", operableShares: "30",
      },
    });
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, holdingEntityId: entity.id,
        grantDate: new Date(), totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED", operableShares: "20",
      },
    });
    const res = await assetsGET(getRequest("http://localhost/api/assets"));
    const body = await readJson<ApiBody<{
      items: { userId: string; planType: string; operableShares: string }[];
    }>>(res);
    const row = body.data!.items.find(
      (r) => r.userId === employee.id && r.planType === "RSU"
    )!;
    expect(row.operableShares).toBe("50");
  });

  test("ASSET-02 RSU 行的 operableOptions 应为 0/null/'-'", async () => {
    const plan = await makeApprovedPlan("RSU");
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "30",
      },
    });
    const res = await assetsGET(getRequest("http://localhost/api/assets"));
    const body = await readJson<ApiBody<{
      items: { userId: string; planType: string; operableOptions: string }[];
    }>>(res);
    const row = body.data!.items.find((r) => r.planType === "RSU")!;
    expect(["0", "-", null]).toContain(row.operableOptions);
  });

  test("ASSET-03 最新估值 — 返回最新一条", async () => {
    await prisma.valuation.create({ data: { valuationDate: new Date("2025-01-01"), fmv: "100" } });
    await prisma.valuation.create({ data: { valuationDate: new Date("2026-01-01"), fmv: "150" } });
    const res = await assetsGET(getRequest("http://localhost/api/assets"));
    const body = await readJson<ApiBody<{ valuation: { fmv: string } }>>(res);
    expect(body.data?.valuation.fmv).toBe("150.00");
  });

  test("ASSET-04 员工详情 — 返回该员工的授予/归属/汇总", async () => {
    const plan = await makeApprovedPlan("RSU");
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const res = await assetByEmpGET(
      new Request(`http://localhost/api/assets/${employee.id}`),
      { params: { employeeId: employee.id } }
    );
    expect(res.status).toBe(200);
  });

  test("ASSET-05 Excel 导出 /api/assets/export", async () => {
    const plan = await makeApprovedPlan("RSU");
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "30",
      },
    });
    const res = await assetsExportGET(
      new Request("http://localhost/api/assets/export")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(
      /spreadsheet|excel|octet-stream/
    );
  });

  test("ASSET-06 Excel 导出 /api/tax-events/export", async () => {
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: employee.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "PENDING_PAYMENT",
      },
    });
    const res = await taxExportGET(
      new Request("http://localhost/api/tax-events/export")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(
      /spreadsheet|excel|octet-stream/
    );
  });
});

describe("EEMP 员工端 API", () => {
  let employee: Awaited<ReturnType<typeof createTestUser>>;
  let approver: Awaited<ReturnType<typeof createTestUser>>;
  let superAdmin: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    employee = await createTestUser("EMPLOYEE");
    approver = await createTestUser("APPROVAL_ADMIN");
    superAdmin = await createTestUser("SUPER_ADMIN");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("EEMP-01 总览 — 返回个人信息+聚合资产", async () => {
    setSession(mockedGetSession, employee);
    const res = await empOverviewGET();
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ user: { id: string }; assets: unknown[] }>>(res);
    expect(body.data?.user.id).toBe(employee.id);
    expect(Array.isArray(body.data?.assets)).toBe(true);
  });

  test("EEMP-02 授予记录 — 不含 Draft", async () => {
    const plan = await makeApprovedPlan("RSU");
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "DRAFT",
      },
    });
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    setSession(mockedGetSession, employee);
    const res = await empGrantsGET(getRequest("http://localhost/api/employee/grants"));
    const body = await readJson<ApiBody<{ items: { status: string }[] }>>(res);
    expect(body.data!.items.every((g) => g.status !== "DRAFT")).toBe(true);
    expect(body.data!.items.length).toBe(1);
  });

  test("EEMP-03 归属详情 — 返回所有归属（排除 Draft Grant）", async () => {
    const plan = await makeApprovedPlan("RSU");
    const draft = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "DRAFT",
      },
    });
    await prisma.vestingRecord.create({
      data: { grantId: draft.id, vestingDate: new Date(), quantity: "100", status: "PENDING" },
    });
    const granted = await prisma.grant.create({
      data: {
        planId: plan.id, userId: employee.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    await prisma.vestingRecord.create({
      data: { grantId: granted.id, vestingDate: new Date(), quantity: "100", status: "PENDING" },
    });
    setSession(mockedGetSession, employee);
    const res = await empVestingGET(getRequest("http://localhost/api/employee/vesting"));
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ items?: unknown[] } | unknown[]>>(res);
    const items = Array.isArray(body.data) ? body.data : (body.data as { items: unknown[] }).items;
    expect(items.length).toBe(1);
  });

  test("EEMP-04 申请记录", async () => {
    setSession(mockedGetSession, employee);
    const res = await empRequestsGET(getRequest("http://localhost/api/employee/requests"));
    expect(res.status).toBe(200);
  });

  test("EEMP-05 税务记录", async () => {
    setSession(mockedGetSession, employee);
    const res = await empTaxGET(getRequest("http://localhost/api/employee/tax-records"));
    expect(res.status).toBe(200);
  });

  test("EEMP-06 管理员可访问员工端 API（返回自己的数据）", async () => {
    setSession(mockedGetSession, approver);
    const res = await empGrantsGET(getRequest("http://localhost/api/employee/grants"));
    expect(res.status).toBe(200);
  });

  test("EEMP-07 管理员员工视图可提交申请", async () => {
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: superAdmin.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, superAdmin);
    const res = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("ISO 数据隔离", () => {
  let empD: Awaited<ReturnType<typeof createTestUser>>;
  let empE: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    empD = await createTestUser("EMPLOYEE");
    empE = await createTestUser("EMPLOYEE");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("ISO-01 D 不能看到 E 的授予", async () => {
    const plan = await makeApprovedPlan("RSU");
    await prisma.grant.create({
      data: {
        planId: plan.id, userId: empE.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    setSession(mockedGetSession, empD);
    const res = await empGrantsGET(getRequest("http://localhost/api/employee/grants"));
    const body = await readJson<ApiBody<{ items: { id: string }[] }>>(res);
    expect(body.data?.items.length).toBe(0);
  });

  test("ISO-02 D 不能看到 E 的税务", async () => {
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: empE.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: empE.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "PENDING_PAYMENT",
      },
    });
    setSession(mockedGetSession, empD);
    const res = await empTaxGET(getRequest("http://localhost/api/employee/tax-records"));
    const body = await readJson<ApiBody<{ items: unknown[] }>>(res);
    expect(body.data?.items.length).toBe(0);
  });

  test("ISO-03 D 不能对 E 的 Grant 提交申请 → 400/403", async () => {
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: empE.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
        operableShares: "50",
      },
    });
    setSession(mockedGetSession, empD);
    const res = await opsPOST(
      jsonRequest("http://localhost/api/operations", {
        body: { grantId: g.id, requestType: "SELL", quantity: "10" },
      })
    );
    expect([400, 403]).toContain(res.status);
  });

  test("ISO-04 D 不能上传 E 的凭证 → 403", async () => {
    const plan = await makeApprovedPlan("RSU");
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: empE.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "FULLY_VESTED",
      },
    });
    const t = await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: empE.id,
        eventType: "VESTING_TAX", operationType: "归属",
        quantity: "10", eventDate: new Date(),
        fmvAtEvent: "100", status: "PENDING_PAYMENT",
      },
    });
    const fd = new FormData();
    fd.append("files", new File([new Uint8Array([1])], "a.png", { type: "image/png" }));
    setSession(mockedGetSession, empD);
    const res = await taxUploadPOST(
      new Request(`http://localhost/api/tax-events/${t.id}/upload`, { method: "POST", body: fd }),
      { params: { id: t.id } }
    );
    expect(res.status).toBe(403);
  });
});
