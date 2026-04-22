import type { ReactNode } from "react";

/**
 * 列表页外壳：标题 + 顶部操作区 + 工具栏（搜索/筛选）+ 内容区 + 分页。
 * 具体组件（SearchToolbar / Pagination / Table）由调用方组合。
 */
export function ListPageShell({
  title,
  toolbar,
  actions,
  children,
  pagination,
}: {
  title: string;
  toolbar?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  pagination?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        {actions}
      </div>
      {toolbar}
      <div className="rounded-lg border border-border bg-background">
        {children}
      </div>
      {pagination}
    </div>
  );
}
