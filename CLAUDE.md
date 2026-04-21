# Claude Code 工作指南

## 项目

股权激励管理系统。完整需求见 `docs/PRD.md`,开工前先读相关章节。

## 技术栈（不可更改）

- Next.js 14+ (App Router) + TypeScript strict 模式
- Prisma + PostgreSQL
- NextAuth.js
- Tailwind CSS + shadcn/ui
- Zustand / React Query

## 硬性规范(每次写代码都要遵守)

### 数据精度

- 股权数量、金额一律用 Prisma 的 `Decimal` 类型
- **禁止用 JavaScript number 处理股数/金额**,会丢精度
- 前端展示时再用 `.toFixed()` 或 Intl 格式化

### 时区

- 数据库一律存 UTC
- 前端展示一律转 UTC+8
- 统一用一个 util 函数,不要每处自己转

### API 响应格式

所有 API Route 统一返回:
\`\`\`ts
{ success: boolean, data?: T, error?: string }
\`\`\`

### 命名

- 文件名:kebab-case
- React 组件:PascalCase
- 变量/函数:camelCase
- 数据库表:snake_case (在 Prisma schema 用 @@map)

### 权限

- 每个 API Route 第一件事就是权限校验
- 员工端 API 查询必须带 `userId` 过滤,不能查到别人数据
- 权限矩阵见 PRD 第 7.2 节,不要自己发挥

### 核心业务逻辑必须写注释

- Vesting 计算
- 状态机流转
- FIFO 分配
- 已授予数量计算

### 测试

- 核心引擎(vesting / state-machine / settlement)必须有单元测试
- 测试必须覆盖 PRD 3.5、3.8 节的示例数据
- 测试没过不准进下一个阶段

## 工作流程

### 开工前

1. 读 `docs/PRD.md` 中本次 session 相关的章节
2. 先给我一份实施计划(列出要改/新增哪些文件)
3. 我确认后再动手

### 开工中

- 遇到 PRD 没写清楚的地方,**停下来问我**,不要自己编
- 超出本次 session 范围的依赖,用 `// TODO(session-X):` 标注,不要擅自扩展
- 每完成一个可独立验证的小模块就 commit 一次
- Commit message 格式:`feat(模块): 做了什么` 或 `fix(模块): 修了什么`

### 收工前

- 跑一遍 lint 和测试,确保全绿
- 总结本次 session 完成了什么、还有什么 TODO

## 不要做的事

- ❌ 不要擅自改 `docs/PRD.md`(有疑问先问我)
- ❌ 不要擅自升级依赖大版本
- ❌ 不要把密钥、密码写进代码
- ❌ 不要用 `any` 绕过类型检查
- ❌ 不要跳过测试直接声称"完成了"
