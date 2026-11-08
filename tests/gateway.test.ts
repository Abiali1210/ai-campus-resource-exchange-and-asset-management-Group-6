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
const config: Omit<GatewayConfig, "adminAuth"> = {
  supabaseUrl: "https://project.supabase.co",
  allowedOrigins: ["http://localhost:5173"],
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
      apikey: "sb_publishable_test",
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
    createNetworkFailure?: boolean;
  } = {},
) {
  const calls: {
    url: string;
    body: Record<string, unknown>;
    headers: Headers;
    method: string;
  }[] = [];
  const adminAuth = {
    createUser: vi.fn(async (_email: string, _password: string) => {
      if (options.createNetworkFailure)
        throw new Error("server-only-secret-diagnostic");
      if (options.createFailure) return null;
      return targetId;
    }),
    deleteUser: vi.fn(async (_userId: string) => !options.rollbackFailure),
  };
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
      if (url.endsWith("/save_profile"))
        return options.profileFailure
          ? json({ message: "Validation: invalid department diagnostic" }, 400)
          : json({ userId: targetId, name: "Synthetic" });
      throw new Error(`Unexpected test request: ${url}`);
    },
  );
  return { fetcher: fetcher as unknown as typeof fetch, calls, adminAuth };
}

const createHandler = (mock: ReturnType<typeof backend>, adminEnabled = true) =>
  createFoundationHandler(
    { ...config, adminAuth: adminEnabled ? mock.adminAuth : undefined },
    mock.fetcher,
  );

describe("authenticated account gateway", () => {
  it("denies hostile origins and missing sessions before any backend access", async () => {
    const mock = backend();
    const handle = createHandler(mock);
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
    expect(
      (
        await handle(
          request("adminCreateAccount", account, {
            apikey: "sb_secret_not-a-publishable-key",
          }),
        )
      ).status,
    ).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });
  it("rejects expired, inactive and subject-mismatched sessions", async () => {
    for (const options of [
      { invalidToken: true },
      { active: false },
      { mismatchedSubject: true },
    ]) {
      const mock = backend(options);
      expect([401, 403]).toContain(
        (await createHandler(mock)(request())).status,
      );
      expect(mock.adminAuth.createUser).not.toHaveBeenCalled();
    }
  });
  it("denies provisioning to representatives despite forged browser role fields", async () => {
    const mock = backend({ roles: ["representative"] });
    expect(
      (
        await createHandler(mock)(
          request("adminCreateAccount", {
            ...account,
            callerId: id,
            callerRoles: ["system_administrator"],
          }),
        )
      ).status,
    ).toBe(403);
    expect(mock.adminAuth.createUser).not.toHaveBeenCalled();
  });
  it("uses the publishable key and caller JWT for RPCs, with Admin Auth isolated behind its adapter", async () => {
    const mock = backend();
    const response = await createHandler(mock)(
      request("adminCreateAccount", account, {
        apikey: "sb_publishable_caller-test",
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      profile: { userId: targetId, name: "Synthetic" },
    });
    expect(mock.adminAuth.createUser).toHaveBeenCalledWith(
      account.email,
      account.password,
    );
    expect(mock.adminAuth.deleteUser).not.toHaveBeenCalled();
    const authCall = mock.calls.find((call) =>
      call.url.endsWith("/auth/v1/user"),
    )!;
    expect(authCall.headers.get("apikey")).toBe("sb_publishable_caller-test");
    expect(authCall.headers.get("Authorization")).toBe("Bearer token");
    const saved = mock.calls.find((call) => call.url.endsWith("/save_profile"))!;
    expect(saved.headers.get("apikey")).toBe("sb_publishable_caller-test");
    expect(saved.headers.get("Authorization")).toBe("Bearer token");
    expect([...authCall.headers.values(), ...saved.headers.values()].join(" ")).not.toContain("server-only-secret");
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
    const mock = backend();
    const response = await createHandler(mock)(
      request("adminUpdateAccount", {
        ...account,
        userId: targetId,
        active: false,
      }),
    );
    expect(response.status).toBe(200);
    expect(mock.adminAuth.createUser).not.toHaveBeenCalled();
    expect(mock.calls.at(-1)?.body.p_input).toMatchObject({
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
      const mock = backend();
      expect(
        (
          await createHandler(mock)(request(action, payload))
        ).status,
      ).toBe(400);
      expect(mock.adminAuth.createUser).not.toHaveBeenCalled();
      expect(mock.calls.some((call) => call.url.endsWith("/save_profile"))).toBe(
        false,
      );
    }
  });
  it("does not provision accounts without the private Admin Auth adapter", async () => {
    const mock = backend();
    expect(
      (
        await createHandler(mock, false)(request())
      ).status,
    ).toBe(503);
    expect(mock.adminAuth.createUser).not.toHaveBeenCalled();
  });
  it("deletes just-created Auth accounts after failed transactional profile setup", async () => {
    const mock = backend({ profileFailure: true });
    const response = await createHandler(mock)(request());
    expect(response.status).toBe(400);
    expect(mock.adminAuth.deleteUser).toHaveBeenCalledWith(targetId);
    const body = await response.text();
    expect(body).not.toContain("server-only-secret");
    expect(body).not.toContain("local-only-password");
    expect(body).not.toContain("diagnostic");
  });
  it("reports operator reconciliation when compensating deletion also fails", async () => {
    const mock = backend({
      profileFailure: true,
      rollbackFailure: true,
    });
    const response = await createHandler(mock)(request());
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("operator reconciliation");
  });
  it("does not disclose raw Auth administration errors", async () => {
    const mock = backend({ createFailure: true });
    const response = await createHandler(mock)(request());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("server-only-secret-diagnostic");
    expect(mock.calls.some((call) => call.url.endsWith("/save_profile"))).toBe(
      false,
    );
  });
  it("maps thrown Admin Auth failures to a safe unavailable response", async () => {
    const mock = backend({ createNetworkFailure: true });
    const response = await createHandler(mock)(request());
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).not.toContain("server-only-secret-diagnostic");
    expect(mock.calls.some((call) => call.url.endsWith("/save_profile"))).toBe(
      false,
    );
  });
  it("has no classification, embedding or other AI action", async () => {
    const mock = backend();
    const handler = createHandler(mock);
    for (const action of [
      "classify",
      "retryEmbedding",
      "match",
      "generateReport",
    ])
      expect((await handler(request(action, {}))).status).toBe(400);
    expect(mock.calls.every((call) => call.url.startsWith(config.supabaseUrl))).toBe(
      true,
    );
    expect(mock.adminAuth.createUser).not.toHaveBeenCalled();
  });
  it("bounds streamed request bodies without trusting Content-Length", async () => {
    await expect(boundedBytes(new Response("oversized"), 3)).rejects.toThrow(
      "size limit",
    );
    const mock = backend();
    const response = await createHandler(mock)(
      new Request("https://edge.test/foundation", {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          apikey: "sb_publishable_test",
        },
        body: "x".repeat(100_001),
      }),
    );
    expect(response.status).toBe(400);
  });
});
