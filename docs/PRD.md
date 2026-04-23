# 股权激励管理系统 PRD v4

> **文档版本**: v4
> **最后更新**: 2026-04-20
> **状态**: Draft

---

## 1. 项目概述

### 1.1 一句话描述

一个面向公司内部的股权激励管理平台，支持管理员创建和管理 RSU / Option 两种激励计划，追踪归属进度，处理行权与 post-settlement 操作申请，并自动生成税务事件原始数据供财务和审计使用。

### 1.2 核心目标

- **管理端**: 让授予管理员高效创建激励计划和授予，审批管理员审核通过，全局掌控归属和行权状态
- **员工端**: 让员工清晰了解自己的股权状况和归属进度，在线发起行权/转让/售出/回购/兑现申请，上传缴款凭证
- **合规**: 所有授予、归属、行权、状态变更操作留有完整审计日志（Audit Trail）
- **税务数据归集**: 自动生成税务事件原始数据，支持导出给财务和审计

### 1.3 用户角色

| 角色 | 定位 | 核心权限 |
|------|-----|---------|
| **超级管理员** | 系统所有者 | 一切权限 + 系统设置 + 用户管理 |
| **授予管理员** (Grant Admin) | 制单方 | 创建/编辑计划、创建授予 |
| **审批管理员** (Approval Admin) | 复核方 | 审批计划、审批行权/post-settlement 申请、推进授予状态、确认税务事件 |
| **普通员工** | 被激励对象 | 查看自己的股权、提交行权/转让/售出/回购/兑现申请、上传缴款凭证 |

> 注：授予管理员和审批管理员的权限分离遵循「Maker-Checker」原则，防止同一人既创建又审批。税务确认权限同样限制为审批管理员和超级管理员，授予管理员不可确认税务事件。
> 注：所有管理员（超级管理员、授予管理员、审批管理员）均可添加员工、持股主体、估值记录。
> 注：权限矩阵后续可调整，集中在此管理。

---

## 2. 技术栈（待最终确定）

### 2.1 推荐方案

```
前端:        Next.js 14+ (App Router) + TypeScript + Tailwind CSS
UI 组件:     shadcn/ui
后端:        Next.js API Routes (Route Handlers)
数据库:      PostgreSQL (通过 Prisma ORM)
文件存储:    本地文件系统（MVP）/ AWS S3 或兼容对象存储（生产环境）
认证:        NextAuth.js (支持邮箱密码 + 企业 SSO 预留)
状态管理:    Zustand 或 React Query
图表:        Recharts
部署:        Vercel / Docker 自部署均可
版本控制:    GitHub Private Repository
```

### 2.2 版本控制说明

- 代码托管于 GitHub 私有仓库，上线后可继续使用
- 敏感信息（数据库密码、API 密钥、NextAuth Secret 等）通过 `.env` 文件管理，在 `.gitignore` 中排除
- 仓库中保留 `.env.example` 作为环境变量模板

### 2.3 项目结构

```
equity-platform/
├── prisma/
│   ├── schema.prisma          # 数据模型定义
│   └── seed.ts                # 种子数据（含初始超级管理员账号）
├── src/
│   ├── app/
│   │   ├── (auth)/            # 认证相关页面
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── change-password/ # 首次登录强制改密码
│   │   ├── (admin)/           # 管理端页面
│   │   │   ├── dashboard/
│   │   │   ├── plans/         # 激励计划池
│   │   │   ├── employees/     # 员工档案
│   │   │   ├── entities/      # 持股主体库
│   │   │   ├── valuations/    # 估值管理
│   │   │   ├── grants/        # 授予管理
│   │   │   ├── tax-events/    # 税务事件单
│   │   │   ├── assets/        # 资产管理
│   │   │   └── user-management/ # 用户管理（仅超级管理员）
│   │   ├── (employee)/        # 员工端页面
│   │   │   ├── overview/      # 个人信息 + 资产汇总
│   │   │   ├── grants/        # 授予记录
│   │   │   ├── vesting/       # 归属详情
│   │   │   ├── requests/      # 申请记录
│   │   │   └── tax-records/   # 税务记录
│   │   ├── api/               # API Route Handlers
│   │   │   ├── auth/
│   │   │   ├── plans/
│   │   │   ├── employees/
│   │   │   ├── entities/
│   │   │   ├── valuations/
│   │   │   ├── grants/
│   │   │   ├── vesting/
│   │   │   ├── operations/     # 行权 & post-settlement 申请
│   │   │   ├── tax-events/
│   │   │   ├── assets/
│   │   │   └── user-management/ # 用户管理 API
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                # shadcn/ui 基础组件
│   │   ├── admin/             # 管理端专用组件
│   │   ├── employee/          # 员工端专用组件
│   │   └── shared/            # 共享组件
│   ├── lib/
│   │   ├── prisma.ts          # Prisma 客户端
│   │   ├── auth.ts            # NextAuth 配置
│   │   ├── vesting.ts         # Vesting 计算引擎
│   │   ├── state-machine.ts   # Grant & VestingRecord 状态机
│   │   ├── settlement.ts      # 交割/行权分配引擎（FIFO）
│   │   ├── permissions.ts     # 权限控制
│   │   └── audit.ts           # 审计日志工具
│   └── types/
│       └── index.ts           # TypeScript 类型定义
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 3. 统一状态机设计

> 这是整个系统的核心。Grant 状态与归属记录（VestingRecord）状态使用**统一语言**，Grant 状态由归属记录状态聚合得出。

### 3.1 归属记录（VestingRecord）状态

每条归属记录只负责记录自身的归属与交割进度。**不跟踪后续的 post-settlement 操作（转让/售出/回购/兑现）**——那些操作会影响 Grant 层的可操作股数/期权字段，但不影响归属记录本身。

**RSU 归属记录状态流转：**
```
Pending（待归属）→ Vested（已归属）→ Settled（已交割）
```

**Option 归属记录状态流转：**
```
Pending（待归属）→ Vested（已归属）→ Partially Settled（部分行权）→ Settled（已全部行权）
```

> Option 可以从 Vested 直接跳到 Settled（员工一次性行权全部），也可以经过 Partially Settled（员工分多次行权）。

| 状态 | 含义 |
|-----|------|
| **Pending** | 还未到归属日期，股权尚未生效 |
| **Vested** | 已到归属日期，股权已归属，但尚未发生行权/交割 |
| **Partially Settled** | 仅 Option 适用。该笔归属的部分期权已行权并交割，但还有剩余未行权期权。Partially Settled 意味着 `exercisableOptions > 0` |
| **Settled** | RSU：该笔归属已完成税务确认和交割`<br>`Option：该笔归属的所有期权已行权并完成交割。Settled 意味着 `exercisableOptions == 0` |
| **Closed** | 仅在 Grant 被关闭时，所有 Pending 状态的归属记录自动变为 Closed。已经 Vested / Partially Settled / Settled 的记录不受影响。**不可由单条归属记录自行触发 Closed。** |

**关键说明：** 归属记录一旦到达 Settled 状态，它就"完成使命"了。员工之后对这些股份/期权做任何 post-settlement 操作（售出/转让/回购/兑现），归属记录的状态都不再变化。

### 3.2 Grant 状态

Grant 状态由所有归属记录的状态**聚合判断**：

```
Draft → Granted → Vesting → Fully Vested → Still Exercisable → All Settled
                                                （仅 Option）
