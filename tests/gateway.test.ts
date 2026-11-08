import { describe, expect, it, vi } from "vitest";
import {
  createFoundationHandler,
  type GatewayConfig,
} from "../supabase/functions/foundation/handler";
import { boundedBytes } from "../supabase/functions/foundation/validation";

const id = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const departmentId = "00000000-0000-4000-8000-000000000003";
const operationKey = "00000000-0000-4000-8000-000000000004";
const config: GatewayConfig = {
  supabaseUrl: "https://project.supabase.co",
  anonKey: "public-test-key",
  allowedOrigins: ["http://localhost:5173"],
  serviceKey: "secret-service-test",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const account = {
  email: "synthetic@example.test",
  password: "local-only-password",
  name: "Synthetic",
  departmentId,
  roles: ["requester"],
  operationKey,
};
const request = (
  action = "adminCreateAccount",
  payload: Record<string, unknown> = account,
  headers: Record<string, string> = {},
) =>
  new Request("https://edge.test/foundation", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      origin: "http://localhost:5173",
      ...headers,
    },
    body: JSON.stringify({ action, payload }),
  });

function backend(
  options: {
    roles?: string[];
    active?: boolean;
    invalidToken?: boolean;
    mismatchedSubject?: boolean;
    profileFailure?: boolean;
    rollbackFailure?: boolean;
    createFailure?: boolean;
  } = {},
) {
  const calls: {
    url: string;
    body: Record<string, unknown>;
    headers: Headers;
    method: string;
  }[] = [];
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({
        url,
        body,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
      });
      if (url.endsWith("/auth/v1/user"))
        return options.invalidToken
          ? json({ error: "expired" }, 401)
          : json({ id });
      if (url.endsWith("/foundation_bootstrap"))
        return json({
          profile: {
            userId: options.mismatchedSubject ? targetId : id,
            active: options.active ?? true,
            roles: options.roles ?? ["system_administrator"],
          },
        });
      if (url.endsWith("/admin/users"))
        return options.createFailure
          ? json({ message: "raw diagnostics secret-service-test" }, 422)
          : json({ id: targetId });
      if (url.includes("/admin/users/"))
        return options.rollbackFailure
          ? json({ message: "operator detail" }, 500)
          : json({});
      if (url.endsWith("/save_profile"))
        return options.profileFailure
          ? json({ message: "Validation: invalid department diagnostic" }, 400)
          : json({ userId: targetId, name: "Synthetic" });
      throw new Error(`Unexpected test request: ${url}`);
    },
  );
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

