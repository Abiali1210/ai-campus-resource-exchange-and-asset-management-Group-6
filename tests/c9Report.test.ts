import { describe, expect, it } from "vitest";
import {
  REQUEST_COLUMNS,
  TRANSFER_COLUMNS,
  csvCell,
  csvFileName,
  toCsv,
} from "../src/c9Report";
import type { C9RequestRow, C9TransferRow } from "../src/types";

const request: C9RequestRow = {
  requestId: "11111111-2222-3333-4444-555555555555",
  submittedAt: "2026-11-10T09:30:00+00:00",
  requesterName: "Sara Example",
  departmentName: "Science",
  categoryName: "Monitors",
  purpose: 'Lab displays, "urgent", two rooms',
  urgency: "High",
  requiredDate: "2026-12-01",
  requestedQty: 4,
  allocatedQty: 1,
  acceptedQty: 2,
  remainingQty: 1,
  status: "Partially Fulfilled",
};
const transfer: C9TransferRow = {
  transferId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  requestId: request.requestId,
  assetName: "Dell 24-inch monitor",
  qty: 2,
  supplierDepartmentName: "Engineering",
  receiverDepartmentName: "Science",
  state: "Completed",
  scheduledAt: "2026-11-11T08:00:00+00:00",
  dispatchedAt: "2026-11-11T08:15:00+00:00",
  receivedAt: null,
  lastActivityAt: "2026-11-11T08:15:00+00:00",
};

describe("C9 CSV export", () => {
  it("quotes commas, quotes and newlines per RFC 4180", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
  });

  it("neutralises spreadsheet formulas in text cells", () => {
    for (const bad of ["=HYPERLINK(1)", "+1", "-1+2", "@SUM(A1)", "\tx"])
      expect(csvCell(bad).startsWith(`"'`)).toBe(true);
    expect(csvCell(-3)).toBe("-3"); // real numbers are untouched
  });

  it("writes a header row and one CRLF-terminated line per row", () => {
    const csv = toCsv([request], REQUEST_COLUMNS);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("");
    expect(lines[0]).toBe(
      "Request,Submitted,Requester,Department,Category,Purpose,Urgency,Required by,Requested,Allocated,Accepted,Remaining,Status",
    );
    expect(lines[1]).toBe(
      '11111111,2026-11-10 09:30,Sara Example,Science,Monitors,"Lab displays, ""urgent"", two rooms",High,2026-12-01,4,1,2,1,Partially Fulfilled',
    );
  });

  it("leaves missing transfer dates blank and keeps every column", () => {
    const [header, row] = toCsv([transfer], TRANSFER_COLUMNS).split("\r\n");
    expect(header.split(",")).toHaveLength(TRANSFER_COLUMNS.length);
    expect(row).toBe(
      "aaaaaaaa,11111111,Dell 24-inch monitor,2,Engineering,Science,Completed,2026-11-11 08:00,2026-11-11 08:15,",
    );
  });

  it("exports only a header for an empty table", () => {
    expect(toCsv([], TRANSFER_COLUMNS).split("\r\n")).toHaveLength(2);
  });

  it("names files by kind and period", () => {
    expect(csvFileName("transfers", "2026-11-01", "2026-11-17")).toBe(
      "campus-transfers-2026-11-01-to-2026-11-17.csv",
    );
  });
});
