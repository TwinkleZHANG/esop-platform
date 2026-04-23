import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, isErrorResponse, requireSession } from "@/lib/api-utils";
import { hasPermission } from "@/lib/permissions";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string; idx: string } }
) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;

  const t = await prisma.taxEvent.findUnique({
    where: { id: params.id },
    select: { userId: true, receiptFiles: true },
  });
  if (!t) return fail("税务事件不存在", 404);

  // 本人员工 或 具备 taxEvent.export 权限的管理员
  const canView =
    session.user.id === t.userId ||
    (session.user.role !== UserRole.EMPLOYEE &&
      hasPermission(session.user.role, "taxEvent.export"));
  if (!canView) return fail("无权查看", 403);

  const idx = Number(params.idx);
  const rel = t.receiptFiles[idx];
  if (!rel) return fail("文件不存在", 404);

  const abs = path.resolve(process.cwd(), rel);
  try {
    const info = await stat(abs);
    if (!info.isFile()) return fail("文件不存在", 404);
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";

    const nodeStream = createReadStream(abs);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return fail("文件读取失败", 404);
  }
}
