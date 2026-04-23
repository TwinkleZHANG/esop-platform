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
  paged,
  parseDateRange,
  parsePagination,
  requirePermission,
} from "@/lib/api-utils";

const TYPE = [
  "LIMITED_PARTNERSHIP",
  "DOMESTIC_SUBSIDIARY",
  "OFFSHORE_SPV",
  "OTHER",
] as const;

const createSchema = z.object({
  name: z.string().min(1, "代持主体必填"),
  entityCode: z.string().min(1, "代持主体 ID 必填"),
  type: z.enum(TYPE),
  registrationNo: z.string().min(1, "主体代码编号必填"),
  address: z.string().optional().nullable(),
  establishedAt: z.string().optional().nullable(),
  legalRep: z.string().optional().nullable(),
  lpAccount: z.string().optional().nullable(),
  taxJurisdiction: z.enum(["内地", "香港", "海外"]),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const guard = await requirePermission("holdingEntity.create");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status"); // ACTIVE/INACTIVE/ALL

  const where: Prisma.HoldingEntityWhereInput = {};
  if (status === "ACTIVE" || status === "INACTIVE") {
    where.status = status as HoldingEntityStatus;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { entityCode: { contains: search, mode: "insensitive" } },
    ];
  }
  const range = parseDateRange(url.searchParams);
  if (range.gte || range.lte) where.createdAt = range;

  const [items, total] = await Promise.all([
    prisma.holdingEntity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.holdingEntity.count({ where }),
  ]);

  return ok(paged(items, total, pagination));
}

export async function POST(req: Request) {
  const guard = await requirePermission("holdingEntity.create");
  if (isErrorResponse(guard)) return guard;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const dup = await prisma.holdingEntity.findUnique({
    where: { entityCode: d.entityCode },
  });
  if (dup) return fail("代持主体 ID 已存在");

  const entity = await prisma.holdingEntity.create({
    data: {
      name: d.name,
      entityCode: d.entityCode,
      type: d.type as HoldingEntityType,
      registrationNo: d.registrationNo,
      address: d.address || null,
      establishedAt: d.establishedAt ? new Date(d.establishedAt) : null,
      legalRep: d.legalRep || null,
      lpAccount: d.lpAccount || null,
      taxJurisdiction: d.taxJurisdiction,
      notes: d.notes || null,
      status: HoldingEntityStatus.ACTIVE,
    },
  });

  return ok(entity);
}
