"use client";

import { useCallback, useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { BackToListButton } from "@/components/back-to-list-button";
import {
  GRANT_STATUS_LABEL,
  GRANT_STATUS_TONE,
  TAX_EVENT_STATUS_LABEL,
  TAX_EVENT_STATUS_TONE,
  TAX_EVENT_TYPE_LABEL,
} from "@/lib/i18n";
import { RequestDialog } from "../_request-dialog";

interface GrantDetail {
  id: string;
  plan: { id: string; title: string; type: "RSU" | "OPTION"; jurisdiction: string };
  holdingEntity: { id: string; name: string } | null;
  grantDate: string;
  vestingStartDate: string | null;
  totalQuantity: string;
  strikePrice: string;
  agreementId: string | null;
  vestingYears: number;
  cliffMonths: number;
  vestingFrequency: "MONTHLY" | "YEARLY";
  exercisePeriodYears: number | null;
  exerciseDeadline: string | null;
  status: GrantStatus;
  operableShares: string;
  operableOptions: string;
  closedReason: string | null;
  exerciseWindowDeadline: string | null;
  exerciseWindowDays: number | null;
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
  }[];
  statusLogs: {
    id: string;
    fromStatus: string;
    toStatus: string;
    operatorName: string;
    legalDocument: string | null;
    timestamp: string;
    timestampDisplay: string;
  }[];
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

function isOptionExpired(d: GrantDetail): boolean {
  const list: number[] = [];
  if (d.exerciseDeadline) list.push(new Date(d.exerciseDeadline).getTime());
  if (d.exerciseWindowDeadline)
    list.push(new Date(d.exerciseWindowDeadline).getTime());
  if (list.length === 0) return false;
  return Date.now() > Math.min(...list);
}

export function EmployeeGrantDetailClient({ grantId }: { grantId: string }) {
  const [grant, setGrant] = useState<GrantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/employee/grants/${grantId}`);
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "加载失败");
      return;
    }
    setGrant(json.data);
  }, [grantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!grant) return <div className="text-sm text-muted-foreground">加载中...</div>;

  const isOption = grant.plan.type === "OPTION";
  const hasShares = Number(grant.operableShares) > 0;
  const hasOpts = Number(grant.operableOptions) > 0;
  const expired = isOption && isOptionExpired(grant);
  const canApply =
    grant.status !== "ALL_SETTLED" &&
    (grant.status === "CLOSED"
      ? hasShares
      : expired
        ? hasShares
        : hasShares || hasOpts);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <BackToListButton />
          <h1 className="min-w-0 max-w-full break-words text-xl font-semibold">
            {grant.plan.title}
          </h1>
          <StatusBadge tone={GRANT_STATUS_TONE[grant.status]}>
            {GRANT_STATUS_LABEL[grant.status]}
          </StatusBadge>
        </div>
        {canApply && (
          <Button onClick={() => setRequestOpen(true)}>申请</Button>
        )}
      </div>

      {/* ① 基本信息 */}
      <Section title="基本信息">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="权利 ID" value={grant.id} />
          <Field label="计划" value={grant.plan.title} />
          <Field label="激励类型" value={grant.plan.type} />
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
          {grant.status === "CLOSING" && grant.exerciseWindowDeadline && (
            <Field
              label="行权窗口截止日"
              value={new Date(
                grant.exerciseWindowDeadline
              ).toLocaleString("zh-CN")}
            />
          )}
          {grant.closedReason && (
            <Field label="关闭原因" value={grant.closedReason} />
          )}
        </div>
      </Section>

      {/* ② 归属计划 */}
      <Section title="归属计划">
        {grant.vestingRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未生成归属记录</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>归属日期</TableHead>
                <TableHead>归属数量</TableHead>
                {isOption && <TableHead>可行权期权</TableHead>}
                <TableHead>状态</TableHead>
                <TableHead>实际归属日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grant.vestingRecords.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    {new Date(v.vestingDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>{v.quantity}</TableCell>
                  {isOption && <TableCell>{v.exercisableOptions}</TableCell>}
                  <TableCell>{VESTING_STATUS_LABEL[v.status]}</TableCell>
                  <TableCell>
                    {v.actualVestDate
                      ? new Date(v.actualVestDate).toLocaleDateString("zh-CN")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {/* ④ 状态变更日志 */}
      <Section title="状态变更日志">
        {grant.statusLogs.length === 0 ? (
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
              {grant.statusLogs.map((l) => (
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
                <TableHead>审批备注</TableHead>
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
                  <TableCell>{r.approverNotes ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <RequestDialog
        grant={
          requestOpen
            ? {
                id: grant.id,
                planType: grant.plan.type,
                planTitle: grant.plan.title,
                operableShares: grant.operableShares,
                operableOptions: grant.operableOptions,
                optionsLocked: expired,
              }
            : null
        }
        onClose={() => setRequestOpen(false)}
        onSubmitted={load}
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
