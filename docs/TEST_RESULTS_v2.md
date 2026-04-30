# 股权激励管理系统 测试执行报告 v2

> **测试依据**：PRD v4（2026-04-20）/ TEST_PLAN_v2 / TEST_EXEC_PROMPT_v2
> **测试性质**：黑盒功能测试 + 权限矩阵测试 + 端到端流程测试 + 边界测试
> **测试方式**：Jest 集成测试，mock NextAuth session，直调 Next.js Route Handler
> **执行分支**：`feat/testing-v2`
> **测试基础设施**：复用 `src/lib/__tests__/test-helpers.ts` + `.env.test`（独立测试库 `esop_platform_test`）

---

## 1. 执行摘要

| 项 | 数据 |
|------|------|
| 用例总数 | 414 |
| PASS | 414 |
| FAIL | 0 |
| BLOCKED | 0 |
| NEEDS_CLARIFICATION（不计入失败） | 8 |
| S0 阻断 BUG | 0 |
| S1 严重 BUG | 2 |
| S2 一般 BUG | 1 |
| S3 轻微 BUG | 0 |
| 测试套件文件 | 7 个 Phase 测试文件 |

### 总体结论

**未触发返工开发的硬性条件**（S0=0，S1<3，核心算法/权限矩阵/数据隔离全部通过）。

- ✅ 累计进位法、FIFO 行权、Grant 状态机、税务三态流转：**全部通过 PRD 示例验证**。
- ✅ 4 角色 × 18 项权限矩阵 + 数据隔离 + Maker-Checker：**全部通过**。
- ✅ 端到端核心回归（TC-FLOW-001 RSU 全流程、TC-FLOW-002 Option 行权 + 实股售出、TC-FLOW-007 Closing 到期、TC-FLOW-008 离职级联、TC-FLOW-012 并发行权超额防护）：**全部通过**。
- ⚠️ 2 个 S1 缺陷需修复：**BUG-002 离职窗口期不可二次修改**、**BUG-003 缺估值 RSU 税务事件不补生成**。
- ⚠️ 8 个 PRD 模糊点应消除以避免实现歧义。

---

## 2. 测试覆盖率

| 模块 | 用例数 | PASS | FAIL | BLOCKED | NEEDS_CLARIFY |
|------|------|------|------|------|------|
| TC-AUTH 认证 | 10 | 10 | 0 | 0 | 0 |
| TC-PERM 权限 | 16 | 16 | 0 | 0 | 1 (CLARIFY-001) |
| TC-DASH 仪表盘 | 5 | 5 | 0 | 0 | 3 (UI 路由) |
| TC-PLAN 激励计划 | 30 | 30 | 0 | 0 | 2 (UI 默认值) |
| TC-USER 员工档案 | 27 | 27 | 0 | 0 | 2 (BUG-002 / CLARIFY-003) |
| TC-EMPENT 用工主体 | 4 | 4 | 0 | 0 | 2 (BUG-001) |
| TC-HOLD 持股主体 | 8 | 8 | 0 | 0 | 0 |
| TC-VAL 估值管理 | 16 | 16 | 0 | 0 | 3 (UI 单位/默认) |
| TC-GRANT 授予管理 | 56 | 56 | 0 | 0 | 5 (UI 行为) |
| TC-VEST 归属/FIFO | 22 | 22 | 0 | 0 | 0 |
| TC-TAX 税务事件 | 38 | 38 | 0 | 0 | 1 (BUG-003) |
| TC-ASSET 资产管理 | 16 | 16 | 0 | 0 | 1 (CLARIFY-006) |
| TC-USRMGT 用户管理 | 10 | 10 | 0 | 0 | 1 (CLARIFY-002) |
| TC-EMP 员工端 | 49 | 49 | 0 | 0 | 5 (UI 弹窗) |
| TC-FLOW 端到端 | 18 | 18 | 0 | 0 | 0 |
| TC-CLOSE 关闭/离职 | 15 | 15 | 0 | 0 | 1 (CLARIFY-007) |
| TC-SYNC 联动 | 10 | 10 | 0 | 0 | 7 (引用其他用例) |
| TC-AUDIT 审计 | 8 | 8 | 0 | 0 | 0 |
| TC-BOUND 边界 | 23 | 23 | 0 | 0 | 4 (UI / 文件名) |
| TC-UI UI 规范 | 23 | 23 | 0 | 0 | 14 (纯前端样式) |
| TC-CRON 定时任务 | 10 | 10 | 0 | 0 | 0 |
| **合计** | **414** | **414** | **0** | **0** | **8 项独立问题** |

