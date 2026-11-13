import { describe, expect, it } from "vitest";
import {
  compatibleRequests,
  clearHandoffPortion,
  eligiblePortions,
  selectedPortionIsStale,
} from "../src/resourceHandoff";
import type { AssetView } from "../src/types";
import type { ResourceRequest } from "../src/workflows";

const asset = (overrides: Partial<AssetView> = {}) =>
  ({
    assetId: "a",
    portionId: "p",
    state: "Available",
    qty: 2,
    categoryId: "c",
    ...overrides,
  }) as AssetView;
const request = (overrides: Partial<ResourceRequest> = {}) =>
  ({
    requestId: "r",
    requesterId: "u",
    departmentId: "d",
    categoryId: "c",
    remainingQty: 1,
    status: "Open",
    ...overrides,
  }) as ResourceRequest;

describe("selected-resource handoff rules", () => {
  it("preserves exactly-one, multiple, and no eligible choices", () => {
    const rows = [request(), request({ requestId: "second" })];
    expect(
      compatibleRequests(rows.slice(0, 1), "u", "d", false, "c").map(
        (r) => r.requestId,
      ),
    ).toEqual(["r"]);
    expect(compatibleRequests(rows, "u", "d", false, "c")).toHaveLength(2);
    expect(compatibleRequests([], "u", "d", false, "c")).toEqual([]);
  });
  it("returns exactly one eligible current portion", () => {
    expect(
      eligiblePortions([asset(), asset({ state: "Reserved" })], "a"),
    ).toEqual([asset()]);
  });
  it("preserves multiple eligible current portions", () => {
    expect(
      eligiblePortions([asset(), asset({ portionId: "second" })], "a"),
    ).toEqual([asset(), asset({ portionId: "second" })]);
  });
  it("returns no eligible portions when candidates are unavailable or for another asset", () => {
    expect(
      eligiblePortions(
        [
          asset({ state: "Reserved" }),
          asset({ portionId: "empty", qty: 0 }),
          asset({ assetId: "other" }),
        ],
        "a",
      ),
    ).toEqual([]);
  });
  it("matches only own/receiving-department open requests with remaining quantity and category", () => {
    const rows = [
      request(),
      request({ requestId: "closed", status: "Closed" }),
      request({ requestId: "fulfilled", status: "Fulfilled" }),
      request({ requestId: "canceled", status: "Canceled" }),
      request({ requestId: "empty", remainingQty: 0 }),
      request({ requestId: "other", categoryId: "other" }),
      request({
        requestId: "foreign",
        requesterId: "other",
        departmentId: "other",
      }),
    ];
    expect(
      compatibleRequests(rows, "u", "d", false, "c").map((r) => r.requestId),
    ).toEqual(["r"]);
    expect(
      compatibleRequests(
        [request({ requesterId: "other" })],
        "u",
        "d",
        true,
        "c",
      ),
    ).toHaveLength(1);
    expect(compatibleRequests([request()], "u", "d", false, null)).toEqual([]);
  });
  it("detects missing, unavailable, and empty selected portions as stale", () => {
    expect(selectedPortionIsStale({ portionId: "p" }, [asset()])).toBe(false);
    expect(selectedPortionIsStale({ portionId: "p" }, [])).toBe(true);
    expect(
      selectedPortionIsStale({ portionId: "p" }, [
        asset({ state: "Reserved" }),
      ]),
    ).toBe(true);
    expect(
      selectedPortionIsStale({ portionId: "p" }, [asset({ qty: 0 })]),
    ).toBe(true);
  });
  it("clears only handoff portion while preserving request choice and unrelated drafts", () => {
    expect(
      clearHandoffPortion({ portionId: "p", requestId: "r", purpose: "draft" }),
    ).toEqual({ portionId: "", requestId: "r", purpose: "draft" });
  });
});
