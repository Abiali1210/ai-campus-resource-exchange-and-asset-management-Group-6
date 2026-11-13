import type { Profile } from "./types";
import type { Transfer, WorkflowWorkspace } from "./workflows";
import type { ResourceRequest } from "./workflows";

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
