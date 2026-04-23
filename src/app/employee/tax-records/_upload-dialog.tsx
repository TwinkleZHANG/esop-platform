"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Target {
  id: string;
  planTitle: string;
  operationType: string;
  existingNotes: string | null;
}

interface Props {
  target: Target | null;
  onClose: () => void;
  onUploaded: () => Promise<void>;
}

const MAX_FILES = 3;
const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,application/pdf";

export function UploadDialog({ target, onClose, onUploaded }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (target) {
      setFiles([]);
      setNotes(target.existingNotes ?? "");
      setError(null);
    }
  }, [target]);

  function onPick(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    if (picked.length > MAX_FILES) {
      setError(`最多上传 ${MAX_FILES} 个文件`);
      return;
    }
    for (const f of picked) {
      if (f.size > MAX_SIZE) {
        setError(`${f.name} 超过 10MB`);
        return;
      }
      if (!["image/jpeg", "image/png", "application/pdf"].includes(f.type)) {
        setError(`${f.name} 格式不支持（仅 JPG/PNG/PDF）`);
        return;
      }
    }
    setError(null);
    setFiles(picked);
  }

  async function submit() {
    if (!target) return;
    if (files.length === 0) return setError("请选择文件");
    setBusy(true);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (notes.trim()) fd.append("notes", notes.trim());
    const res = await fetch(`/api/tax-events/${target.id}/upload`, {
      method: "POST",
      body: fd,
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "上传失败");
      return;
    }
    await onUploaded();
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>上传转账回单</DialogTitle>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
              {target.planTitle} · {target.operationType}
            </div>

            <div className="space-y-1">
              <Label>凭证文件 *（JPG/PNG/PDF，单文件 ≤10MB，最多 3 个）</Label>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                onChange={(e) => onPick(e.target.files)}
                className="block w-full text-sm"
              />
              {files.length > 0 && (
                <ul className="mt-1 text-xs text-muted-foreground">
                  {files.map((f) => (
                    <li key={f.name}>
                      {f.name} · {(f.size / 1024).toFixed(0)} KB
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                上传会替换已有凭证；「已确定」后不可再上传。
              </p>
            </div>

            <div className="space-y-1">
              <Label>备注</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="（选填）"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy || files.length === 0}>
            {busy ? "上传中..." : "上传"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
