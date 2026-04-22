import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";
import { generateInitialPassword } from "@/lib/password-gen";

const patchSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "GRANT_ADMIN", "APPROVAL_ADMIN", "EMPLOYEE"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("userManagement");
  if (isErrorResponse(guard)) return guard;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("参数错误");

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return fail("用户不存在", 404);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: parsed.data.role as UserRole },
    select: { id: true, role: true },
  });
  return ok(updated);
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  // 重置密码
  const guard = await requirePermission("userManagement");
  if (isErrorResponse(guard)) return guard;

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return fail("用户不存在", 404);

  const newPassword = generateInitialPassword(8);
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: true },
  });

  return ok({ newPassword });
}