describe("authenticated account gateway", () => {
  it("denies hostile origins and missing sessions before any backend access", async () => {
    const { fetcher, calls } = backend();
    const handle = createFoundationHandler(config, fetcher);
    expect(
      (
        await handle(
          request("adminCreateAccount", account, {
            origin: "https://hostile.test",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handle(
          request("adminCreateAccount", account, { authorization: "" }),
        )
      ).status,
    ).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it("rejects expired, inactive and subject-mismatched sessions", async () => {
    for (const options of [
      { invalidToken: true },
      { active: false },
      { mismatchedSubject: true },
    ]) {
      const { fetcher, calls } = backend(options);
      expect([401, 403]).toContain(
        (await createFoundationHandler(config, fetcher)(request())).status,
      );
      expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
    }
  });
  it("denies provisioning to representatives despite forged browser role fields", async () => {
    const { fetcher, calls } = backend({ roles: ["representative"] });
    expect(
      (
        await createFoundationHandler(
          config,
          fetcher,
        )(
          request("adminCreateAccount", {
            ...account,
            callerId: id,
            callerRoles: ["system_administrator"],
          }),
        )
      ).status,
    ).toBe(403);
    expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
  });
  it("creates accounts with privileged Auth only and saves the audited profile as caller", async () => {
    const { fetcher, calls } = backend();
    const response = await createFoundationHandler(config, fetcher)(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      profile: { userId: targetId, name: "Synthetic" },
    });
    expect(
      calls
        .find((call) => call.url.endsWith("/admin/users"))!
        .headers.get("Authorization"),
    ).toBe("Bearer secret-service-test");
    const saved = calls.find((call) => call.url.endsWith("/save_profile"))!;
    expect(saved.headers.get("Authorization")).toBe("Bearer token");
    expect(saved.body.p_input).toMatchObject({
      userId: targetId,
      departmentId,
      roles: ["requester"],
      active: true,
      operationKey,
    });
    expect(saved.body.p_input).not.toHaveProperty("password");
  });
  it("updates active state and role assignments through caller-authorized profile RPC", async () => {
    const { fetcher, calls } = backend();
    const response = await createFoundationHandler(
      config,
      fetcher,
    )(
      request("adminUpdateAccount", {
        ...account,
        userId: targetId,
        active: false,
      }),
    );
    expect(response.status).toBe(200);
    expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
    expect(calls.at(-1)?.body.p_input).toMatchObject({
      userId: targetId,
      active: false,
    });
  });
  it("rejects invalid passwords, roles, identifiers and active status before mutation", async () => {
    for (const [action, payload] of [
      ["adminCreateAccount", { ...account, password: "short" }],
      ["adminCreateAccount", { ...account, roles: ["invented"] }],
      ["adminCreateAccount", { ...account, departmentId: "invalid" }],
      ["adminUpdateAccount", { ...account, userId: targetId, active: "false" }],
    ] as const) {
      const { fetcher, calls } = backend();
      expect(
        (
          await createFoundationHandler(
            config,
            fetcher,
          )(request(action, payload))
        ).status,
      ).toBe(400);
      expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
      expect(calls.some((call) => call.url.endsWith("/save_profile"))).toBe(
        false,
      );
    }
  });
  it("does not provision accounts without the private service configuration", async () => {
    const { fetcher, calls } = backend();
    expect(
      (
        await createFoundationHandler(
          { ...config, serviceKey: undefined },
          fetcher,
        )(request())
      ).status,
    ).toBe(503);
    expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
  });
  it("deletes just-created Auth accounts after failed transactional profile setup", async () => {
    const { fetcher, calls } = backend({ profileFailure: true });
    const response = await createFoundationHandler(config, fetcher)(request());
    expect(response.status).toBe(400);
    expect(calls.at(-1)).toMatchObject({
      url: `${config.supabaseUrl}/auth/v1/admin/users/${targetId}`,
      method: "DELETE",
    });
    const body = await response.text();
    expect(body).not.toContain("secret-service-test");
    expect(body).not.toContain("local-only-password");
    expect(body).not.toContain("diagnostic");
  });
  it("reports operator reconciliation when compensating deletion also fails", async () => {
    const { fetcher } = backend({
      profileFailure: true,
      rollbackFailure: true,
    });
    const response = await createFoundationHandler(config, fetcher)(request());
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("operator reconciliation");
  });
  it("does not disclose raw Auth administration errors", async () => {
    const { fetcher, calls } = backend({ createFailure: true });
    const response = await createFoundationHandler(config, fetcher)(request());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("secret-service-test");
    expect(calls.some((call) => call.url.endsWith("/save_profile"))).toBe(
      false,
    );
  });
  it("has no classification, embedding or other AI action", async () => {
    const { fetcher, calls } = backend();
    const handler = createFoundationHandler(config, fetcher);
    for (const action of [
      "classify",
      "retryEmbedding",
      "match",
      "generateReport",
    ])
      expect((await handler(request(action, {}))).status).toBe(400);
    expect(calls.every((call) => call.url.startsWith(config.supabaseUrl))).toBe(
      true,
    );
    expect(calls.some((call) => call.url.includes("/admin/"))).toBe(false);
  });
  it("bounds streamed request bodies without trusting Content-Length", async () => {
    await expect(boundedBytes(new Response("oversized"), 3)).rejects.toThrow(
      "size limit",
    );
    const { fetcher } = backend();
    const response = await createFoundationHandler(
      config,
      fetcher,
    )(
      new Request("https://edge.test/foundation", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: "x".repeat(100_001),
      }),
    );
    expect(response.status).toBe(400);
  });
});
