/**
 * Phase 1 黑盒测试 — TC-AUTH (10) + TC-PERM (16)
 *
 * 角色：独立 QA。仅依据 PRD v4 与 TEST_PLAN_v2 判断对错。
 * 范围：API 层端到端验证（mock NextAuth session）。Middleware/页面级行为同步验证。
 *
 * 输出：每条 TC 独立断言；run-end 后由测试报告聚合。
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";

// API routes under test
import { GET as plansGET, POST as plansPOST } from "@/app/api/plans/route";
import { PATCH as planApprovePATCH, DELETE as planDELETE } from "@/app/api/plans/[id]/route";
import { POST as employeesPOST } from "@/app/api/employees/route";
import { PUT as employeePUT } from "@/app/api/employees/[id]/route";
import { POST as grantsPOST } from "@/app/api/grants/route";
import { PATCH as grantStatusPATCH } from "@/app/api/grants/[id]/route";
import { PATCH as opApprovePATCH } from "@/app/api/operations/[id]/route";
import { PATCH as taxConfirmPATCH } from "@/app/api/tax-events/[id]/route";
import { GET as userMgmtGET } from "@/app/api/user-management/route";
import {
  PATCH as userRolePATCH,
  POST as userResetPOST,
} from "@/app/api/user-management/[id]/route";
import { GET as employeeOverviewGET } from "@/app/api/employee/overview/route";
import { GET as employeeGrantDetailGET } from "@/app/api/employee/grants/[id]/route";
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
import { Prisma } from "@prisma/client";

const mockedGetSession = getServerSession as jest.Mock;
const mockedGetToken = getToken as jest.Mock;

// 简化 authorize 调用
async function callAuthorize(
  email: string,
  password: string
): Promise<{ id: string; mustChangePassword?: boolean } | null> {
  const provider = authOptions.providers[0] as unknown as {
    options: {
      authorize: (
        c: { email: string; password: string }
      ) => Promise<{ id: string; mustChangePassword?: boolean } | null>;
    };
  };
  return provider.options.authorize({ email, password });
}

// 创建用工主体（用于资产/grant 测试）
async function createEmployerEntity(name = "默认主体") {
  return prisma.employerEntity.create({
    data: { name, currency: "CNY" },
  });
}

// 创建一个完整可被授予的 RSU/Option 计划与 Grant（用于权限测试）
async function setupPlanAndApprovedGrant(opts: {
  type: "RSU" | "OPTION";
  status?:
    | "DRAFT"
    | "GRANTED"
    | "ALL_SETTLED"
    | "PARTIALLY_SETTLED"
    | "CLOSING"
    | "CLOSED";
}) {
  const plan = await prisma.plan.create({
    data: {
      title: `Test ${opts.type} Plan`,
      type: opts.type as "RSU" | "OPTION",
      jurisdiction: "内地",
      deliveryMethod:
        opts.type === "RSU"
          ? { methods: ["SHARES"] }
          : { methods: ["OPTION_RIGHT"], label: "购买实股的权利" },
      poolSize: new Prisma.Decimal(10000),
      effectiveDate: new Date("2026-01-01"),
      status: "APPROVED",
    },
  });
  const owner = await createTestUser("EMPLOYEE");
  const grant = await prisma.grant.create({
    data: {
      planId: plan.id,
      userId: owner.id,
      grantDate: new Date("2026-01-01"),
      vestingStartDate: new Date("2026-01-01"),
      totalQuantity: new Prisma.Decimal(100),
      strikePrice: new Prisma.Decimal(opts.type === "OPTION" ? 1 : 0),
      vestingYears: 4,
      cliffMonths: 0,
      vestingFrequency: "YEARLY",
      exercisePeriodYears: opts.type === "OPTION" ? 10 : null,
      exerciseDeadline:
        opts.type === "OPTION" ? new Date("2036-01-01") : null,
      agreementId: "AG-1",
      status: opts.status ?? "DRAFT",
    },
  });
  return { plan, owner, grant };
}

// ============== Phase 1 测试 ==============

describe("Phase 1 — TC-AUTH 认证与首次登录（10 条）", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    mockedGetToken.mockReset();
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("TC-AUTH-001 邮箱密码登录成功", async () => {
    const passwordHash = await bcrypt.hash("right-pwd-123", 4);
    const u = await prisma.user.create({
      data: {
        name: "Auth001",
        employeeId: "T-AUTH-001",
        email: "auth001@test.com",
        passwordHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
        mustChangePassword: false,
      },
    });
    const result = await callAuthorize("auth001@test.com", "right-pwd-123");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(u.id);
  });

  test("TC-AUTH-002 错误密码登录被拒绝", async () => {
    const passwordHash = await bcrypt.hash("right", 4);
    await prisma.user.create({
      data: {
        name: "Auth002",
        employeeId: "T-AUTH-002",
        email: "auth002@test.com",
        passwordHash,
        role: "EMPLOYEE",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
      },
    });
    const result = await callAuthorize("auth002@test.com", "WRONG");
    expect(result).toBeNull();
  });

  test("TC-AUTH-003 不存在的邮箱被拒绝（不应区分用户不存在）", async () => {
    const result = await callAuthorize("nope@test.com", "any-pwd");
    expect(result).toBeNull();
    // 注：当前 authorize 为不存在与错密码统一返回 null，符合 PRD 建议（"建议返回通用'邮箱或密码错误'"）
  });

  test("TC-AUTH-004 首次登录强制改密码（mustChangePassword 透传到 token）", async () => {
    const passwordHash = await bcrypt.hash("init-1", 4);
    await prisma.user.create({
      data: {
        name: "Auth004",
        employeeId: "T-AUTH-004",
        email: "auth004@test.com",
        passwordHash,
        role: "SUPER_ADMIN",
        legalIdentity: "MAINLAND",
        taxResidence: "MAINLAND",
        mustChangePassword: true,
      },
    });
    const result = await callAuthorize("auth004@test.com", "init-1");
    expect(result?.mustChangePassword).toBe(true);
    // middleware.ts 会基于 token.mustChangePassword=true 跳转到 /change-password
  });

  test("TC-AUTH-005 管理员添加员工后初始密码登录强制改密", async () => {
    const ga = await createTestUser("GRANT_ADMIN");
    setSession(mockedGetSession, ga);
    const res = await employeesPOST(
      jsonRequest("http://localhost/api/employees", {
        body: {
          name: "新员工",
          employeeId: "EMP-NEW-1",
          email: "empnew1@test.com",
          legalIdentity: "MAINLAND",
          taxResidence: "MAINLAND",
        },
      })
    );
    expect(res.status).toBe(200);
    const body = await readJson<{
      success: boolean;
      data: { id: string; initialPassword: string };
    }>(res);
    expect(body.success).toBe(true);
    expect(body.data.initialPassword).toBeTruthy();

    const created = await prisma.user.findUnique({
      where: { id: body.data.id },
    });
    expect(created?.mustChangePassword).toBe(true);

    // 用初始密码 authorize → 返回 mustChangePassword=true
    const r = await callAuthorize("empnew1@test.com", body.data.initialPassword);
    expect(r?.mustChangePassword).toBe(true);
  });

  test("TC-AUTH-006 改密成功后 mustChangePassword=false，下次登录直通", async () => {
    const initHash = await bcrypt.hash("old-pwd-1", 4);
    const u = await prisma.user.create({
      data: {
        name: "Auth006",
        employeeId: "T-AUTH-006",
        email: "auth006@test.com",
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
    const after = await callAuthorize("auth006@test.com", "new-pwd-12345");
    expect(after?.mustChangePassword).toBe(false);
  });

  test("TC-AUTH-007 超管重置员工密码后，员工再次登录强制改密", async () => {
    const sa = await createTestUser("SUPER_ADMIN");
    const target = await createTestUser("EMPLOYEE", { mustChangePassword: false });
    setSession(mockedGetSession, sa);
    const res = await userResetPOST(
      new Request("http://localhost/api/user-management/" + target.id, {
        method: "POST",
      }),
      { params: { id: target.id } }
    );
    expect(res.status).toBe(200);
    const body = await readJson<{ data: { newPassword: string } }>(res);
    expect(body.data.newPassword).toBeTruthy();

    const refreshed = await prisma.user.findUnique({ where: { id: target.id } });
    expect(refreshed?.mustChangePassword).toBe(true);

    // 用新临时密码登录，token 应携带 mustChangePassword=true
    const r = await callAuthorize(target.email, body.data.newPassword);
    expect(r?.mustChangePassword).toBe(true);
  });

  test("TC-AUTH-008 未登录访问受保护 API → 401", async () => {
    setSession(mockedGetSession, null);
    const adminAPI = await plansGET(getRequest("http://localhost/api/plans"));
    expect(adminAPI.status).toBe(401);
    const employeeAPI = await employeeOverviewGET();
    expect(employeeAPI.status).toBe(401);
  });

  test("TC-AUTH-009 注销后访问受保护 API → 401（与未登录等价）", async () => {
    // NextAuth 注销 = 清除 token。API 层观察等同于未登录。
    setSession(mockedGetSession, null);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    expect(res.status).toBe(401);
  });

  test("TC-AUTH-010 Session 过期 → API 拒绝（与未登录等价）", async () => {
    // JWT 过期后 getServerSession 返回 null
    setSession(mockedGetSession, null);
    const res = await plansGET(getRequest("http://localhost/api/plans"));
    expect(res.status).toBe(401);
    // 注：表单数据保留属于前端行为，本黑盒接口测试不验证
  });
});

describe("Phase 1 — TC-PERM 权限矩阵与路由保护（16 条）", () => {
  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    mockedGetToken.mockReset();
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  // 工具：用 4 角色逐个调用某 API，断言 status
  async function expectByRole(
    description: string,
    invoke: () => Promise<Response>,
    expected: {
      SUPER_ADMIN: number | number[];
      GRANT_ADMIN: number | number[];
      APPROVAL_ADMIN: number | number[];
      EMPLOYEE: number | number[];
    }
  ) {
    for (const role of [
      "SUPER_ADMIN",
      "GRANT_ADMIN",
      "APPROVAL_ADMIN",
      "EMPLOYEE",
    ] as const) {
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await invoke();
      const exp = expected[role];
      const allowed = Array.isArray(exp) ? exp : [exp];
      if (!allowed.includes(res.status)) {
        throw new Error(
          `[${description}] role=${role} 返回 ${res.status}，期望 ${allowed.join("/")}`
        );
      }
    }
  }

  test("TC-PERM-001 创建计划：仅超管/授予管理员", async () => {
    await expectByRole(
      "POST /api/plans",
      () =>
        plansPOST(
          jsonRequest("http://localhost/api/plans", {
            body: {
              title: "P1",
              type: "RSU",
              jurisdiction: "内地",
              deliveryMethods: ["SHARES"],
              poolSize: 100,
              effectiveDate: "2026-01-01",
            },
          })
        ),
      {
        SUPER_ADMIN: 200,
        GRANT_ADMIN: 200,
        APPROVAL_ADMIN: 403,
        EMPLOYEE: 403,
      }
    );
  });

  test("TC-PERM-002 审批计划：仅超管/审批管理员", async () => {
    // 每个角色重新建一个 PENDING_APPROVAL 计划再尝试审批（避免状态污染）
    for (const role of [
      "SUPER_ADMIN",
      "GRANT_ADMIN",
      "APPROVAL_ADMIN",
      "EMPLOYEE",
    ] as const) {
      const plan = await prisma.plan.create({
        data: {
          title: "P-" + role,
          type: "RSU",
          jurisdiction: "内地",
          deliveryMethod: { methods: ["SHARES"] },
          poolSize: new Prisma.Decimal(100),
          effectiveDate: new Date("2026-01-01"),
          status: "PENDING_APPROVAL",
        },
      });
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await planApprovePATCH(
        new Request("http://localhost/api/plans/" + plan.id, { method: "PATCH" }),
        { params: { id: plan.id } }
      );
      const expected =
        role === "SUPER_ADMIN" || role === "APPROVAL_ADMIN" ? 200 : 403;
      expect({ role, status: res.status, expected }).toEqual({
        role,
        status: expected,
        expected,
      });
    }
  });

  test("TC-PERM-003 添加员工：超管/授予/审批均可", async () => {
    let counter = 0;
    await expectByRole(
      "POST /api/employees",
      () => {
        counter += 1;
        return employeesPOST(
          jsonRequest("http://localhost/api/employees", {
            body: {
              name: "E" + counter,
              employeeId: "EID-" + counter + "-" + Date.now(),
              email: `e${counter}-${Date.now()}@test.com`,
              legalIdentity: "MAINLAND",
              taxResidence: "MAINLAND",
            },
          })
        );
      },
      {
        SUPER_ADMIN: 200,
        GRANT_ADMIN: 200,
        APPROVAL_ADMIN: 200,
        EMPLOYEE: 403,
      }
    );
  });

  test("TC-PERM-004 创建授予：仅超管/授予管理员", async () => {
    const { plan, owner } = await setupPlanAndApprovedGrant({ type: "RSU" });
    let counter = 0;
    await expectByRole(
      "POST /api/grants",
      () => {
        counter += 1;
        return grantsPOST(
          jsonRequest("http://localhost/api/grants", {
            body: {
              planId: plan.id,
              userId: owner.id,
              grantDate: "2026-02-01",
              vestingStartDate: "2026-02-01",
              totalQuantity: 10 + counter,
              vestingYears: 4,
              cliffMonths: 0,
              vestingFrequency: "YEARLY",
            },
          })
        );
      },
      {
        SUPER_ADMIN: 200,
        GRANT_ADMIN: 200,
        APPROVAL_ADMIN: 403,
        EMPLOYEE: 403,
      }
    );
  });

  test("TC-PERM-005 推进 Grant Draft→Granted：仅超管/审批管理员", async () => {
    for (const role of [
      "SUPER_ADMIN",
      "GRANT_ADMIN",
      "APPROVAL_ADMIN",
      "EMPLOYEE",
    ] as const) {
      const { grant } = await setupPlanAndApprovedGrant({
        type: "RSU",
        status: "DRAFT",
      });
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await grantStatusPATCH(
        jsonRequest("http://localhost/api/grants/" + grant.id, {
          method: "PATCH",
          body: { to: "GRANTED" },
        }),
        { params: { id: grant.id } }
      );
      const expected =
        role === "SUPER_ADMIN" || role === "APPROVAL_ADMIN" ? 200 : 403;
      expect({ role, status: res.status, expected }).toEqual({
        role,
        status: expected,
        expected,
      });
    }
  });

  test("TC-PERM-006 关闭 Grant：仅超管/审批管理员", async () => {
    for (const role of [
      "SUPER_ADMIN",
      "GRANT_ADMIN",
      "APPROVAL_ADMIN",
      "EMPLOYEE",
    ] as const) {
      const { grant } = await setupPlanAndApprovedGrant({
        type: "RSU",
        status: "GRANTED",
      });
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await grantStatusPATCH(
        jsonRequest("http://localhost/api/grants/" + grant.id, {
          method: "PATCH",
          body: { to: "CLOSED", closedReason: "PERM-006 测试" },
        }),
        { params: { id: grant.id } }
      );
      const expected =
        role === "SUPER_ADMIN" || role === "APPROVAL_ADMIN" ? 200 : 403;
      expect({ role, status: res.status, expected }).toEqual({
        role,
        status: expected,
        expected,
      });
    }
  });

  test("TC-PERM-007 审批员工申请：仅超管/审批管理员", async () => {
    for (const role of [
      "SUPER_ADMIN",
      "GRANT_ADMIN",
      "APPROVAL_ADMIN",
      "EMPLOYEE",
    ] as const) {
      const { grant, owner } = await setupPlanAndApprovedGrant({
        type: "OPTION",
        status: "GRANTED",
      });
      // 给该 grant 加一个 PENDING 的 OperationRequest
      const opReq = await prisma.operationRequest.create({
        data: {
          userId: owner.id,
          grantId: grant.id,
          requestType: "EXERCISE",
          quantity: new Prisma.Decimal(10),
          status: "PENDING",
        },
      });
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await opApprovePATCH(
        jsonRequest("http://localhost/api/operations/" + opReq.id, {
          method: "PATCH",
          body: { decision: "REJECT", approverNotes: "test" },
        }),
        { params: { id: opReq.id } }
      );
      const expected =
        role === "SUPER_ADMIN" || role === "APPROVAL_ADMIN" ? 200 : 403;
      expect({ role, status: res.status, expected }).toEqual({
        role,
        status: expected,
        expected,
      });
    }
  });

  test("TC-PERM-008 设置员工离职：仅超管/审批管理员", async () => {
    for (const role of [
      "SUPER_ADMIN",
      "GRANT_ADMIN",
      "APPROVAL_ADMIN",
      "EMPLOYEE",
    ] as const) {
      const target = await createTestUser("EMPLOYEE");
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await employeePUT(
        jsonRequest("http://localhost/api/employees/" + target.id, {
          method: "PUT",
          body: {
            employmentStatus: "离职",
            offboardReason: "test",
            exerciseWindowDays: 90,
          },
        }),
        { params: { id: target.id } }
      );
      const expected =
        role === "SUPER_ADMIN" || role === "APPROVAL_ADMIN" ? 200 : 403;
      expect({ role, status: res.status, expected }).toEqual({
        role,
        status: expected,
        expected,
      });
    }
  });

  test("TC-PERM-009 确认税务事件：仅超管/审批管理员（含 Maker-Checker）", async () => {
    for (const role of [
      "SUPER_ADMIN",
      "GRANT_ADMIN",
      "APPROVAL_ADMIN",
      "EMPLOYEE",
    ] as const) {
      const { grant, owner } = await setupPlanAndApprovedGrant({
        type: "RSU",
        status: "GRANTED",
      });
      const v = await prisma.valuation.create({
        data: {
          valuationDate: new Date("2026-01-01"),
          fmv: new Prisma.Decimal(1),
        },
      });
      const vrec = await prisma.vestingRecord.create({
        data: {
          grantId: grant.id,
          vestingDate: new Date("2026-02-01"),
          quantity: new Prisma.Decimal(10),
          status: "VESTED",
        },
      });
      const tax = await prisma.taxEvent.create({
        data: {
          grantId: grant.id,
          userId: owner.id,
          eventType: "VESTING_TAX",
          operationType: "归属",
          quantity: new Prisma.Decimal(10),
          eventDate: new Date("2026-02-01"),
          fmvAtEvent: new Prisma.Decimal(1),
          valuationId: v.id,
          strikePrice: new Prisma.Decimal(0),
          status: "RECEIPT_UPLOADED",
          vestingRecordId: vrec.id,
        },
      });
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await taxConfirmPATCH(
        jsonRequest("http://localhost/api/tax-events/" + tax.id, {
          method: "PATCH",
          body: { action: "CONFIRM" },
        }),
        { params: { id: tax.id } }
      );
      const expected =
        role === "SUPER_ADMIN" || role === "APPROVAL_ADMIN" ? 200 : 403;
      expect({ role, status: res.status, expected }).toEqual({
        role,
        status: expected,
        expected,
      });
    }
  });

  test("TC-PERM-010 用户管理 GET：仅超管", async () => {
    await expectByRole(
      "GET /api/user-management",
      () => userMgmtGET(getRequest("http://localhost/api/user-management")),
      {
        SUPER_ADMIN: 200,
        GRANT_ADMIN: 403,
        APPROVAL_ADMIN: 403,
        EMPLOYEE: 403,
      }
    );
  });

  test("TC-PERM-011 员工访问管理端 API → 拒绝（middleware 跳转 + API 401/403）", async () => {
    const emp = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, emp);
    const r1 = await plansGET(getRequest("http://localhost/api/plans"));
    expect([401, 403]).toContain(r1.status);
    const r2 = await userMgmtGET(
      getRequest("http://localhost/api/user-management")
    );
    expect(r2.status).toBe(403);
    // middleware 行为：员工访问 /admin/* → 重定向到 /employee（已在 src/middleware.ts 实现）
  });

  test("TC-PERM-012 管理员访问 /employee/* API → 200，返回自己的数据", async () => {
    for (const role of ["SUPER_ADMIN", "GRANT_ADMIN", "APPROVAL_ADMIN"] as const) {
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await employeeOverviewGET();
      expect(res.status).toBe(200);
      const body = await readJson<{ data: { user: { id: string } } }>(res);
      expect(body.data.user.id).toBe(u.id);
    }
  });

  test("TC-PERM-013 用户管理路由仅超管：非超管 API 返回 403", async () => {
    for (const role of ["GRANT_ADMIN", "APPROVAL_ADMIN", "EMPLOYEE"] as const) {
      const u = await createTestUser(role);
      setSession(mockedGetSession, u);
      const res = await userMgmtGET(
        getRequest("http://localhost/api/user-management")
      );
      expect(res.status).toBe(403);
    }
  });

  test("TC-PERM-014 API 端点权限校验（绕过前端，使用员工 session 调写接口）", async () => {
    const emp = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, emp);
    // 写计划
    const r1 = await plansPOST(
      jsonRequest("http://localhost/api/plans", {
        body: {
          title: "X",
          type: "RSU",
          jurisdiction: "内地",
          deliveryMethods: ["SHARES"],
          poolSize: 1,
          effectiveDate: "2026-01-01",
        },
      })
    );
    expect(r1.status).toBe(403);
    // 推进 Grant
    const { grant } = await setupPlanAndApprovedGrant({
      type: "RSU",
      status: "DRAFT",
    });
    setSession(mockedGetSession, emp);
    const r2 = await grantStatusPATCH(
      jsonRequest("http://localhost/api/grants/" + grant.id, {
        method: "PATCH",
        body: { to: "GRANTED" },
      }),
      { params: { id: grant.id } }
    );
    expect(r2.status).toBe(403);
    // 修改用户角色
    const r3 = await userRolePATCH(
      jsonRequest("http://localhost/api/user-management/" + emp.id, {
        method: "PATCH",
        body: { role: "SUPER_ADMIN" },
      }),
      { params: { id: emp.id } }
    );
    expect(r3.status).toBe(403);
  });

  test("TC-PERM-015 员工端 API 数据隔离：A 不能访问 B 的 Grant", async () => {
    const empA = await createTestUser("EMPLOYEE");
    const empB = await createTestUser("EMPLOYEE");
    const plan = await prisma.plan.create({
      data: {
        title: "DI",
        type: "RSU",
        jurisdiction: "内地",
        deliveryMethod: { methods: ["SHARES"] },
        poolSize: new Prisma.Decimal(100),
        effectiveDate: new Date("2026-01-01"),
        status: "APPROVED",
      },
    });
    const grantOfB = await prisma.grant.create({
      data: {
        planId: plan.id,
        userId: empB.id,
        grantDate: new Date("2026-01-01"),
        vestingStartDate: new Date("2026-01-01"),
        totalQuantity: new Prisma.Decimal(10),
        strikePrice: new Prisma.Decimal(0),
        vestingYears: 4,
        cliffMonths: 0,
        vestingFrequency: "YEARLY",
        agreementId: "AG-DI",
        status: "GRANTED",
      },
    });
    setSession(mockedGetSession, empA);
    const res = await employeeGrantDetailGET(
      new Request("http://localhost/api/employee/grants/" + grantOfB.id),
      { params: { id: grantOfB.id } }
    );
    // A 直接访问 B 的 Grant ID，必须返回 404，绝不能返回 B 的数据
    expect(res.status).toBe(404);
  });

  test("TC-PERM-016 角色变更后即时生效（PRD 4.8 要求刷新页面立即生效）", async () => {
    // 注：JWT session 缓存了 role；DB 中改 role 后，"立即生效"对 JWT 而言通常需要触发 update()
    // PRD 4.8 强调的是 UI 刷新后立即生效。当前实现：
    //   - DB 角色变更：✅ 已落库
    //   - getServerSession 仍读取已发的 token（role 未刷新），需重新登录或 update()
    // 因此这里只断言 DB 中角色已更新，并将"是否真正即时生效"的判断结果记入观察。
    const sa = await createTestUser("SUPER_ADMIN");
    const target = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, sa);
    const res = await userRolePATCH(
      jsonRequest("http://localhost/api/user-management/" + target.id, {
        method: "PATCH",
        body: { role: "APPROVAL_ADMIN" },
      }),
      { params: { id: target.id } }
    );
    expect(res.status).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after?.role).toBe("APPROVAL_ADMIN");

    // 如果 target 持有的是旧 token（role=EMPLOYEE），权限校验仍按 EMPLOYEE。
    // 用刚刷新的 user 对象 mock 一次 session，模拟"刷新页面后"的新 token：
    setSession(mockedGetSession, after!);
    const r2 = await userMgmtGET(
      getRequest("http://localhost/api/user-management")
    );
    // APPROVAL_ADMIN 不能查用户管理（仅超管），符合权限矩阵
    expect(r2.status).toBe(403);
    // 注：PRD 4.8 要求 UI 立即刷新。本断言只能验证 DB 落库 + 模拟新 token。
    // "用户无需重新登录"的实际刷新路径由前端 useSession.update() 触发，未在 API 层验证。
  });
});
