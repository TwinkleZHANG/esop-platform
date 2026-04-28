/**
 * 集成测试 — 认证与权限（TEST_PLAN 3.1, AUTH-01..12）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GET as plansGET } from "@/app/api/plans/route";
import { GET as employeeOverviewGET } from "@/app/api/employee/overview/route";
import { GET as userMgmtGET } from "@/app/api/user-management/route";
import { POST as changePwdPOST } from "@/app/api/auth/change-password/route";
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

describe("AUTH 认证与权限", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("AUTH-01 未登录访问管理端 API → 401", async () => {
    setSession(mockedGetSession, null);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    expect(res.status).toBe(401);
    const body = await readJson<{ success: boolean }>(res);
    expect(body.success).toBe(false);
  });

  test("AUTH-02 未登录访问员工端 API → 401", async () => {
    setSession(mockedGetSession, null);
    const res = await employeeOverviewGET();
    expect(res.status).toBe(401);
  });

  test("AUTH-03 正确邮箱密码登录（authorize 回调）→ 返回 user", async () => {
    const passwordHash = await bcrypt.hash("right-password", 4);
    const u = await prisma.user.create({
      data: {
        name: "Auth03",
        employeeId: "T-AUTH-03",
        email: "auth03@test.com",
        passwordHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
        mustChangePassword: false,
      },
    });
    const provider = (authOptions.providers[0] as unknown as {
      options: {
        authorize: (
          c: { email: string; password: string } | undefined
        ) => Promise<{ id: string; mustChangePassword?: boolean } | null>;
      };
    });
    const result = await provider.options.authorize({
      email: "auth03@test.com",
      password: "right-password",
    });
    expect(result).not.toBeNull();
    expect(result?.id).toBe(u.id);
  });

  test("AUTH-04 错误密码登录 → 返回 null", async () => {
    const passwordHash = await bcrypt.hash("right-password", 4);
    await prisma.user.create({
      data: {
        name: "Auth04",
        employeeId: "T-AUTH-04",
        email: "auth04@test.com",
        passwordHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
        mustChangePassword: false,
      },
    });
    const provider = authOptions.providers[0] as unknown as {
      options: {
        authorize: (
          c: { email: string; password: string } | undefined
        ) => Promise<unknown>;
      };
    };
    const result = await provider.options.authorize({
      email: "auth04@test.com",
      password: "WRONG",
    });
    expect(result).toBeNull();
  });

  test("AUTH-05 首次登录强制改密码（mustChangePassword 标记保留到 session）", async () => {
    // 直接验证：authorize 回调返回的 user 对象包含 mustChangePassword=true
    // 中间件根据 token.mustChangePassword 重定向，属于框架层；这里只验证模型契约。
    const passwordHash = await bcrypt.hash("init-pwd", 4);
    await prisma.user.create({
      data: {
        name: "Auth05",
        employeeId: "T-AUTH-05",
        email: "auth05@test.com",
        passwordHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
        mustChangePassword: true,
      },
    });
    const provider = authOptions.providers[0] as unknown as {
      options: {
        authorize: (c: { email: string; password: string }) => Promise<{
          mustChangePassword?: boolean;
        } | null>;
      };
    };
    const result = await provider.options.authorize({
      email: "auth05@test.com",
      password: "init-pwd",
    });
    expect(result?.mustChangePassword).toBe(true);
  });

  test("AUTH-06 改密码成功 → mustChangePassword 变为 false", async () => {
    const initHash = await bcrypt.hash("old-pwd-1", 4);
    const u = await prisma.user.create({
      data: {
        name: "Auth06",
        employeeId: "T-AUTH-06",
        email: "auth06@test.com",
        passwordHash: initHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
        mustChangePassword: true,
      },
    });
    setSession(mockedGetSession, u);
    const res = await changePwdPOST(
      jsonRequest("http://localhost/api/auth/change-password", {
        body: { currentPassword: "old-pwd-1", newPassword: "new-pwd-12345" },
      })
    );
    expect(res.status).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.mustChangePassword).toBe(false);
    expect(
      await bcrypt.compare("new-pwd-12345", after!.passwordHash!)
    ).toBe(true);
  });

  test("AUTH-07 改密码 — 当前密码错误 → 400", async () => {
    const initHash = await bcrypt.hash("real-pwd-1", 4);
    const u = await prisma.user.create({
      data: {
        name: "Auth07",
        employeeId: "T-AUTH-07",
        email: "auth07@test.com",
        passwordHash: initHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
      },
    });
    setSession(mockedGetSession, u);
    const res = await changePwdPOST(
      jsonRequest("http://localhost/api/auth/change-password", {
        body: { currentPassword: "WRONG-OLD", newPassword: "new-pwd-12345" },
      })
    );
    expect(res.status).toBe(400);
  });

  test("AUTH-08 改密码 — 新密码太短 → 400", async () => {
    const initHash = await bcrypt.hash("real-pwd-1", 4);
    const u = await prisma.user.create({
      data: {
        name: "Auth08",
        employeeId: "T-AUTH-08",
        email: "auth08@test.com",
        passwordHash: initHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
      },
    });
    setSession(mockedGetSession, u);
    const res = await changePwdPOST(
      jsonRequest("http://localhost/api/auth/change-password", {
        body: { currentPassword: "real-pwd-1", newPassword: "1234567" }, // 7 chars
      })
    );
    expect(res.status).toBe(400);
  });

  test("AUTH-09 员工角色访问管理端 API → 403", async () => {
    const emp = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, emp);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    expect([401, 403]).toContain(res.status);
  });

  test("AUTH-10 授予管理员访问用户管理 → 403", async () => {
    const ga = await createTestUser("GRANT_ADMIN");
    setSession(mockedGetSession, ga);
    const res = await userMgmtGET(
      getRequest("http://localhost/api/user-management")
    );
    expect(res.status).toBe(403);
  });

  test("AUTH-11 超管访问用户管理 → 200", async () => {
    const sa = await createTestUser("SUPER_ADMIN");
    setSession(mockedGetSession, sa);
    const res = await userMgmtGET(
      getRequest("http://localhost/api/user-management")
    );
    expect(res.status).toBe(200);
  });

  test("AUTH-12 管理员可访问员工端 API → 200（返回自己的数据）", async () => {
    const sa = await createTestUser("SUPER_ADMIN");
    setSession(mockedGetSession, sa);
    const res = await employeeOverviewGET();
    expect(res.status).toBe(200);
    const body = await readJson<{ data: { user: { id: string } } }>(res);
    expect(body.data.user.id).toBe(sa.id);
  });
});
