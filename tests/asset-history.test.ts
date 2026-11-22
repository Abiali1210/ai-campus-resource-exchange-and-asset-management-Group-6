import { describe, expect, it } from "vitest";
import {
  AUDIT_EVENT_LABELS,
  auditActorLabel,
  auditEventLabel,
} from "../src/workflowPresentation";

const dottedCode = /^[a-z]+\.[A-Za-z_]+$/;
const uuid = "0f7c2a8e-4b1d-4c5e-9a3b-2d6e8f1a0b4c";

describe("asset history event labels", () => {
  it("names catalogue events in plain language", () => {
    expect(auditEventLabel("asset.saved")).toBe("Record saved");
    expect(auditEventLabel("asset.published")).toBe("Listing published");
    expect(auditEventLabel("asset.withdrawn")).toBe("Listing withdrawn");
  });

  it("uses the workflow History wording for reservation and transfer events", () => {
    expect(auditEventLabel("reservation.approved")).toBe(
      "Reservation approved",
    );
    expect(auditEventLabel("transfer.approveRelease")).toBe("Release approved");
    expect(auditEventLabel("transfer.schedule")).toBe("Pickup scheduled");
    expect(auditEventLabel("transfer.dispatch")).toBe("Dispatched");
    expect(auditEventLabel("transfer.receive")).toBe("Receipt recorded");
    expect(auditEventLabel("transfer.cancelTransfer")).toBe(
      "Transfer canceled before dispatch",
    );
  });

  it("covers every event the database writes against an asset", () => {
    // Event codes written with target_type 'asset' in supabase/migrations.
    for (const code of [
      "asset.saved",
      "asset.published",
      "asset.withdrawn",
      "reservation.approved",
      "reservation.rejected",
      "transfer.approveRelease",
      "transfer.rejectRelease",
      "transfer.cancelTransfer",
      "transfer.schedule",
      "transfer.dispatch",
      "transfer.receive",
      "transfer.reconcile",
      "transfer.confirmReturn",
    ])
      expect(Object.hasOwn(AUDIT_EVENT_LABELS, code), code).toBe(true);
  });

  it("never returns a raw dotted code for a known event", () => {
    for (const [code, label] of Object.entries(AUDIT_EVENT_LABELS)) {
      expect(auditEventLabel(code)).toBe(label);
      expect(label).not.toMatch(dottedCode);
      expect(label).not.toContain(".");
      expect(label).not.toContain("_");
    }
  });

  it("keeps unknown codes readable", () => {
    expect(auditEventLabel("asset.condition_assessed")).toBe(
      "Asset condition assessed",
    );
    expect(auditEventLabel("transfer.markLost")).toBe("Transfer mark lost");
    expect(auditEventLabel("profile.saved")).toBe("Profile saved");
    expect(auditEventLabel("maintenance")).toBe("Maintenance");
    // Object prototype names are not labels.
    expect(auditEventLabel("constructor")).toBe("Constructor");
    expect(auditEventLabel("toString")).toBe("To string");
  });

  it("falls back to a neutral label for an empty code", () => {
    expect(auditEventLabel("")).toBe("Recorded change");
    expect(auditEventLabel(null)).toBe("Recorded change");
    expect(auditEventLabel(undefined)).toBe("Recorded change");
    expect(auditEventLabel("...")).toBe("Recorded change");
  });
});

describe("asset history actor labels", () => {
  it("shows the actor's name", () => {
    expect(auditActorLabel({ actorId: uuid, actorName: "Sara Ahmed" })).toBe(
      "Sara Ahmed",
    );
    expect(auditActorLabel({ actorId: uuid, actorName: "  Omar  " })).toBe(
      "Omar",
    );
  });

  it("never shows a user ID when the name is unavailable", () => {
    for (const actorName of [undefined, null, "", "   "])
      expect(auditActorLabel({ actorId: uuid, actorName })).toBe(
        "Unknown user",
      );
  });

  it("labels events without an actor as system changes", () => {
    expect(auditActorLabel({ actorId: null })).toBe("System");
    expect(auditActorLabel({ actorId: null, actorName: null })).toBe("System");
  });
});
