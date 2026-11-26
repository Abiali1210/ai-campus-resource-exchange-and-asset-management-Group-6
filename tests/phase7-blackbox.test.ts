/**
 * Phase 7 black-box tests: equivalence partitioning (EP) and boundary value
 * analysis (BVA) on the client-side validators and catalogue filter.
 *
 * Each case is derived from the input specification only, not the code. The
 * TC-BB-xx IDs match the test case tables in the Phase 7 report, so every row
 * there points to one assertion here.
 */
import { describe, expect, it } from "vitest";
import { ValidationError, matchesFilters, validateAsset } from "../src/domain";
import { validateRequest, type WorkflowCommand } from "../src/workflows";
import type { AssetInput, AssetView } from "../src/types";

/** Run a validator and return the failing field names (empty = accepted). */
function failingFields(run: () => void): string[] {
  try {
    run();
    return [];
  } catch (error) {
    if (error instanceof ValidationError)
      return Object.keys(error.fields).sort();
    throw error;
  }
}

const validAsset: AssetInput = {
  name: "Oscilloscope",
  description: "Two-channel bench scope",
  categoryId: "lab-equipment",
  trackingMode: "batch",
  totalQty: 5,
  condition: "Good",
  ownerDepartmentId: "engineering",
  custodianId: "custodian-1",
  assignedLocation: "Building 3, Lab 2",
  purchaseDate: "2024-02-29",
  unitValue: 1200,
  unitMassKg: 4.5,
  tags: [],
  materials: [],
  specifications: {},
};
const asset = (patch: Partial<AssetInput>) => () =>
  validateAsset({ ...validAsset, ...patch });

describe("validateAsset: quantity (C2 asset registration)", () => {
  // Valid class: positive whole numbers. Invalid: <= 0, fractional, non-finite.
  it.each([
    ["TC-BB-01", "lower boundary 1", 1, []],
    ["TC-BB-02", "typical value 5", 5, []],
    ["TC-BB-03", "large value 10000", 10000, []],
    ["TC-BB-04", "just below boundary 0", 0, ["totalQty"]],
    ["TC-BB-05", "negative -1", -1, ["totalQty"]],
    ["TC-BB-06", "fractional 1.5", 1.5, ["totalQty"]],
    ["TC-BB-07", "not a number", NaN, ["totalQty"]],
    ["TC-BB-08", "infinity", Infinity, ["totalQty"]],
  ])("%s batch quantity %s", (_id, _label, totalQty, expected) =>
    expect(failingFields(asset({ totalQty }))).toEqual(expected),
  );

  // Individually tracked equipment is its own class: only quantity 1 is valid.
  it.each([
    ["TC-BB-09", 1, []],
    ["TC-BB-10", 2, ["totalQty"]],
  ])("%s individual tracking with quantity %s", (_id, totalQty, expected) =>
    expect(
      failingFields(asset({ trackingMode: "individual", totalQty })),
    ).toEqual(expected),
  );
});

describe("validateAsset: required text and references", () => {
  it.each([
    ["TC-BB-11", "empty name", { name: "" }, ["name"]],
    ["TC-BB-12", "whitespace-only name", { name: "   " }, ["name"]],
    [
      "TC-BB-13",
      "empty location",
      { assignedLocation: "" },
      ["assignedLocation"],
    ],
    [
      "TC-BB-14",
      "missing owner",
      { ownerDepartmentId: "" },
      ["ownerDepartmentId"],
    ],
    ["TC-BB-15", "missing custodian", { custodianId: "" }, ["custodianId"]],
  ] as const)("%s rejects %s", (_id, _label, patch, expected) =>
    expect(failingFields(asset(patch))).toEqual(expected),
  );

  it("TC-BB-16 reports every invalid field at once", () =>
    expect(
      failingFields(asset({ name: "", totalQty: 0, assignedLocation: " " })),
    ).toEqual(["assignedLocation", "name", "totalQty"]));
});

describe("validateAsset: optional unit value and mass", () => {
  // Unit value: null (unknown) and >= 0 are valid; negative/non-finite are not.
  it.each([
    ["TC-BB-17", "unknown (null)", null, []],
    ["TC-BB-18", "boundary 0", 0, []],
    ["TC-BB-19", "just below boundary -0.01", -0.01, ["unitValue"]],
    ["TC-BB-20", "non-finite", Infinity, ["unitValue"]],
  ])("%s unit value %s", (_id, _label, unitValue, expected) =>
    expect(failingFields(asset({ unitValue }))).toEqual(expected),
  );

  // Mass: absent is valid; when supplied it must be strictly positive.
  it.each([
    ["TC-BB-21", "absent", null, []],
    ["TC-BB-22", "smallest positive 0.001", 0.001, []],
    ["TC-BB-23", "boundary 0", 0, ["unitMassKg"]],
    ["TC-BB-24", "negative", -2, ["unitMassKg"]],
  ])("%s mass %s", (_id, _label, unitMassKg, expected) =>
    expect(failingFields(asset({ unitMassKg }))).toEqual(expected),
  );
});

describe("validateAsset: purchase date", () => {
  it.each([
    ["TC-BB-25", "absent", null, []],
    ["TC-BB-26", "leap day 2024-02-29", "2024-02-29", []],
    ["TC-BB-27", "non-leap 2023-02-29", "2023-02-29", ["purchaseDate"]],
    ["TC-BB-28", "month 13", "2024-13-01", ["purchaseDate"]],
    ["TC-BB-29", "wrong format 29/02/2024", "29/02/2024", ["purchaseDate"]],
  ])("%s date %s", (_id, _label, purchaseDate, expected) =>
    expect(failingFields(asset({ purchaseDate }))).toEqual(expected),
  );
});

