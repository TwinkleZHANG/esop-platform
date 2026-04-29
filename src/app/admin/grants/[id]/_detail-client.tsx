"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type {
  GrantStatus,
  OperationRequestStatus,
  OperationRequestType,
  OperationTarget,
  TaxEventStatus,
  TaxEventType,
  VestingRecordStatus,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BackToListButton } from "@/components/back-to-list-button";
import {
  TAX_EVENT_STATUS_LABEL,
  TAX_EVENT_STATUS_TONE,
  TAX_EVENT_TYPE_LABEL,
} from "@/lib/i18n";
import { TaxEventDetailDialog } from "@/app/admin/tax-events/_components/tax-event-detail-dialog";
import { EditDraftDialog } from "./_edit-draft-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { hasPermission } from "@/lib/permissions";
import {
  GRANT_STATUS_LABEL,
  GRANT_STATUS_TONE,
} from "@/lib/i18n";

interface GrantDetail {
  id: string;
  plan: { id: string; title: string; type: "RSU" | "OPTION"; jurisdiction: string };
  user: { id: string; name: string; employeeId: string; email: string };
  holdingEntity: { id: string; name: string } | null;
  grantDate: string;
  vestingStartDate: string | null;
  totalQuantity: string;
  strikePrice: string;
  agreementId: string | null;
  vestingYears: number;
  cliffMonths: number;
  vestingFrequency: "MONTHLY" | "YEARLY";
  status: GrantStatus;
  operableShares: string;
  operableOptions: string;
  closedReason: string | null;
  exerciseWindowDeadline: string | null;
  exerciseWindowDays: number | null;
  exercisePeriodYears: number | null;
  exerciseDeadline: string | null;
  vestingRecords: {
    id: string;
    vestingDate: string;
    quantity: string;
    exercisableOptions: string;
    status: VestingRecordStatus;
    actualVestDate: string | null;
  }[];
  taxEvents: {
    id: string;
    eventType: TaxEventType;
    operationType: string;
    quantity: string;
    eventDate: string;
    fmvAtEvent: string;
    status: TaxEventStatus;
  }[];
  operationRequests: {
    id: string;
    requestType: OperationRequestType;
    requestTarget: OperationTarget | null;
    quantity: string;
    status: OperationRequestStatus;
    submitDate: string;
    approveDate: string | null;
    approverNotes: string | null;
    approver: { id: string; name: string } | null;
  }[];
  statusLogs: {
    id: string;
    fromStatus: string;
    toStatus: string;
    operatorName: string;
    legalDocument: string | null;
    timestamp: string;
  }[];
}

interface LogEntry {
  id: string;
  fromStatus: string;
  toStatus: string;
  operatorName: string;
  legalDocument: string | null;
  timestamp: string;
  timestampDisplay: string;
}

const REQUEST_TYPE_LABEL: Record<OperationRequestType, string> = {
  EXERCISE: "行权",
  TRANSFER: "转让",
  SELL: "售出",
  BUYBACK: "回购",
  REDEEM: "兑现",
};

const REQUEST_TARGET_LABEL: Record<OperationTarget, string> = {
  SHARES: "实股",
  OPTIONS: "期权",
};

const VESTING_STATUS_LABEL: Record<VestingRecordStatus, string> = {
  PENDING: "待归属",
  VESTED: "已归属",
  PARTIALLY_SETTLED: "部分行权",
  SETTLED: "已交割",
  CLOSED: "已关闭",
};

