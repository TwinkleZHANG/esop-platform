import { GrantStatus, Jurisdiction } from "@prisma/client";
import type { StatusTone } from "@/components/status-badge";

export const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  MAINLAND: "内地",
  HONGKONG: "香港",
  OVERSEAS: "海外",
};

export const JURISDICTION_OPTIONS: { value: Jurisdiction; label: string }[] = [
  { value: "MAINLAND", label: "内地" },
  { value: "HONGKONG", label: "香港" },
  { value: "OVERSEAS", label: "海外" },
];

export const GRANT_STATUS_LABEL: Record<GrantStatus, string> = {
  DRAFT: "草稿",
  GRANTED: "已授予",
  VESTING: "归属中",
  FULLY_VESTED: "全部归属",
  STILL_EXERCISABLE: "仍可行权",
  ALL_SETTLED: "全部交割",
  CLOSING: "关闭中",
  CLOSED: "已关闭",
};

/** 状态 → 徽标色调（PRD 9.2） */
export const GRANT_STATUS_TONE: Record<GrantStatus, StatusTone> = {
  DRAFT: "muted",
  GRANTED: "progress",
  VESTING: "progress",
  FULLY_VESTED: "progress",
  STILL_EXERCISABLE: "progress",
  ALL_SETTLED: "success",
  CLOSING: "closing",
  CLOSED: "danger",
};

export const GRANT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "全部" },
  ...(Object.entries(GRANT_STATUS_LABEL) as [GrantStatus, string][]).map(
    ([v, l]) => ({ value: v, label: l })
  ),
];
