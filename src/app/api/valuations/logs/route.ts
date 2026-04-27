import { prisma } from "@/lib/prisma";
import {
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";
import { formatUtc8 } from "@/lib/audit";

export async function GET() {
  const guard = await requirePermission("valuation.create");
  if (isErrorResponse(guard)) return guard;

  const logs = await prisma.valuationLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 200,
  });

  return ok(
    logs.map((l) => ({
      id: l.id,
      action: l.action,
      fmv: l.fmv.toFixed(2),
      valuationDate: l.valuationDate,
      operatorName: l.operatorName,
      timestampDisplay: formatUtc8(l.timestamp),
    }))
  );
}
