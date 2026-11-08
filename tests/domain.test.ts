import { describe, expect, it } from "vitest";
import { matchesFilters, validateAsset } from "../src/domain";
import type { AssetInput, AssetView } from "../src/types";
const input: AssetInput = {
  name: "Monitor",
  description: "A display",
  categoryId: "category",
  trackingMode: "individual",
  totalQty: 1,
  condition: "Good",
  ownerDepartmentId: "dept",
  custodianId: "user",
  assignedLocation: "Lab",
  purchaseDate: null,
  unitValue: null,
  tags: [],
  materials: [],
  specifications: {},
};
describe("catalogue input boundaries", () => {
  it("accepts missing optional financial data without inventing zero", () =>
    expect(() => validateAsset(input)).not.toThrow());
  it.each([0, -1, 1.5, NaN])("rejects invalid quantity %s", (q) =>
    expect(() => validateAsset({ ...input, totalQty: q })).toThrow(
      "positive whole",
    ),
  );
  it("rejects batches disguised as individual equipment", () =>
    expect(() => validateAsset({ ...input, totalQty: 2 })).toThrow(
      "quantity one",
    ));
  it("returns field errors without changing entered data", () => {
    const draft = { ...input, name: "", assignedLocation: "" };
    expect(() => validateAsset(draft)).toThrow();
    expect(draft.name).toBe("");
    expect(draft.description).toBe(input.description);
  });
  it("does not satisfy financial range with unknown value", () => {
    const row = {
      ...input,
      state: "Available",
      qty: 1,
      categoryName: "Display",
      departmentName: "Engineering",
    } as AssetView;
    expect(matchesFilters(row, { minValue: 0 })).toBe(false);
    expect(
      matchesFilters(row, { keyword: "DISPLAY", location: "lab", minQty: 1 }),
    ).toBe(true);
    expect(matchesFilters(row, { minAge: 1 })).toBe(false);
  });
});
