/**
 * Smoke 测试：验证集成测试基础设施可用
 * - 能连接到 esop_platform_test 数据库
 * - 能创建/清理测试用户
 * - 能 mock NextAuth session 并调用 API Route Handler
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import { GET as plansGET } from "@/app/api/plans/route";
import {
  cleanDatabase,
  createTestUser,
  disconnect,
  getRequest,
  readJson,
  setSession,
} from "@/lib/__tests__/test-helpers";

const mockedGetSession = getServerSession as jest.Mock;

describe("integration test infrastructure smoke", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  it("DATABASE_URL 指向测试库", () => {
    expect(process.env.DATABASE_URL).toContain("esop_platform_test");
  });

  it("未登录访问 /api/plans → 401", async () => {
    setSession(mockedGetSession, null);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    expect(res.status).toBe(401);
    const body = await readJson<{ success: boolean; error?: string }>(res);
    expect(body.success).toBe(false);
  });

  it("超管访问 /api/plans → 200 + 空列表", async () => {
    const admin = await createTestUser("SUPER_ADMIN");
    setSession(mockedGetSession, admin);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    expect(res.status).toBe(200);
    const body = await readJson<{
      success: boolean;
      data: { items: unknown[]; total: number };
    }>(res);
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(0);
    expect(body.data.items).toEqual([]);
  });

  it("员工访问 /api/plans → 403 (asset.view 权限)", async () => {
    const emp = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, emp);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    expect(res.status).toBe(403);
  });
});
