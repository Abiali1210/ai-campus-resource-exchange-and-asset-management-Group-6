export type AssetSource = {
  name: string;
  category: string;
  description: string;
  tags: unknown;
  specifications: unknown;
};

function clean(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
function bounded(value: string, max: number, field: string): string {
  if (Array.from(value).length > max)
    throw new Error(`canonical_${field}_limit`);
  return value;
}
function stable(value: unknown): string {
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("canonical_invalid_specification");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(clean(value));
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (
    (typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype) ||
    (value !== null &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) === null)
  )
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  throw new Error("invalid_specification");
}
export function canonicalizeAsset(s: AssetSource): string {
  const name = bounded(clean(s.name), 200, "name"),
    category = bounded(clean(s.category), 120, "category"),
    description = bounded(clean(s.description ?? ""), 4000, "description");
  const rawTags = s.tags ?? [];
  if (!Array.isArray(rawTags)) throw new Error("canonical_invalid_tags");
  const normalizedTags = rawTags
    .map((x) => {
      if (typeof x !== "string") throw new Error("canonical_invalid_tags");
      return bounded(clean(x), 100, "tag");
    })
    .filter(Boolean);
  const tags = [...new Set(normalizedTags)].sort();
  if (tags.length > 50) throw new Error("canonical_tag_count_limit");
  const specs = stable(s.specifications ?? {});
  bounded(specs, 6000, "specifications");
  const result = `Asset name: ${name}\nCategory: ${category}\nDescription: ${description}\nTags: ${tags.join(", ")}\nSpecifications: ${specs}`;
  return bounded(result, 12000, "text");
}
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
