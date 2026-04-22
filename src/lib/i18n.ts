import { Jurisdiction } from "@prisma/client";

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