export function GrantDetailClient({ grantId }: { grantId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const sessionUserId = session?.user?.id;
  const canEdit = hasPermission(role, "grant.create");
  const canAdvance = hasPermission(role, "grant.advance");
  const canClose = hasPermission(role, "grant.close");
  const canApprove = hasPermission(role, "operationRequest.approve");

  const [grant, setGrant] = useState<GrantDetail | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<
    GrantDetail["operationRequests"][number] | null
  >(null);
  const [taxEventId, setTaxEventId] = useState<string | null>(null);
  const [vestingPage, setVestingPage] = useState(1);
  const VESTING_PAGE_SIZE = 15;

  const load = useCallback(async () => {
    const [g, l] = await Promise.all([
      fetch(`/api/grants/${grantId}`).then((r) => r.json()),
      fetch(`/api/grants/${grantId}/logs`).then((r) => r.json()),
    ]);
    if (!g.success) {
      setError(g.error ?? "加载失败");
      return;
    }
    setGrant(g.data);
    if (l.success) setLogs(l.data);
  }, [grantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!grant) return <div className="text-sm text-muted-foreground">加载中...</div>;

  const isDraft = grant.status === "DRAFT";
  const isOption = grant.plan.type === "OPTION";
  const isClosing = grant.status === "CLOSING";
  const isClosed = grant.status === "CLOSED";
  // Maker-Checker：不能审批自己的授予/申请
  const isSelfGrant = !!sessionUserId && sessionUserId === grant.user.id;

  const daysRemaining = (() => {
    if (!isClosing || !grant.exerciseWindowDeadline) return null;
    const dl = new Date(grant.exerciseWindowDeadline).getTime();
    const diff = dl - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  })();

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <BackToListButton />
          <h1 className="min-w-0 max-w-full break-words text-xl font-semibold">
            {grant.user.name} · {grant.plan.title}
          </h1>
          <StatusBadge tone={GRANT_STATUS_TONE[grant.status]}>
            {GRANT_STATUS_LABEL[grant.status]}
          </StatusBadge>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && isDraft && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
          )}
          {canAdvance && isDraft && !isSelfGrant && (
            <Button onClick={() => setAdvanceOpen(true)}>推进到已授予</Button>
          )}
          {canAdvance && isDraft && isSelfGrant && (
            <span className="text-sm text-muted-foreground">
              不能审批自己的记录
            </span>
          )}
          {canClose && !isClosed && grant.status !== "CLOSING" && (
            <Button variant="outline" onClick={() => setCloseOpen(true)}>
              关闭授予
            </Button>
          )}
        </div>
      </div>

      {/* ① 授予信息 */}
      <Section title="授予信息">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="权利 ID" value={grant.id} />
          <Field label="计划" value={grant.plan.title} />
          <Field label="激励类型" value={grant.plan.type} />
          <Field label="员工" value={`${grant.user.name}（${grant.user.employeeId}）`} />
          <Field
            label="持股主体"
            value={grant.holdingEntity?.name ?? "-"}
          />
          <Field
            label="授予日期"
            value={new Date(grant.grantDate).toLocaleDateString("zh-CN")}
          />
          <Field
            label="授予计划开始日期"
            value={
              grant.vestingStartDate
                ? new Date(grant.vestingStartDate).toLocaleDateString("zh-CN")
                : "-"
            }
          />
          <Field label="授予数量" value={grant.totalQuantity} />
          <Field
            label="行权价"
            value={isOption ? grant.strikePrice : "（RSU）0"}
          />
          <Field label="协议 ID" value={grant.agreementId ?? "-"} />
          <Field label="归属年限" value={`${grant.vestingYears} 年`} />
          <Field label="悬崖期" value={`${grant.cliffMonths} 月`} />
          <Field
            label="归属频率"
            value={grant.vestingFrequency === "MONTHLY" ? "按月" : "按年"}
          />
          {isOption && (
            <>
              <Field
                label="行权期"
                value={
                  grant.exercisePeriodYears
                    ? `${grant.exercisePeriodYears} 年`
                    : "-"
                }
              />
              <Field
                label="行权截止日"
                value={
                  grant.exerciseDeadline
                    ? new Date(grant.exerciseDeadline).toLocaleDateString(
                        "zh-CN"
                      )
                    : "-"
                }
              />
            </>
          )}
          <Field label="可操作股数" value={grant.operableShares} />
          <Field
            label="可操作期权"
            value={isOption ? grant.operableOptions : "-"}
          />
          {isClosing && (
            <>
              <Field
                label="行权窗口截止日"
                value={
                  grant.exerciseWindowDeadline
                    ? new Date(
                        grant.exerciseWindowDeadline
                      ).toLocaleString("zh-CN")
                    : "-"
                }
              />
              <Field
                label="剩余天数"
                value={daysRemaining !== null ? `${daysRemaining} 天` : "-"}
              />
            </>
          )}
          {grant.closedReason && (
            <Field label="关闭原因" value={grant.closedReason} />
          )}
        </div>
      </Section>

      {/* ② 归属计划 */}
      <Section title="归属计划">
        {grant.vestingRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Draft 阶段无归属记录；进入 Granted 状态后自动生成。
          </p>
        ) : (
          (() => {
            const total = grant.vestingRecords.length;
            const totalPages = Math.max(
              1,
              Math.ceil(total / VESTING_PAGE_SIZE)
            );
            const currentPage = Math.min(vestingPage, totalPages);
            const start = (currentPage - 1) * VESTING_PAGE_SIZE;
            const paged = grant.vestingRecords.slice(
              start,
              start + VESTING_PAGE_SIZE
            );
            return (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>归属日期</TableHead>
                      <TableHead>归属数量</TableHead>
                      <TableHead>可操作股数</TableHead>
                      {isOption && <TableHead>可行权期权</TableHead>}
                      <TableHead>状态</TableHead>
                      <TableHead>实际归属日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          {new Date(v.vestingDate).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell>{v.quantity}</TableCell>
                        <TableCell>{grant.operableShares}</TableCell>
                        {isOption && (
                          <TableCell>{v.exercisableOptions}</TableCell>
                        )}
                        <TableCell>{VESTING_STATUS_LABEL[v.status]}</TableCell>
                        <TableCell>
                          {v.actualVestDate
                            ? new Date(v.actualVestDate).toLocaleDateString(
                                "zh-CN"
                              )
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {total > VESTING_PAGE_SIZE && (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      共 {total} 条 · 第 {start + 1}-
                      {Math.min(start + VESTING_PAGE_SIZE, total)} 条
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setVestingPage(currentPage - 1)}
                      >
                        上一页
                      </Button>
                      <span>
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setVestingPage(currentPage + 1)}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()
        )}
      </Section>

      {/* ③ 税务事件 */}
      <Section title="税务事件">
        {grant.taxEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无税务事件</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>税务类型</TableHead>
                <TableHead>具体操作</TableHead>
                <TableHead>数量</TableHead>
                <TableHead>FMV</TableHead>
                <TableHead>事件日期</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grant.taxEvents.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{TAX_EVENT_TYPE_LABEL[t.eventType]}</TableCell>
                  <TableCell>{t.operationType}</TableCell>
                  <TableCell>{t.quantity}</TableCell>
                  <TableCell>{t.fmvAtEvent}</TableCell>
                  <TableCell>
                    {new Date(t.eventDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={TAX_EVENT_STATUS_TONE[t.status]}>
                      {TAX_EVENT_STATUS_LABEL[t.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTaxEventId(t.id)}
                    >
                      查看
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {/* ④ 状态变更日志 */}
      <Section title="状态变更日志">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无状态变更记录</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>变更前状态</TableHead>
                <TableHead>变更后状态</TableHead>
                <TableHead>操作人</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.timestampDisplay}</TableCell>
                  <TableCell>{l.fromStatus}</TableCell>
                  <TableCell>{l.toStatus}</TableCell>
                  <TableCell>{l.operatorName}</TableCell>
                  <TableCell>{l.legalDocument ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {/* ⑤ 申请记录 */}
      <Section title="申请记录">
        {grant.operationRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无申请</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>目标</TableHead>
                <TableHead>数量</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>操作人</TableHead>
                <TableHead>审批备注</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grant.operationRequests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{REQUEST_TYPE_LABEL[r.requestType]}</TableCell>
                  <TableCell>
                    {r.requestTarget
                      ? REQUEST_TARGET_LABEL[r.requestTarget]
                      : "-"}
                  </TableCell>
                  <TableCell>{r.quantity}</TableCell>
                  <TableCell>
                    {new Date(r.submitDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>
                    {r.status === "PENDING"
                      ? "-"
                      : r.approver?.name ?? "-"}
                  </TableCell>
                  <TableCell>{r.approverNotes ?? "-"}</TableCell>
                  <TableCell>
                    {canApprove && r.status === "PENDING" && !isSelfGrant && (
                      <Button size="sm" onClick={() => setApprovalTarget(r)}>
                        审批
                      </Button>
                    )}
                    {canApprove && r.status === "PENDING" && isSelfGrant && (
                      <span className="text-xs text-muted-foreground">
                        不能审批自己的记录
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <EditDraftDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        grantId={grantId}
        initial={grant}
        onDone={load}
      />
      <AdvanceDialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        grantId={grantId}
        initialAgreement={grant.agreementId ?? ""}
        onDone={load}
      />
      <CloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        grantId={grantId}
        planType={grant.plan.type}
        operableOptions={grant.operableOptions}
        onDone={load}
      />
      <ApprovalDialog
        target={approvalTarget}
        onClose={() => setApprovalTarget(null)}
        onDone={load}
      />
      <TaxEventDetailDialog
        taxEventId={taxEventId}
        onClose={() => setTaxEventId(null)}
        canConfirm={hasPermission(role, "taxEvent.confirm")}
        onConfirmed={load}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-background p-5 [&_table_td]:whitespace-nowrap [&_table_th]:whitespace-nowrap">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}

function AdvanceDialog({
  open,
  onOpenChange,
  grantId,
  initialAgreement,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grantId: string;
  initialAgreement: string;
  onDone: () => Promise<void>;
}) {
  const [agreementId, setAgreementId] = useState(initialAgreement);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAgreementId(initialAgreement);
      setError(null);
    }
  }, [open, initialAgreement]);

  async function submit() {
    setError(null);
    if (!agreementId.trim()) return setError("协议 ID 必填");
    setBusy(true);
    const res = await fetch(`/api/grants/${grantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "GRANTED", agreementId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "推进失败");
      return;
    }
    await onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>推进到「已授予」</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            推进后系统自动生成归属记录，后续不可再编辑授予详情。
          </p>
          <div className="space-y-1">
            <Label>协议 ID *</Label>
            <Input
              value={agreementId}
              onChange={(e) => setAgreementId(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "处理中..." : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({
  open,
  onOpenChange,
  grantId,
  planType,
  operableOptions,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grantId: string;
  planType: "RSU" | "OPTION";
  operableOptions: string;
  onDone: () => Promise<void>;
}) {
  // 正常关闭（非离职）：Option 不设窗口期；员工继续按原行权期行权
  const goesClosing = planType === "OPTION" && Number(operableOptions) > 0;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    setError(null);
    if (!reason.trim()) return setError("关闭原因必填");
    setBusy(true);
    const res = await fetch(`/api/grants/${grantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: goesClosing ? "CLOSING" : "CLOSED",
        closedReason: reason,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "关闭失败");
      return;
    }
    await onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{goesClosing ? "关闭授予（进入 Closing）" : "关闭授予"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            关闭后所有 PENDING 归属记录将变为 CLOSED，后续不可撤销。
            {goesClosing &&
              " 员工仍可在原行权期截止日前行使已归属期权。"}
          </p>
          <div className="space-y-1">
            <Label>关闭原因 *</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "处理中..." : "确认关闭"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalDialog({
  target,
  onClose,
  onDone,
}: {
  target: GrantDetail["operationRequests"][number] | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setNotes("");
      setError(null);
    }
  }, [target]);

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!target) return;
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/operations/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, approverNotes: notes || null }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "操作失败");
      return;
    }
    await onDone();
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>审批申请</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border bg-muted px-3 py-2">
              {REQUEST_TYPE_LABEL[target.requestType]}
              {target.requestTarget && ` · ${REQUEST_TARGET_LABEL[target.requestTarget]}`}
              {" · "}数量 {target.quantity}
            </div>
            <div className="space-y-1">
              <Label>审批备注</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={() => decide("REJECT")}
            disabled={busy}
          >
            驳回
          </Button>
          <Button onClick={() => decide("APPROVE")} disabled={busy}>
            {busy ? "处理中..." : "通过"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
