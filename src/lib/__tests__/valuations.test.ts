/**
 * 集成测试 — 估值管理（TEST_PLAN 3.5, VAL-01..08）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import { POST as valuationsPOST } from "@/app/api/valuations/route";
import { DELETE as valuationByIdDELETE } from "@/app/api/valuations/[id]/route";
import { getFMVForDate } from "@/lib/valuation";
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

describe("VAL 估值管理", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    admin = await createTestUser("SUPER_ADMIN");
    setSession(mockedGetSession, admin);
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("VAL-01 添加估值记录 → 200", async () => {
    const res = await valuationsPOST(
      jsonRequest("http://localhost/api/valuations", {
        body: { valuationDate: "2026-01-01", fmv: "100.00" },
      })
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ fmv: string }>>(res);
    expect(body.data?.fmv).toBe("100.00");
  });

  test("VAL-02 估值不可编辑（无 PUT 路由）→ 经 import 检查模块上无 PUT 导出", async () => {
    const mod = await import("@/app/api/valuations/[id]/route");
    expect((mod as Record<string, unknown>).PUT).toBeUndefined();
  });

  test("VAL-03 删除未引用的估值 → 200", async () => {
    const v = await prisma.valuation.create({
      data: { valuationDate: new Date("2026-01-01"), fmv: "100" },
    });
    const res = await valuationByIdDELETE(
      new Request(`http://localhost/api/valuations/${v.id}`, { method: "DELETE" }),
      { params: { id: v.id } }
    );
    expect(res.status).toBe(200);
    const after = await prisma.valuation.findUnique({ where: { id: v.id } });
    expect(after).toBeNull();
  });

  test("VAL-04 删除已引用的估值 → 400 + 提示", async () => {
    // 准备：创建一条估值，并构造一个引用它的税务事件
    const v = await prisma.valuation.create({
      data: { valuationDate: new Date("2026-01-01"), fmv: "100" },
    });
    const u = await createTestUser("EMPLOYEE");
    const plan = await prisma.plan.create({
      data: {
        title: "P", type: "RSU", jurisdiction: "内地",
        deliveryMethod: { methods: ["SHARES"] },
        poolSize: "1000", effectiveDate: new Date(), status: "APPROVED",
      },
    });
    const g = await prisma.grant.create({
      data: {
        planId: plan.id, userId: u.id, grantDate: new Date(),
        totalQuantity: "100", vestingYears: 1, cliffMonths: 0,
        vestingFrequency: "MONTHLY", status: "GRANTED",
      },
    });
    await prisma.taxEvent.create({
      data: {
        grantId: g.id, userId: u.id, eventType: "VESTING_TAX",
        operationType: "归属", quantity: "10",
        eventDate: new Date(), fmvAtEvent: "100",
        valuationId: v.id, status: "PENDING_PAYMENT",
      },
    });
    const res = await valuationByIdDELETE(
      new Request(`http://localhost/api/valuations/${v.id}`, { method: "DELETE" }),
      { params: { id: v.id } }
    );
    expect(res.status).toBe(400);
    const body = await readJson<ApiBody>(res);
    expect(body.error).toMatch(/引用/);
  });

  test("VAL-05 FMV 引用规则 — 取 ≤ date 的最近一条", async () => {
    await prisma.valuation.create({ data: { valuationDate: new Date("2025-01-01"), fmv: "50" } });
    await prisma.valuation.create({ data: { valuationDate: new Date("2025-06-01"), fmv: "80" } });
    await prisma.valuation.create({ data: { valuationDate: new Date("2026-03-01"), fmv: "120" } });
    const fmv = await getFMVForDate(new Date("2025-12-31"));
    expect(fmv?.fmv.toFixed(2)).toBe("80.00");
  });

  test("VAL-06 FMV 引用规则 — 触发日前无估值 → null", async () => {
    await prisma.valuation.create({ data: { valuationDate: new Date("2026-06-01"), fmv: "100" } });
    const fmv = await getFMVForDate(new Date("2026-01-01"));
    expect(fmv).toBeNull();
  });

  test("VAL-07 估值审计日志 — 添加后有 CREATED 记录", async () => {
    const res = await valuationsPOST(
      jsonRequest("http://localhost/api/valuations", {
        body: { valuationDate: "2026-01-01", fmv: "100" },
      })
    );
    const body = await readJson<ApiBody<{ id: string }>>(res);
    const logs = await prisma.valuationLog.findMany({
      where: { valuationId: body.data!.id },
    });
    expect(logs.find((l) => l.action === "CREATED")).toBeTruthy();
  });

  test("VAL-08 估值审计日志 — 删除后有 DELETED 记录（含快照）", async () => {
    const v = await prisma.valuation.create({
      data: { valuationDate: new Date("2026-01-01"), fmv: "100" },
    });
    await valuationByIdDELETE(
      new Request(`http://localhost/api/valuations/${v.id}`, { method: "DELETE" }),
      { params: { id: v.id } }
    );
    // valuationId 由于 onDelete: SetNull 被清空，按 fmv/valuationDate 快照查找
    const log = await prisma.valuationLog.findFirst({
      where: { action: "DELETED", fmv: "100" as unknown as string },
    });
    expect(log).toBeTruthy();
    expect(log?.fmv.toFixed(2)).toBe("100.00");
  });
});