任意阶段 → Closing（仅 Option 且 operableOptions > 0）→ Closed
任意阶段 → Closed（RSU，或 Option 且 operableOptions == 0）
```

| Grant 状态 | 含义 | 聚合规则 |
|------------|-----|---------|
| **Draft** | 创建未生效 | 未生成归属记录 |
| **Granted** | 协议签署生效 | 归属记录已生成，全部为 Pending（手动从 Draft 变更而来） |
| **Vesting** | 归属进行中 | 至少一条归属记录为 Vested 或已交割，但仍有 Pending 的归属记录 |
| **Fully Vested** | 已全部归属 | 所有归属记录都至少为 Vested 或更高状态（无 Pending）。**注意：对 RSU 而言，Fully Vested 表示所有归属已完成，但可能仍有待交割的记录（Vested 但尚未 Settled）。** |
| **Still Exercisable** | 可行权中（仅 Option） | 在 Fully Vested 基础上，还有未 Settled 的归属记录 |
| **All Settled** | 已全部交割 | 所有归属记录状态均为 Settled （且无 Pending、Vested、Partially Settled 记录） |
| **Closing** | 关闭中（仅 Option） | 管理员触发关闭，但仍有未行权期权（operableOptions > 0），员工在行权窗口期内可继续行权。所有 Pending 归属记录已自动变为 Closed，不再产生新归属 |
| **Closed** | 已关闭 | 管理员手动触发（取消/离职回购/过期作废），所有 Pending 归属记录自动变为 Closed。**Grant 状态为 Closed 时，如 `operableShares > 0`，员工仍可对该 Grant 的已交割实股发起 post-settlement 申请，申请流程与正常状态一致。** |

**具体表现：**

- **RSU 的 All Settled**：所有归属都已完成税务确认和交割
- **Option 的 All Settled**：所有归属都在 Vested 后被员工行权，且都完成税务确认和交割

### 3.3 状态触发规则

| 状态变更 | 触发方式 | 触发条件 | 操作者 |
|---------|---------|--------|--------|
| Grant: Draft → Granted | 手动  审批管理员填入协议ID（必填，如创建时未填则此时必须补填），点击「状态变更」 | 审批管理员 |
| Grant: Granted → Vesting | 自动 | 到达授予计划开始日期 + 悬崖期，首笔归属记录 Pending → Vested | 系统定时任务 |
| Grant: Vesting → Fully Vested | 自动 | 所有归属记录都变为 Vested 或更高状态（无 Pending） | 系统 |
| Grant: Fully Vested → Still Exercisable | 自动 | 仅 Option。达到 Fully Vested 后，只要还有未 Settled 的归属记录（Vested 或 Partially Settled） | 系统 |
| Grant: Fully Vested / Still Exercisable → All Settled | 自动 | 所有归属记录都变为 Settled | 系统 |
| Grant: 任意 → Closing（仅 Option） | 手动 | 管理员触发关闭，且 operableOptions > 0。管理员填写关闭原因和行权窗口期（0/30/90/365天）。所有 Pending 归属记录自动变为 Closed | 管理员 |
| Grant: Closing → Closed | 自动 | 窗口期到期（到期日当天 23:59:59 前仍可行权，次日 00:00 定时任务执行清零），或窗口期内员工行权使 operableOptions 降为 0。到期时系统自动将 operableOptions 清零，所有 Vested / Partially Settled 归属记录 → Closed，Grant → Closed，未行权期权额度释放回计划池 | 系统定时任务 |
| Grant: 任意 → Closed | 手动 | RSU Grant 管理员触发关闭，或 Option Grant 管理员触发关闭且 operableOptions == 0。管理员填写关闭原因。所有 Pending 归属记录自动变为 Closed | 管理员 |
| VestingRecord: Pending → Vested（RSU） | 自动 | 到达归属日期 | 系统定时任务 |
| VestingRecord: Pending → Vested（Option） | 自动 | 到达归属日期。触发时需要初始化 exercisableOptions = quantity | 系统定时任务 |
| VestingRecord: Vested → Settled（RSU） | 自动 | RSU 该笔归属的税务事件「已确定」 | 系统 |
| VestingRecord: Vested → Partially Settled（Option） | 自动 | 针对该笔归属的某次行权，其行权税务事件状态变为「已确定」，且 FIFO 消耗后 `exercisableOptions > 0` | 系统 |
| VestingRecord: Partially Settled → Settled（Option） | 自动 | 针对该笔归属的后续行权，其行权税务事件状态变为「已确定」，且 FIFO 消耗后 `exercisableOptions == 0` | 系统 |
| VestingRecord: Vested → Settled（Option）| 自动 | 针对该笔归属的某次行权，其行权税务事件状态变为「已确定」，且 FIFO 消耗后 `exercisableOptions == 0` | 系统 |
| VestingRecord: Pending → Closed | 自动 | Grant 被 Closed 时自动触发（仅 Pending 状态的记录） | 系统（跟随 Grant） |

> **关于 All Settled 的说明**：All Settled 虽然标记为"自动触发"，但其前置条件（该 Grant 下所有税务事件状态都变为「已确定」）需要管理员在税务事件单页面逐一手动确认。管理员的实际工作位置在税务事件单页面，一旦最后一笔税务事件被确认，系统即自动聚合并推进 Grant 到 All Settled。
> **归属记录状态推进的统一原则**：归属记录从 Vested 变为 Partially Settled 或 Settled，必须以对应的税务事件状态「已确定」为前置条件。税务确认是所有交割类状态变更的唯一触发源。

### 3.4 Grant 的可操作股数 / 可操作期权字段

> 归属记录不跟踪交割后的操作变化，这些信息维护在 Grant 层的两个字段上：

**Grant 新增两个字段：**

- `operableShares`（可操作股数）：员工当前持有、可发起 post-settlement 操作的实股数量
- `operableOptions`（可操作期权）：员工当前持有、可发起行权或 post-settlement 操作的期权数量

**初始值：** 创建授予时均为 0。

**变化规则：**

**RSU：**

- 归属变为 Settled（税务确认完成） → `operableShares += 该笔归属数量`
- 员工 post-settlement 操作（售出/转让/回购/兑现）被批准且税务确认后 → `operableShares -= 操作数量`
- `operableOptions` 始终为 0

**Option：**

- 归属变为 Vested → `operableOptions += 该笔归属数量`
- 员工行权被批准且税务确认后 → `operableOptions -= 行权数量`, `operableShares += 行权数量`
- 员工对期权的 post-settlement 操作（转让/回购/兑现）被批准且税务确认后 → `operableOptions -= 操作数量`
- 员工对实股的 post-settlement 操作（售出/转让/回购/兑现）被批准且税务确认后 → `operableShares -= 操作数量`
- Grant 进入 Closing 状态 → operableOptions 保持不变，员工在窗口期内可继续行权
- 行权窗口期到期 → operableOptions 清零
- **Grant 进入 Closed 状态 → operableShares 保持不变，员工仍可对已交割实股发起 post-settlement 操作**

### 3.5 可操作字段变化示例

**场景：1年归属期；半年悬崖期；按月归属；总归属数量 1200**

**RSU 示例：**

| 时间      | 事件                                   | operableShares | operableOptions |
| --------- | -------------------------------------- | -------------- | --------------- |
| 初始      | 创建授予                               | 0              | 0（RSU 恒为 0） |
| 第6个月   | RSU 归属 600，员工缴税后管理员确认交割 | 600            | 0               |
| 第7个月   | RSU 归属 100，员工缴税后管理员确认交割 | 700            | 0               |
| 第8个月   | RSU 归属 100，员工缴税后管理员确认交割 | 800            | 0               |
| 第8个月末 | 员工申请售出 200，税务确认后           | 600            | 0               |

**Option 示例：**

| 时间      | 事件                                           | operableShares | operableOptions |
| --------- | ---------------------------------------------- | -------------- | --------------- |
| 初始      | 创建授予                                       | 0              | 0               |
| 第6个月   | Option 归属 600 份                             | 0              | 600             |
| 第7个月   | Option 归属 100 份                             | 0              | 700             |
| 第8个月   | Option 归属 100 份                             | 0              | 800             |
| 第8个月末 | 员工申请行权 200 份，税务确认后                | 200            | 600             |
| 后续      | 员工申请售出 100（针对已行权实股），税务确认后 | 100            | 600             |

### 3.6 Post-Settlement 操作规则

员工发起申请时，根据股权类型和操作目标展示不同的选项：

**RSU 的操作选项（针对已交割实股）：**

- 售出 / 转让 / 回购 / 兑现
- 消耗 `operableShares`

**Option 的操作选项（分两种目标）：**

*针对已归属未行权的期权：*

- 行权 / 转让 / 回购 / 兑现（没有"售出"——期权不能直接卖）
- 消耗 `operableOptions`

*针对已行权已交割的实股：*

- 售出 / 转让 / 回购 / 兑现
- 消耗 `operableShares`

### 3.7 税务事件与状态更新流程

**所有交割类状态变更，都以对应的税务事件状态「已确定」为前置条件。以下按触发场景分别说明：**

**RSU 归属交割流程：**

1. 系统定时任务检测到归属记录到期 → Pending → Vested
2. 系统自动生成税务事件（归属税务，状态：待缴款）
3. 员工上传缴款凭证（状态：已上传凭证）
4. 管理员确认（状态：已确定）
5. 系统按 3.4 规则更新 Grant 字段，推进归属记录和 Grant 状态

**Option 行权流程：**

1. 员工提交行权申请
2. 管理员审批通过
3. 系统自动生成税务事件（行权税务，状态：待缴款）
4. 员工上传缴款凭证（状态：已上传凭证）
5. 管理员确认（状态：已确定）
6. 系统按 3.4 规则更新 Grant 字段，按 FIFO（见 3.8）消耗归属记录，推进状态

**Post-settlement 操作流程（RSU 和 Option 通用）：**

1. 员工提交申请（售出/转让/回购/兑现）
2. 管理员审批通过
3. 系统自动生成税务事件（post-settlement 税务，状态：待缴款）
4. 员工上传缴款凭证（状态：已上传凭证）
5. 管理员确认（状态：已确定）
6. 系统按 3.4 规则更新 Grant 字段

### 3.8 行权分配逻辑（FIFO）

当员工对 Option 发起行权时，按 **FIFO（先进先出）** 原则消耗归属记录：

**示例（Option，1200 份，6月 cliff，按月归属，1年归属期）：**

| 归属记录 | 归属日期 | 归属数量 | 可行权期权 | 状态    |
| -------- | -------- | -------- | ---------- | ------- |
| 记录1    | 第6个月  | 600      | 0          | Pending |
| 记录2    | 第7个月  | 100      | 0          | Pending |
| 记录3    | 第8个月  | 100      | 0          | Pending |
| ...      | ...      | ...      | ...        | ...     |
| 记录7    | 第12个月 | 100      | 0          | Pending |

**场景1：第7个月底，员工行权 500 份（记录1 和 2 都已 Vested）**

FIFO 分配：从记录1 消耗 500 份

| 归属记录 | 归属日期 | 归属数量 | 可行权期权 | 状态              |
| -------- | -------- | -------- | ---------- | ----------------- |
| 记录1    | 第6个月  | 600      | 100        | Partially Settled |
| 记录2    | 第7个月  | 100      | 100        | Vested            |
| 记录3    | 第8个月  | 100      | 0          | Pending           |
| ...      | ...      | ...      | ...        | ...               |

→ Grant 状态：Vesting（仍有 Pending 归属记录）

> 注：此时 Grant 状态不是 Still Exercisable，因为还有 Pending 的归属记录未 Vested。Still Exercisable 的前提是所有归属都已脱离 Pending。

**第12个月底，所有记录已 Vested，员工行权 550 份期权**

FIFO 分配：记录1 消耗剩余 100 份（之前已行权500），记录2 消耗 100，记录3 消耗 100，记录4 消耗 100，记录5 消耗 100，记录6 消耗 50

| 归属记录 | 归属日期 | 归属数量 | 可行权期权 | 状态                              |
| -------- | -------- | -------- | ---------- | --------------------------------- |
| 记录1    | 第6个月  | 600      | 0          | Settled                           |
| 记录2    | 第7个月  | 100      | 0          | Settled                           |
| 记录3    | 第8个月  | 100      | 0          | Settled                           |
| 记录4    | 第9个月  | 100      | 0          | Settled                           |
| 记录5    | 第10个月 | 100      | 0          | Settled                           |
| 记录6    | 第11个月 | 100      | 50         | Partially Settled (已行权 50/100) |
| 记录7    | 第12个月 | 100      | 100        | Vested                            |

→ Grant 状态：Still Exercisable（所有归属已脱离 Pending，但记录6 尚未完全行权）, 记录7 尚未行权

期权的 post-settlement 操作（转让/回购/兑现）同样按 FIFO 顺序消耗 VestingRecord 的 exercisableOptions，并按相同规则更新 VestingRecord 状态（Vested→Partially Settled→Settled）

### 3.9 状态变更日志

**Grant 的每次状态变更必须生成一条不可修改的 log**，包含：

- 更改前状态
- 更改后状态
- 时间戳（数据库存储 UTC，展示时转换为 UTC+8）
- 操作者（管理员姓名 / 「系统自动触发」）
- 法律/财务依据文件（如有）

---

## 4. 管理端页面详细需求

管理端共 9 个页面：1 个仪表盘 + 7 个业务页面 + 1 个用户管理页面（仅超级管理员可见）。

### 4.0 仪表盘（Dashboard）

> 管理员登录后的默认首页，提供系统概览和快捷入口。

#### 页面布局

**① 数据概览板块**：四张数字卡片，每张可点击跳转对应页面。

| 卡片     | 主数字       | 副数字                       | 点击跳转       |
| -------- | ------------ | ---------------------------- | -------------- |
| 员工     | 在册员工总数 | 其中活跃（在职）数           | 员工档案页面   |
| 激励计划 | 计划总数     | 其中进行中（已通过）数       | 激励计划池页面 |
| 授予     | 授予总数     | 其中待处理（有待审批申请）数 | 授予管理页面   |
| 税务事件 | 税务事件总数 | 其中待确认（已上传凭证）数   | 税务事件单页面 |

**② 快捷操作板块**：三个快捷按钮，点击直接跳转到对应的创建/添加页面。

- 「+ 创建计划」→ 激励计划池创建页面
- 「+ 添加员工」→ 员工档案添加页面
- 「+ 创建授予」→ 授予管理创建页面

---

### 4.1 激励计划池（Plan）

#### 页面布局

- 顶部：「创建计划」按钮
- 搜索/筛选栏：按计划标题或计划ID搜索；按股权类型下拉筛选（全部 / RSU / Option）
- 主体：计划列表表格

#### 创建计划 — 字段

> 以下为该实体的完整字段。标注为「自动」的字段不在创建表单中展示，仅在创建后的列表和详情页中显示。

| #  | 字段名           | 必填 | 类型       | 说明                 |
| -- | ---------------- | ---- | ---------- | -------------------- |
| 1  | 计划ID           | 自动 | 文本       | 唯一标识             |
| 2  | 计划标题         | 必填 | 文本输入   |                      |
| 3  | 激励类型         | 必选 | 下拉单选   | RSU / Option         |
| 4  | 适用法域         | 必选 | 点击选择   | 内地 / 香港 / 海外   |
| 5  | 交割方式         | 联动 | 见下方规则 | 根据股权类型动态展示 |
| 6  | 激励池规模       | 必填 | 数字       | 总授予额度（数量）   |
| 7  | 生效日期         | 必填 | 日期选择   | 默认创建当日，可更改 |
| 8  | 董事会决议文件ID | 选填 | 文本输入   |                      |
| 9  | 状态             | 自动 | 系统管理   | 创建后默认「审批中」 |
| 10 | 备注             | 选填 | 文本输入   |                      |

**交割方式联动规则：**

- RSU → 必选，多选：实股 / LP份额 / 境外SPV股份
- Option → 固定文案展示：「购买实股的权利」（不可编辑）

#### 列表展示

| 计划标题 | 激励类型 | 适用法域 | 激励池规模 | 已授予数量 | 剩余额度 | 状态 | 操作 |
| -------- | -------- | -------- | ---------- | ---------- | -------- | ---- | ---- |

**已授予数量计算规则：**

```
已授予数量 = Σ (非 Closed 状态 Grant 的 totalQuantity)
           + Σ (Closed 状态 Grant 中已消耗的数量)
