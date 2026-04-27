# 股权激励管理系统 — 测试分析与用例文档

> **重要原则**：本文档完全基于 `docs/PRD.md` 编写，不参考系统代码实现。测试执行者应独立验证系统是否符合 PRD 需求，而非验证代码内部一致性。

---

## 目录

- [1. 测试范围与策略](#1-测试范围与策略)
- [2. 测试环境准备](#2-测试环境准备)
- [3. 后端 API 测试用例](#3-后端-api-测试用例)
- [4. 端到端业务流程测试](#4-端到端业务流程测试)
- [5. 单元测试验证](#5-单元测试验证)
- [附录：权限矩阵完整测试清单](#附录权限矩阵完整测试清单)

---

## 1. 测试范围与策略

### 1.1 测试分层

| 层级 | 范围 | 方法 | 优先级 |
|------|------|------|--------|
| 单元测试 | Vesting 计算、状态机、FIFO 引擎 | `npm test`（已有用例，验证是否全绿） | P0 |
| 后端 API 测试 | 所有 API 端点的输入输出、权限、边界 | Jest 集成测试脚本 | P0 |
| 端到端流程测试 | RSU/Option 完整生命周期、离职级联 | 按步骤调用多个 API 串联验证 | P0 |
| 数据隔离测试 | 员工端 API 不能访问他人数据 | 用不同用户 session 交叉验证 | P0 |
| 权限矩阵测试 | PRD 7.2 每个角色的每项权限 | 逐项用对应角色调用 API | P1 |

### 1.2 不在本次测试范围内

- 前端 UI 渲染效果、样式、响应式布局（已手动验证）
- 性能和压力测试
- 安全渗透测试（XSS/CSRF/SQL 注入等）
- 邮件通知（V2 规划，未实现）

---

## 2. 测试环境准备

### 2.1 前置条件

```bash
# 确保数据库运行
psql -U twinklezhang -d postgres -c "SELECT 1"

# 重置数据库到干净状态
npx prisma migrate reset --force

# 运行种子脚本创建初始超管
npx prisma db seed

# 启动开发服务器（测试期间保持运行）
npm run dev
```

### 2.2 测试方法说明

本项目使用 NextAuth session cookie 认证，直接 curl 操作不便。推荐以下两种测试方式：

**方式一（推荐）：Jest 集成测试**
编写 Jest 测试文件，直接导入 Prisma Client 创建测试数据，通过 mock NextAuth session 调用 API handler。

**方式二：Node.js 脚本**
编写独立脚本，用 Prisma 直接创建测试用户和数据，用 `fetch` 调用本地 API（需处理 cookie）。

### 2.3 测试数据规划

测试需要以下角色的用户（通过 Prisma 直接创建，不依赖 UI）：

| 用户 | 角色 | 邮箱 | 用途 |
|------|------|------|------|
| 超管A | SUPER_ADMIN | super@test.com | 全权限操作 |
| 授予管理员B | GRANT_ADMIN | grant@test.com | 创建计划/授予 |
| 审批管理员C | APPROVAL_ADMIN | approval@test.com | 审批/确认 |
| 员工D | EMPLOYEE | emp-d@test.com | 员工端操作 |
| 员工E | EMPLOYEE | emp-e@test.com | 数据隔离验证 |

---

## 3. 后端 API 测试用例

### 3.1 认证与权限（PRD 第 7 节）

| 编号 | 用例 | 输入 | 预期结果 |
|------|------|------|---------|
| AUTH-01 | 未登录访问管理端 API | GET /api/plans（无 session） | 401 `{success:false}` |
| AUTH-02 | 未登录访问员工端 API | GET /api/employee/overview（无 session） | 401 |
| AUTH-03 | 正确邮箱密码登录 | POST credentials（正确邮箱+密码） | 200，返回 session |
| AUTH-04 | 错误密码登录 | POST credentials（错误密码） | 登录失败 |
| AUTH-05 | 首次登录强制改密码 | 新用户 session 访问任意页面 | 重定向到 /change-password |
| AUTH-06 | 改密码成功 | POST /api/auth/change-password（当前密码+新密码≥8位） | 200，mustChangePassword → false |
| AUTH-07 | 改密码 — 当前密码错误 | POST change-password（错误的当前密码） | 400 |
| AUTH-08 | 改密码 — 新密码太短 | POST change-password（新密码 < 8 位） | 400 |
| AUTH-09 | 员工角色访问管理端 API | 员工 session + GET /api/plans | 401 或 403 |
| AUTH-10 | 授予管理员访问用户管理 | 授予管理员 session + GET /api/user-management | 403 |
| AUTH-11 | 超管访问用户管理 | 超管 session + GET /api/user-management | 200 |
| AUTH-12 | 管理员可访问员工端 API | 超管 session + GET /api/employee/overview | 200（返回自己的数据） |

### 3.2 激励计划池（PRD 第 4.1 节）

| 编号 | 用例 | 角色 | 输入 | 预期结果 |
|------|------|------|------|---------|
| PLAN-01 | 创建 RSU 计划 | 授予管理员 | title, type=RSU, jurisdiction, deliveryMethod, poolSize, effectiveDate | 201，状态=PENDING_APPROVAL |
| PLAN-02 | 创建 Option 计划 | 授予管理员 | type=OPTION | 201，交割方式自动为「购买实股的权利」 |
| PLAN-03 | 审批管理员不能创建计划 | 审批管理员 | POST /api/plans | 403 |
| PLAN-04 | 授予管理员不能审批计划 | 授予管理员 | PATCH /api/plans/[id]（审批通过） | 403 |
| PLAN-05 | 审批管理员审批通过 | 审批管理员 | PATCH /api/plans/[id]（action=approve） | 200，状态=APPROVED |
| PLAN-06 | 已通过计划不可再编辑 | 授予管理员 | PUT /api/plans/[id]（APPROVED 状态） | 400 |
| PLAN-07 | 缺少必填字段 | 授予管理员 | POST /api/plans 缺少 title | 400 |
| PLAN-08 | poolSize 非数字 | 授予管理员 | poolSize="abc" | 400 |
| PLAN-09 | 搜索计划 | 管理员 | GET /api/plans?search=RSU | 返回匹配结果 |
| PLAN-10 | 按类型筛选 | 管理员 | GET /api/plans?type=RSU | 仅返回 RSU 类型 |
| PLAN-11 | 分页 | 管理员 | GET /api/plans?page=1&pageSize=10 | 返回正确分页数据 |
| PLAN-12 | 已授予数量计算 | - | 计划下有非 Closed Grant + Closed Grant | 列表返回正确的已授予数量（按 PRD 4.1 公式） |

### 3.3 员工档案（PRD 第 4.2 节）

| 编号 | 用例 | 角色 | 输入 | 预期结果 |
|------|------|------|------|---------|
| EMP-01 | 添加员工 | 任意管理员 | name, employeeId, email, legalIdentity, taxResidence | 201，返回初始密码，mustChangePassword=true |
| EMP-02 | 员工 ID 唯一性 | 管理员 | 重复的 employeeId | 400 |
| EMP-03 | 邮箱唯一性 | 管理员 | 重复的 email | 400 |
| EMP-04 | 员工不能添加员工 | 员工 | POST /api/employees | 403 |
| EMP-05 | 搜索员工 | 管理员 | GET /api/employees?search=张三 | 匹配姓名或 ID |
| EMP-06 | 筛选在职/离职 | 管理员 | GET /api/employees?status=在职 | 仅返回在职 |
| EMP-07 | 管理员也出现在员工列表 | 管理员 | GET /api/employees | 包含管理员角色的用户 |
| EMP-08 | 设为离职 — 权限 | 授予管理员 | PUT /api/employees/[id] status=离职 | 403（仅审批管理员/超管可操作） |

### 3.4 持股主体库（PRD 第 4.3 节）

| 编号 | 用例 | 输入 | 预期结果 |
|------|------|------|---------|
| ENTITY-01 | 添加持股主体 | 全部必填字段 | 201，状态=ACTIVE |
| ENTITY-02 | 代持主体 ID 唯一 | 重复 entityCode | 400 |
| ENTITY-03 | 停用主体 | PUT status=INACTIVE | 200 |
| ENTITY-04 | 停用的主体不能被授予引用 | 创建授予时选择已停用主体 | 400 |

### 3.5 估值管理（PRD 第 4.4 节）

| 编号 | 用例 | 输入 | 预期结果 |
|------|------|------|---------|
| VAL-01 | 添加估值记录 | valuationDate, fmv | 201 |
| VAL-02 | 估值不可编辑 | PUT /api/valuations/[id] | 404 或 405 |
| VAL-03 | 删除未引用的估值 | DELETE（未被税务事件引用） | 200 |
| VAL-04 | 删除已引用的估值 | DELETE（已被税务事件引用） | 400，提示"已被引用" |
| VAL-05 | FMV 引用规则 — 正常 | getFMVForDate(date)，date 后有估值 | 返回 ≤ date 的最近估值 |
| VAL-06 | FMV 引用规则 — 无估值 | 触发日前无任何估值 | 返回 null |
| VAL-07 | 估值审计日志 — 添加 | 添加估值后查询 logs | 有 CREATED 的 ValuationLog |
| VAL-08 | 估值审计日志 — 删除 | 删除估值后查询 logs | 有 DELETED 的 ValuationLog，含快照数据 |

### 3.6 授予管理与状态机（PRD 第 3 节、4.5 节）

| 编号 | 用例 | 输入 | 预期结果 |
|------|------|------|---------|
| GRANT-01 | 创建 RSU 授予 | 关联已通过计划 + 在职员工 | 201，status=DRAFT，strikePrice=0 |
| GRANT-02 | 创建 Option 授予 | 含 strikePrice | 201，status=DRAFT |
| GRANT-03 | 引用未通过计划 | planId 指向 PENDING_APPROVAL 的计划 | 400 |
| GRANT-04 | 引用离职员工 | userId 指向离职员工 | 400 |
| GRANT-05 | 引用停用持股主体 | holdingEntityId 指向 INACTIVE 主体 | 400 |
| GRANT-06 | 超过计划剩余额度 | 授予数量 > 剩余额度 | 400，提示额度不足 |
| GRANT-07 | Draft → Granted（无协议 ID） | 不填 agreementId 直接推进 | 400，提示必须填协议 ID |
| GRANT-08 | Draft → Granted（有协议 ID） | 填入 agreementId 后推进 | 200，生成归属记录，全部 PENDING |
| GRANT-09 | Draft 状态可编辑 | PUT（DRAFT 状态） | 200 |
| GRANT-10 | Granted 状态不可编辑 | PUT（GRANTED 状态） | 400 |
| GRANT-11 | 非法状态跳转 | Draft 直接到 Vesting | 400 |
| GRANT-12 | 关闭 RSU Grant | 审批管理员关闭 | 200，PENDING 归属 → CLOSED |
| GRANT-13 | 关闭 Option（有未行权） | operableOptions > 0 | 200，进入 CLOSING，设置截止日 |
| GRANT-14 | 关闭 Option（无未行权） | operableOptions == 0 | 200，直接 CLOSED |
| GRANT-15 | 授予管理员不能推进状态 | 授予管理员 PATCH Draft→Granted | 403 |
| GRANT-16 | 状态变更日志 | 任何状态变更后 | 有对应 StatusChangeLog 记录 |
| GRANT-17 | Closed 后仍可对实股操作 | Closed + operableShares > 0 | 员工可提交 post-settlement 申请 |

### 3.7 归属计算引擎（PRD「累计进位法」）

| 编号 | 用例 | 输入 | 预期结果 |
|------|------|------|---------|
| VEST-01 | 标准场景 | 1200 份、6 月 cliff、按月、1 年 | 7 条记录，总和=1200，cliff 期=600 |
| VEST-02 | 无 cliff | 1200 份、0 月 cliff、按月、1 年 | 12 条记录，总和=1200 |
| VEST-03 | 按年归属 | 1200 份、0 月 cliff、按年、4 年 | 4 条记录，总和=1200 |
| VEST-04 | 不整除 | 200 份、6 月 cliff、按月、2 年 | 19 条记录，总和=200 |
| VEST-05 | 最小值 | 1 份 | 总和=1 |
| VEST-06 | 累计进位公平性 | 200 份、24 期 | 任意截断点的已归属总量与理论按比例数偏差≤1 |

### 3.8 FIFO 交割分配引擎（PRD 第 3.8 节）

| 编号 | 用例 | 输入 | 预期结果 |
|------|------|------|---------|
| FIFO-01 | PRD 场景 1 | 记录1(600可行权)+记录2(100) → 行权500 | 记录1剩100(Partially Settled) |
| FIFO-02 | PRD 场景 2 | 接上 → 行权550 | 记录1-5 Settled，记录6剩50 |
| FIFO-03 | 一次清零 | 行权量=全部可行权 | 所有记录 Settled |
| FIFO-04 | 超额行权 | 行权量>可行权总量 | 抛错 |
| FIFO-05 | 行权量 ≤ 0 | 0 或负数 | 抛错 |

### 3.9 申请与审批（PRD 第 3.6 节）

| 编号 | 用例 | 角色 | 输入 | 预期结果 |
|------|------|------|------|---------|
| OP-01 | RSU 售出申请 | 员工 | type=SELL, target=SHARES, qty ≤ operableShares | 201，status=PENDING |
| OP-02 | RSU 申请超额 | 员工 | quantity > operableShares | 400 |
| OP-03 | Option 行权申请 | 员工 | type=EXERCISE, target=OPTIONS, qty ≤ operableOptions | 201 |
| OP-04 | Option 不能售出期权 | 员工 | type=SELL, target=OPTIONS | 400 |
| OP-05 | RSU 不能行权 | 员工 | RSU Grant + type=EXERCISE | 400 |
| OP-06 | 审批通过 | 审批管理员 | PATCH approve | 200，status=APPROVED，生成税务事件 |
| OP-07 | 审批驳回 | 审批管理员 | PATCH reject + notes | 200，status=REJECTED |
| OP-08 | 授予管理员不能审批 | 授予管理员 | PATCH approve | 403 |
| OP-09 | 驳回后可重新申请 | 员工 | 重新 POST | 201 |
| OP-10 | 无估值时审批拒绝 | 审批管理员 | 审批通过但无对应 FMV | 400 或 500，提示先录入估值 |

### 3.10 税务事件（PRD 第 3.7 节、4.6 节）

| 编号 | 用例 | 触发 | 预期结果 |
|------|------|------|---------|
| TAX-01 | RSU 归属自动生成 | cron 触发归属 | 生成 VESTING_TAX，PENDING_PAYMENT |
| TAX-02 | Option 行权审批后生成 | 审批通过行权 | 生成 EXERCISE_TAX |
| TAX-03 | Post-settlement 审批后生成 | 审批通过售出 | 生成 POST_SETTLEMENT_TAX |
| TAX-04 | 无估值时不生成 RSU 税务 | 归属触发但无 FMV | 不生成，cron 返回 valuationMissing |
| TAX-05 | 税务确认权限 | 授予管理员 confirm | 403 |
| TAX-06 | RSU 税务确认 → 更新 | confirm VESTING_TAX | operableShares += qty，归属→Settled |
| TAX-07 | Option 行权确认 → 更新 | confirm EXERCISE_TAX | operableOptions-=，operableShares+=，FIFO |
| TAX-08 | PS 实股确认 → 更新 | confirm PS_TAX (SHARES) | operableShares -= |
| TAX-09 | PS 期权确认 → 更新 | confirm PS_TAX (OPTIONS) | operableOptions -= |
| TAX-10 | 不可手动创建 | POST /api/tax-events | 404 或 405 |
| TAX-11 | 凭证上传 | 员工 POST upload（JPG/PNG/PDF, ≤10MB, ≤3个） | 200，状态→RECEIPT_UPLOADED |
| TAX-12 | 凭证类型限制 | 上传 .exe 文件 | 400 |
| TAX-13 | 凭证大小限制 | 上传 > 10MB | 400 |
| TAX-14 | 确认后不可替换凭证 | CONFIRMED 状态下上传 | 400 |

### 3.11 定时任务（PRD 第 10 节）

| 编号 | 用例 | 前置条件 | 预期结果 |
|------|------|---------|---------|
| CRON-01 | Vesting 翻转 | 有到期 PENDING 归属 | Pending → Vested |
| CRON-02 | Option 归属同步 | Option 归属 Vested | operableOptions += qty，exercisableOptions = qty |
| CRON-03 | RSU 税务生成 | RSU 归属 + 有估值 | 生成 VESTING_TAX |
| CRON-04 | RSU 缺估值跳过 | RSU 归属 + 无估值 | 不生成，valuationMissing > 0 |
| CRON-05 | Grant 状态推进 | 部分归属 Vested | Grant → VESTING |
| CRON-06 | 全部归属 Vested | 所有归属 Vested | Grant → FULLY_VESTED |
| CRON-07 | Closing 到期 | deadline 已过 | operableOptions=0，归属→Closed，Grant→Closed |
| CRON-08 | Closing 到期释放额度 | 同上 | 计划剩余额度增加 |
| CRON-09 | Closing 到期关闭申请 | 有 PENDING 行权申请 | 申请 → CLOSED |
| CRON-10 | 单个 Grant 失败不影响其他 | 一个 Grant 数据异常 | 其他 Grant 正常处理 |

### 3.12 资产管理（PRD 第 4.7 节）

| 编号 | 用例 | 预期结果 |
|------|------|---------|
| ASSET-01 | 聚合正确性 | 同一(员工+持股主体+类型)的多个 Grant 的 operableShares 累加 |
| ASSET-02 | RSU 可操作期权显示 | RSU 行的 operableOptions 为 null 或 "-" |
| ASSET-03 | 最新估值 | 返回最新 Valuation |
| ASSET-04 | 员工详情 | 返回该员工的授予+归属汇总 |
| ASSET-05 | Excel 导出 | GET /api/assets/export 返回 xlsx 文件 |
| ASSET-06 | 税务事件 Excel 导出 | GET /api/tax-events/export 返回 xlsx 文件 |

### 3.13 员工端 API（PRD 第 5 节）

| 编号 | 用例 | 角色 | 预期结果 |
|------|------|------|---------|
| EEMP-01 | 总览 | 员工 | 返回个人信息 + 聚合资产 |
| EEMP-02 | 授予记录 | 员工 | 仅 Granted 及之后状态，不含 Draft |
| EEMP-03 | 归属详情 | 员工 | 返回所有归属记录（排除 Draft Grant） |
| EEMP-04 | 申请记录 | 员工 | 返回自己的所有申请 |
| EEMP-05 | 税务记录 | 员工 | 返回自己的所有税务事件 |
| EEMP-06 | 管理员切换员工视图 | 审批管理员 | 能访问 /api/employee/*，返回自己的数据 |
| EEMP-07 | 管理员员工视图可提交申请 | 超管 | POST /api/operations 成功 |

### 3.14 数据隔离（PRD 第 7.3 节）

| 编号 | 用例 | 方法 | 预期结果 |
|------|------|------|---------|
| ISO-01 | 员工 D 不能看 E 的授予 | D 的 session + /api/employee/grants | 只返回 D 的 |
| ISO-02 | 员工 D 不能看 E 的税务 | D 的 session + /api/employee/tax-records | 只返回 D 的 |
| ISO-03 | 员工 D 不能操作 E 的 Grant | D 的 session + POST /api/operations（E 的 grantId） | 400 或 403 |
| ISO-04 | 员工 D 不能上传 E 的凭证 | D 的 session + POST upload（E 的 taxEventId） | 403 |

### 3.15 自审拦截

| 编号 | 用例 | 场景 | 预期结果 |
|------|------|------|---------|
| SELF-01 | 不能推进自己的授予 | 超管给自己创建 Grant → Draft→Granted | 400，提示不能审批自己 |
| SELF-02 | 不能审批自己的申请 | 超管自己提交申请后自己审批 | 400 |
| SELF-03 | 不能确认自己的税务 | 超管自己的税务事件自己确认 | 400 |

---

## 4. 端到端业务流程测试

### 4.1 RSU 完整生命周期

```
准备：
  1. 授予管理员B创建 RSU 计划（poolSize=10000）
  2. 审批管理员C审批通过
  3. 任意管理员添加估值记录（valuationDate=2025-01-01, fmv=100）
  4. 任意管理员创建员工D
  5. 授予管理员B创建 RSU 授予给员工D（quantity=1200, 6月cliff, 按月, 1年, vestingStartDate=2025-01-01）
  6. 审批管理员C推进 Draft → Granted（补填协议ID）

验证归属记录生成：
  7. GET 授予详情 → 应有 7 条归属记录，全部 PENDING
  8. Grant status = GRANTED
  9. operableShares = 0, operableOptions = 0

触发归属（模拟到期）：
  10. POST /api/cron/daily
  11. 到期归属记录 → VESTED
  12. Grant 状态推进（VESTING 或 FULLY_VESTED）
  13. 自动生成 VESTING_TAX（每个 Vested 归属一条）
  14. operableShares 仍为 0（税务未确认）

员工上传凭证：
  15. 员工D → GET /api/employee/tax-records → 看到待缴款记录
  16. 员工D → POST upload 上传凭证
  17. 税务状态 → RECEIPT_UPLOADED

管理员确认税务：
  18. 审批管理员C → PATCH /api/tax-events/[id] confirm
  19. 税务状态 → CONFIRMED
  20. operableShares += 归属数量
  21. 归属记录 → SETTLED

员工 post-settlement：
  22. 员工D → POST /api/operations（SELL, SHARES, qty ≤ operableShares）
  23. 审批管理员C审批通过 → 生成 POST_SETTLEMENT_TAX
  24. 员工上传凭证 → 管理员确认
  25. operableShares -= 售出数量

验证最终状态：
  26. 所有归属 Settled + 所有税务 CONFIRMED → Grant = ALL_SETTLED
```

### 4.2 Option 完整生命周期

```
准备：
  1-6. 同 RSU 但 type=OPTION, strikePrice=50

触发归属：
  7. POST /api/cron/daily
  8. 到期归属 → VESTED
  9. operableOptions += 归属数量（不是 operableShares）
  10. 不自动生成税务事件（Option 归属不生成）

员工行权：
  11. 员工D → POST /api/operations（EXERCISE, OPTIONS, qty=500）
  12. 审批管理员C审批通过 → 生成 EXERCISE_TAX
  13. 员工上传凭证 → 管理员确认
  14. operableOptions -= 500, operableShares += 500
  15. FIFO 消耗归属记录（验证消耗顺序正确）

员工售出实股：
  16. 员工D → POST /api/operations（SELL, SHARES, qty=200）
  17. 审批 → 税务 → 确认
  18. operableShares -= 200
```

### 4.3 员工离职级联

```
准备：
  1. 员工D有 RSU 授予（VESTING 状态，部分归属已 Vested）
  2. 员工D有 Option 授予（operableOptions > 0）
  3. 员工D有一个 PENDING 状态的行权申请

触发离职：
  4. 审批管理员C设置员工D为离职（关闭原因 + 窗口期 30 天）

验证：
  5. PENDING 申请 → CLOSED
  6. RSU Grant（非 All Settled）→ CLOSED，PENDING 归属 → CLOSED
  7. Option Grant（operableOptions > 0）→ CLOSING（截止日 = 今天 + 30）
  8. 已 Vested/Settled 归属记录不受影响
  9. operableShares 保持不变
  10. 员工D仍可登录（有 operableShares 的 Grant 未处理完）
```

### 4.4 Option Closing 窗口期到期

```
准备：
  1. 有 CLOSING 状态的 Option Grant

模拟到期：
  2. 修改 exerciseWindowDeadline 为过去日期
  3. POST /api/cron/daily

验证：
  4. operableOptions → 0
  5. VESTED / PARTIALLY_SETTLED 归属 → CLOSED
  6. Grant → CLOSED
  7. 未行权额度释放回计划池（验证计划的剩余额度增加）
  8. PENDING 行权申请 → CLOSED
```

---

## 5. 单元测试验证

```bash
npm test
```

预期：3 suites / 35+ tests 全绿

| 测试套件 | 覆盖内容 | 预期测试数 |
|---------|---------|-----------|
| vesting.test.ts | 归属计算引擎（累计进位法）| 5+ |
| state-machine.test.ts | Grant/VestingRecord 状态流转 | 22+ |
| settlement.test.ts | FIFO 分配 | 7+ |

---

## 附录：权限矩阵完整测试清单

基于 PRD 7.2，以下每一行都应验证（✅=允许，❌=拒绝）：

| API 端点 | 超管 | 授予管理员 | 审批管理员 | 员工 |
|---------|------|-----------|-----------|------|
| POST /api/plans（创建计划） | ✅ 201 | ✅ 201 | ❌ 403 | ❌ 403 |
| PATCH /api/plans/[id] approve | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| POST /api/employees（添加员工） | ✅ 201 | ✅ 201 | ✅ 201 | ❌ 403 |
| PUT /api/employees/[id]（编辑） | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 403 |
| POST /api/entities（添加主体） | ✅ 201 | ✅ 201 | ✅ 201 | ❌ 403 |
| POST /api/valuations（添加估值） | ✅ 201 | ✅ 201 | ✅ 201 | ❌ 403 |
| POST /api/grants（创建授予） | ✅ 201 | ✅ 201 | ❌ 403 | ❌ 403 |
| PATCH /api/grants/[id] → Granted | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| PATCH /api/grants/[id] → Closed | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| PATCH /api/operations/[id] approve | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| PUT /api/employees/[id] → 离职 | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| PATCH /api/tax-events/[id] confirm | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| GET /api/tax-events/export | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 403 |
| GET /api/assets | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 403 |
| GET /api/user-management | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 |
| POST /api/operations（提交申请） | ✅ 201 | ✅ 201 | ✅ 201 | ✅ 201 |
| POST /api/tax-events/[id]/upload | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 |
