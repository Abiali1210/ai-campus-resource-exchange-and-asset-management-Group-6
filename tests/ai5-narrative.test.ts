import { describe, expect, it } from "vitest";
import { parseAi5Narrative } from "../src/ai5Narrative";

describe("AI5 narrative presentation", () => {
  it("parses the five labeled v2 lines into a structured briefing", () => {
    expect(
      parseAi5Narrative(
        "Headline: Activity is visible\nDemand: Requests remain\nTransfer activity: Transfers recorded\nInterpretation: Activity is mixed\nLimitation: This snapshot cannot establish causes or future outcomes",
      ),
    ).toEqual({
      kind: "structured",
      headline: "Activity is visible",
      demand: "Requests remain",
      transferActivity: "Transfers recorded",
      interpretation: "Activity is mixed",
      limitation: "This snapshot cannot establish causes or future outcomes",
    });
  });
  it("keeps v1 or malformed labeled text safely as plain text", () => {
    expect(parseAi5Narrative("An older narrative remains readable.")).toEqual({
      kind: "plain",
      text: "An older narrative remains readable.",
    });
    expect(
      parseAi5Narrative("Headline: Incomplete\nDemand: no remaining sections"),
    ).toEqual({
      kind: "plain",
      text: "Headline: Incomplete\nDemand: no remaining sections",
    });
  });
});
