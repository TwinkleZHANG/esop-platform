import { TaxEventStatus } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requireSession,
} from "@/lib/api-utils";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 3;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);

function resolveUploadDir() {
  const base = process.env.UPLOAD_DIR ?? "./uploads";
  return path.resolve(process.cwd(), base);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;
  // 任意登录用户均可对自己的税务事件上传凭证（管理员切到员工视图同样适用）；
  // 通过下面 t.userId === session.user.id 防越权。

  const t = await prisma.taxEvent.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, status: true, receiptFiles: true },
  });
  if (!t) return fail("税务事件不存在", 404);
  if (t.userId !== session.user.id) return fail("无权操作", 403);
  if (t.status === TaxEventStatus.CONFIRMED) {
    return fail("已确定的税务事件不可上传凭证");
  }

  const form = await req.formData().catch(() => null);
  if (!form) return fail("表单解析失败");

  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) return fail("未选择文件");
  if (files.length > MAX_FILES) return fail(`最多上传 ${MAX_FILES} 个文件`);
  const notesField = form.get("notes");
  const notes = typeof notesField === "string" ? notesField.trim() : "";

  for (const f of files) {
    if (!ALLOWED_MIME.has(f.type)) {
      return fail(`不支持的文件类型：${f.type}（仅 JPG/PNG/PDF）`);
    }
    if (f.size > MAX_FILE_BYTES) {
      return fail(`${f.name} 超过 10MB`);
    }
  }

  const uploadDir = resolveUploadDir();
  const eventDir = path.join(uploadDir, t.id);
  await fs.mkdir(eventDir, { recursive: true });

  // 替换式上传：删除旧文件，落盘新文件
  for (const rel of t.receiptFiles) {
    try {
      await fs.unlink(path.resolve(process.cwd(), rel));
    } catch {
      // 忽略：可能已被手动清理
    }
  }

  const savedPaths: string[] = [];
  for (const f of files) {
    const ext = path.extname(f.name) || "";
    const safeName = `${randomUUID()}${ext}`;
    const abs = path.join(eventDir, safeName);
    const buffer = Buffer.from(await f.arrayBuffer());
    await fs.writeFile(abs, buffer);
    savedPaths.push(path.relative(process.cwd(), abs));
  }

  const updated = await prisma.taxEvent.update({
    where: { id: t.id },
    data: {
      receiptFiles: savedPaths,
      status: TaxEventStatus.RECEIPT_UPLOADED,
      ...(notes ? { employeeNotes: notes } : {}),
    },
    select: { id: true, status: true, receiptFiles: true, employeeNotes: true },
  });

  return ok(updated);
}