```

其中"已消耗的数量"按类型计算：

- **RSU Closed Grant**：已消耗 = 该 Grant 下状态为 Vested 或 Settled 的归属记录的 quantity 之和（这些实股已交付给员工，不可回收）
- **Option Closed Grant**：已消耗 = 该 Grant 下状态为 Settled 的归属记录的 quantity 之和（仅已行权并完成交割的部分不可回收；未行权的 Vested / Partially Settled 期权在关闭时回到计划池）
- RSU 一旦归属（Vested）或Option 一旦行权交割完毕，员工即具有法律上的股权权益，公司无法单方面收回，因此该部分额度视为已消耗，不得再授予他人

**剩余额度** = 激励池规模 - 已授予数量

#### 状态流转

```
创建成功 → [审批中] → 审批管理员通过 → [已通过]
```

- 状态只有两个：审批中、已通过
- 不设驳回操作
- 审批通过后状态不可再变更

#### 操作逻辑

- **授予管理员**创建计划
- 授予管理员点「查看」→ 可「编辑」或「返回列表」（仅「审批中」状态可编辑）
- 审批管理员点「查看」→ 可「审批通过」或「返回列表」
- **只有「已通过」状态的计划才能在授予管理中被引用**

---

### 4.2 员工档案（User）

#### 页面布局

- 顶部：「添加员工」按钮
- 搜索/筛选栏：按员工姓名或员工ID搜索；按雇佣状态下拉筛选（全部 / 在职 / 离职）
- 主体：员工列表表格

#### 添加员工 — 字段

> 以下为该实体的完整字段。标注为「自动」的字段不在创建表单中展示，仅在创建后的列表和详情页中显示。

| # | 字段名     | 必填 | 类型            | 说明                                                                                                                                 |
| - | ---------- | ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | 员工姓名   | 必填 | 文本输入        |                                                                                                                                      |
| 2 | 员工ID     | 必填 | 文本输入        | 唯一标识                                                                                                                             |
| 3 | 部门       | 选填 | 文本输入        |                                                                                                                                      |
| 4 | 法律身份   | 必选 | 下拉单选        | 内地 / 香港 / 海外                                                                                                                   |
| 5 | 邮箱       | 必填 | 文本输入        | 企业邮箱，同时作为员工端登录账号                                                                                                     |
| 6 | 用工主体   | 选填 | 下拉多选 + 新增 | 关联独立的用工主体表（EmployerEntity），下拉框列出已有的用工主体，可点击「+ 新增」添加新用工主体并保存。新增的用工主体对所有员工可见 |
| 7 | 税务居住地 | 必选 | 下拉单选        | 内地 / 香港 / 海外                                                                                                                   |
| 8 | 授予数     | 自动 | 数字            | 该员工所有授予记录的数量，默认0                                                                                                      |
| 9 | 雇佣状态   | 自动 | 系统管理        | 创建时默认「在职」，审批管理员/超级管理员可修改为「离职」                                                                            |

> 管理员创建员工时，系统自动生成初始密码（由管理员发送给员工登录）。员工首次登录后必须强制修改密码。管理员可在用户管理页面（见 4.9）重置员工密码。

**用工主体表（EmployerEntity）：** 独立存储，包含用工主体名称。在添加或编辑员工时可新增用工主体，新增后所有员工（包括已有员工编辑时）都能看到并选择。
**用工主体不可删除：如有任何员工关联了该用工主体，系统将提示「该用工主体已被使用，无法删除」。如需废弃，须先将所有关联员工的用工主体修改后再删除。**

#### 列表展示

| 员工姓名 | 员工ID | 部门 | 法律身份 | 授予数 | 状态 | 操作 |
| -------- | ------ | ---- | -------- | ------ | ---- | ---- |

- 授予数 = Granted 及之后状态的授予数量

#### 操作逻辑

- **所有管理员**可添加员工
- 点「查看」→ 可「编辑」所有信息或「返回列表」
- 「查看」页面额外显示**授予记录**板块：列出该员工所有授予记录（只做展示，不可在此创建或编辑授予）
- 管理员将员工状态设为「离职」时：
  - 所有"待审批"状态的申请（OperationRequest）自动作废，状态变为「已关闭」
  - 已批准但税务事件尚未「已确定」的，需管理员手动决定是否继续流程还是取消
  - 系统自动关闭该员工所有符合条件的授予：
    - RSU：所有非 All Settled 的 Grant → Closed
    - Option：所有非 All Settled 的 Grant → 根据 operableOptions 判断进入 Closing 或 Closed
- 管理员在设置离职时统一填写关闭原因和行权窗口期（0/30/90/365天），自动附到所有被关闭的 Grant 上。如有特殊情况，管理员可在窗口期到期前进入单条 Grant 详情修改行权窗口期
- 离职员工账号仍保持可登录状态，直至所有持有 operableShares 的 Grant 处理完毕（All Settled 或 operableShares 归零）

---

### 4.3 持股主体库（HoldingEntity）

#### 页面布局

- 顶部：「添加持股主体」按钮
- 搜索/筛选栏：按代持主体名称或ID搜索；按状态下拉筛选（全部 / 启用 / 停用）
- 主体：持股主体列表表格

#### 添加持股主体 — 字段

> 以下为该实体的完整字段。标注为「自动」的字段不在创建表单中展示，仅在创建后的列表和详情页中显示。

| #  | 字段名          | 必填 | 类型     | 说明                                   |
| -- | --------------- | ---- | -------- | -------------------------------------- |
| 1  | 代持主体        | 必填 | 文本输入 | 代持主体名称                           |
| 2  | 代持主体ID      | 必填 | 文本输入 | 唯一标识                               |
| 3  | 持股主体类型    | 必选 | 下拉单选 | 有限合伙 / 境内子公司 / 境外SPV / 其他 |
| 4  | 主体代码编号    | 必填 | 文本输入 | 统一社会信用代码/境外注册编号等        |
| 5  | 注册地址        | 选填 | 文本输入 |                                        |
| 6  | 成立时间        | 选填 | 日期选择 | 成立/注册时间                          |
| 7  | 法人代表/负责人 | 选填 | 文本输入 |                                        |
| 8  | LP份额账户      | 选填 | 文本输入 |                                        |
| 9  | 税务属地        | 必选 | 下拉单选 | 内地 / 香港 / 海外                     |
| 10 | 状态            | 自动 | 系统管理 | 创建时默认「启用」，可修改为「停用」   |
| 11 | 备注            | 选填 | 文本输入 |                                        |

#### 列表展示

| 代持主体ID | 代持主体 | 持股主体类型 | 税务属地 | 状态 | 操作 |
| ---------- | -------- | ------------ | -------- | ---- | ---- |

#### 操作逻辑

- **所有管理员**可添加持股主体
- 点「查看」→ 可「编辑」或「返回列表」
- **只有「启用」状态的持股主体才能在授予管理中被引用**

---

### 4.4 估值管理（Valuation）

#### 页面布局

- 顶部：「添加估值记录」按钮
- 无搜索/筛选
- 主体：估值记录列表表格

#### 添加估值记录 — 字段

> 以下为该实体的完整字段。标注为「自动」的字段不在创建表单中展示，仅在创建后的列表和详情页中显示。

| # | 字段名       | 必填 | 类型     | 说明                         |
| - | ------------ | ---- | -------- | ---------------------------- |
| 1 | 估值日期     | 必填 | 日期选择 | 默认创建当日，可更改         |
| 2 | FMV 公允价值 | 必填 | 数字     | 单位：港币（HKD）            |
| 3 | 估值来源     | 选填 | 文本输入 | 如第三方评估机构、内部评估等 |
| 4 | 描述         | 选填 | 文本输入 | 估值相关说明                 |
| 5 | 创建时间     | 自动 | 时间戳   | 系统自动记录，与估值日期区分 |

#### 列表展示

| 估值日期 | FMV（港币） | 估值来源 | 操作 |
| -------- | ----------- | -------- | ---- |

#### 操作逻辑

- **所有管理员**可添加估值记录
- 点「查看」→ 可「删除」或「返回列表」
- **估值记录不可编辑，如需修正请新增一条记录**
- **删除约束：如该估值记录已被任何税务事件引用（作为触发日 FMV 来源），系统提示「该估值记录已被引用，无法删除」。仅未被引用的记录可删除。**

#### FMV 引用规则

- 系统在需要引用 FMV 时（税务事件生成、资产管理市值计算），取估值管理中**日期最接近且不晚于触发日**的那条估值记录。税务事件详情中显示「FMV 来源：YYYY-MM-DD 估值记录」，方便管理员核实。
- 如果触发日之前没有任何估值记录，系统不生成税务事件，并在管理端提示**有归属到期但缺少估值记录，请先录入估值**。管理员录入估值后，下一次定时任务自动补生成对应的税务事件。

---

### 4.5 授予管理（Grant + 状态机）

> 系统最核心的页面。

#### 页面布局

- 顶部：「创建授予」按钮
- **待审批提醒区**：如果有员工新提交的申请（行权/转让/售出/回购/兑现），在列表最上方高亮显示对应的授予记录，提醒管理员点击查看并审批。待审批提醒区最多显示 5 条，超出时按「下一页」显示后面的授予信息。
- 搜索/筛选栏：按计划标题/计划ID/员工姓名搜索；按状态下拉筛选（全部 / 草稿 Draft / 已授予 Granted / 归属中 Vesting / 全部归属 Fully Vested / 仍可行权 Still Exercisable / 全部交割 All Settled / 关闭中 Closing / 关闭 Closed）
- 主体：授予列表表格

#### 创建授予 — 字段

> 以下为该实体的完整字段。标注为「自动」的字段不在创建表单中展示，仅在创建后的列表和详情页中显示。

**【基本信息】**

| # | 字段名       | 必填 | 类型        | 说明 |
| - | ---------- | ---- | ----------- | ---- |
| 1 | 权利ID      | 自动 | 文本        | 唯一标识 |
| 2 | 计划标题     | 必填 | 下拉框+搜索 | 关联 Plan（按名字或ID搜索），**仅显示「已通过」的计划** |
| 3 | 员工姓名     | 必填 | 下拉框+搜索 | 关联员工（按名字或ID搜索），**仅显示「在职」的员工**    |
| 4 | 持股实体     | 选填 | 下拉框+搜索 | 关联持股主体，**仅显示「启用」的主体**                  |
| 5 | 授予日期     | 必填 | 日期选择    | 默认创建当日，可更改 |
| 6 | 授予计划开始日期 | 选填 | 日期选择    | 无则等于授予日期  |
| 7 | 状态         | 自动 | 系统管理    | 创建后默认 Draft |

**【授予详情】**

| # | 字段名         | 必填     | 类型    | 说明 |
| - | ------------- | ------- | ------- | ---- |
| 8  | 授予数量      | 必填     | 数字     | 数量 |
| 9  | 行权价        | 条件必填  | 数字    | RSU 固定为 0；Option 必填，单位 HKD |
| 10 | 员工签署协议ID | 选填     | 文本输入 | 创建时选填（草稿阶段可暂不填写），但 Draft → Granted 时变为必填。如创建时未填，状态变更时必须补填。 |

**【归属计划】**

| #  | 字段名   | 必填 | 类型     | 说明                               |
| -- | -------- | ---- | -------- | ---------------------------------- |
| 11 | 归属年限 | 必填 | 下拉单选 | 1/2/3/4/5年（可添加自定义年限）    |
| 12 | 悬崖期   | 必填 | 下拉单选 | 0/6/12/18/24月（可添加自定义月限） |
| 13 | 归属频率 | 必选 | 下拉单选 | 按月 / 按年                        |

#### 列表展示

| 员工名字 | 计划标题 | 激励类型 | 授予数量 | 行权价 | 授予日期 | 可操作股数 | 可操作期权 | 状态 | 操作 |
| ------- | ------- | ------ | ------- | ----- | ------ | --------- | -------- | ---- | ---- |

- **可操作股数**：Grant 的 `operableShares` 字段
- **可操作期权**：Grant 的 `operableOptions` 字段（RSU 显示「-」）
- **状态**：Draft / Granted / Vesting / Fully Vested / Still Exercisable（仅 Option）/ All Settled / Closing / Closed

#### 详情页（点击「查看」后）

五个板块：

**① 授予信息**：
展示所有基本信息和授予详情字段，以及当前的 `operableShares` 和 `operableOptions`

- 当状态为 Closing 时，额外显示行权窗口截止日和剩余天数

**② 归属计划**：
Grant 状态变为 Granted 后，系统自动生成所有归属记录。每条记录展示：

| 归属日期 | 归属数量 | 可行权期权数 | 状态 |
| -------- | ----- | ---------- | ---- |

- 归属数量计算采用**累计进位法**策略，确保所有归属记录数量之和恰好等于 totalQuantity

**归属记录状态：**

- RSU：Pending / Vested / Settled / Closed
- Option：Pending / Vested / Partially Settled / Settled / Closed

> 归属计算示例（悬崖期6个月，归属年限1年，按月归属，授予1200）：
>
> - 第6个月：600（悬崖期一次性归属）
> - 第7个月：100
> - 第8个月：100
> - ……
> - 第12个月：100（最后一期补齐余数）
> - 共7条归属记录

> 注：归属记录本身不跟踪 post-settlement 操作（转让/售出/回购/兑现）。这些变化体现在 Grant 层的 `operableShares` / `operableOptions` 字段上。

**③ 税务事件**：该 Grant 下所有自动触发的税务事件记录列表，展示状态（待缴款 / 已上传凭证 / 已确定）

**④ 状态变更日志**：不可修改的完整变更记录

**⑤ 申请记录**（如有待审批申请）：展示员工提交的行权 / 转让 / 售出 / 回购 / 兑现申请详情（含申请目标：实股 / 期权），管理员可在此审批（通过/驳回 + 审批备注）

#### 操作逻辑

- **授予管理员**创建授予，状态默认 Draft
- 创建授予时，系统校验：该计划下已授予数量（见 4.1 计算规则）+ 本次授予数量 ≤ 计划的激励池规模。超出则提示「该计划剩余额度不足，当前剩余 X」，阻止创建。
- Draft 状态下，授予管理元可「编辑」，审批管理员可修改状态到「授予granted」
- 其他状态「查看」只有「返回列表」或修改状态为「关闭」
- 审批管理员在详情页审批员工申请
- **关闭 Grant**：管理员可手动触发，需填写关闭原因。Option 且 `operableOptions > 0 ` 时，还需选择行权窗口期（0/30/90/365天）。管理员可在窗口期到期前修改截止日
- RSU 或 Option `operableOptions == 0` → 直接 Closed
- Option `operableOptions > 0` → 进入 Closing，窗口期到期后系统自动 Closed
- **Closed 状态下**：如 `operableShares > 0`，员工仍可对该 Grant 的已交割实股发起 post-settlement 申请，管理员仍可在详情页审批这些申请

#### 税务事件触发规则

- **RSU 归属**：每次单笔归属（归属记录从 Pending → Vested）自动生成一条税务事件（归属税务）。确认后归属记录变为 Settled，`operableShares` 增加
- **Option 行权**：每次行权申请被批准后自动生成一条税务事件（行权税务）。确认后按 FIFO 消耗归属记录，更新归属记录状态，`operableOptions` 减少，`operableShares` 增加
- **Post-settlement 操作**（售出 / 转让 / 回购 / 兑现）被批准后，自动生成一条税务事件。确认后根据操作目标减少 `operableShares` 或 `operableOptions`

---

### 4.6 税务事件单（TaxEvent）

#### 页面布局

- 无创建按钮（系统自动生成，不可手动创建）
- 搜索/筛选栏：日期范围筛选；按员工搜索；按税务状态下拉筛选（全部 / 待缴款 / 已上传凭证 / 已确定）
- 主体：税务事件列表表格
- 导出按钮：支持按照当前筛选或搜索结果导出 Excel

#### 字段

| #  | 字段名 | 类型 | 说明 |
| -- |-------| ---- | --- |
| 1 | 税务事件编号 | 自动生成 | 唯一标识 |
| 2 | 权利ID | 自动关联 | 关联 Grant |
| 3 | 员工ID | 自动关联   | 关联员工 |
| 4 | 员工姓名 | 自动关联   | 关联员工 |
| 5 | 税务类型 | 自动 | 归属税务（RSU）/ 行权税务（Option）/ 归属后税务（转让/售出/回购/兑现） |
| 6 | 具体操作 | 自动 | 归属 / 行权 / 转让 / 售出 / 回购 / 兑现 |
| 7 | 操作目标 | 自动 | 实股 / 期权（仅 Option post-settlement 区分） |
| 8 | 数量 | 自动 | 本次操作的数量 |
| 9 | 触发日期 | 自动 | 归属/行权/操作发生日期 |
| 10 | 触发日公允价（FMV） | 自动 | 取估值管理中日期最接近且不晚于触发日的估值记录（详见 4.4 FMV 引用规则） |
| 11 | 行权价 | 自动 | 仅 Option 行权时适用，RSU 和 post-settlement 为 0 |
| 12 | 税务状态 | 手动管理 | 待缴款 → 已上传凭证 → 已确定 |
| 13 | 员工上传凭证 | 来自员工端 | 员工上传的缴款凭证文件（支持 JPG/PNG/PDF，单文件不超过 10MB，每条税务事件最多上传 3 个文件，上传后在「已确定」前可替换） |
| 14 | 员工备注 | 来自员工端 | 员工添加的备注信息 |
| 15 | 关联申请ID | 自动关联 | 关联 OperationRequest（归属税务为空，行权税务和归属后税务自动关联对应申请） |

#### 列表展示

| 员工名字 | 税务类型 | 具体操作 | 触发日期 | 数量 | 状态 | 操作 |
| ------- | ------- | ------ | ------- | --- | ---- | --- |

#### 税务状态流转

```
待缴款 → 已上传凭证 → 已确定
```

| 状态 | 触发方式 | 说明 |
| ---- | ------ | ---- |
| **待缴款** | 自动 | 税务事件生成时的默认状态 |
| **已上传凭证** | 员工操作 | 员工在员工端上传缴款凭证后，**管理端税务事件单和员工端税务记录同步更新**为此状态 |
| **已确定** | 管理员操作 | **仅审批管理员和超级管理员**可操作。管理员查看凭证后点击确认，**管理端和员工端同步更新**为此状态。确认后系统自动更新 Grant 的 `operableShares` / `operableOptions`，推进归属记录和 Grant 的状态 |

#### 操作逻辑

- 点「查看」→ 查看所有字段信息，包括员工上传的凭证和备注
- **仅审批管理员和超级管理员**可将状态从「已上传凭证」更改为「已确定」
- 或「返回列表」
- **Grant 下所有税务事件都「已确定」，且所有归属记录都变为 Settled，是 Grant 推进到 All Settled 的前置条件**

#### 导出功能

- 支持导出 Excel
- 导出内容包含所有字段
- 可结合筛选条件导出（如导出某日期范围内的所有待缴款事件）

---

### 4.7 资产管理（Asset Overview）

> 纯展示页面，汇总所有员工当前持股情况。

#### 页面布局

- 顶部信息栏：显示「当前估值：XX HKD」和「估值日期：YYYY-MM-DD」（取估值管理中最新一条记录）
- 搜索/筛选栏：按员工姓名或员工ID搜索；按员工状态下拉筛选（全部 / 在职 / 离职）
- 主体：资产汇总表格
- 导出按钮：支持按照当前筛选或搜索结果导出 Excel

#### 列表展示

| 员工姓名 | 员工ID | 持股实体 | 激励类型 | 可操作股数 | 可操作期权 | 员工状态 |
| ------- | ----- | ------- | ------ | --------- | -------- | ------- |

#### 数据规则

- **每一行 = 员工 + 持股实体 + 股权类型 的组合**
- 同一组合下的多个授予的 `operableShares` 和 `operableOptions` 分别累加
- **可操作股数**：聚合该组合下所有 Grant 的 `operableShares`（已交割且可操作的实股）
- **可操作期权**：
  - RSU 显示「-」
  - Option 聚合该组合下所有 Grant 的 `operableOptions`（已归属未行权的期权）
- **持股当前市值 = 可操作股数 × 最新估值（取估值管理中最新一条 FMV 记录）**
- 员工姓名可点击**跳转到员工资产详情页**

#### 操作逻辑

- **所有管理员**可查看此页面
- 纯展示页面，无创建/编辑操作
- 数据从 Grant 的 `operableShares` / `operableOptions` 字段聚合计算
- **当行权/转让/售出/回购/兑现申请的税务确认完成后，关键操作完成时页面自动刷新以反映最新数据**

#### 员工资产详情页（点击员工姓名后）

顶部：「返回列表」按钮 + 员工基本信息（姓名、员工ID、部门、员工状态）

**① 授予记录**：该员工名下所有授予

| 计划标题 | 激励类型 | 授予数量 | 可操作股数 | 可操作期权 | 授予日期 | 状态 |
| ------- | ------ | ------- | -------- | --------- | ------ | ---- |

**② 归属记录汇总**：该员工所有授予下的所有归属记录

| 计划标题 | 激励类型 | 归属日期 | 归属数量 | 状态 |
| ------- | ------- | ------ | ------- | --- |

> 此页面为纯展示，不可编辑。数据与员工端「授予记录」和「归属详情」页面同源。

---

### 4.8 用户管理（仅超级管理员）

> 管理所有用户的系统角色和密码。仅超级管理员可见。侧边栏位置放在最底部，与业务页面视觉分隔。

#### 页面布局

- 搜索/筛选栏：按用户姓名或邮箱搜索；按角色下拉筛选（全部 / 超级管理员 / 授予管理员 / 审批管理员 / 普通员工）
- 主体：用户列表表格

#### 列表展示

| 用户姓名 | 员工ID | 邮箱 | 系统角色 | 雇佣状态 | 操作 |
| ------- | ----- | --- | ------- | ------- | --- |

#### 操作逻辑

- 点「编辑」→ 可修改用户的**系统角色**（普通员工 / 授予管理员 / 审批管理员 / 超级管理员）
- 点「重置密码」→ 系统生成新的初始密码，该用户下次登录时强制修改密码
- **此页面不可创建或删除用户**。用户创建在员工档案页面完成。
- 角色变更即时生效，刷新页面后用户看到的菜单和权限立即更新

---

## 5. 员工端页面

### 5.1 概述

员工端采用**可折叠窄侧边栏导航**，将内容分为 5 个独立页面。员工只能看到自己的数据。侧边栏默认展开，可折叠为图标模式以留出更多内容空间。

**侧边栏菜单项：**

1. 总览（个人信息 + 资产汇总）
2. 授予记录
3. 归属详情
4. 申请记录
5. 税务记录

> 员工端仅展示 Granted 及之后状态的授予和相关信息，Draft 状态的授予对员工不可见。

**员工端提醒**：当存在 Closing 状态的 Grant 时，在员工端所有 5 个页面的顶部（侧边栏上方或页面顶部 banner 区域）持续显示，直到窗口期结束或 Grant 变为 Closed：

- 单条授予关闭：「您有一条期权授予进入关闭流程，已归属未行权期权：X 份，必须在 YYYY-MM-DD 前行权，逾期将自动失效」+ 倒计时天数
- 员工离职：「您已离职，已归属未行权期权：X 份，必须在 YYYY-MM-DD 前行权，逾期将自动失效」+ 倒计时天数

### 5.2 页面详情

---

#### 页面一：总览

**① 个人信息汇总**

纯展示，不可编辑。

| 字段       | 说明               |
| ---------- | ------------------ |
| 员工姓名   | 员工姓名           |
| 员工ID     | 员工唯一标识       |
| 部门       | 所属部门           |
| 法律身份   | 内地 / 香港 / 海外 |
| 税务居住地 | 内地 / 香港 / 海外 |

**② 资产汇总**

展示该员工当前持股情况汇总。纯展示，无操作。
顶部信息栏：显示「当前估值：XX HKD」和「估值日期：YYYY-MM-DD」（取估值管理中最新一条记录）。

| 持股实体 | 激励类型 | 可操作股数 | 可操作期权 | 持股当前市值 |
| ------- | ------ | --------- | -------- | ---------- |

**数据规则：**

- 每一行 = 持股实体 + 激励类型 的组合
- 同一组合下的多个授予的 operableShares 和 operableOptions 分别累加
- 可操作期权：RSU 显示「-」
- 持股当前市值 = 可操作股数 × 最新 FMV

---

#### 页面二：授予记录

列出该员工所有 Granted 及之后状态的授予。有搜索（按计划标题/计划ID搜索）和筛选功能（按状态下拉筛选：全部 / 已授予 Granted / 归属中 Vesting / 全部归属 Fully Vested / 仍可行权 Still Exercisable / 全部交割 All Settled / 关闭中 Closing / 关闭 Closed）。

| 计划标题 | 激励类型 | 授予数量 | 行权价 | 授予日期 | 可操作股数 | 可操作期权 | 状态 | 操作 |
| ------- | ------- | ------ | ----- | ------- | -------- | --------- | --- | --- |

**字段说明：**

- **状态**：Granted / Vesting / Fully Vested / Still Exercisable / All Settled / Closing / Closed
- **可操作股数**：Grant 的 `operableShares` 字段
  - RSU：已交割未操作的实股
  - Option：已行权已交割未操作的实股
- **可操作期权**：Grant 的 `operableOptions` 字段
  - RSU：显示「-」
  - Option：已归属未行权的期权数

**操作按钮：「申请」**

点击「申请」按钮弹出申请弹窗，根据股权类型展示不同的表单结构：

**RSU 申请弹窗：**

- 顶部信息展示：「可操作实股：X 股」
- 申请操作：下拉单选（售出 / 转让 / 回购 / 兑现）
- 申请数量：数字输入（不可超过可操作股数）
- 备注：文本输入（选填）
- 确认提交

**Option 申请弹窗：**

- 顶部信息展示：
  - 「已归属未行权的期权 — 可操作 X 份」
  - 「已行权的实股 — 可操作 Y 股」
- 操作目标：单选（期权 / 实股）
  - 选择「期权」后 → 申请操作下拉：行权 / 转让 / 回购 / 兑现；数量上限 = operableOptions
  - 选择「实股」后 → 申请操作下拉：售出 / 转让 / 回购 / 兑现；数量上限 = operableShares
- 申请数量：数字输入（不可超过对应上限）
- 备注：文本输入（选填）
- 确认提交

**提交后流程：**

1. 系统生成一条申请记录（状态：待审批）
2. 管理端授予管理页面顶部显示该条待审批记录
3. 超级管理员/审批管理员审批通过/驳回
4. 通过后：系统自动生成税务事件（状态：待缴款） → 员工端申请记录状态更新
5. 员工上传凭证 → 税务事件状态「已上传凭证」
6. 超级管理员/审批管理员确认 → 税务事件「已确定」 → 系统更新 `operableShares` / `operableOptions` 和相关状态 → 员工端和管理端所有相关页面自动刷新
7. 驳回后：员工端申请记录状态更新为「已驳回」+ 审批备注。驳回不影响员工的可操作字段，员工可重新提交申请。

**申请按钮管控：**

- `operableShares > 0` 或 `operableOptions > 0`：申请按钮可用
- Closing + 窗口期内：申请按钮正常可用
- Closed 且 `operableShares > 0`：申请按钮可用（仅可对实股操作）
- Closed 且 `operableShares == 0`：申请按钮不显示
- All Settled：申请按钮不显示

---

#### 页面三：归属详情

列出该员工所有授予下的所有归属记录（仅 Granted 及之后状态的授予）。纯展示，无操作。有搜索和筛选功能。

| 计划标题 | 激励类型 | 归属日期 | 归属数量 | 可行权期权数 | 状态 |
| ------- | ------ | ------- | ------- | ---------- | --- |

**状态：**

- RSU：Pending / Vested / Settled / Closed
- Option：Pending / Vested / Partially Settled / Settled / Closed

> 归属记录不跟踪 post-settlement 操作（转让/售出/回购/兑现）。这些操作通过 Grant 层的可操作字段体现，不影响归属记录本身。

**归属数量计算 — 累计进位法：**

归属数量采用「累计进位法」，确保每期归属的股数为整数，且任意时点关闭授予时员工已归属的总量最接近按比例应得数量。

算法：
- 每期理论累计归属 = totalQuantity × (已归属期数 / 总期数)
- 本期实际归属 = round(本期理论累计归属) - 前几期实际归属之和
- 最后一期用 totalQuantity - 已归属总和 补齐，确保总和精确等于 totalQuantity

示例（200股，24期，6月cliff）：
- 悬崖期归属（第6期）：round(200 × 6/24) = round(50) = 50 股
- 第7期：round(200 × 7/24) - 50 = round(58.33) - 50 = 58 - 50 = 8 股
- 第8期：round(200 × 8/24) - 58 = round(66.67) - 58 = 67 - 58 = 9 股
- 第9期：round(200 × 9/24) - 67 = round(75) - 67 = 75 - 67 = 8 股
- ...以此类推
- 最后一期补齐到 200

优点：在任意时点关闭授予，员工已归属总量与按比例应得数量的偏差不超过 1 股。

注意：此算法只影响后端计算逻辑，前端归属计划表格直接展示计算结果的整数归属数量，无需显示中间的累计值或尾数。


---

#### 页面四：申请记录

记录员工所有的申请（行权/转让/售出/回购/兑现）。有搜索和筛选功能。

| 计划标题 | 申请操作 | 申请目标 | 申请数量 | 状态 | 申请时间 | 审批备注 |
| ------- | ------ | ------- | ------- | --- | ------- | ------ |

**字段说明：**

- **申请操作**：行权 / 转让 / 售出 / 回购 / 兑现（仅Option 能申请行权）
- **申请目标**：实股 / 期权（仅 Option 区分；RSU 默认为实股）

**状态：** 待审批 → 已批准 / 已驳回 / 已关闭

- 待审批：员工已提交，等待超级管理员/审批管理员审批
- 已批准：超级管理员/审批管理员审批通过（后续自动触发税务事件）
- 已驳回：超级管理员/审批管理员驳回（需显示审批备注中的驳回原因）
- 已关闭：员工离职时，所有待审批状态的申请自动变为已关闭

---

#### 页面五：税务记录

展示该员工所有税务事件。有搜索和筛选功能。

| 税务类型 | 具体操作 | 触发日期 | 数量 | 状态 | 操作 |
| ------- | ------- | ------ | --- | --- | ---- |

**状态：** 待缴款 → 已上传凭证 → 已确定

**操作：**

- 「上传转账回单」按钮：员工上传缴款凭证文件（支持 JPG/PNG/PDF，单文件不超过 10MB，每条税务事件最多 3 个文件）+ 添加备注
- 上传后在「已确定」前可替换
- 上传后，**员工端税务记录状态和管理端税务事件单状态同步变为「已上传凭证」**
- 管理员在管理端税务事件单中查看凭证并确认后，**双端同步变为「已确定」**
- 「已确定」后，系统自动更新 Grant 的 `operableShares` / `operableOptions`，推进归属记录和 Grant 的状态
- **归属记录和 Grant 状态更新后，员工端资产汇总、授予记录、归属详情页面自动刷新**

---

## 6. 数据模型

### 6.1 核心实体关系

```
Plan (激励计划)
 └── 1:N → Grant (授予)

