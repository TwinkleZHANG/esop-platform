import { UserRole } from "@prisma/client";

// 权限矩阵实现。对应 PRD 7.2 节，按功能逐项列出允许的角色集合。
// 新增/修改权限时直接改 MATRIX，不要散落到调用点。

type Permission =
  | "plan.create"
  | "plan.approve"
  | "employee.create"
  | "employee.edit"
  | "holdingEntity.create"
  | "valuation.create"
  | "grant.create"
  | "grant.advance" // Draft → Granted
  | "grant.close" // → Closed
  | "operationRequest.approve"
  | "employee.terminate"
  | "taxEvent.confirm"
  | "taxEvent.export"
  | "asset.view"
  | "asset.export"
  | "userManagement" // 超管专属
  | "self.viewEquity"
  | "self.submitRequest"
  | "self.uploadReceipt";

const MATRIX: Record<Permission, UserRole[]> = {
  "plan.create": [UserRole.SUPER_ADMIN, UserRole.GRANT_ADMIN],
  "plan.approve": [UserRole.SUPER_ADMIN, UserRole.APPROVAL_ADMIN],
  "employee.create": [
    UserRole.SUPER_ADMIN,
    UserRole.GRANT_ADMIN,
    UserRole.APPROVAL_ADMIN,
  ],
  "employee.edit": [
    UserRole.SUPER_ADMIN,
    UserRole.GRANT_ADMIN,
    UserRole.APPROVAL_ADMIN,
  ],
  "holdingEntity.create": [
    UserRole.SUPER_ADMIN,
    UserRole.GRANT_ADMIN,
    UserRole.APPROVAL_ADMIN,
  ],
  "valuation.create": [
    UserRole.SUPER_ADMIN,
    UserRole.GRANT_ADMIN,
    UserRole.APPROVAL_ADMIN,
  ],
  "grant.create": [UserRole.SUPER_ADMIN, UserRole.GRANT_ADMIN],
  "grant.advance": [UserRole.SUPER_ADMIN, UserRole.APPROVAL_ADMIN],
  "grant.close": [UserRole.SUPER_ADMIN, UserRole.APPROVAL_ADMIN],
  "operationRequest.approve": [UserRole.SUPER_ADMIN, UserRole.APPROVAL_ADMIN],
  "employee.terminate": [UserRole.SUPER_ADMIN, UserRole.APPROVAL_ADMIN],
  "taxEvent.confirm": [UserRole.SUPER_ADMIN, UserRole.APPROVAL_ADMIN],
  "taxEvent.export": [
    UserRole.SUPER_ADMIN,
    UserRole.GRANT_ADMIN,
    UserRole.APPROVAL_ADMIN,
  ],
  "asset.view": [
    UserRole.SUPER_ADMIN,
    UserRole.GRANT_ADMIN,
    UserRole.APPROVAL_ADMIN,
  ],
  "asset.export": [
    UserRole.SUPER_ADMIN,
    UserRole.GRANT_ADMIN,
    UserRole.APPROVAL_ADMIN,
  ],
  userManagement: [UserRole.SUPER_ADMIN],
  "self.viewEquity": [UserRole.EMPLOYEE],
  "self.submitRequest": [UserRole.EMPLOYEE],
  "self.uploadReceipt": [UserRole.EMPLOYEE],
};

export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission
): boolean {
  if (!role) return false;
  return MATRIX[permission].includes(role);
}

export function isAdmin(role: UserRole | null | undefined): boolean {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.GRANT_ADMIN ||
    role === UserRole.APPROVAL_ADMIN
  );
}

export function isEmployee(role: UserRole | null | undefined): boolean {
  return role === UserRole.EMPLOYEE;
}

export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === UserRole.SUPER_ADMIN;
}

export type { Permission };
