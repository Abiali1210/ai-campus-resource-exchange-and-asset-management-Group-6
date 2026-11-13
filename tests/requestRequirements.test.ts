import { describe, expect, it } from "vitest";
import {
  formatSpecifications,
  serializeRequirements,
  type RequirementRow,
} from "../src/requestRequirements";

const row = (name: string, value: string): RequirementRow => ({
  id: `${name}-${value}`,
  name,
  value,
});

describe("serializeRequirements", () => {
  it("serializes rows, ignores fully blank rows, and safely supports __proto__", () => {
    const result = serializeRequirements([
      row(" capacity ", " 12 "),
      row("", "  "),
      row("__proto__", "safe"),
    ]);
    expect(result).toEqual({ capacity: 12, ["__proto__"]: "safe" });
    expect(serializeRequirements([])).toEqual({});
  });

  it("converts numeric and boolean text while preserving other trimmed strings", () => {
    expect(
      serializeRequirements([
        row("decimal", "-1.25"),
        row("exponent", "+2e3"),
        row("yes", "TRUE"),
        row("no", "false"),
        row("hex", "0x10"),
        row("text", " hello "),
        row("overflow", "1e9999"),
      ]),
    ).toEqual({
      decimal: -1.25,
      exponent: 2000,
      yes: true,
      no: false,
      hex: "0x10",
      text: "hello",
      overflow: "1e9999",
    });
  });

  it("rejects duplicate names case-insensitively", () => {
    expect(() =>
      serializeRequirements([row("Size", "1"), row(" size ", "2")]),
    ).toThrow(/duplicated/i);
  });

  it("rejects a value without a name", () => {
    expect(() => serializeRequirements([row(" ", "value")])).toThrow(/name/i);
  });

  it("rejects a named row without a value", () => {
    expect(() => serializeRequirements([row("Color", "  ")])).toThrow(/value/i);
  });
});

describe("formatSpecifications", () => {
  it("humanizes labels and readable numeric, boolean, and nested content", () => {
    expect(
      formatSpecifications({
        max_capacity: 12000,
        fractional_value: 1.23456,
        tiny_value: 0.000001,
        isAvailable: true,
        existing_data: { pickup_zone: "North", tags: ["paper", "glass"] },
      }),
    ).toEqual([
      { label: "Max capacity", value: "12,000" },
      { label: "Fractional value", value: "1.23456" },
      { label: "Tiny value", value: "0.000001" },
      { label: "Is Available", value: "Yes" },
      {
        label: "Existing data",
        value: "Pickup zone: North; Tags: paper, glass",
      },
    ]);
  });
});