User (员工/管理员)
 ├── N:M → EmployerEntity (用工主体)
 └── 1:N → Grant (授予)

HoldingEntity (持股主体)
 └── 1:N → Grant (授予)

Valuation (估值记录)
 └── 被 TaxEvent 引用（取触发日的 FMV）
 └── 被 资产管理 引用（取最新 FMV 计算市值）

Grant (授予)
 ├── N:1 → Plan
 ├── N:1 → User
 ├── N:1 → HoldingEntity (可选)
 ├── 1:N → VestingRecord (归属记录)
 ├── 1:N → TaxEvent (税务事件)
 ├── 1:N → OperationRequest (申请记录)
 └── 1:N → StatusChangeLog (状态变更日志)

VestingRecord (归属记录)
 └── N:1 → Grant

TaxEvent (税务事件)
 └── N:1 → Grant

OperationRequest (申请记录)
 └── N:1 → Grant

StatusChangeLog (状态变更日志)
 └── N:1 → Grant

EmployerEntity (用工主体)
 └── 独立表，与 User 多对多关联
```

### 6.2 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ========== 用户角色 ==========

enum UserRole {
  SUPER_ADMIN
  GRANT_ADMIN
  APPROVAL_ADMIN
  EMPLOYEE
}

enum Jurisdiction {
  MAINLAND
  HONGKONG
  OVERSEAS
}

// ========== 用户 / 员工 ==========

model User {
  id                  String    @id @default(cuid())
  name                String
  employeeId          String    @unique
  email               String    @unique // 企业邮箱，同时作为登录账号
  passwordHash        String?
  mustChangePassword  Boolean   @default(true)  // 首次登录强制改密码
  role                UserRole  @default(EMPLOYEE)
  department          String?
  legalIdentity       Jurisdiction
  taxResidence        Jurisdiction
  employmentStatus    String    @default("在职")
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  employerEntities  EmployerEntity[]
  taxEvents         TaxEvent[]
  operationRequests  OperationRequest[]

  // 授予数：通过 grants 关联实时计算，不单独存储
  grants            Grant[]

  @@map("users")
}

// ========== 用工主体 ==========

model EmployerEntity {
  id        String   @id @default(cuid())
  name      String   @unique
  createdAt DateTime @default(now())

  users     User[]

  @@map("employer_entities")
}

// ========== 激励计划 ==========

enum PlanType {
  RSU
  OPTION
}

enum PlanStatus {
  PENDING_APPROVAL
  APPROVED
}

model Plan {
  id                  String      @id @default(cuid())
  title               String
  type                PlanType
  jurisdiction        String
  deliveryMethod      Json
  poolSize            Decimal
  effectiveDate       DateTime
  boardResolutionId   String?
  status              PlanStatus  @default(PENDING_APPROVAL)
  notes               String?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  grants              Grant[]

  @@map("plans")
}

// ========== 持股主体 ==========

enum HoldingEntityType {
  LIMITED_PARTNERSHIP
  DOMESTIC_SUBSIDIARY
  OFFSHORE_SPV
  OTHER
}

enum HoldingEntityStatus {
  ACTIVE
  INACTIVE
}

model HoldingEntity {
  id              String              @id @default(cuid())
  name            String
  entityCode      String              @unique
  type            HoldingEntityType
  registrationNo  String
  address         String?
  establishedAt   DateTime?
  legalRep        String?
  lpAccount       String?
  taxJurisdiction String
  status          HoldingEntityStatus @default(ACTIVE)
  notes           String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  grants          Grant[]

  @@map("holding_entities")
}

// ========== 估值管理 ==========

model Valuation {
  id              String   @id @default(cuid())
  valuationDate   DateTime
  fmv             Decimal
  source          String?
  description     String?
  createdAt       DateTime @default(now())

  taxEvents       TaxEvent[]

  @@map("valuations")
}

// ========== 授予管理 ==========

enum GrantStatus {
  DRAFT
  GRANTED
  VESTING
  FULLY_VESTED
  STILL_EXERCISABLE   // 仅 Option：已全部归属，但还有未行权/未交割的期权
  ALL_SETTLED
  CLOSING             // 仅 Option：关闭中，行权窗口期内
  CLOSED
}

enum VestingFrequency {
  MONTHLY
  YEARLY
}

model Grant {
  id                        String       @id @default(cuid())
  planId                    String
  userId                    String
  holdingEntityId           String?
  grantDate                 DateTime
  vestingStartDate          DateTime?
  totalQuantity             Decimal                          // 授予总数量（RSU 为股数，Option 为期权数）
  strikePrice               Decimal      @default(0)
  agreementId               String?
  vestingYears              Int
  cliffMonths               Int
  vestingFrequency          VestingFrequency
  status                    GrantStatus  @default(DRAFT)
  operableShares            Decimal      @default(0)   // 可操作股数（实股）
  operableOptions           Decimal      @default(0)   // 可操作期权（仅 Option，RSU 恒为 0）
  closedReason              String?
  exerciseWindowDeadline    DateTime?    // 行权窗口截止日（仅 Closing 状态有值）
  exerciseWindowDays        Int?         // 行权窗口期天数（0/30/90/365）
  createdAt                 DateTime     @default(now())
  updatedAt                 DateTime     @updatedAt

  plan                      Plan              @relation(fields: [planId], references: [id])
  user                      User              @relation(fields: [userId], references: [id])
  holdingEntity             HoldingEntity?    @relation(fields: [holdingEntityId], references: [id])
  vestingRecords            VestingRecord[]
  taxEvents                 TaxEvent[]
  operationRequests         OperationRequest[]
  statusLogs                StatusChangeLog[]

  @@map("grants")
}

// ========== 归属记录 ==========

enum VestingRecordStatus {
  PENDING
  VESTED
  PARTIALLY_SETTLED   // 仅 Option 适用（部分期权已行权完成交割）
  SETTLED
  CLOSED
}

model VestingRecord {
  id                  String              @id @default(cuid())
  grantId             String
  vestingDate         DateTime
  quantity            Decimal                                // 该期归属总数量（RSU 为股数，Option 为期权数）
  exercisableOptions  Decimal             @default(0)  // 仅 Option：剩余可行权期权数。Vested 时初始化为 quantity，行权时 FIFO 扣减
  status              VestingRecordStatus @default(PENDING)
  actualVestDate      DateTime?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  grant           Grant               @relation(fields: [grantId], references: [id])

  @@map("vesting_records")
}

// 归属数量计算采用「累计进位法」，确保每期归属的股数为整数，且任意时点关闭授予时员工已归属的总量最接近按比例应得数量。确保所有归属记录数量之和恰好等于 totalQuantity
// RSU 归属记录无需跟踪行权进度，因为 RSU 在 Vested 后直接触发税务事件并一次性 Settled。
// Option 归属记录通过 exercisableOptions 字段跟踪剩余可行权期权数：Pending → Vested 时初始化为此次归属涉及的总期权数（即 quantity），每次 FIFO 行权扣减，减至 0 时状态变为 Settled。该字段同时作为状态判断依据：exercisableOptions > 0 为 Partially Settled，== 0 为 Settled。
// Post-settlement 操作（转让/售出/回购/兑现）不影响归属记录，仅通过 Grant 层的 operableShares / operableOptions 体现。

// ========== 税务事件 ==========

enum TaxEventType {
  VESTING_TAX
  EXERCISE_TAX
  POST_SETTLEMENT_TAX
}

enum TaxEventStatus {
  PENDING_PAYMENT
  RECEIPT_UPLOADED
  CONFIRMED
}

enum OperationTarget {
  SHARES     // 实股
  OPTIONS    // 期权
}

model TaxEvent {
  id                 String            @id @default(cuid())
  grantId            String
  userId             String
  eventType          TaxEventType
  operationType      String                                // 归属/行权/转让/售出/回购/兑现
  operationTarget    OperationTarget?                      // 实股/期权（仅 Option post-settlement 需要）
  quantity           Decimal                               // 本次操作的数量
  eventDate          DateTime
  fmvAtEvent         Decimal
  valuationId        String?                               // 取值来源：4.4 节 FMV 引用规则（日期 ≤ 触发日 的最近一条），用于「作为触发日 FMV 来源」的删除约束判定
  strikePrice        Decimal           @default(0)
  status             TaxEventStatus    @default(PENDING_PAYMENT)
  receiptFiles       String[]                              // 员工上传的凭证文件路径（最多 3 个）
  employeeNotes      String?                               // 员工添加的备注
  operationRequestId String?           @unique             // 关联触发此税务事件的申请（RSU 归属税务无关联申请，为 null）；与 OperationRequest 为 1:1 关系
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  grant              Grant             @relation(fields: [grantId], references: [id])
  user               User              @relation(fields: [userId], references: [id])
  operationRequest   OperationRequest?  @relation(fields: [operationRequestId], references: [id])
  valuation          Valuation?        @relation(fields: [valuationId], references: [id])

  @@map("tax_events")
}

// ========== 申请记录 ==========

enum OperationRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CLOSED       // 员工离职时，待审批的申请自动关闭
}

enum OperationRequestType {
  EXERCISE        // 行权（仅 Option）
  TRANSFER        // 转让
  SELL            // 售出（仅针对实股）
  BUYBACK         // 回购
  REDEEM          // 兑现
}

model OperationRequest {
  id              String                  @id @default(cuid())
  grantId         String
  userId          String
  requestType     OperationRequestType
  requestTarget   OperationTarget?                        // 实股/期权（仅 Option 的 post-settlement 申请需要）
  quantity        Decimal                                 // 申请数量
  status          OperationRequestStatus   @default(PENDING)
  submitDate      DateTime                @default(now())
  approveDate     DateTime?
  approverNotes   String?                                 // 审批备注（通过或驳回原因）
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  grant           Grant                   @relation(fields: [grantId], references: [id])
  user            User                    @relation(fields: [userId], references: [id])
  taxEvent        TaxEvent?                               // 审批通过后系统自动生成的税务事件

  @@map("operation_requests")
}

// ========== 状态变更日志 ==========

model StatusChangeLog {
  id              String   @id @default(cuid())
  grantId         String
  fromStatus      String
  toStatus        String
  operatorName    String
  legalDocument   String?
  timestamp       DateTime @default(now())   // 存储 UTC，展示时转换为 UTC+8

  grant           Grant    @relation(fields: [grantId], references: [id])

  @@index([grantId, timestamp])
  @@map("status_change_logs")
}
```

