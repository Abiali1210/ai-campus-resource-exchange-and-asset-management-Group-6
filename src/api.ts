import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import seed from "../tests/fixtures/foundation.json";
import { matchesFilters, validateAsset } from "./domain";
import type {
  AccountInput,
  AssetDetail,
  AssetInput,
  AssetView,
  Bootstrap,
  Department,
  Filters,
  Profile,
  Ai5Outcomes,
  C9ActivityReport,
  Ai5Snapshot,
  Ai5Narrative,
  Ai5WorkspaceItem,
} from "./types";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const configured = Boolean(
  url && key && !url.includes("your-project") && !key.includes("your-"),
);
const client = configured ? createClient(url!, key!) : null;
const operationKey = () => crypto.randomUUID();
export class ServiceError extends Error {
  constructor(
    message: string,
    public code = "ServiceError",
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// This is a public, synthetic read-only preview, not an authentication substitute.
const preview: AssetView[] = seed.stockPortions
  .filter((p) => p.state === "Available")
  .map((portion) => {
    const asset = seed.assets.find((a) => a.assetId === portion.assetId)!;
    return {
      ...asset,
      ...portion,
      trackingMode: asset.trackingMode as AssetView["trackingMode"],
      categoryName:
        seed.categories.find((c) => c.categoryId === asset.categoryId)?.name ??
        "Unclassified",
      departmentName: seed.departments.find(
        (d) => d.departmentId === portion.ownerDepartmentId,
      )!.name,
      unitValue: null,
      specifications: asset.specifications,
    };
  });

export class FoundationService {
  readonly configured = configured;
  private assetIds = new Map<string, string>();
  private get db(): SupabaseClient {
    if (!client)
      throw new ServiceError(
        "Connect a Supabase project to sign in and save changes.",
        "NotConfigured",
      );
    return client;
  }
  protected async rpc<T>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw new ServiceError(error.message, error.code);
    return data as T;
  }
  async activityReport(
    start: string,
    end: string,
    departmentId: string | null,
  ): Promise<C9ActivityReport> {
    return this.rpc<C9ActivityReport>("c9_activity_report", {
      p_start: start,
      p_end: end,
      p_department: departmentId,
    });
  }
  async ai5Outcomes(
    start: string,
    end: string,
    departmentId: string | null,
  ): Promise<Ai5Outcomes> {
    return this.rpc<Ai5Outcomes>("ai5_outcome_breakdown", {
      p_start: start,
      p_end: end,
      p_department: departmentId,
    });
  }
  async ai5Snapshots(): Promise<Ai5Snapshot[]> {
    return this.rpc<Ai5Snapshot[]>("ai5_report_workspace", { p_limit: 20 });
  }
  async captureAi5Snapshot(key: string): Promise<Ai5Snapshot> {
    return this.rpc<Ai5Snapshot>("ai5_capture_report", {
      p_idempotency_key: key,
    });
  }
  async ai5Workspace(): Promise<Ai5WorkspaceItem[]> {
    return this.rpc("ai5_narrative_workspace");
  }
  async ai5PublishedNarratives(): Promise<Ai5WorkspaceItem[]> {
    return this.rpc("ai5_published_narratives");
  }
  async editAi5Narrative(id: string, text: string): Promise<Ai5Narrative> {
    return this.rpc("ai5_edit_narrative", { p_id: id, p_text: text });
  }
  async markAi5Ready(id: string): Promise<Ai5Narrative> {
    return this.rpc("ai5_mark_ready", { p_id: id });
  }
  async publishAi5Narrative(id: string): Promise<Ai5Narrative> {
    return this.rpc("ai5_publish_narrative", { p_id: id });
  }
  async generateAi5(
    snapshotId: string,
    idempotencyKey: string,
  ): Promise<Ai5Narrative> {
    const { data, error } = await this.db.functions.invoke("ai5-generate", {
      body: { snapshotId, idempotencyKey },
    });
    if (error)
      throw new ServiceError(
        "Summary generation failed; snapshot facts remain authoritative and available.",
        "provider",
      );
    if (data?.error?.code) {
      const messages: Record<string, string> = {
        timeout:
          "Summary generation timed out; snapshot facts remain available and authoritative.",
        quota:
          "Summary generation is temporarily unavailable due to quota; snapshot facts remain available and authoritative.",
        provider:
          "Summary generation is temporarily unavailable; snapshot facts remain available and authoritative.",
        malformed:
          "Summary response was invalid; snapshot facts remain available and authoritative.",
        validation:
          "Summary could not be validated; snapshot facts remain available and authoritative.",
      };
      const code = String(data.error.code);
      throw new ServiceError(
        messages[code] ??
          "Summary generation failed; snapshot facts remain available and authoritative.",
        code,
      );
    }
    if (
      !data ||
      !data.report ||
      typeof data.report.narrative_id !== "string" ||
      data.report.snapshot_id !== snapshotId
    )
      throw new ServiceError(
        "Summary response was invalid; no generated summary was saved.",
        "InvalidResponse",
      );
    return data.report as Ai5Narrative;
  }
  /** Calls a caller-authenticated Edge Function (used by the AI #4 assistant). */
  invokeFunction = (
    name: string,
    options: { body: unknown },
  ): Promise<{ data: any; error: any }> =>
    this.db.functions.invoke(
      name,
      options as { body: Record<string, unknown> },
    );
  private remember(rows: AssetView[]): AssetView[] {
    for (const r of rows) {
      // The permission-scoped SQL projection omits financial keys entirely when
      // forbidden. Normalize their absence for display, never invent zero value.
      r.unitValue = r.unitValue ?? null;
      this.assetIds.set(r.portionId, r.assetId);
    }
    return rows;
  }
  async session(): Promise<Profile | null> {
    if (!client) return null;
    const {
      data: { session },
      error,
    } = await client.auth.getSession();
    if (error) throw new ServiceError(error.message);
    if (!session) return null;
    const boot = await this.rpc<Bootstrap & { profile: Profile }>(
      "foundation_bootstrap",
    );
    if (!boot.profile?.active) {
      await client.auth.signOut();
      return null;
    }
    return boot.profile;
  }
  async signIn(email: string, password: string): Promise<Profile> {
    const { error } = await this.db.auth.signInWithPassword({
      email,
      password,
    });
    if (error)
      throw new ServiceError(
        "Sign-in failed. Check your account details or contact the technical administrator.",
        "Unauthorized",
      );
    try {
      const profile = await this.session();
      if (!profile)
        throw new ServiceError(
          "This account is inactive or not provisioned.",
          "Forbidden",
        );
      return profile;
    } catch (error) {
      await this.db.auth.signOut();
      throw error;
    }
  }
  async signOut(): Promise<void> {
    const { error } = await this.db.auth.signOut();
    if (error) throw new ServiceError(error.message);
  }
  async bootstrap(): Promise<Bootstrap> {
    if (!client)
      return {
        categories: seed.categories,
        departments: seed.departments,
        profiles: [],
      };
    return this.rpc<Bootstrap>("foundation_bootstrap");
  }
  previewCatalogue(filters: Filters = {}): Promise<AssetView[]> {
    return Promise.resolve(
      this.remember(preview.filter((a) => matchesFilters(a, filters))),
    );
  }
  async catalogue(filters: Filters = {}): Promise<AssetView[]> {
    return this.remember(
      await this.rpc<AssetView[]>("search_assets", {
        p_filters: { ...filters, marketplaceOnly: !filters.own },
      }),
    );
  }
  async getAsset(assetId: string, portionId?: string): Promise<AssetDetail> {
    if (!client) {
      const asset = preview.find((a) => a.assetId === assetId);
      if (!asset) throw new ServiceError("Asset unavailable.", "NotFound");
      return { asset, history: [] };
    }
    const detail = await this.rpc<AssetDetail>("asset_detail", {
      p_asset_id: assetId,
      ...(portionId ? { p_portion_id: portionId } : {}),
    });
    this.remember([detail.asset]);
    return detail;
  }
  async saveAsset(input: AssetInput): Promise<AssetView> {
    validateAsset(input);
    const row = await this.rpc<AssetView>("save_asset", {
      p_input: { ...input, operationKey: operationKey() },
    });
    this.remember([row]);
    return row;
  }
  private async publication(
    portionId: string,
    version: number,
    publish: boolean,
  ): Promise<void> {
    const assetId = this.assetIds.get(portionId);
    if (!assetId)
      throw new ServiceError(
        "Reload the asset before changing publication.",
        "Conflict",
      );
    await this.rpc("set_publication", {
      p_asset_id: assetId,
      p_expected_version: version,
      p_publish: publish,
      p_operation_key: operationKey(),
    });
  }
  publishAsset(portionId: string, version: number): Promise<void> {
    return this.publication(portionId, version, true);
  }
  withdrawAsset(portionId: string, version: number): Promise<void> {
    return this.publication(portionId, version, false);
  }
  private async edge<T>(action: string, payload: unknown): Promise<T> {
    const { data, error } = await this.db.functions.invoke("foundation", {
      body: { action, payload },
    });
    if (error) {
      let message = error.message;
      try {
        const body = await error.context?.json();
        message = body?.error?.message ?? body?.error ?? message;
      } catch {
        /* response can be absent during network outage */
      }
      throw new ServiceError(String(message), "ServiceUnavailable");
    }
    if (data?.error)
      throw new ServiceError(
        data.error.message ?? String(data.error),
        data.error.code,
      );
    return (data?.data ?? data) as T;
  }
  async saveDepartment(
    input: Partial<Department> & { name: string },
  ): Promise<void> {
    await this.rpc("save_department", {
      p_input: { ...input, operationKey: operationKey() },
    });
  }
  async createAccount(input: AccountInput): Promise<void> {
    await this.edge("adminCreateAccount", {
      ...input,
      operationKey: operationKey(),
    });
  }
  async updateAccount(input: AccountInput): Promise<void> {
    await this.edge("adminUpdateAccount", {
      ...input,
      operationKey: operationKey(),
    });
  }
}
export const api = new FoundationService();
