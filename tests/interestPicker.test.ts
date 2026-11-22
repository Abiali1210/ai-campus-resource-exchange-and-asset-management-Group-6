import { describe, expect, it } from "vitest";
import {
  conditionMeetsMinimum,
  jsonContains,
  portionOptionLabels,
  searchPortions,
  suitableForRequest,
  suitablePortions,
} from "../src/interestPicker";
import type { AssetView } from "../src/types";

const asset = (overrides: Partial<AssetView> = {}) =>
  ({
    assetId: "a",
    portionId: "p",
    name: "Desk",
    departmentName: "Physics",
    assignedLocation: "Room 1",
    physicalLocation: "Room 1",
    qty: 2,
    condition: "Good",
    state: "Available",
    categoryId: "c",
    specifications: {},
    ...overrides,
  }) as AssetView;
const request = {
  categoryId: "c",
  condition: "Good",
  specifications: {} as Record<string, unknown>,
};

describe("interest picker suitability", () => {
  it("accepts only assessed conditions at or above the minimum", () => {
    expect(conditionMeetsMinimum("Excellent", "Good")).toBe(true);
    expect(conditionMeetsMinimum("Good", "Good")).toBe(true);
    expect(conditionMeetsMinimum("Fair", "Good")).toBe(false);
    expect(conditionMeetsMinimum("Unknown", "Fair")).toBe(false);
    expect(conditionMeetsMinimum("Poor", "Fair")).toBe(false);
    expect(conditionMeetsMinimum("Fair", "Fair")).toBe(true);
  });
  it("mirrors jsonb containment for nested values", () => {
    expect(jsonContains({ a: 1, b: "x" }, { a: 1 })).toBe(true);
    expect(jsonContains({ a: 1 }, { a: "1" })).toBe(false);
    expect(jsonContains({ a: 1 }, { b: 1 })).toBe(false);
    expect(jsonContains({ a: ["x", "y"] }, { a: ["y"] })).toBe(true);
    expect(jsonContains({ a: ["x"] }, { a: "x" })).toBe(false);
    expect(jsonContains({ a: { b: 1, c: 2 } }, { a: { b: 1 } })).toBe(true);
    expect(jsonContains({ a: null }, { a: null })).toBe(true);
    expect(jsonContains({}, {})).toBe(true);
  });
  it("requires category, condition and specifications to match", () => {
    expect(suitableForRequest(request, asset())).toBe(true);
    expect(suitableForRequest(request, asset({ categoryId: "x" }))).toBe(false);
    expect(suitableForRequest(request, asset({ condition: "Unknown" }))).toBe(
      false,
    );
    expect(
      suitableForRequest(
        { ...request, specifications: { seats: 4 } },
        asset({ specifications: { seats: 4, colour: "grey" } }),
      ),
    ).toBe(true);
    expect(
      suitableForRequest(
        { ...request, specifications: { seats: 4 } },
        asset({ specifications: { seats: 2 } }),
      ),
    ).toBe(false);
  });
  it("counts hidden portions only when a request is chosen", () => {
    const rows = [asset(), asset({ portionId: "u", condition: "Unknown" })];
    expect(suitablePortions(rows, null)).toEqual({ rows, hidden: 0 });
    expect(suitablePortions(rows, request)).toEqual({
      rows: [rows[0]],
      hidden: 1,
    });
  });
});

describe("interest picker search and labels", () => {
  const rows = [
    asset({ portionId: "1" }),
    asset({ portionId: "2", name: "Chair", departmentName: "Chemistry" }),
    asset({ portionId: "3", assignedLocation: "Lab B" }),
  ];
  it("searches name, department and location case-insensitively", () => {
    expect(searchPortions(rows, "").map((r) => r.portionId)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(searchPortions(rows, "chair").map((r) => r.portionId)).toEqual([
      "2",
    ]);
    expect(searchPortions(rows, "CHEM").map((r) => r.portionId)).toEqual(["2"]);
    expect(searchPortions(rows, "lab b").map((r) => r.portionId)).toEqual([
      "3",
    ]);
  });
  it("labels without IDs and disambiguates by location, then a counter", () => {
    const labels = portionOptionLabels([
      ...rows,
      asset({ portionId: "4", assignedLocation: "Lab B" }),
    ]);
    expect(labels.get("2")).toBe("Chair · Chemistry · 2 available · Good");
    expect(labels.get("1")).toBe(
      "Desk · Physics · 2 available · Good · Room 1",
    );
    expect(labels.get("3")).toBe("Desk · Physics · 2 available · Good · Lab B");
    expect(labels.get("4")).toBe(
      "Desk · Physics · 2 available · Good · Lab B · #2",
    );
  });
});
