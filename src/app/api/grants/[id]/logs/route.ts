import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";
import { formatUtc8 } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const grant = await prisma.grant.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!grant) return fail("授予不存在", 404);

  const logs = await prisma.statusChangeLog.findMany({
    where: { grantId: params.id },
    orderBy: { timestamp: "desc" },
  });

  return ok(
    logs.map((l) => ({
      id: l.id,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      operatorName: l.operatorName,
      legalDocument: l.legalDocument,
      timestamp: l.timestamp, // UTC ISO
      timestampDisplay: formatUtc8(l.timestamp), // UTC+8 格式化
    }))
  );
}
