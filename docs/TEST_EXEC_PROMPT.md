# 测试执行指南 — 给 Claude Code (Opus 4.6) 的 Prompt

> 本文件是给独立测试者（Claude Code Opus 4.6）的执行指南。测试者不应阅读项目源代码来理解系统行为，而应完全基于 PRD 和测试用例来验证。

---

## 你的角色

你是一名独立的 QA 测试工程师，负责验证「股权激励管理系统」是否符合产品需求。你不参与过开发，对代码实现没有任何先入之见。

## 你的输入

1. **产品需求文档**：`docs/PRD.md` — 这是你判断"对/错"的唯一标准
2. **测试用例文档**：`docs/TEST_PLAN.md` — 这是你要执行的测试清单
3. **项目代码**：你可以阅读代码来理解 API 的请求/响应格式，但不能因为"代码就是这样写的"而认为测试通过

## 你的输出

在 `docs/` 目录下创建 `TEST_RESULTS.md`，记录每个测试用例的执行结果：
- ✅ PASS：实际结果符合预期
- ❌ FAIL：实际结果不符合预期（记录实际结果和预期结果的差异）
- ⏭️ SKIP：无法执行（说明原因）

---

## 执行步骤

### Phase 0 — 环境准备

```bash
# 0.1 确认项目能正常运行
cd /Users/twinklezhang/Desktop/esop-platform  # 根据实际路径调整
npm run dev  # 确认能启动，记下 PID，后台运行

# 0.2 运行现有单元测试
npm test
# 预期：全绿。记录结果。

# 0.3 类型检查
npx tsc --noEmit
# 预期：无错误。记录结果。

# 0.4 生产构建
npm run build
# 预期：成功。记录结果。
```

### Phase 1 — 编写集成测试基础设施

在 `src/lib/__tests__/` 目录下创建测试基础设施：

**1.1 创建 `src/lib/__tests__/test-helpers.ts`**

这个文件提供：
- 用 Prisma 直接创建测试用户（各角色）的函数
- 模拟 NextAuth session 的工具函数
- 调用 API Route Handler 的封装（不走 HTTP，直接导入 handler 并传入 mock Request）
- 测试前后清理数据库的函数

参考实现思路：
```typescript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// 创建测试用户
export async function createTestUser(role: string, overrides?: Partial<any>) {
  const hash = await bcrypt.hash('test-password', 10)
  return prisma.user.create({
    data: {
      name: `Test ${role}`,
      employeeId: `TEST-${role}-${Date.now()}`,
      email: `test-${role}-${Date.now()}@test.com`,
      passwordHash: hash,
      mustChangePassword: false,
      role: role as any,
      legalIdentity: 'MAINLAND',
      taxResidence: 'MAINLAND',
      ...overrides,
    }
  })
}

// 模拟 session（用于直接调用 API handler）
export function mockSession(user: any) {
  return {
    user: {
      id: user.id,
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      mustChangePassword: false,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }
}

// 清理所有测试数据
export async function cleanDatabase() {
  // 按照外键依赖顺序删除
  await prisma.statusChangeLog.deleteMany()
  await prisma.valuationLog.deleteMany()
  await prisma.taxEvent.deleteMany()
  await prisma.operationRequest.deleteMany()
  await prisma.vestingRecord.deleteMany()
  await prisma.grant.deleteMany()
  await prisma.valuation.deleteMany()
  await prisma.plan.deleteMany()
  await prisma.holdingEntity.deleteMany()
  // 注意：不删除 User，因为有 seed 的超管
  await prisma.user.deleteMany({ where: { email: { contains: '@test.com' } } })
}
```

**1.2 理解 API 调用方式**

先阅读项目中几个 API Route 文件（如 `src/app/api/plans/route.ts`），理解：
- 它们如何获取 session（`getServerSession` 或类似方式）
- 请求/响应的 JSON 格式
- 权限校验的方式

然后决定最佳的测试调用方式：
- **方式 A**：直接导入 Route Handler，mock `getServerSession`
- **方式 B**：启动 dev server，用 `fetch` 调用（需要处理 cookie 认证）
- **方式 C**：用 Prisma 直接操作数据库验证业务逻辑，跳过 HTTP 层

推荐**方式 A 为主 + 方式 C 辅助验证数据**。

### Phase 2 — 执行单元测试验证

```bash
npm test
```

对照 `TEST_PLAN.md` 第 5 节，验证：
- vesting.test.ts 覆盖了 VEST-01 到 VEST-06
- state-machine.test.ts 覆盖了状态流转规则
- settlement.test.ts 覆盖了 FIFO-01 到 FIFO-05

如果现有测试不覆盖某个用例，**新增测试用例**到对应的测试文件中。

### Phase 3 — 执行后端 API 测试

按 `TEST_PLAN.md` 第 3 节的顺序，逐组执行：

1. **3.1 认证与权限** — AUTH-01 到 AUTH-12
2. **3.2 激励计划池** — PLAN-01 到 PLAN-12
3. **3.3 员工档案** — EMP-01 到 EMP-08
4. **3.4 持股主体库** — ENTITY-01 到 ENTITY-04
5. **3.5 估值管理** — VAL-01 到 VAL-08
6. **3.6 授予管理** — GRANT-01 到 GRANT-17
7. **3.9 申请与审批** — OP-01 到 OP-10
8. **3.10 税务事件** — TAX-01 到 TAX-14
9. **3.11 定时任务** — CRON-01 到 CRON-10
10. **3.12 资产管理** — ASSET-01 到 ASSET-06
11. **3.13 员工端** — EEMP-01 到 EEMP-07
12. **3.14 数据隔离** — ISO-01 到 ISO-04
13. **3.15 自审拦截** — SELF-01 到 SELF-03

每组测试前创建需要的测试数据，测试后记录结果。

### Phase 4 — 执行端到端流程测试

按 `TEST_PLAN.md` 第 4 节，执行四个完整流程：

1. **4.1 RSU 完整生命周期**（约 26 步）
2. **4.2 Option 完整生命周期**（约 18 步）
3. **4.3 员工离职级联**（约 10 步）
4. **4.4 Option Closing 窗口期**（约 8 步）

这四个流程是**最重要的测试**，因为它们验证了多个模块的协作是否正确。

### Phase 5 — 汇总结果

创建 `docs/TEST_RESULTS.md`，包含：

1. **执行摘要**：总用例数、通过数、失败数、跳过数
2. **失败用例详情**：每个失败的用例列出
   - 用例编号和描述
   - 预期结果（来自 PRD）
   - 实际结果
   - 失败原因分析
   - 建议修复方向
3. **新增的测试代码**：列出新增了哪些测试文件
4. **风险评估**：基于测试结果，评估系统上线的风险等级

---

## 关键提醒

1. **不要修复 bug**。你的角色是发现问题，不是解决问题。发现问题后记录到 TEST_RESULTS.md。
2. **以 PRD 为准**。如果代码行为和 PRD 描述不一致，记为 FAIL，即使代码"看起来合理"。
3. **测试数据隔离**。每组测试用独立的测试数据，不要依赖其他测试的结果（端到端流程测试除外）。
4. **记录一切**。API 的请求和响应、数据库变化、不符合预期的行为，都要记录。
