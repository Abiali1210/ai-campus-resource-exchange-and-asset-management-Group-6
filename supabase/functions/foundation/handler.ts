import {
  GatewayError,
  ROLE_KEYS,
  boundedBytes,
  object,
  stringList,
  text,
  uuid,
  type JsonObject,
} from "./validation.ts";

export interface GatewayConfig {
  supabaseUrl: string;
  adminAuth?: {
    createUser(email: string, password: string): Promise<string | null>;
    deleteUser(userId: string): Promise<boolean>;
  };
  allowedOrigins: string[];
}
type Fetch = typeof fetch;

/** Authenticated technical account administration. No business approval authority. */
export function createFoundationHandler(
  config: GatewayConfig,
  requestFetch: Fetch = fetch,
) {
  const url = config.supabaseUrl.replace(/\/$/, "");
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const allowed = !origin || config.allowedOrigins.includes(origin);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, apikey, content-type, x-client-info",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers });
    if (!allowed)
      return json(
        { error: { code: "Forbidden", message: "Origin is not allowed." } },
        403,
      );
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return json({ error: { code: "Validation", message: "Use POST." } }, 405);

    try {
      if (
        !url.startsWith("https://") &&
        !/^http:\/\/(localhost|127\.0\.0\.1|kong)(:|\/)/.test(url + "/")
      )
        throw new GatewayError(
          "Configuration",
          "Service configuration is unavailable.",
          503,
        );
      const authorization = request.headers.get("authorization") ?? "";
      if (!/^Bearer \S+$/i.test(authorization))
        throw new GatewayError("Unauthorized", "Sign in to continue.", 401);
      const publishableKey = request.headers.get("apikey") ?? "";
      if (!publishableKey.startsWith("sb_publishable_"))
        throw new GatewayError(
          "Unauthorized",
          "A valid publishable API key is required.",
          401,
        );
      const callerHeaders = {
        apikey: publishableKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      };
      const auth = await requestFetch(`${url}/auth/v1/user`, {
        headers: callerHeaders,
      });
      if (!auth.ok)
        throw new GatewayError(
          "Unauthorized",
          "Your session is invalid or expired.",
          401,
        );
      const subject = object(await auth.json());
      const userId = uuid(subject.id, "User");

      async function rpc(
        name: string,
        parameters: JsonObject,
      ): Promise<unknown> {
        const response = await requestFetch(`${url}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: callerHeaders,
          body: JSON.stringify(parameters),
        });
        if (!response.ok) {
          // SQL messages are bounded to known categories; never forward raw diagnostics.
          let message = "";
          try {
            message = String(object(await response.json()).message ?? "");
          } catch {
            /* retain safe fallback */
          }
          const code =
            [
              "Unauthorized",
              "Forbidden",
              "Validation",
              "Conflict",
              "NotFound",
            ].find((value) => message.startsWith(value)) ??
            (response.status === 403 ? "Forbidden" : "Conflict");
          const statuses: Record<string, number> = {
            Unauthorized: 401,
            Forbidden: 403,
            Validation: 400,
            Conflict: 409,
            NotFound: 404,
          };
          throw new GatewayError(
            code,
            code === "Forbidden"
              ? "You do not have permission for this action."
              : `${code}: the operation could not be completed.`,
            statuses[code] ?? 409,
          );
        }
        return response.json();
      }

      const bootstrap = object(await rpc("foundation_bootstrap", {}));
      const profile = object(bootstrap.profile);
      if (profile.userId !== userId || profile.active !== true)
        throw new GatewayError(
          "Forbidden",
          "This account is inactive or unavailable.",
          403,
        );
      const roles = stringList(profile.roles, "roles", 9);
      const input = object(
        JSON.parse(
          new TextDecoder().decode(
            await boundedBytes(new Response(request.body), 100_000),
          ),
        ),
      );
      const action = text(input.action, "Action", 40);
      const payload = object(input.payload ?? {});

      if (action === "adminCreateAccount" || action === "adminUpdateAccount") {
        if (!roles.includes("system_administrator"))
          throw new GatewayError(
            "Forbidden",
            "Technical administration permission is required.",
            403,
          );
        const name = text(payload.name, "Name", 120);
        const departmentId = uuid(payload.departmentId, "Department");
        const assigned = stringList(payload.roles, "roles", 9);
        if (
          !assigned.length ||
          assigned.some(
            (role) => !(ROLE_KEYS as readonly string[]).includes(role),
          )
        )
          throw new GatewayError(
            "Validation",
            "Select valid role assignments.",
          );
        const operationKey = uuid(payload.operationKey, "Operation key");
        if (action === "adminUpdateAccount") {
          if (typeof payload.active !== "boolean")
            throw new GatewayError("Validation", "Active status is required.");
          const result = await rpc("save_profile", {
            p_input: {
              userId: uuid(payload.userId, "User"),
              name,
              departmentId,
              roles: assigned,
              active: payload.active,
              operationKey,
            },
          });
          return json({ profile: result });
        }
        const adminAuth = config.adminAuth;
        if (!adminAuth)
          throw new GatewayError(
            "Configuration",
            "Account provisioning has not been configured.",
            503,
          );
        const email = text(payload.email, "Email", 254).toLowerCase();
        const password = payload.password;
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          typeof password !== "string" ||
          password.length < 12 ||
          password.length > 128
        )
          throw new GatewayError(
            "Validation",
            "Use a valid email and an initial password of 12–128 characters.",
          );
        const createdUserId = await adminAuth.createUser(email, password);
        if (!createdUserId)
          throw new GatewayError(
            "Conflict",
            "The account could not be created. Check whether it already exists.",
            409,
          );
        const createdId = uuid(createdUserId, "Created user");
        try {
          const result = await rpc("save_profile", {
            p_input: {
              userId: createdId,
              name,
              departmentId,
              roles: assigned,
              active: true,
              operationKey,
            },
          });
          return json({ profile: result }, 201);
        } catch (error) {
          try {
            if (!(await adminAuth.deleteUser(createdId)))
              throw new Error("Compensation failed");
          } catch {
            throw new GatewayError(
              "Conflict",
              "Account setup needs operator reconciliation. Check Auth and profile records before retrying.",
              409,
            );
          }
          throw error;
        }
      }

      throw new GatewayError("Validation", "Unknown action.");
    } catch (error) {
      if (error instanceof GatewayError)
        return json(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      if (error instanceof SyntaxError)
        return json(
          {
            error: {
              code: "Validation",
              message: "Request body must be valid JSON.",
            },
          },
          400,
        );
      return json(
        {
          error: {
            code: "Unavailable",
            message: "The service could not complete this request.",
          },
        },
        503,
      );
    }
  };
}