const validRequest: WorkflowCommand = {
  action: "submitRequest",
  purpose: "Replace broken lab chairs",
  qty: 4,
  categoryId: "furniture",
  destination: "Building 1, Room 104",
  requiredDate: "2026-12-15",
};
const request = (patch: Partial<WorkflowCommand>) => () =>
  validateRequest({ ...validRequest, ...patch });

describe("validateRequest: resource request (C4 request submission)", () => {
  it("TC-BB-30 accepts a complete valid request", () =>
    expect(failingFields(request({}))).toEqual([]));

  it.each([
    ["TC-BB-31", "lower boundary 1", 1, []],
    ["TC-BB-32", "boundary 0", 0, ["qty"]],
    ["TC-BB-33", "negative -3", -3, ["qty"]],
    ["TC-BB-34", "fractional 2.5", 2.5, ["qty"]],
    ["TC-BB-35", "numeric string '4'", "4", ["qty"]],
  ])("%s quantity %s", (_id, _label, qty, expected) =>
    expect(failingFields(request({ qty }))).toEqual(expected),
  );

  it.each([
    ["TC-BB-36", "blank purpose", { purpose: "  " }, ["purpose"]],
    ["TC-BB-37", "missing category", { categoryId: "" }, ["categoryId"]],
    ["TC-BB-38", "blank destination", { destination: "" }, ["destination"]],
    ["TC-BB-39", "missing date", { requiredDate: undefined }, ["requiredDate"]],
    [
      "TC-BB-40",
      "wrong date format",
      { requiredDate: "15-12-2026" },
      ["requiredDate"],
    ],
  ] as const)("%s rejects %s", (_id, _label, patch, expected) =>
    expect(failingFields(request(patch))).toEqual(expected),
  );

  it("TC-BB-41 an empty submission fails on all five fields", () =>
    expect(
      failingFields(() => validateRequest({ action: "submitRequest" })),
    ).toEqual(["categoryId", "destination", "purpose", "qty", "requiredDate"]));
});

const row: AssetView = {
  assetId: "a1",
  portionId: "p1",
  name: "Oscilloscope",
  description: "Two-channel bench scope",
  categoryId: "lab-equipment",
  categoryName: "Lab equipment",
  totalQty: 5,
  qty: 5,
  trackingMode: "batch",
  condition: "Good",
  state: "Available",
  ownerDepartmentId: "engineering",
  departmentName: "Engineering",
  custodianId: "custodian-1",
  assignedLocation: "Building 3, Lab 2",
  physicalLocation: "Building 3, Lab 2",
  purchaseDate: "2024-01-01",
  unitValue: 1200,
  tags: ["electronics"],
  materials: [],
  specifications: { bandwidth: "100 MHz" },
  version: 1,
};
const now = new Date("2026-01-01T00:00:00Z"); // asset is ~2.0 years old

describe("matchesFilters: catalogue search (C3 catalogue search)", () => {
  it.each([
    ["TC-BB-42", "no filters", {}, true],
    ["TC-BB-43", "keyword in name, any case", { keyword: "OSCILLO" }, true],
    ["TC-BB-44", "keyword in tags", { keyword: "electronics" }, true],
    ["TC-BB-45", "keyword in specifications", { keyword: "100 mhz" }, true],
    ["TC-BB-46", "keyword absent", { keyword: "projector" }, false],
    ["TC-BB-47", "location substring", { location: "lab 2" }, true],
    ["TC-BB-48", "other department", { departmentId: "finance" }, false],
    [
      "TC-BB-49",
      "available only, row available",
      { availability: "available" },
      true,
    ],
  ] as const)("%s %s", (_id, _label, filters, expected) =>
    expect(matchesFilters(row, filters, now)).toBe(expected),
  );

  // Minimum quantity boundary around qty = 5.
  it.each([
    ["TC-BB-50", 5, true],
    ["TC-BB-51", 6, false],
  ])("%s minimum quantity %s", (_id, minQty, expected) =>
    expect(matchesFilters(row, { minQty }, now)).toBe(expected),
  );

  // Value range boundaries around unitValue = 1200; unknown value never matches.
  it.each([
    ["TC-BB-52", "min = value", { minValue: 1200 }, row.unitValue, true],
    ["TC-BB-53", "min just above", { minValue: 1200.01 }, row.unitValue, false],
    ["TC-BB-54", "max = value", { maxValue: 1200 }, row.unitValue, true],
    ["TC-BB-55", "unknown value with max", { maxValue: 5000 }, null, false],
  ] as const)(
    "%s value range: %s",
    (_id, _label, filters, unitValue, expected) =>
      expect(matchesFilters({ ...row, unitValue }, filters, now)).toBe(
        expected,
      ),
  );

  // Age range: the row is ~2 years old; unknown purchase date never matches.
  it.each([
    [
      "TC-BB-56",
      "max age 3 (older bound)",
      { maxAge: 3 },
      row.purchaseDate,
      true,
    ],
    ["TC-BB-57", "min age 3", { minAge: 3 }, row.purchaseDate, false],
    ["TC-BB-58", "unknown date with min age", { minAge: 0 }, null, false],
  ] as const)("%s age: %s", (_id, _label, filters, purchaseDate, expected) =>
    expect(matchesFilters({ ...row, purchaseDate }, filters, now)).toBe(
      expected,
    ),
  );
});
