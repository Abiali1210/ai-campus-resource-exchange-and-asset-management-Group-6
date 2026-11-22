import type { AuditEvent, Profile } from "./types";
import type { Transfer, WorkflowWorkspace } from "./workflows";
import type { ResourceRequest } from "./workflows";

// Plain-language names for audit event codes, shared by the asset record
// history and Requests and transfers → History. Never show the raw codes.
export const AUDIT_EVENT_LABELS: Readonly<Record<string, string>> = {
  "asset.saved": "Record saved",
  "asset.published": "Listing published",
  "asset.withdrawn": "Listing withdrawn",
  "request.submitted": "Request submitted",
  "interest.recorded": "Interest recorded",
  "reservation.approved": "Reservation approved",
  "reservation.rejected": "Reservation rejected",
  "transfer.approveRelease": "Release approved",
  "transfer.rejectRelease": "Release rejected",
  "transfer.schedule": "Pickup scheduled",
  "transfer.dispatch": "Dispatched",
  "transfer.receive": "Receipt recorded",
  "transfer.reconcile": "Dispute reconciled and accepted",
  "transfer.confirmReturn": "Supplier confirmed return",
  "transfer.cancelTransfer": "Transfer canceled before dispatch",
  "request.closeRequest": "Unmet need closed",
  "request.cancelRequest": "Request canceled",
};

// Known codes use the table above. An unknown code still reads as words,
// e.g. "asset.condition_assessed" -> "Asset condition assessed".
export function auditEventLabel(code: string | null | undefined): string {
  if (code && Object.hasOwn(AUDIT_EVENT_LABELS, code))
    return AUDIT_EVENT_LABELS[code];
  const words = String(code ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Recorded change";
}

// Who made the change, by display name. Never shows a user ID.
export function auditActorLabel(
  event: Pick<AuditEvent, "actorId" | "actorName">,
): string {
  const name = event.actorName?.trim();
  if (name) return name;
  return event.actorId ? "Unknown user" : "System";
}

export function groupRequests(requests: ResourceRequest[]): {
  open: ResourceRequest[];
  completed: ResourceRequest[];
} {
  return requests.reduce(
    (groups, request) => {
      if (["Closed", "Canceled", "Fulfilled"].includes(request.status))
        groups.completed.push(request);
      else groups.open.push(request);
      return groups;
    },
    { open: [], completed: [] } as {
      open: ResourceRequest[];
      completed: ResourceRequest[];
    },
  );
}

export type TransferAction =
  | "approveRelease"
  | "rejectRelease"
  | "schedule"
  | "dispatch"
  | "receive"
  | "reconcile"
  | "confirmReturn"
  | "cancelTransfer";
export type TransferActionOption = [TransferAction, string];

export function transferActions(
  t: Transfer,
  w: WorkflowWorkspace,
  profile: Profile,
): TransferActionOption[] {
  const rep = profile.roles.includes("representative"),
    supplier = rep && profile.departmentId === t.supplierDepartmentId;
  const receiver = rep && profile.departmentId === t.receiverDepartmentId;
  const i = w.interests.find((i) => i.interestId === t.interestId),
    q = w.requests.find((q) => q.requestId === t.requestId);
  const self =
    profile.userId === i?.createdBy || profile.userId === q?.requesterId;
  const assigned =
    profile.roles.includes("facilities") && profile.userId === t.facilitiesId;
  const actions: TransferActionOption[] = [];
  if (supplier && !self && t.state === "Pending Approval")
    actions.push(
      ["approveRelease", "Approve release"],
      ["rejectRelease", "Reject release"],
    );
  if (assigned && ["Approved", "Scheduled"].includes(t.state))
    actions.push(["schedule", "Schedule pickup"]);
  if (assigned && t.state === "Scheduled")
    actions.push(["dispatch", "Record dispatch"]);
  if (receiver && t.state === "In Transit")
    actions.push(["receive", "Record receipt"]);
  if (receiver && t.state === "Disputed")
    actions.push(["reconcile", "Accept reconciled receipt"]);
  if (supplier && t.state === "Disputed")
    actions.push(["confirmReturn", "Confirm physical return"]);
  if (
    (supplier || receiver || profile.userId === q?.requesterId) &&
    ["Pending Approval", "Approved", "Scheduled"].includes(t.state)
  )
    actions.push(["cancelTransfer", "Cancel before dispatch"]);
  return actions;
}

export type TransferGroups = {
  needsAction: Transfer[];
  inProgress: Transfer[];
  completed: Transfer[];
};
export function groupTransfers(
  transfers: Transfer[],
  w: WorkflowWorkspace,
  profile: Profile,
): TransferGroups {
  return transfers.reduce<TransferGroups>(
    (groups, transfer) => {
      if (["Completed", "Canceled", "Returned"].includes(transfer.state))
        groups.completed.push(transfer);
      else if (
        transferActions(transfer, w, profile).some(
          ([action]) => action !== "cancelTransfer",
        )
      )
        groups.needsAction.push(transfer);
      else groups.inProgress.push(transfer);
      return groups;
    },
    { needsAction: [], inProgress: [], completed: [] },
  );
}