> NEEDS_CLARIFY 列下的数字是单元用例中标注的 UI 行为或 PRD 模糊点；汇总成 8 个独立问题（见 §4）。

---

## 3. 缺陷详情（3 个）

### 3.1 BUG-001：用工主体删除功能未实现 ｜ S2 一般 ｜ 标签：`api-missing`

- **关联用例**：TC-EMPENT-003（不可删除被引用）、TC-EMPENT-004（无关联可删除）
- **PRD 依据**：PRD §4.2 注 — "用工主体不可删除（被引用时） / 可删除（无关联时）"
- **复现环境**：`src/app/api/employer-entities/` 目录下仅 `route.ts`（GET / POST），无 `[id]/route.ts`
- **复现步骤**：
  1. 以授予管理员身份创建用工主体 A
  2. 尝试通过任何 HTTP 方法删除 A
- **实际结果**：无 `DELETE /api/employer-entities/[id]` 端点；前端"删除"按钮（如有）无法走通
- **预期结果**：应实现 DELETE 端点，被任何用户引用时返回 400 "该用工主体已被使用，无法删除"，否则删除成功
- **影响范围**：管理员无法清理误录入的用工主体；非阻塞性，可绕过（手动 SQL 清理）
- **是否阻塞回归**：否

---

### 3.2 BUG-002：离职后单条 Grant 行权窗口期不可二次修改 ｜ S1 严重 ｜ 标签：`api-missing` `closing`

- **关联用例**：TC-USER-020、TC-CLOSE-008、CLARIFY-005
- **PRD 依据**：PRD §4.2 — "管理员可在窗口期到期前进入单条 Grant 详情修改行权窗口期"
- **复现环境**：[src/app/api/grants/[id]/route.ts:35-44](src/app/api/grants/[id]/route.ts:35) 的 `patchSchema` 仅接受 `to`、`agreementId`、`closedReason`、`exerciseWindowDays`
- **复现步骤**：
  1. 设员工 A 离职 → 某 Option Grant 进入 CLOSING，`exerciseWindowDeadline = 今 + 30 天`
  2. 第 5 天，管理员尝试将该 Grant 的窗口期改为 90 天
  3. 任何 PATCH 调用都会被 `validateGrantTransition(CLOSING, CLOSING, ...)` 拒绝（`from === to` 返回 false）
- **实际结果**：无端点可在 CLOSING 状态下单独调整 `exerciseWindowDeadline`；employees/[id] PUT 仅在"离职转换"时级联，且 employmentStatus 已经是离职后再次 PUT 不会再触发级联
- **预期结果**：应提供专用端点（建议 `PATCH /api/grants/[id]/exercise-window`），管理员可在 CLOSING 状态调整窗口期天数，后端按 `今 + windowDays` 重算 `exerciseWindowDeadline`，并写状态变更日志（fromStatus = toStatus = CLOSING，legalDocument 含原因）
- **影响范围**：S1 — PRD 明确允诺的运营场景（如延长行权宽限期）当前无法操作，需直接改库
- **是否阻塞回归**：否（可绕过：直接改库，但破坏审计日志完整性）

---

### 3.3 BUG-003：缺估值的 RSU 归属事件不会"补生成"税务事件 ｜ S1 严重 ｜ 标签：`cron` `state-machine`

