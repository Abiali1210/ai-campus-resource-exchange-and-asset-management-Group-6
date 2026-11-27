import { describe, expect, it } from "vitest";
import { mapAi5Error, normalizeAi5EditText } from "../src/ai5Editing";

describe("AI5 editing contract helpers", () => {
  it("normalizes line endings and outer whitespace without rewriting number words", () => {
    expect(normalizeAi5EditText("  Seven requests\r\nTwo units\r  ")).toBe(
      "Seven requests\nTwo units",
    );
  });

  it.each([
    ["AI5_TEXT_EMPTY", "Enter narrative text before saving."],
    ["AI5_TEXT_TOO_LONG", "Narrative text must be 600 characters or fewer."],
    [
      "AI5_UNSUPPORTED_NUMBER: 999",
      "Numeric value “999” must match the displayed snapshot facts.",
    ],
    [
      "AI5_INVALID_STATE",
      "This narrative is no longer editable in its current state.",
    ],
    [
      "AI5_FORBIDDEN",
      "Only an authorized business administrator can perform this action.",
    ],
    ["AI5_NOT_FOUND", "The requested narrative was not found."],
  ])("maps %s to its distinct user-facing message", (source, expected) => {
    expect(mapAi5Error(source)).toBe(expected);
  });

  it("does not present state or permission failures as numeric mismatches", () => {
    expect(mapAi5Error("AI5_INVALID_STATE")).not.toMatch(/numeric values/i);
    expect(mapAi5Error("AI5_FORBIDDEN")).not.toMatch(/numeric values/i);
  });
});
