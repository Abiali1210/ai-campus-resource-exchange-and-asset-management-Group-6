import { describe, expect, it } from "vitest";
import {
  specificationRows,
  serializeSpecifications,
} from "../src/specificationEditor";

describe("editing stored technical specifications", () => {
  it("preserves all unchanged JSON types through unrelated edits and renames", () => {
    const original = {
      screen: 24,
      adjustable: true,
      features: { height: true },
      ports: ["HDMI"],
      unknown: null,
      connector: "HDMI",
    };
    const rows = specificationRows(original);
    expect(serializeSpecifications(rows)).toEqual(original);
    rows[0][0] = "screenInches";
    expect(serializeSpecifications(rows).screenInches).toBe(24);
  });
  it("edits an existing typed value explicitly as JSON and new values as text", () => {
    const rows = specificationRows({ screen: 24, features: { height: true } });
    rows[0][1] = "27";
    rows[1][1] = '{"height":false}';
    rows.push([" connector ", " HDMI "]);
    expect(serializeSpecifications(rows)).toEqual({
      screen: 27,
      features: { height: false },
      connector: "HDMI",
    });
    expect(serializeSpecifications(rows.slice(1))).not.toHaveProperty("screen");
  });
  it("rejects malformed typed JSON and ambiguous field names", () => {
    const rows = specificationRows({ features: { height: true } });
    rows[0][1] = "[object Object]";
    expect(() => serializeSpecifications(rows)).toThrow("valid JSON");
    rows[0][1] = '{"unbounded":1e309}';
    expect(() => serializeSpecifications(rows)).toThrow("valid JSON");
    expect(() =>
      serializeSpecifications([
        ["connector", "HDMI"],
        [" Connector ", "VGA"],
      ]),
    ).toThrow("only once");
    expect(() => serializeSpecifications([["connector", ""]])).toThrow(
      "both a name and a value",
    );
    expect(serializeSpecifications([["", ""]])).toEqual({});
  });
});