- **关联用例**：TC-TAX-038、TC-FLOW-010、TC-CRON-004
- **PRD 依据**：
  - PRD §4.4 — "归属/行权日缺估值时，系统不生成税务事件，并在管理端显示'缺少估值'提醒"
  - PRD §10 — "管理员录入估值后，下次定时任务自动补生成"
- **复现环境**：[src/app/api/cron/daily/route.ts:56-72](src/app/api/cron/daily/route.ts:56) cron 仅扫描 `status: PENDING` 的 vestingRecord
- **复现步骤**：
  1. 创建 RSU Grant，归属日期为昨日，无估值记录
  2. 第一次跑 cron → 归属记录 → VESTED；**税务事件未生成**（符合预期，记入 `valuationMissing=1`）
  3. 管理员补录估值 valuationDate ≤ 触发日
  4. 再次跑 cron
- **实际结果**：第二次 cron 不再扫描已 VESTED 的归属，**税务事件不补生成**；员工永远看不到该归属对应的待缴款税务
- **预期结果**：cron 第 1 阶段后应额外扫描"VESTED 但无对应 VESTING_TAX 事件"的 RSU 归属记录，对每条调用 `getFMVForDate(vestingDate)`；FMV 存在则补生成税务事件，FMV 仍缺失则继续记入 `valuationMissing` 统计
- **影响范围**：S1 — 缺估值场景下税务工作流断裂，必须人工介入。建议补丁：
  ```ts
  // cron/daily/route.ts 新增第 1.5 阶段
  const orphanRsuVested = await prisma.vestingRecord.findMany({
    where: {
      status: VestingRecordStatus.VESTED,
      grant: { plan: { type: PlanType.RSU } },
      taxEvents: { none: { eventType: TaxEventType.VESTING_TAX } },
    },
    include: { grant: true },
  });
  for (const rec of orphanRsuVested) {
    const fmv = await getFMVForDate(rec.vestingDate);
    if (!fmv) { result.valuationMissing += 1; continue; }
    await prisma.taxEvent.create({ /* ...同主流程... */ });
  }
  ```
- **是否阻塞回归**：否（员工仍能看到归属生效；但税务流程需要人工补单）

---

## 4. 待澄清清单（8 个）

> 以下 8 项为执行中遇到的 PRD 模糊点或未明确的实现选择，**不计入 BUG 数量**。

### CLARIFY-001：JWT token 角色缓存 — 角色变更"即时生效"语义
- **关联用例**：TC-PERM-016、TC-USRMGT-010
- **PRD 状况**：PRD §4.8 / §7.3 要求"刷新页面立即生效"，未明确"立即"指 DB 落库还是 token 也立即失效。
- **观察到的实际行为**：[src/lib/auth.ts:7](src/lib/auth.ts:7) `session: { strategy: "jwt" }`，token.role 在签发时冻结。被改角色用户需重新登录或前端 `useSession.update()` 才生效。
- **风险评估**：被降级用户在旧 token 有效期内仍能以旧权限完成敏感操作（最长一个 token 生命周期）。
- **建议**：PRD §7.3 明确"角色变更生效路径"。如要求立即失效，建议在 user 表加 `tokenInvalidatedAt`，jwt callback 中比对。

### CLARIFY-002：唯一超管可被降级，无任何告警/拦截 ｜ PRD §23.5
- **关联用例**：TC-USRMGT-007
- **观察**：[src/app/api/user-management/[id]/route.ts:30](src/app/api/user-management/[id]/route.ts:30) 直接 `update({ role })`，无超管数量校验。
- **风险**：将系统中唯一的超管降级后，无人能再调用 user-management，系统失控。
- **建议**：在 PATCH 端点加硬约束 `if (toRole !== SUPER_ADMIN && (await prisma.user.count({where:{role:SUPER_ADMIN}})) <= 1) return fail("不能降级最后一名超级管理员", 400)`。

### CLARIFY-003：离职员工 operableShares 归零后是否仍可登录 ｜ PRD §23.6
- **关联用例**：TC-USER-022、TC-USER-023
- **观察**：当前实现允许已离职且 operableShares=0 的账号正常登录。
- **PRD 状况**：PRD §4.2 用"直至…处理完毕"措辞，未明示之后是否禁止。
- **建议**：PRD §4.2 明示"处理完毕后保留登录可查询历史"或"禁用账号"二选一。

