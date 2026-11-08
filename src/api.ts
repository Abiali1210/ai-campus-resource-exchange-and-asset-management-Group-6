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
  private async rpc<T>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw new ServiceError(error.message, error.code);
    return data as T;
  }
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
  async getAsset(assetId: string): Promise<AssetDetail> {
    if (!client) {
      const asset = preview.find((a) => a.assetId === assetId);
      if (!asset) throw new ServiceError("Asset unavailable.", "NotFound");
      return { asset, history: [] };
    }
    const detail = await this.rpc<AssetDetail>("asset_detail", {
      p_asset_id: assetId,
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
