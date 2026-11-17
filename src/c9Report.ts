// C9 basic report: column definitions and CSV export.
// Pure functions only, so the export format is unit-tested without a browser.
import type { C9RequestRow, C9TransferRow } from "./types";

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const date = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
const dateTime = (iso?: string | null) =>
  iso ? iso.slice(0, 16).replace("T", " ") : "";
const shortId = (id: string) => id.slice(0, 8);

export const REQUEST_COLUMNS: Column<C9RequestRow>[] = [
  { header: "Request", value: (r) => shortId(r.requestId) },
  { header: "Submitted", value: (r) => dateTime(r.submittedAt) },
  { header: "Requester", value: (r) => r.requesterName },
  { header: "Department", value: (r) => r.departmentName },
  { header: "Category", value: (r) => r.categoryName },
  { header: "Purpose", value: (r) => r.purpose },
  { header: "Urgency", value: (r) => r.urgency },
  { header: "Required by", value: (r) => date(r.requiredDate) },
  { header: "Requested", value: (r) => r.requestedQty },
  { header: "Allocated", value: (r) => r.allocatedQty },
  { header: "Accepted", value: (r) => r.acceptedQty },
  { header: "Remaining", value: (r) => r.remainingQty },
  { header: "Status", value: (r) => r.status },
];

export const TRANSFER_COLUMNS: Column<C9TransferRow>[] = [
  { header: "Transfer", value: (t) => shortId(t.transferId) },
  { header: "Request", value: (t) => shortId(t.requestId) },
  { header: "Asset", value: (t) => t.assetName },
  { header: "Qty", value: (t) => t.qty },
  { header: "From", value: (t) => t.supplierDepartmentName },
  { header: "To", value: (t) => t.receiverDepartmentName },
  { header: "State", value: (t) => t.state },
  { header: "Scheduled", value: (t) => dateTime(t.scheduledAt) },
  { header: "Dispatched", value: (t) => dateTime(t.dispatchedAt) },
  { header: "Received", value: (t) => dateTime(t.receivedAt) },
];

// RFC 4180 quoting, plus a guard against spreadsheet formula injection: a text cell
// starting with = + - @ (or tab/CR) is prefixed with ' so Excel/Sheets treat it as
// text. Numbers are written as-is.
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) || s !== value ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows)
    lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  return lines.join("\r\n") + "\r\n";
}

export const csvFileName = (
  kind: "requests" | "transfers",
  start: string,
  end: string,
) => `campus-${kind}-${start}-to-${end}.csv`;

// Browser-only: hands the CSV to the user as a download. The BOM makes Excel read UTF-8.
export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