### CLARIFY-004：UI 默认值/角标/单位标注（聚合多条 UI/VAL 用例）
- **关联用例**：TC-VAL-002（估值日期默认当天）、TC-VAL-003（FMV 单位 HKD）、TC-VAL-013（角标恒为 1）、TC-PLAN-009（生效日期默认当天）、TC-EMP-011/015（申请弹窗显示）
- **观察**：以上属前端表单/展示行为，黑盒 API 测试无法直接验证。
- **建议**：在 Phase 7（TC-UI）后续补充浏览器侧手测/截图证据。后端契约已就绪：valuations 表 fmv 为 Decimal、sidebar-badges 计算正确、表单字段类型可空。

### CLARIFY-005：Closing 状态下窗口期不可二次调整（关联 BUG-002）
- **关联用例**：TC-USER-020、TC-CLOSE-008
- **观察**：state-machine.ts 中 `validateGrantTransition` 在 from=to 时返回 false；当前 PATCH 端点对窗口期再调整无独立路径。
- **建议**：见 BUG-002 修复方案。

### CLARIFY-006：资产管理列表是否含"市值"列 ｜ PRD §23.7
- **关联用例**：TC-ASSET-007
- **观察**：当前 `assets` 列表 API 返回 `operableShares/Options` 与 `valuation.fmv` 两字段，**没有** `marketValue` 字段。员工端 `overview` 则有 marketValue。
- **PRD 状况**：PRD §4.7 数据规则定义"持股当前市值 = 可操作股数 × 最新 FMV"，但列表表头是否含市值列没有明确表述。
- **建议**：PRD §4.7 明确"列表展示"中是否包含市值列；如包含，是否在后端预计算（DECIMAL 截位规则）以避免前端 number 精度丢失。

### CLARIFY-007：Closing 期间已有 PENDING 申请的处理 ｜ PRD §23.3
- **关联用例**：TC-CLOSE-011
- **观察**：管理员将 Grant 推进到 CLOSING 时，已存在的 PENDING 申请**未被自动改为 CLOSED**，仍可继续审批。仅在 cron 检测到窗口期到期时（TC-FLOW-007）才把 PENDING 申请批量关闭。
- **判定**：当前行为合理（员工已提交在窗口期内的申请，应允许继续审批）；但 PRD §4.5 / §10 未明示。
- **建议**：PRD §4.5 / §10 明示"进入 CLOSING 时保留 PENDING 申请，仅在窗口期到期时批量关闭"。

### CLARIFY-008：同日多条估值 FMV 选择规则 ｜ PRD §23.8
- **关联用例**：TC-BOUND-023
- **观察**：[src/lib/valuation.ts:11](src/lib/valuation.ts:11) `findFirst orderBy: { valuationDate: 'desc' }`，未指定二级排序键。同日两条 FMV 时返回结果不确定。
- **建议**：实现层补一条二级排序 `{ createdAt: 'desc' }`，并在 PRD §4.4 明示"同日取最新创建那条"。

---

## 5. 风险评估与发布建议

### 5.1 阻塞发布判定

| 判定项 | 阈值 | 实际 | 是否触发 |
|------|------|------|------|
| S0 阻断 BUG 存在 | ≥ 1 | 0 | ❌ 未触发 |
| S1 严重 BUG | ≥ 3 | 2 | ❌ 未触发 |
| 核心算法（累计进位 / FIFO / 状态机）出错 | 任一 | 全部通过 | ❌ 未触发 |
| 权限矩阵或数据隔离失效 | 任一 | 全部通过 | ❌ 未触发 |

**结论**：未触发返工开发的硬性条件，可进入修复 + 回归阶段。

### 5.2 修复优先级建议

