import { FoundationService } from "./api";
import { ValidationError } from "./domain";
import type { AuditEvent } from "./types";

export interface ResourceRequest {
  requestId: string;
  requesterId: string;
  departmentId: string;
  categoryId: string;
  purpose: string;
  requestedQty: number;
  acceptedQty: number;
  allocatedQty: number;
  remainingQty: number;
  specifications: Record<string, unknown>;
  condition: string;
  urgency: string;
  requiredDate: string;
  destination: string;
  status: string;
  version: number;
  submittedAt: string;
}
export interface Interest {
  interestId: string;
  requestId: string;
  portionId: string;
  createdBy: string;
  qty: number;
  status: string;
  version: number;
  supplierDepartmentId: string;
  assetName: string;
  assetId: string;
  submittedAt: string;
  currentAvailable: boolean;
}
export interface Approval {
  approval_id: string;
  actor_id: string;
  decision_type: string;
  decision: string;
  reason: string;
  decided_at: string;
  interest_id: string | null;
}
export interface Handover {
  handover_id: string;
  kind: string;
  qty: number;
  condition: string;
  accepted: boolean;
  recorded_by: string;
  holder_id: string;
  location: string;
  reason: string;
  recorded_at: string;
}
export interface Transfer {
  transferId: string;
  reservationId: string;
  requestId: string;
  interestId: string;
  portionId: string;
  supplierDepartmentId: string;
  receiverDepartmentId: string;
  qty: number;
  state: string;
  version: number;
  facilitiesId: string | null;
  scheduledAt: string | null;
  arrangements: string | null;
  handlingCost: number | null;
  transportCost: number | null;
  assetName: string;
  assetId: string;
  ownerDepartmentId: string;
  custodianId: string;
  holderId: string | null;
  assignedLocation: string;
  physicalLocation: string;
  condition: string;
  allocationStatus: string;
  approvals: Approval[];
  handovers: Handover[];
  holders: { userId: string; name: string }[];
}
export interface WorkflowWorkspace {
  requests: ResourceRequest[];
  interests: Interest[];
  transfers: Transfer[];
  decisions: Approval[];
  facilities: { userId: string; name: string }[];
  history: AuditEvent[];
}
export type WorkflowAction =
  | "submitRequest"
  | "recordInterest"
  | "approveReservation"
  | "rejectReservation"
  | "approveRelease"
  | "rejectRelease"
  | "schedule"
  | "dispatch"
  | "receive"
  | "reconcile"
  | "confirmReturn"
  | "cancelTransfer"
  | "closeRequest"
  | "cancelRequest";
export interface WorkflowCommand {
  action: WorkflowAction;
  [key: string]: unknown;
}
export interface WorkflowResult {
  requestId?: string;
  interestId?: string;
  transferId?: string;
  version: number;
}

// Preserve this operation across an uncertain network response. A fresh key is
// created only when the user changes the command or the prior command succeeds.
export class WorkflowOperation {
  readonly payload: WorkflowCommand & { operationKey: string };
  readonly fingerprint: string;
  constructor(command: WorkflowCommand, key = crypto.randomUUID()) {
    this.fingerprint = JSON.stringify(command);
    this.payload = Object.freeze({
      ...JSON.parse(this.fingerprint),
      operationKey: key,
    });
  }
  matches(command: WorkflowCommand) {
    return JSON.stringify(command) === this.fingerprint;
  }
}
export function validateRequest(command: WorkflowCommand): void {
  const fields: Record<string, string> = {};
  if (!String(command.purpose ?? "").trim())
    fields.purpose = "Describe the purpose.";
  if (!Number.isInteger(command.qty) || Number(command.qty) <= 0)
    fields.qty = "Enter a positive whole quantity.";
  if (!command.categoryId) fields.categoryId = "Choose a category.";
  if (!String(command.destination ?? "").trim())
    fields.destination = "Enter the receiving location.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(command.requiredDate ?? "")))
    fields.requiredDate = "Enter the required date.";
  if (Object.keys(fields).length) throw new ValidationError(fields);
}
export function nextTransferAction(state: string): string {
  return (
    (
      {
        "Pending Approval": "Supplier representative: decide release",
        Approved: "Assigned Facilities: schedule pickup",
        Scheduled: "Assigned Facilities: record dispatch",
        "In Transit": "Receiving representative: accept or dispute receipt",
        Disputed:
          "Receiving representative: reconcile full acceptance, or supplier representative: confirm full return",
        Completed: "Complete: accepted receipt and formal custody recorded",
        Returned: "Returned: demand restored; condition controls availability",
        Canceled: "Canceled before dispatch: allocation released",
      } as Record<string, string>
    )[state] ?? "Review workflow"
  );
}
export function nextRequestAction(q: ResourceRequest): string {
  if (["Closed", "Canceled", "Fulfilled"].includes(q.status))
    return "No further allocation: request is terminal.";
  if (q.remainingQty > 0)
    return "Requester / receiving representative: select published stock for the remaining need; supplier representative decides reservation.";
  return "Follow active transfers below for release, movement and receiving confirmation.";
}
export class WorkflowService extends FoundationService {
  workspace(): Promise<WorkflowWorkspace> {
    return this.rpc("workflow_workspace");
  }
  execute(operation: WorkflowOperation): Promise<WorkflowResult> {
    if (operation.payload.action === "submitRequest")
      validateRequest(operation.payload);
    return this.rpc("workflow_command", { p_input: operation.payload });
  }
}
export const workflows = new WorkflowService();
