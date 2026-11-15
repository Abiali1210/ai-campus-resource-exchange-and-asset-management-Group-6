import { describe, expect, it } from "vitest";
import { formatAi5PeriodDate, formatAi5Timestamp } from "../src/ai5Dates";

describe("AI5 date formatting", () => {
  it("formats period dates without time", () => {
    expect(
      formatAi5PeriodDate("2025-01-15T23:30:00Z", {
        locale: "en-US",
        timeZone: "UTC",
      }),
    ).toBe("Jan 15, 2025");
  });

  it("formats timestamps in a fixed timezone to the minute", () => {
    const result = formatAi5Timestamp("2025-01-15T23:30:45.123Z", {
      locale: "en-US",
      timeZone: "America/Los_Angeles",
    });
    expect(result).toContain("Jan 15, 2025");
    expect(result).toContain("3:30 PM");
    expect(result).not.toMatch(/:45|\.123|PST|GMT/);
  });

  it("returns invalid input unchanged", () => {
    expect(formatAi5Timestamp("not-a-date")).toBe("not-a-date");
    expect(
      formatAi5PeriodDate("2025-01-15", { timeZone: "Invalid/Zone" }),
    ).toBe("2025-01-15");
  });
});