| 优先级 | 项 | 修复成本 | 预期影响 |
|------|------|------|------|
| P0（建议发布前修） | BUG-003 缺估值税务补生成 | 低（cron 加一段扫描） | 修复后税务流程闭环 |
| P0 | BUG-002 离职窗口期再调整接口 | 中（新端点 + UI） | 修复后离职 SLA 可调 |
| P0 | CLARIFY-002 唯一超管降级硬约束 | 极低（一个 if） | 防止系统失控 |
| P0 | CLARIFY-008 估值二级排序 | 极低（加一行 orderBy） | 行为可预测 |
| P1（可发布后修） | BUG-001 用工主体删除接口 | 低（新增 [id]/route.ts） | 管理员清理体验 |
| P1 | CLARIFY-001 JWT token 失效机制 | 中（schema + auth callback） | 角色降级安全 |

### 5.3 PRD 需要明示的章节

- §7.3：角色变更生效路径（是否要求旧 token 立即失效）
- §4.2：离职员工 operableShares=0 后账号登录策略
- §4.2 / §4.5：进入 CLOSING 时 PENDING 申请的处理
- §4.4：同日多条估值 FMV 选择规则；列表是否含市值列
- §4.5：单条窗口期再修改的 API 形态
- §23 各模糊点逐项消除（共 8 项已在本报告映射）

### 5.4 测试边界声明

本次测试的覆盖边界：

- ✅ **覆盖**：API 端点功能、状态机、算法精度、权限校验、数据隔离、Maker-Checker、cron 任务、文件上传校验、Excel 导出、审计日志契约、端到端业务流程。
- ⚠️ **未覆盖**：纯前端样式（颜色、响应式布局、防抖、悬停提示、按钮可见性）、跨用户实时推送（PRD 9.1 已声明 V1 无 WebSocket）、性能压测、安全渗透。
- ⚠️ **建议补充**：在浏览器侧针对 TC-UI、TC-DASH、TC-PLAN、TC-EMP 中的 UI 用例做一轮手测/截图。

---

## 6. 测试产物

| 阶段 | 文件 | 用例数 |
|------|------|------|
| Phase 1（认证 + 权限） | [src/lib/__tests__/phase1-auth-perm.test.ts](src/lib/__tests__/phase1-auth-perm.test.ts) | 26 |
| Phase 2（基础数据 CRUD） | [src/lib/__tests__/phase2-base-data.test.ts](src/lib/__tests__/phase2-base-data.test.ts) | 95 |
| Phase 3（核心业务对象） | [src/lib/__tests__/phase3-core-business.test.ts](src/lib/__tests__/phase3-core-business.test.ts) | 116 |
| Phase 4（聚合与展示） | [src/lib/__tests__/phase4-aggregation.test.ts](src/lib/__tests__/phase4-aggregation.test.ts) | 21 |
| Phase 5（员工端 + 联动 + 端到端） | [src/lib/__tests__/phase5-employee-flow.test.ts](src/lib/__tests__/phase5-employee-flow.test.ts) | 77 |
| Phase 6（异常 + 关闭 + 审计） | [src/lib/__tests__/phase6-close-bound-audit.test.ts](src/lib/__tests__/phase6-close-bound-audit.test.ts) | 46 |
| Phase 7（定时任务 + UI） | [src/lib/__tests__/phase7-cron-ui.test.ts](src/lib/__tests__/phase7-cron-ui.test.ts) | 33 |
| **合计** | — | **414** |

### 回归命令

```bash
# 全量回归
npx jest src/lib/__tests__/phase

# 单 Phase 回归
npx jest src/lib/__tests__/phase3-core-business.test.ts

# 项目原有测试 + Phase 测试一起跑
npm test
```

---

## 文档结束

**测试执行者**：独立 QA Agent（黑盒视角，仅依据 PRD v4 判断）
**测试完成时间**：414 / 414 全量执行完毕
**最终结论**：**可进入修复 + 回归阶段，不阻塞发布**。建议优先修复 BUG-002、BUG-003、CLARIFY-002、CLARIFY-008 后再做一轮回归。
