# ESOP Platform · 股权激励管理系统

面向公司内部的股权激励管理平台，支持 RSU / Option 两种激励形态：授予与归属追踪、行权与 post-settlement 申请审批、税务事件归集、员工自助查看与凭证上传。

完整需求见 [`docs/PRD.md`](docs/PRD.md)。

## 技术栈

- Next.js 14 (App Router) + TypeScript strict
- PostgreSQL + Prisma 6
- NextAuth.js（邮箱密码登录，预留 SSO）
- Tailwind CSS + shadcn/ui（base-nova 风格）
- Jest + ts-jest（核心引擎单元测试）
- xlsx（Excel 导出）

## 本地运行

### 前置依赖

- Node.js ≥ 20
- PostgreSQL ≥ 14（或可访问的远端实例）
- npm（项目锁定在 npm）

### 步骤

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：至少确认 DATABASE_URL、NEXTAUTH_SECRET、ADMIN_* 四项

# 3. 初始化数据库（应用所有 migration）
npx prisma migrate deploy

# 4. 生成 Prisma Client
npx prisma generate

# 5. 写入初始超级管理员
npx prisma db seed

# 6. 启动开发服务器
npm run dev
```

访问 http://localhost:3000，用 `.env` 里配置的 `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` 登录，首次登录会强制改密码。

### 国内网络注意

若 `binaries.prisma.sh` 无法连接，命令前临时加镜像：

```bash
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma npx prisma migrate deploy
```

或在 `.env` 里启用 `PRISMA_ENGINES_MIRROR`。

## 常用命令

```bash
npm run dev                 # 开发服务器
npm run build               # 生产构建
npm start                   # 运行生产构建
npm test                    # Jest 单元测试（vesting / state-machine / settlement）
npx tsc --noEmit            # TypeScript 类型检查
npx prisma migrate dev      # 新增 schema 变更时生成 migration
npx prisma studio           # DB 可视化
```

## 定时任务

每日 00:00 UTC+8 需触发：

```bash
curl -X POST http://localhost:3000/api/cron/daily \
  -H "X-Cron-Token: $CRON_SECRET"
```

端点会自动处理：归属到期翻转、RSU 税务事件生成、Grant 状态聚合推进、Closing 窗口期到期清算。错误隔离到单个 Grant，失败收集到响应 `errors[]`。

可接入：系统 cron、云厂商定时任务、Vercel Cron。

## 角色 & 初始登录

| 角色 | 说明 |
| --- | --- |
| 超级管理员 | 所有权限，在用户管理页分配其他角色 |
| 授予管理员 | 创建计划 / 创建授予 |
| 审批管理员 | 审批计划 / 审批申请 / 推进 Grant 状态 / 确认税务事件 |
| 普通员工 | 查看自己的股权、提交申请、上传凭证 |

初始超管由 `prisma db seed` 写入，其他用户在管理端「员工档案」创建（自动生成账号 + 随机初始密码）。

## 文件上传

员工上传的缴款凭证存放在 `UPLOAD_DIR`（默认 `./uploads`），按税务事件 id 分目录。已加入 `.gitignore`。

生产部署建议挂载持久化卷或替换为对象存储（当前仅本地 FS）。

## 项目结构

```
src/
├── app/
│   ├── (auth)/          登录/改密
│   ├── admin/           管理端页面
│   ├── employee/        员工端页面
│   └── api/             API routes
├── components/          复用组件
├── lib/
│   ├── vesting.ts       归属计划生成（累计进位法）
│   ├── state-machine.ts Grant / VestingRecord 状态机
│   ├── settlement.ts    FIFO 行权分配
│   ├── valuation.ts     FMV 引用
│   ├── audit.ts         状态变更日志 + UTC+8 格式化
│   ├── permissions.ts   PRD 7.2 权限矩阵
│   └── api-utils.ts     统一响应、鉴权、分页、decimalLike
└── types/
```

## 开发约定

- 股权数量、金额一律 `Prisma.Decimal`；前端展示 `toFixed(0)` (股数) / `toFixed(2)` (金额)
- 数据库存 UTC，StatusChangeLog 等显式场景用 `formatUtc8` 展示
- API 响应统一 `{ success, data?, error? }`
- 每个 API 路由先鉴权（`requirePermission(...)` 或 `requireSession`）
- 员工端 API 必须按 `userId` 过滤；管理端 API 按 PRD 7.2 权限矩阵限制

更多细节见 `CLAUDE.md`。

## 已知限制

- 日期仅字段（如 `grantDate`）前端用 `toLocaleDateString("zh-CN")` 显示，依赖浏览器时区；中国用户正常，后续可统一换 `formatDateUtc8`
- 文件存储仅支持本地 FS；生产环境需替换为 S3/OSS
- 邮件通知未实现（员工申请进度靠刷新页面查看）
- 企业 SSO（SAML/OIDC）预留接口但未接入；当前仅邮箱密码登录

见 [`TODO.md`](TODO.md) 了解后续计划。
