import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SHOW_TEST_DATA_KEY,
  TEST_RECORD_PREFIXES,
  hiddenTestRecordsLabel,
  isTestRecordName,
  loadShowTestData,
  saveShowTestData,
  visibleRecords,
  withoutTestRecords,
} from "../src/testData";

describe("isTestRecordName", () => {
  it("matches every configured prefix", () => {
    expect(TEST_RECORD_PREFIXES).toEqual([
      "[Part 2 fixture",
      "LIVE-TEST-",
      "QA-2026-",
    ]);
    expect(isTestRecordName("[Part 2 fixture v1] Something")).toBe(true);
    expect(isTestRecordName("LIVE-TEST-42 chair")).toBe(true);
    expect(isTestRecordName("QA-2026-11-20-roles request")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isTestRecordName("  [part 2 FIXTURE v3] desk")).toBe(true);
    expect(isTestRecordName("\tlive-test-monitor\n")).toBe(true);
    expect(isTestRecordName(" qa-2026-x")).toBe(true);
  });

  it("only matches at the start of the text", () => {
    expect(isTestRecordName("Desk LIVE-TEST-1")).toBe(false);
    expect(isTestRecordName("Part 2 fixture")).toBe(false);
    expect(isTestRecordName("QA-2025-old")).toBe(false);
    expect(isTestRecordName("Oak study desk")).toBe(false);
  });

  it("treats null, undefined and empty text as real records", () => {
    expect(isTestRecordName(null)).toBe(false);
    expect(isTestRecordName(undefined)).toBe(false);
    expect(isTestRecordName("")).toBe(false);
    expect(isTestRecordName("   ")).toBe(false);
  });
});

describe("list helpers", () => {
  const rows = [
    { id: "1", name: "Oak desk", purpose: "Lab setup" },
    { id: "2", name: "LIVE-TEST-chair", purpose: "Lab setup" },
    { id: "3", name: "Monitor", purpose: "QA-2026-11-20-roles" },
    { id: "4", name: "[Part 2 fixture v1] Lamp", purpose: null },
  ];
  const names = (r: (typeof rows)[number]) => [r.name, r.purpose];

  it("drops rows where any name is a test name", () => {
    expect(withoutTestRecords(rows, names).map((r) => r.id)).toEqual(["1"]);
  });

  it("always keeps rows the caller marks as open", () => {
    expect(
      withoutTestRecords(rows, names, (r) => r.id === "4").map((r) => r.id),
    ).toEqual(["1", "4"]);
  });

  it("reports the hidden count, and shows everything when toggled on", () => {
    expect(visibleRecords(rows, false, names)).toEqual({
      rows: [rows[0]],
      hidden: 3,
    });
    const all = visibleRecords(rows, true, names);
    expect(all.rows).toEqual(rows);
    expect(all.hidden).toBe(0);
  });

  it("labels the hidden count", () => {
    expect(hiddenTestRecordsLabel(0)).toBe("");
    expect(hiddenTestRecordsLabel(1)).toBe("1 test record hidden");
    expect(hiddenTestRecordsLabel(3)).toBe("3 test records hidden");
  });
});

describe("show test data preference", () => {
  afterEach(() => vi.unstubAllGlobals());

  const memoryStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      store,
    };
  };

  it("defaults to false and round-trips through localStorage", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(loadShowTestData()).toBe(false);
    saveShowTestData(true);
    expect(storage.store.get(SHOW_TEST_DATA_KEY)).toBe("true");
    expect(SHOW_TEST_DATA_KEY).toBe("circular-campus:show-test-data");
    expect(loadShowTestData()).toBe(true);
    saveShowTestData(false);
    expect(loadShowTestData()).toBe(false);
  });

  it("falls back to false when storage is missing or throws", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadShowTestData()).toBe(false);
    expect(() => saveShowTestData(true)).not.toThrow();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadShowTestData()).toBe(false);
    expect(() => saveShowTestData(true)).not.toThrow();
  });
});