---

## 7. 认证 & 权限

### 7.1 认证方式

- **MVP 阶段**: 邮箱 + 密码登录（NextAuth Credentials Provider）
- **首次登录**: 系统检查 `mustChangePassword` 字段，为 `true` 时跳转到强制改密码页面，修改成功后标记为 `false`
- **初始管理员**: 通过 `prisma/seed.ts` 种子脚本创建第一个超级管理员账号（邮箱和初始密码从环境变量 `ADMIN_EMAIL` 和 `ADMIN_INITIAL_PASSWORD` 中读取），首次登录同样强制改密码
- **密码重置**: 超级管理员可在用户管理页面重置任意用户的密码，重置后 `mustChangePassword` 自动设为 `true`
- **后续扩展**: 预留企业 SSO 接口（SAML / OIDC）

### 7.2 权限矩阵

| 功能                          | 超级管理员 | 授予管理员 | 审批管理员 | 普通员工 |
| ---------------------------- | ---------- | ---------- | ---------- | -------- |
| 创建激励计划                   | ✅         | ✅         | ❌         | ❌       |
| 审批计划                       | ✅         | ❌         | ✅         | ❌       |
| 添加员工                       | ✅         | ✅         | ✅         | ❌       |
| 编辑员工                       | ✅         | ✅         | ✅         | ❌       |
| 添加持股主体                   | ✅         | ✅         | ✅         | ❌       |
| 添加估值记录                   | ✅         | ✅         | ✅         | ❌       |
| 创建授予                       | ✅         | ✅         | ❌         | ❌       |
| 推进授予状态（Draft→Granted）   | ✅         | ❌         | ✅         | ❌       |
| 关闭授予（→Closed）            | ✅         | ❌         | ✅         | ❌       |
| 审批员工申请                   | ✅         | ❌         | ✅         | ❌       |
| 将员工状态设为离职              | ✅         | ❌         | ✅         | ❌       |
| 确认税务事件（→已确定）          | ✅         | ❌         | ✅         | ❌       |
| 导出税务事件 Excel             | ✅         | ✅         | ✅         | ❌       |
| 查看资产管理                   | ✅         | ✅         | ✅         | ❌       |
| 导出资产管理 Excel             | ✅         | ✅         | ✅         | ❌       |
| 用户管理（角色分配/密码重置）     | ✅         | ❌         | ❌         | ❌       |
| 查看自己的股权                 | -          | -          | -          | ✅       |
| 提交行权/转让/售出/回购申请      | -          | -          | -          | ✅       |
| 上传缴款凭证                   | -          | -          | -          | ✅       |

