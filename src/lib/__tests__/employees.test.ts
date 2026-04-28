/**
 * 集成测试 — 员工档案 + 持股主体（TEST_PLAN 3.3 / 3.4）
 */
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

import { getServerSession } from "next-auth";
import {
  GET as employeesGET,
  POST as employeesPOST,
} from "@/app/api/employees/route";
import { PUT as employeeByIdPUT } from "@/app/api/employees/[id]/route";
import {
  GET as entitiesGET,
  POST as entitiesPOST,
} from "@/app/api/entities/route";
import { PUT as entityByIdPUT } from "@/app/api/entities/[id]/route";
import { POST as grantsPOST } from "@/app/api/grants/route";
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

const empBody = (over: Record<string, unknown> = {}) => ({
  name: "张三",
  employeeId: `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
  email: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@test.com`,
  legalIdentity: "MAINLAND",
  taxResidence: "MAINLAND",
  ...over,
});

const entityBody = (over: Record<string, unknown> = {}) => ({
  name: "测试 LP",
  entityCode: `LP-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
  type: "LIMITED_PARTNERSHIP",
  registrationNo: "REG-001",
  taxJurisdiction: "内地",
  ...over,
});

describe("EMP 员工档案", () => {
  let grantAdmin: Awaited<ReturnType<typeof createTestUser>>;
  let approvalAdmin: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await cleanDatabase();
    mockedGetSession.mockReset();
    grantAdmin = await createTestUser("GRANT_ADMIN");
    approvalAdmin = await createTestUser("APPROVAL_ADMIN");
  });
  afterAll(async () => {
    await cleanDatabase();
    await disconnect();
  });

  test("EMP-01 添加员工 → 200，返回初始密码，mustChangePassword=true", async () => {
    setSession(mockedGetSession, grantAdmin);
    const res = await employeesPOST(
      jsonRequest("http://localhost/api/employees", { body: empBody() })
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ id: string; initialPassword: string }>>(res);
    expect(body.data?.initialPassword).toBeTruthy();
    expect(body.data!.initialPassword.length).toBeGreaterThanOrEqual(8);
    const dbUser = await prisma.user.findUnique({ where: { id: body.data!.id } });
    expect(dbUser?.mustChangePassword).toBe(true);
  });

  test("EMP-02 员工 ID 唯一性 → 400", async () => {
    setSession(mockedGetSession, grantAdmin);
    const b = empBody();
    await employeesPOST(jsonRequest("http://localhost/api/employees", { body: b }));
    const res = await employeesPOST(
      jsonRequest("http://localhost/api/employees", {
        body: { ...empBody(), employeeId: b.employeeId },
      })
    );
    expect(res.status).toBe(400);
  });

  test("EMP-03 邮箱唯一性 → 400", async () => {
    setSession(mockedGetSession, grantAdmin);
    const b = empBody();
    await employeesPOST(jsonRequest("http://localhost/api/employees", { body: b }));
    const res = await employeesPOST(
      jsonRequest("http://localhost/api/employees", {
        body: { ...empBody(), email: b.email },
      })
    );
    expect(res.status).toBe(400);
  });

  test("EMP-04 员工不能添加员工 → 403", async () => {
    const emp = await createTestUser("EMPLOYEE");
    setSession(mockedGetSession, emp);
    const res = await employeesPOST(
      jsonRequest("http://localhost/api/employees", { body: empBody() })
    );
    expect(res.status).toBe(403);
  });

  test("EMP-05 搜索员工", async () => {
    setSession(mockedGetSession, grantAdmin);
    await employeesPOST(
      jsonRequest("http://localhost/api/employees", {
        body: empBody({ name: "李四特别" }),
      })
    );
    await employeesPOST(
      jsonRequest("http://localhost/api/employees", {
        body: empBody({ name: "王五" }),
      })
    );
    const res = await employeesGET(
      getRequest("http://localhost/api/employees", { search: "特别" })
    );
    const body = await readJson<ApiBody<{ items: { name: string }[] }>>(res);
    expect(body.data?.items.length).toBe(1);
    expect(body.data?.items[0].name).toBe("李四特别");
  });

  test("EMP-06 筛选在职/离职", async () => {
    setSession(mockedGetSession, grantAdmin);
    const res = await employeesPOST(
      jsonRequest("http://localhost/api/employees", { body: empBody() })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(res);
    // 设为离职（用 superAdmin 以避开权限边界）
    const sa = await createTestUser("SUPER_ADMIN");
    setSession(mockedGetSession, sa);
    await employeeByIdPUT(
      jsonRequest(`http://localhost/api/employees/${cb.data!.id}`, {
        method: "PUT",
        body: {
          employmentStatus: "离职",
          offboardReason: "测试",
          exerciseWindowDays: 30,
        },
      }),
      { params: { id: cb.data!.id } }
    );
    setSession(mockedGetSession, grantAdmin);
    const list = await employeesGET(
      getRequest("http://localhost/api/employees", { status: "在职" })
    );
    const body = await readJson<ApiBody<{
      items: { employmentStatus: string }[];
    }>>(list);
    body.data!.items.forEach((u) => expect(u.employmentStatus).toBe("在职"));
  });

  test("EMP-07 管理员也出现在员工列表", async () => {
    setSession(mockedGetSession, grantAdmin);
    const res = await employeesGET(getRequest("http://localhost/api/employees"));
    const body = await readJson<ApiBody<{ items: { id: string }[] }>>(res);
    const ids = body.data!.items.map((u) => u.id);
    expect(ids).toContain(grantAdmin.id);
    expect(ids).toContain(approvalAdmin.id);
  });

  test("EMP-08 设为离职 — 授予管理员应被拒（PRD 7.2: employee.terminate 仅审批管理员/超管）", async () => {
    // 创建一个员工
    setSession(mockedGetSession, grantAdmin);
    const created = await employeesPOST(
      jsonRequest("http://localhost/api/employees", { body: empBody() })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    // 授予管理员尝试设为离职
    setSession(mockedGetSession, grantAdmin);
    const res = await employeeByIdPUT(
      jsonRequest(`http://localhost/api/employees/${cb.data!.id}`, {
        method: "PUT",
        body: {
          employmentStatus: "离职",
          offboardReason: "测试",
          exerciseWindowDays: 30,
        },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(403);
  });
});

describe("ENTITY 持股主体库", () => {
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

  test("ENTITY-01 添加持股主体 → 200，状态 ACTIVE", async () => {
    const res = await entitiesPOST(
      jsonRequest("http://localhost/api/entities", { body: entityBody() })
    );
    expect(res.status).toBe(200);
    const body = await readJson<ApiBody<{ status: string }>>(res);
    expect(body.data?.status).toBe("ACTIVE");
  });

  test("ENTITY-02 entityCode 唯一 → 400", async () => {
    const b = entityBody();
    await entitiesPOST(jsonRequest("http://localhost/api/entities", { body: b }));
    const res = await entitiesPOST(
      jsonRequest("http://localhost/api/entities", {
        body: { ...entityBody(), entityCode: b.entityCode },
      })
    );
    expect(res.status).toBe(400);
  });

  test("ENTITY-03 停用主体 → 200", async () => {
    const created = await entitiesPOST(
      jsonRequest("http://localhost/api/entities", { body: entityBody() })
    );
    const cb = await readJson<ApiBody<{ id: string }>>(created);
    const res = await entityByIdPUT(
      jsonRequest(`http://localhost/api/entities/${cb.data!.id}`, {
        method: "PUT",
        body: { status: "INACTIVE" },
      }),
      { params: { id: cb.data!.id } }
    );
    expect(res.status).toBe(200);
    const after = await prisma.holdingEntity.findUnique({
      where: { id: cb.data!.id },
    });
    expect(after?.status).toBe("INACTIVE");
  });

  test("ENTITY-04 停用的主体不能被授予引用 → 400", async () => {
    // 准备：APPROVED 计划 + 在职员工 + INACTIVE 主体
    const plan = await prisma.plan.create({
      data: {
        title: "P",
        type: "RSU",
        jurisdiction: "内地",
        deliveryMethod: { methods: ["SHARES"] },
        poolSize: "1000",
        effectiveDate: new Date(),
        status: "APPROVED",
      },
    });
    const emp = await createTestUser("EMPLOYEE");
    const entity = await prisma.holdingEntity.create({
      data: {
        name: "X",
        entityCode: `INA-${Date.now()}`,
        type: "OFFSHORE_SPV",
        registrationNo: "R",
        taxJurisdiction: "内地",
        status: "INACTIVE",
      },
    });
    const res = await grantsPOST(
      jsonRequest("http://localhost/api/grants", {
        body: {
          planId: plan.id,
          userId: emp.id,
          holdingEntityId: entity.id,
          grantDate: "2026-01-01",
          totalQuantity: "100",
          vestingYears: 1,
          cliffMonths: 0,
          vestingFrequency: "MONTHLY",
        },
      })
    );
    expect(res.status).toBe(400);
  });
});
