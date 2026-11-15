import { describe, expect, it } from "vitest";
import { normalizeAi5NumberWords } from "../src/ai5NumberWords";

describe("normalizeAi5NumberWords", () => {
  const facts = [0, 1, 2, 4, 7, 21, 42, 100, 105, 999];

  it.each([
    ["seven requests", "7 requests"],
    ["Two completed transfers", "2 completed transfers"],
    ["four units", "4 units"],
    ["twenty-one open requests", "21 open requests"],
    [
      "one hundred and five units successfully transferred",
      "105 units successfully transferred",
    ],
    ["nine hundred ninety-nine requests", "999 requests"],
    ["zero transfers", "0 transfers"],
    ["one request", "1 request"],
    ["one completed transfer", "1 completed transfer"],
    ["one unit", "1 unit"],
    ["one open request", "1 open request"],
    ["one unit successfully transferred", "1 unit successfully transferred"],
  ])("normalizes %s when allowed", (input, expected) => {
    expect(normalizeAi5NumberWords(input, facts)).toEqual({
      text: expected,
      normalized: true,
    });
  });

  it("is case-insensitive and accepts four fact arguments", () => {
    expect(
      normalizeAi5NumberWords("FORTY-TWO COMPLETED TRANSFERS", 42, 5, 6, 7),
    ).toEqual({
      text: "42 COMPLETED TRANSFERS",
      normalized: true,
    });
  });

  it.each([
    "eight requests",
    "one hundred and six requests",
    "one hundred and requests",
    "one hundred five six requests",
    "twenty one hundred requests",
    "one thousand requests",
    "minus seven requests",
    "seventh requests",
    "one-half requests",
    "one requests",
    "two request",
    "zero request",
  ])("leaves unsupported or malformed phrases unchanged: %s", (input) => {
    expect(normalizeAi5NumberWords(input, facts)).toEqual({
      text: input,
      normalized: false,
    });
  });

  it.each([
    "one way",
    "one of",
    "one way requests",
    "someone",
    "twenty-one-year-old",
  ])("does not convert ordinary prose or embedded phrases: %s", (input) => {
    expect(normalizeAi5NumberWords(input, facts)).toEqual({
      text: input,
      normalized: false,
    });
  });

  it("normalizes metric facts in prose, but leaves other words intact", () => {
    expect(
      normalizeAi5NumberWords(
        "Seven requests; eight units; one hundred and five transfers.",
        facts,
      ),
    ).toEqual({
      text: "7 requests; eight units; 105 transfers.",
      normalized: true,
    });
  });

  it("does not match number words inside larger word or hyphen runs", () => {
    const input = "abc-seven requests, twenty-one-year-old transfers";
    expect(normalizeAi5NumberWords(input, facts)).toEqual({
      text: input,
      normalized: false,
    });
  });
});