> 此矩阵可后续调整。

### 7.3 路由保护

- 未登录用户访问任何页面跳转到 /login
- `mustChangePassword == true` 的用户登录后强制跳转到 /change-password
- 员工无法访问 /admin/* 路由
- 管理员无法访问 /employee/* 路由
- /admin/user-management/* 路由仅超级管理员可访问
- API 端点都有权限校验
- 员工端 API 必须在查询中加入 userId 过滤，确保只能看到自己的数据

---

## 8. 系统联动详情

### 8.1 数据引用关系

| 来源       | 目标           | 说明                                     |
| ---------- | -------------- | ---------------------------------------- |
| 激励计划池 | 授予管理       | 创建授予时关联计划（仅「已通过」可选）   |
| 员工档案   | 授予管理       | 创建授予时关联员工（仅「在职」可选）     |
| 持股主体库 | 授予管理       | 创建授予时关联持股主体（仅「启用」可选） |
| 估值管理   | 税务事件单     | 归属/行权/操作日的 FMV 自动引用          |
| 估值管理   | 资产管理       | 最新 FMV × 可操作股数 = 持股当前市值    |
| 估值管理   | 员工端资产汇总 | 同上，仅展示本人数据                     |

### 8.2 自动触发关系

| 触发事件 | 结果 |
| ------ | ---- |
| Grant 状态 → Granted | 自动生成所有归属记录（初始 Pending）|
| 归属记录到期（每日定时任务） | Pending → Vested，Option 同时更新 Grant 的 `operableOptions += 归属数量`；推进 Grant 状态 |
| RSU 每次归属（Pending → Vested） | 自动生成一条税务事件（归属税务，状态：待缴款） |
| Option 行权申请被批准 | 自动生成一条税务事件（行权税务，状态：待缴款） |
| Post-settlement 操作（转让/售出/回购/兑现）被批准 | 自动生成一条税务事件（post-settlement 税务，状态：待缴款） |
| RSU 归属税务事件 → 已确定 | 归属记录 Vested → Settled，`operableShares += 归属数量`，推进 Grant 状态 |
| Option 行权税务事件 → 已确定 | 按 FIFO 消耗归属记录，`operableOptions -= 行权数量`，`operableShares += 行权数量`，更新归属记录状态，推进 Grant 状态 |
| Post-settlement 税务事件 → 已确定 | 根据操作目标：实股 →`operableShares -= 操作数量`；期权 → `operableOptions -= 操作数量`  |
| 授予数量变化 | 员工档案「授予数」自动更新 |
| 员工状态 → 离职 | ① 所有待审批申请自动关闭（状态 → 已关闭）`<br>`② 系统自动关闭该员工所有非 All Settled 的 Grant（RSU → Closed，Option 根据 `operableOptions` → Closing 或 Closed），统一附上管理员填写的关闭原因和窗口期`<br>`③ 已批准但税务未确定的事件，需管理员手动决定 |
| Closing 状态 Grant 行权窗口期到期 | `operableOptions` 清零，所有 Vested / Partially Settled 归属记录 → Closed，Grant → Closed，未行权期权额度释放回计划池 |
| Grant 状态 → Closed | 按 4.1 已授予数量计算规则重新计算剩余额度：仅未消耗的部分释放回计划池 |

### 8.3 前置条件约束

| 约束 | 说明 |
| ---- | --- |
| 计划状态「已通过」 | 才能被授予管理引用 |
| 持股主体状态「启用」 | 才能被授予管理引用 |
| 员工状态「在职」 | 才能在创建授予时被选择 |
| Grant 状态为 Draft | 才能编辑授予信息 |
| Grant: Draft → Granted | 协议ID 必须已填写（如创建时未填，此时必须补填） |
| Grant 下所有税务事件「已确定」 + 所有归属记录 Settled | Grant 才能推进到 All Settled |
| 申请数量不超过对应的可操作字段  | 员工提交行权时 ≤`operableOptions`；post-settlement 实股操作 ≤ `operableShares`；post-settlement 期权操作 ≤ `operableOptions` |
| 计划剩余额度充足 | 创建授予时，已授予数量（见 4.1 计算规则）+ 本次授予数量 ≤ 激励池规模 |

### 8.4 管理端 ↔ 员工端联动

| 事件 | 影响范围 |
| ----- | ------- |
| 员工提交申请（行权/转让/售出/回购/兑现） | → 管理端：授予管理页面顶部显示待审批记录 |
| 管理员审批通过 | → 员工端：申请记录状态更新为「已批准」+ 审批备注`<br>`→ 系统：自动生成税务事件（状态：待缴款）`<br>`→ 员工端：税务记录新增一条待缴款记录 |
| 管理员审批驳回 | → 员工端：申请记录状态更新为「已驳回」+ 审批备注 |
| 员工上传缴款凭证 | → 管理端：税务事件单状态变为「已上传凭证」`<br>`→ 员工端：税务记录状态同步变为「已上传凭证」 |
| 管理员确认税务事件「已确定」 | → 管理端：税务事件单状态变为「已确定」`<br>`→ 员工端：税务记录状态同步变为「已确定」`<br>`→ 系统：更新 Grant 的 `operableShares` / `operableOptions<br>`→ 系统：推进归属记录状态（如 Vested → Settled 或 Partially Settled）`<br>`→ 系统：聚合计算推进 Grant 状态`<br>`→ 管理端：授予管理页面（列表可操作字段 + 详情归属计划）、资产管理页面自动刷新`<br>`→ 员工端：资产汇总、授予记录、归属详情页面自动刷新 |
| Grant 状态 → Closing | → 员工端：对应授予显示行权窗口期倒计时和提醒信息 |
| Grant 被 Closed | → 所有 Pending 归属记录自动变为 Closed（已 Vested/Partially Settled/Settled 的不受影响）`<br>`→ operableShares 保持不变，员工仍可对已交割实股发起 post-settlement 申请`<br>`→ 管理端：授予管理、资产管理页面自动刷新`<br>`→ 员工端：所有页面自动刷新 |

### 8.5 导出功能

| 页面       | 导出格式 | 说明                             |
| ---------- | -------- | -------------------------------- |
| 税务事件单 | Excel    | 可结合日期/员工/状态筛选条件导出 |
| 资产管理   | Excel    | 可结合员工/状态筛选条件导出      |

---

## 9. UI / UX 要求

### 9.1 设计原则

- **清晰优先**: 股权数据敏感，数字必须清晰易读，避免歧义
- **状态可见**: 所有流程状态用颜色标签区分
- **操作确认**: 状态变更、关闭授予、提交申请等重要操作必须二次确认
- **关键操作后自动刷新**: 管理端和员工端在关键操作（审批、税务确认、申请提交、凭证上传等）完成后，相关页面自动刷新以反映最新数据。不使用 WebSocket 实时推送，通过操作完成后的页面刷新或数据重新获取实现同步。「自动刷新」指操作发起方（当前用户）在操作成功后，通过 React Query invalidateQueries 重新获取数据，并非跨用户实时推送。另一端用户（员工/管理员）需手动刷新页面，或在 V2 通过邮件通知感知状态变更。

### 9.2 配色方案

```
主色:     #1E40AF (深蓝，金融级专业感)
成功:     #059669 (绿色，已通过/Settled/已确定)
进行中:   #2563EB (蓝色，Vesting/Still Exercisable/Partially Settled)
警告:     #D97706 (橙色，待审批/待缴款/Pending)
信息:     #7C3AED (紫色，已上传凭证)
危险:     #DC2626 (红色，Closed/已驳回)
背景:     #F8FAFC (浅灰白)
关闭中:   #EA580C (深橙色，Closing/行权窗口期倒计时)
```

### 9.3 响应式

- 桌面端优先，管理端和员工端均以 PC 使用为主
- 暂不考虑移动端适配

### 9.4 管理端侧边栏导航

管理端使用侧边栏导航，菜单项如下：

**业务页面：**

1. 仪表盘（Dashboard）
2. 激励计划池
3. 员工档案
4. 持股主体库
5. 估值管理
6. 授予管理
7. 税务事件单
8. 资产管理

**系统设置（底部分隔区域，仅超级管理员可见）：**
9. 用户管理

**侧边栏提醒机制**：菜单项在有待处理事项时显示红点 + 数字角标。

| 菜单项     | 触发条件                                       | 角标数字     |
| ---------- | ---------------------------------------------- | ------------ |
| 激励计划池 | 有计划处于「审批中」状态，待审批管理员通过     | 待审批计划数 |
| 估值管理   | 有归属到期但缺少估值记录，无法生成税务事件     | 「1」        |
| 授予管理   | 有员工新提交的申请（待审批状态）               | 待审批申请数 |
| 税务事件单 | 有税务事件处于「已上传凭证」状态，待管理员确认 | 待确认数量   |

- 对应事项处理完毕后，红点自动消失
- 角标数字在页面刷新或关键操作后更新
- 估值管理角标固定显示「1」而非实际数量，原因是「缺少估值」是一个二元状态（有缺口/无缺口），不以缺口数量计数

### 9.5 员工端侧边栏导航

员工端使用可折叠的窄侧边栏，默认展开，可折叠为图标模式。菜单项：

1. 总览
2. 授予记录
3. 归属详情
4. 申请记录
5. 税务记录

### 9.6 搜索与筛选规范

- 搜索为模糊匹配（输入关键字即可命中包含该关键字的记录）
- 输入 300ms 防抖后自动搜索（无需点击搜索按钮）
- 搜索和筛选可叠加使用（如：搜索"张三" + 筛选状态"在职"）
- 所有列表默认每页 20 条，按创建时间倒序排列
- 支持翻页
- 搜索和筛选结果同样分页

### 9.7 前端布局规范

- **长文本处理**：计划名称、权利ID、计划ID 等可能很长的字段，在表格中限制最大宽度并截断（鼠标悬停显示完整内容）；在详情页中允许换行但不可溢出容器
- **操作按钮区**：宽屏横排，窄屏自动换行（flex-wrap），确保所有按钮始终可见可点击，不可被挤出视图
- **状态标签**：固定最小宽度，文字始终横排，不可被压缩为竖排
- **表格容器**：所有数据表格外层加横向滚动（overflow-x-auto），窄屏时可左右滑动查看完整内容，表格内容不换行
- **详情页信息卡片**：字段用响应式 grid 布局，窄屏时从多列自动收为单列，字段值不可与标签重叠
- **页面容器**：所有页面根容器禁止横向溢出
- **日期选择器**：未选择时显示空白 + placeholder 提示文字，不预填当天日期（除非 PRD 明确要求默认当天）


---

## 10. 系统自动任务

**定时任务统一执行时间**：每日 00:00（UTC+8）。

**行权窗口期到期判定规则**：到期日当天 23:59:59 前员工仍可行权，次日 00:00 定时任务执行时清零。

| 任务 | 频率 | 说明  |
| ---- | --- | ----- |
| Vesting 检查 | 每日 00:00（UTC+8） | 扫描所有 Pending 归属记录，到期的翻转为 Vested |
| Option 可操作期权更新 | 每日（随 Vesting 检查） | Option 归属时，归属记录 `exercisableOptions = 归属数量`，Grant 的 `operableOptions += 归属数量`  |
| RSU 税务事件生成 | 每日（随 Vesting 检查） | RSU 归属时自动生成税务事件（状态：待缴款）。如触发日之前无估值记录，暂不生成，待管理员录入估值后下次定时任务自动补生成 |
| Grant 状态推进 | 每日 + 事件触发 | 根据归属记录状态聚合，自动推进 Grant 状态（含 Still Exercisable 分支） |
| 申请审批后处理 | 事件触发 | 行权/post-settlement 申请批准后，生成税务事件 |
| 税务确认后处理 | 事件触发 | 税务事件「已确定」后：`<br>`- RSU 归属税务：`operableShares += 归属数量`，归属记录 Vested→Settled`<br>`- Option 行权税务：FIFO 消耗归属记录，`operableOptions -=`，`operableShares +=<br>`- Post-settlement 税务：根据目标减少 `operableShares` 或 `operableOptions<br>`- 推进 Grant 状态 |
| Closing 窗口期检查 | 每日 00:00（UTC+8） | 扫描所有 Closing 状态的 Grant，到期的执行：`operableOptions` 清零，Vested / Partially Settled 归属记录 → Closed，Grant → Closed，未行权期权额度释放回计划池，所有处于「待审批」状态的行权申请自动变为「已关闭」，不再执行 |

---

## 11. 开发计划（建议分期）

### Phase 1 — 基础框架 + 数据模型（Week 1-2）

```
- [ ] 项目初始化: Next.js + Prisma + PostgreSQL + NextAuth
- [ ] 数据库 Schema 创建 & 迁移
- [ ] 种子数据（测试用的完整数据链路 + 初始超级管理员账号）
- [ ] 认证流程（登录/登出/Session/首次登录强制改密码）
- [ ] 权限中间件 & 路由保护
- [ ] 状态变更日志基础设施
```

### Phase 2 — 基础数据页面（Week 3-4）

```
- [ ] 管理端仪表盘（Dashboard）：数据概览卡片 + 快捷操作
- [ ] 激励计划池（Plan）: 创建、列表、搜索筛选、审批流程
- [ ] 员工档案（User）: 添加、列表、搜索筛选、用工主体管理
- [ ] 持股主体库（HoldingEntity）: 添加、列表、搜索筛选
- [ ] 估值管理（Valuation）: 添加、列表、编辑、删除
- [ ] 用户管理（User Management）: 角色分配、密码重置（仅超级管理员）
```

### Phase 3 — 授予管理 + 统一状态机（Week 5-7）

```
- [ ] 授予创建表单（含关联下拉搜索、已授予数量校验）
- [ ] Vesting 计算引擎（根据归属年限/悬崖期/频率自动生成归属记录）
- [ ] 统一状态机实现（Grant 状态由归属记录状态聚合）
- [ ] FIFO 交割分配引擎
- [ ] 授予详情页（五个板块：授予信息、归属计划、税务事件、状态变更日志、申请记录）
- [ ] 每日定时任务（归属检查 & 状态推进 & Closing 窗口期检查）
- [ ] 状态变更日志自动记录
- [ ] 单元测试：Vesting 计算正确性 + 状态机流转 + FIFO 分配
```

### Phase 4 — 税务事件 + 资产管理 + 导出（Week 8-9）

```
- [ ] 税务事件自动生成逻辑（归属/行权/post-settlement）
- [ ] 税务事件单列表页（搜索筛选）
- [ ] 税务状态管理（待缴款 → 已上传凭证 → 已确定）
- [ ] 凭证上传与查看流程（文件上传 + 存储）
- [ ] 交割前置条件检查（税务已确定 → 更新 operableShares/operableOptions，推进归属记录与 Grant 状态）
- [ ] 资产管理页面（聚合查询 + 计算）
- [ ] Excel 导出功能（税务事件 + 资产管理）
```

### Phase 5 — 员工端（Week 10-11）

```
- [ ] 员工端侧边栏导航布局（可折叠）
- [ ] 总览页面（个人信息汇总 + 资产汇总）
- [ ] 授予记录页面 + 申请弹窗（RSU/Option 分别处理）
- [ ] 归属详情页面
- [ ] 申请记录页面
- [ ] 税务记录页面 + 上传凭证功能
- [ ] 管理端 ↔ 员工端联动测试
```

### Phase 6 — 优化 & 上线准备（Week 12）

```
- [ ] 全流程集成测试
- [ ] 性能优化（聚合查询优化、缓存策略）
- [ ] 安全审查（权限校验、数据隔离、输入验证）
- [ ] 部署配置 & 文档
```

---

## 12. Claude Code 执行指南

### 12.1 开发规范

- **语言**: 全部使用 TypeScript，strict 模式
- **命名**: 文件名 kebab-case，组件 PascalCase，变量/函数 camelCase
- **API 响应格式**: 统一使用 `{ success: boolean, data?: T, error?: string }`
- **错误处理**: API 使用 try-catch + 统一错误响应；前端使用 Error Boundary
- **代码注释**: 关键业务逻辑（Vesting 计算、状态机、FIFO 分配、已授予数量计算）必须写清楚注释

### 12.2 执行顺序建议

1. 先完成 Prisma Schema 并运行迁移
2. 编写种子数据，确保有测试用的完整数据链路 + 初始超级管理员账号
3. 实现 Vesting 计算引擎，**写单元测试验证计算正确性**
4. 实现统一状态机和 FIFO 分配引擎，**写单元测试**
5. 搭建认证 + 权限框架（含首次登录强制改密码）
6. 按 Phase 顺序逐步实现页面和 API
7. 每完成一个模块，运行测试确保不影响已有功能

### 12.3 关键注意事项

- **Decimal 精度**: 股权数量和金额使用 Prisma 的 `Decimal` 类型，前端展示时再格式化
- **时区处理**: 所有日期存储为 UTC，展示时转为 UTC+8
- **并发控制**: 行权操作需要使用数据库事务，防止超额行权。具体步骤：开启事务 → 锁定相关归属记录 → 检查可操作数量 → FIFO 分配 → 更新状态 → 提交事务
- **数据隔离**: 员工端 API 必须在查询中加入 userId 过滤条件，绝对不能返回其他员工数据
- **状态机严格性**: 状态只能按定义的路径流转，任何非法跳转都应被拒绝并记录告警
- **双端同步**: 管理端和员工端共用同一条数据记录，关键操作完成后通过页面刷新或数据重新获取反映最新状态
- **文件上传**: 凭证文件存储路径通过环境变量 `UPLOAD_DIR` 配置，MVP 使用本地文件系统，生产环境可切换为 S3

---

## 附录 A — 环境变量

```env
# .env.example
DATABASE_URL="postgresql://user:password@localhost:5432/equity_platform"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"
ADMIN_EMAIL="admin@company.com"
ADMIN_INITIAL_PASSWORD="change-me-on-first-login"
UPLOAD_DIR="./uploads"
```

## 附录 B — 术语表

| 术语 | 英文 | 说明 |
| ---- | --- | ---- |
| RSU | Restricted Stock Unit | 限制性股票单位，归属后直接获得股票 |
| 期权 | Stock Option | 员工在未来以约定价格购买公司股票的权利 |
| 归属 | Vesting | 股权按条件逐步生效的过程 |
| 悬崖期 | Cliff Period | 最低服务期，期间不产生任何归属 |
| 行权 | Exercise | 员工按约定价格购买已归属股权的操作 |
| 行权价 | Strike Price | 行权时的购买价格 |
| FMV | Fair Market Value | 公允市场价值 |
| 交割 | Settlement | 股权实际交付/确认完成的操作 |
| 兑现 | Redemption | 公司按约定价格将员工持有的股权（实股或期权）回购并以现金结算的操作。与回购的区别在于：回购通常由公司主动发起（如离职回购条款），兑现通常由员工主动申请将股权变现为现金 |
| 代持主体 | Holding Entity | 代为持有股权的法律实体 |
| 审计日志 | Audit Trail | 所有操作的不可篡改记录 |
| Maker-Checker | 制单-复核分离 | 创建和审批由不同角色执行的风控原则 |
| FIFO | First In First Out | 先进先出，行权/交割时优先消耗最早归属的记录 |
| Post-settlement | 交割后操作 | 交割完成后的转让、售出、回购、兑现等操作 |

## 附录 C — 通知机制（V2 规划）

> 当前版本（V1）暂不实现通知，所有待处理事项依赖用户主动查看管理端侧边栏角标或员工端页面提醒。以下为 V2 版本的通知规划。

**通知方式**：每日邮件汇总（当日无待通知事项则不发送邮件）。

**通知对象与触发条件：**

| 通知对象 | 触发条件                 | 通知内容                                    |
| -------- | ------------------------ | ------------------------------------------- |
| 管理员   | 有新的待审批申请         | 「有 X 条新的员工申请待审批」               |
| 管理员   | 有新的已上传凭证待确认   | 「有 X 条税务事件待确认」                   |
| 员工     | 申请被审批（通过或驳回） | 「您的 XX 申请已被通过/驳回」               |
| 员工     | 税务事件状态变更         | 「您有 X 条税务事件状态已更新」             |
| 员工     | Closing 窗口期剩余 7 天  | 「您有期权将在 7 天后到期失效，请及时行权」 |
