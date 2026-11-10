import { describe, it, expect } from "vitest";
import {
  WorkflowOperation,
  validateRequest,
  nextTransferAction,
  nextRequestAction,
  type ResourceRequest,
} from "../src/workflows";
describe("workflow client contracts", () => {
  it("preserves the same operation payload across an uncertain response", () => {
    const input = {
      action: "approveReservation" as const,
      interestId: "interest",
      qty: 1,
      expectedVersion: 1,
      reason: "Reviewed",
    };
    const op = new WorkflowOperation(input, "fixed-key");
    input.qty = 2;
    expect(op.payload.qty).toBe(1);
    expect(op.payload.operationKey).toBe("fixed-key");
    expect(op.matches({ ...input, qty: 1 })).toBe(true);
    expect(op.matches(input)).toBe(false);
  });
  it("returns field validation errors while preserving the request draft", () => {
    const input = {
      action: "submitRequest" as const,
      purpose: "",
      qty: 1.5,
      categoryId: "",
      destination: "",
      requiredDate: "",
    };
    expect(() => validateRequest(input)).toThrow("Describe the purpose.");
    expect(input.qty).toBe(1.5);
  });
  it("accepts a complete ordinary request without AI", () => {
    expect(() =>
      validateRequest({
        action: "submitRequest",
        purpose: "Display for lab",
        qty: 1,
        categoryId: "monitors",
        destination: "Lab",
        requiredDate: "2026-12-01",
      }),
    ).not.toThrow();
  });
  it("shows the responsible role and action at every active transfer state", () => {
    expect(nextTransferAction("Pending Approval")).toContain(
      "Supplier representative",
    );
    expect(nextTransferAction("Approved")).toContain("Assigned Facilities");
    expect(nextTransferAction("Scheduled")).toContain("dispatch");
    expect(nextTransferAction("In Transit")).toContain(
      "Receiving representative",
    );
    expect(nextTransferAction("Disputed")).toContain("confirm full return");
  });
  it("preserves partially outstanding need in tracking and terminal closure explanation", () => {
    expect(
      nextRequestAction({
        remainingQty: 2,
        status: "Partially Fulfilled",
      } as ResourceRequest),
    ).toContain("remaining need");
    expect(
      nextRequestAction({
        remainingQty: 2,
        status: "Closed",
      } as ResourceRequest),
    ).toContain("terminal");
  });
});
