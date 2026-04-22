import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

export async function GET() {
  const guard = await requirePermission("employee.create");
  if (isErrorResponse(guard)) return guard;

  const items = await prisma.employerEntity.findMany({
    orderBy: { createdAt: "desc" },
  });
  return ok(items);
}

const createSchema = z.object({ name: z.string().min(1) });

export async function POST(req: Request) {
  const guard = await requirePermission("employee.create");
  if (isErrorResponse(guard)) return guard;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("用工主体名称必填");

  const exists = await prisma.employerEntity.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) return fail("该用工主体已存在");

  const created = await prisma.employerEntity.create({
    data: { name: parsed.data.name },
  });
  return ok(created);
}
