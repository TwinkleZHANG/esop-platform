import {
  HoldingEntityStatus,
  HoldingEntityType,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

const TYPE = [
  "LIMITED_PARTNERSHIP",
  "DOMESTIC_SUBSIDIARY",
  "OFFSHORE_SPV",
  "OTHER",
] as const;

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(TYPE).optional(),
  registrationNo: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  establishedAt: z.string().nullable().optional(),
  legalRep: z.string().nullable().optional(),
  lpAccount: z.string().nullable().optional(),
  taxJurisdiction: z.enum(["内地", "香港", "海外"]).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("holdingEntity.create");
  if (isErrorResponse(guard)) return guard;

  const entity = await prisma.holdingEntity.findUnique({
    where: { id: params.id },
  });
  if (!entity) return fail("持股主体不存在", 404);
  return ok(entity);
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("holdingEntity.create");
  if (isErrorResponse(guard)) return guard;

  const entity = await prisma.holdingEntity.findUnique({
    where: { id: params.id },
  });
  if (!entity) return fail("持股主体不存在", 404);

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;
  const data: Prisma.HoldingEntityUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.type !== undefined) data.type = d.type as HoldingEntityType;
  if (d.registrationNo !== undefined) data.registrationNo = d.registrationNo;
  if (d.address !== undefined) data.address = d.address || null;
  if (d.establishedAt !== undefined)
    data.establishedAt = d.establishedAt ? new Date(d.establishedAt) : null;
  if (d.legalRep !== undefined) data.legalRep = d.legalRep || null;
  if (d.lpAccount !== undefined) data.lpAccount = d.lpAccount || null;
  if (d.taxJurisdiction !== undefined)
    data.taxJurisdiction = d.taxJurisdiction;
  if (d.notes !== undefined) data.notes = d.notes || null;
  if (d.status !== undefined) data.status = d.status as HoldingEntityStatus;

  const updated = await prisma.holdingEntity.update({
    where: { id: entity.id },
    data,
  });
  return ok(updated);
}
