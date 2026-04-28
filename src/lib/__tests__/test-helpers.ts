/**
 * 集成测试基础设施
 *
 * 用法（每个集成测试文件顶部）：
 *
 *   jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
 *   import { getServerSession } from "next-auth";
 *   import { setSession, clearSession, ... } from "@/lib/__tests__/test-helpers";
 *
 *   beforeEach(() => setSession(getServerSession as jest.Mock, null));
 */
import { PrismaClient, UserRole, Jurisdiction } from "@prisma/client";
import bcrypt from "bcryptjs";

export const prisma = new PrismaClient();

export interface TestUserOverrides {
  name?: string;
  employeeId?: string;
  email?: string;
  legalIdentity?: Jurisdiction;
  taxResidence?: Jurisdiction;
  employmentStatus?: string;
  mustChangePassword?: boolean;
  department?: string | null;
}

let userCounter = 0;

/** 创建测试用户。employeeId/email 不传时自动生成唯一值。 */
export async function createTestUser(
  role: UserRole,
  overrides: TestUserOverrides = {}
) {
  userCounter += 1;
  const seed = `${Date.now()}-${userCounter}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const passwordHash = await bcrypt.hash("test-password", 4); // 低 cost 加快测试
  return prisma.user.create({
    data: {
      name: overrides.name ?? `测试-${role}-${seed}`,
      employeeId: overrides.employeeId ?? `T-${role}-${seed}`,
      email: overrides.email ?? `t-${role}-${seed}@test.com`,
      passwordHash,
      mustChangePassword: overrides.mustChangePassword ?? false,
      role,
      legalIdentity: overrides.legalIdentity ?? "MAINLAND",
      taxResidence: overrides.taxResidence ?? "MAINLAND",
      employmentStatus: overrides.employmentStatus ?? "在职",
      department: overrides.department ?? null,
    },
  });
}

/** 模拟 NextAuth session（用于 getServerSession 的 mockResolvedValue） */
export function mockSession(user: {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  mustChangePassword?: boolean;
}) {
  return {
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword ?? false,
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

/** 设置当前 session。传 null 则模拟未登录。 */
export function setSession(
  mockedGetServerSession: jest.Mock,
  user: Parameters<typeof mockSession>[0] | null
) {
  if (user === null) {
    mockedGetServerSession.mockResolvedValue(null);
  } else {
    mockedGetServerSession.mockResolvedValue(mockSession(user));
  }
}

/** 清空所有测试数据（按外键依赖顺序）。仅删除 *@test.com 的用户。 */
export async function cleanDatabase() {
  await prisma.statusChangeLog.deleteMany();
  await prisma.valuationLog.deleteMany();
  await prisma.taxEvent.deleteMany();
  await prisma.operationRequest.deleteMany();
  await prisma.vestingRecord.deleteMany();
  await prisma.grant.deleteMany();
  await prisma.valuation.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.holdingEntity.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: "@test.com" } } });
  await prisma.employerEntity.deleteMany();
}

/** 构造一个 JSON POST/PUT/PATCH/DELETE 请求 */
export function jsonRequest(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Request {
  return new Request(url, {
    method: init.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

/** 构造一个 GET 请求（带 query string 拼接） */
export function getRequest(
  url: string,
  query: Record<string, string | number | undefined> = {}
): Request {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  return new Request(u, { method: "GET" });
}

/** 解析 NextResponse.json() 的响应体 */
export async function readJson<T = unknown>(
  res: Response | { json: () => Promise<T> }
): Promise<T> {
  return (res as Response).json() as Promise<T>;
}

/** 关闭 Prisma 连接（在 afterAll 中调用） */
export async function disconnect() {
  await prisma.$disconnect();
}
