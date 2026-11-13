import { describe, expect, it } from "vitest";
import type { Profile } from "../src/types";
import type {
  ResourceRequest,
  Transfer,
  WorkflowWorkspace,
} from "../src/workflows";
import {
  groupRequests,
  groupTransfers,
  transferActions,
} from "../src/workflowPresentation";

const profile = (
  userId: string,
  roles: Profile["roles"],
  departmentId = "dept-a",
): Profile => ({
  userId,
  name: userId,
  departmentId,
  active: true,
  roles,
});
const transfer = (
  state: string,
  id = state,
  facilitiesId: string | null = "staff",
): Transfer => ({
  transferId: id,
  reservationId: "reservation",
  requestId: "request",
  interestId: "interest",
  portionId: "portion",
  supplierDepartmentId: "dept-a",
  receiverDepartmentId: "dept-b",
  qty: 1,
  state,
  version: 1,
  facilitiesId,
  scheduledAt: null,
  arrangements: null,
  assetName: "Asset",
  assetId: "asset",
  ownerDepartmentId: "dept-a",
  custodianId: "staff",
  holderId: null,
  assignedLocation: "Room",
  physicalLocation: "Room",
  condition: "Good",
  allocationStatus: "Active",
  approvals: [],
  handovers: [],
  holders: [],
});
const workspace = (transfers: Transfer[]): WorkflowWorkspace => ({
  requests: [
    {
      requestId: "request",
      requesterId: "requester",
      departmentId: "dept-a",
      categoryId: "category",
      purpose: "Need",
      requestedQty: 1,
      acceptedQty: 0,
      allocatedQty: 0,
      remainingQty: 1,
      specifications: {},
      condition: "Good",
      urgency: "Normal",
      requiredDate: "2026-01-01",
      destination: "Room",
      status: "Open",
      version: 1,
      submittedAt: "",
    },
  ],
  interests: [
    {
      interestId: "interest",
      requestId: "request",
      portionId: "portion",
      createdBy: "creator",
      qty: 1,
      status: "Pending",
      version: 1,
      supplierDepartmentId: "dept-a",
      assetName: "Asset",
      assetId: "asset",
      submittedAt: "",
      currentAvailable: true,
    },
  ],
  transfers,
  decisions: [],
  facilities: [],
  history: [],
});

describe("transfer presentation grouping", () => {
  it("matches supplier stage actions and suppresses the interest creator", () => {
    const t = transfer("Pending Approval"),
      w = workspace([t]);
    expect(
      transferActions(t, w, profile("supplier", ["representative"])).map(
        ([a]) => a,
      ),
    ).toContain("approveRelease");
    expect(
      transferActions(t, w, profile("creator", ["representative"])).map(
        ([a]) => a,
      ),
    ).not.toContain("approveRelease");
  });
  it("requires receiver role for receipt and assigned Facilities for scheduling", () => {
    const inTransit = transfer("In Transit"),
      approved = transfer("Approved"),
      w = workspace([inTransit, approved]);
    expect(
      transferActions(
        inTransit,
        w,
        profile("receiver", ["representative"], "dept-b"),
      ).map(([a]) => a),
    ).toContain("receive");
    expect(
      transferActions(
        inTransit,
        w,
        profile("other", ["representative"], "dept-a"),
      ).map(([a]) => a),
    ).not.toContain("receive");
    expect(
      transferActions(approved, w, profile("staff", ["facilities"])).map(
        ([a]) => a,
      ),
    ).toContain("schedule");
    expect(
      transferActions(approved, w, profile("other", ["facilities"])).map(
        ([a]) => a,
      ),
    ).not.toContain("schedule");
  });
  it("partitions each transfer once, excludes cancellation-only attention, and includes all terminals", () => {
    const items = [
      transfer("Pending Approval", "self"),
      transfer("Pending Approval", "supplier"),
      transfer("Approved", "cancel-only", null),
      transfer("Completed"),
      transfer("Canceled"),
      transfer("Returned"),
    ];
    const w = workspace(items);
    w.requests[0]!.requesterId = "someone-else";
    w.interests[0]!.createdBy = "requester";
    w.interests.push({
      ...w.interests[0]!,
      interestId: "supplier-interest",
      createdBy: "another-user",
    });
    items.find((t) => t.transferId === "supplier")!.interestId =
      "supplier-interest";
    const groups = groupTransfers(
      items,
      w,
      profile("requester", ["requester", "representative"]),
    );
    expect(groups.needsAction.map((t) => t.transferId)).toEqual(["supplier"]);
    expect(groups.inProgress.map((t) => t.transferId)).toEqual([
      "self",
      "cancel-only",
    ]);
    expect(groups.completed.map((t) => t.state)).toEqual([
      "Completed",
      "Canceled",
      "Returned",
    ]);
    const ids = [
      ...groups.needsAction,
      ...groups.inProgress,
      ...groups.completed,
    ].map((t) => t.transferId);
    expect(ids).toHaveLength(items.length);
    expect(new Set(ids).size).toBe(items.length);
  });
});

const request = (status: string, id: string): ResourceRequest => ({
  requestId: id,
  requesterId: "requester",
  departmentId: "dept-a",
  categoryId: "category",
  purpose: id,
  requestedQty: 1,
  acceptedQty: 0,
  allocatedQty: 0,
  remainingQty: 1,
  specifications: {},
  condition: "Good",
  urgency: "Normal",
  requiredDate: "2026-01-01",
  destination: "Room",
  status,
  version: 1,
  submittedAt: "",
});

describe("request presentation grouping", () => {
  it("stably partitions mixed requests", () => {
    const groups = groupRequests([
      request("Open", "open-1"),
      request("Closed", "closed"),
      request("In Progress", "open-2"),
      request("Fulfilled", "fulfilled"),
      request("Canceled", "canceled"),
    ]);
    expect(groups.open.map((item) => item.requestId)).toEqual([
      "open-1",
      "open-2",
    ]);
    expect(groups.completed.map((item) => item.requestId)).toEqual([
      "closed",
      "fulfilled",
      "canceled",
    ]);
  });

  it("handles empty and all-terminal requests", () => {
    expect(groupRequests([])).toEqual({ open: [], completed: [] });
    const groups = groupRequests([
      request("Closed", "closed"),
      request("Canceled", "canceled"),
      request("Fulfilled", "fulfilled"),
    ]);
    expect(groups.open).toEqual([]);
    expect(groups.completed.map((item) => item.requestId)).toEqual([
      "closed",
      "canceled",
      "fulfilled",
    ]);
  });
});
