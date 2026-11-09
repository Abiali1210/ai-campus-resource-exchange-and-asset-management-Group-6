import { describe, it, expect } from "vitest";
import fixture from "./fixtures/foundation.json";
// @ts-expect-error Pure Node seed helper is JavaScript.
import { demoEmailFor, legacyDemoEmailFor } from "../scripts/demo-accounts.mjs";

describe("shared seed account identity mapping", () => {
  it("maps all twelve fixture profiles to the established unique sign-in aliases", () => {
    const actual = fixture.users.map((p) =>
      demoEmailFor(p, fixture.departments),
    );
    expect(actual).toEqual([
      "req-eng@demo.test",
      "req-sci@demo.test",
      "rep-eng@demo.test",
      "rep-sci@demo.test",
      "biz-eng@demo.test",
      "maint@demo.test",
      "fac@demo.test",
      "proc@demo.test",
      "fin@demo.test",
      "sust@demo.test",
      "admin@demo.test",
      "inactive@demo.test",
    ]);
    expect(new Set(actual).size).toBe(12);
  });
  it("uses role, department and active state rather than mutable display names", () => {
    expect(
      demoEmailFor(
        { ...fixture.users[0], name: "Renamed user" },
        fixture.departments,
      ),
    ).toBe("req-eng@demo.test");
    expect(
      demoEmailFor({ ...fixture.users[0], active: false }, fixture.departments),
    ).toBe("inactive@demo.test");
  });
  it("rejects ambiguous or missing role assignments and invalid active flags", () => {
    for (const changes of [
      { roles: [] },
      { roles: ["requester", "representative"] },
      { roles: null },
      { active: "true" },
    ])
      expect(() =>
        demoEmailFor({ ...fixture.users[0], ...changes }, fixture.departments),
      ).toThrow("Unsupported synthetic account mapping");
  });
  it("rejects unknown departments and unsupported role/department combinations", () => {
    expect(() =>
      demoEmailFor(
        { ...fixture.users[0], departmentId: "missing" },
        fixture.departments,
      ),
    ).toThrow("Unknown synthetic account department");
    expect(() =>
      demoEmailFor(
        {
          ...fixture.users[0],
          roles: ["facilities"],
          departmentId: fixture.departments[1].departmentId,
        },
        fixture.departments,
      ),
    ).toThrow("Unsupported synthetic account mapping");
  });
  it("preserves legacy address lookup for the incoming identity-preserving provisioner", () => {
    expect(legacyDemoEmailFor(fixture.users[0])).toBe(
      "requester-engineering@demo.example.test",
    );
    expect(legacyDemoEmailFor(fixture.users[10])).toBe(
      "system-administrator-engineering@demo.example.test",
    );
    expect(new Set(fixture.users.map(legacyDemoEmailFor)).size).toBe(12);
  });
});
