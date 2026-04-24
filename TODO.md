# 后续改进 TODO

本文件记录当前版本未覆盖或可优化的点，按优先级粗分。

## 体验 / 数据一致性

- [ ] 统一日期显示：`grantDate`、`vestingDate`、`eventDate` 等 DateTime 字段目前用 `toLocaleDateString("zh-CN")`，依赖浏览器时区。CN 用户正常；其他时区可能偏一天。建议加 `formatDateUtc8(date)` 工具并在全站替换
- [ ] 邮件通知：员工申请被审批、税务事件被确认、离职清算等关键事件应触发邮件（当前只能靠刷新页面感知）
- [ ] 审计日志查看：当前 Grant 详情展示 `StatusChangeLog`；计划/持股主体/估值等实体的编辑尚未有日志
- [ ] 分页：详情页归属计划分页已做客户端 15 条；若 Grant 归属记录超过几百条，可考虑改服务端分页

## 存储 / 基建

- [ ] 文件存储：当前 `UPLOAD_DIR` 走本地 FS，生产环境需替换为 S3 或 OSS（抽象成 `StorageAdapter`）
- [ ] 定时任务：`/api/cron/daily` 需要外部调度（系统 cron / Vercel Cron / 云厂商）。可接入 Vercel Cron 并提供签名校验样例
- [ ] 数据库备份：未提供 PostgreSQL 备份脚本；部署时按运维要求配置

## 认证 / 权限

- [ ] 企业 SSO：`src/lib/auth.ts` 已预留 NextAuth 位置，可接 SAML/OIDC Provider
- [ ] 用户密码策略：目前仅前端校验 ≥8 位；可加复杂度要求与后端强校验
- [ ] 登出：员工端 shell 顶部已有「退出登录」按钮；管理端侧边栏未加，应补充
- [ ] Session 过期：默认 NextAuth JWT 无强制过期；生产建议缩短 + refresh 机制

## 性能

- [ ] 列表页搜索：当前用 Prisma `contains` 大小写不敏感查询。大数据量下应加索引或迁移到全文搜索
- [ ] 资产管理聚合：`/api/assets` 当前在应用层分组求和，数据量大时考虑 SQL GROUP BY 或物化视图
- [ ] React Query：当前列表页每次挂载/筛选变化都 refetch；可接入 React Query / SWR 做缓存 + 自动重试

## 安全

- [ ] 文件访问权限审计日志：`/api/tax-events/[id]/files/[idx]` 目前只校验身份，未记日志
- [ ] 登录失败限流：防暴力破解，当前没有失败计数
- [ ] CSP / HTTP 安全头：生产部署建议配置 `Content-Security-Policy`、`Strict-Transport-Security` 等

## 测试

- [ ] 集成测试：当前单测覆盖 `vesting` / `state-machine` / `settlement` 三个核心模块；API 路由、cron 任务、权限矩阵缺端到端测试
- [ ] E2E 测试：可接入 Playwright 覆盖「员工提交 → 管理员审批 → 员工上传 → 管理员确认」全流程

## 文档

- [ ] 运维手册：部署、升级、备份、Prisma migration 策略
- [ ] API 文档：暂时只能看代码；可加 OpenAPI / tRPC 风格的类型共享
