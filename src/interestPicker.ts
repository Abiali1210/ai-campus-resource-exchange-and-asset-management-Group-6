import type { AssetView } from "./types";
import type { ResourceRequest } from "./workflows";

// Mirrors public.workflow_suitable's condition order: only these conditions can
// ever be approved, and a portion must be at least as good as the minimum.
const CONDITION_RANK = ["Excellent", "Good", "Fair"];

// Postgres jsonb containment (`a @> b`) for values nested inside an object:
// objects match key by key, arrays match when every wanted element is contained
// by some element, and scalars must be equal and of the same type.
export function jsonContains(have: unknown, want: unknown): boolean {
  if (Array.isArray(want))
    return (
      Array.isArray(have) &&
      want.every((w) => have.some((h) => jsonContains(h, w)))
    );
  if (want !== null && typeof want === "object")
    return (
      have !== null &&
      typeof have === "object" &&
      !Array.isArray(have) &&
      Object.entries(want).every(
        ([key, value]) =>
          Object.prototype.hasOwnProperty.call(have, key) &&
          jsonContains((have as Record<string, unknown>)[key], value),
      )
    );
  return have === want;
}

export function conditionMeetsMinimum(condition: string, minimum: string) {
  const rank = CONDITION_RANK.indexOf(condition),
    floor = CONDITION_RANK.indexOf(minimum);
  return rank >= 0 && floor >= 0 && rank <= floor;
}

/** Client-side mirror of public.workflow_suitable for the Interest picker. */
export function suitableForRequest(
  request: Pick<ResourceRequest, "categoryId" | "condition" | "specifications">,
  asset: Pick<AssetView, "categoryId" | "condition" | "specifications">,
) {
  return (
    asset.categoryId === request.categoryId &&
    conditionMeetsMinimum(asset.condition, request.condition) &&
    jsonContains(asset.specifications ?? {}, request.specifications ?? {})
  );
}

/** Splits picker candidates into those that can be approved and a hidden count. */
export function suitablePortions<T extends AssetView>(
  rows: T[],
  request: Pick<
    ResourceRequest,
    "categoryId" | "condition" | "specifications"
  > | null,
) {
  if (!request) return { rows, hidden: 0 };
  const suitable = rows.filter((row) => suitableForRequest(request, row));
  return { rows: suitable, hidden: rows.length - suitable.length };
}

export function searchPortions<T extends AssetView>(rows: T[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.name, row.departmentName, row.assignedLocation, row.physicalLocation]
      .filter(Boolean)
      .some((text) => text.toLowerCase().includes(needle)),
  );
}

/**
 * Readable option text without portion IDs. Identical texts are told apart by
 * assigned location, and only if that still collides by a "#2", "#3" counter.
 */
export function portionOptionLabels(rows: AssetView[]) {
  const base = rows.map(
    (a) =>
      `${a.name} · ${a.departmentName} · ${a.qty} available · ${a.condition}`,
  );
  const count = (labels: string[], label: string) =>
    labels.filter((l) => l === label).length;
  const located = base.map((label, i) =>
    count(base, label) > 1 && rows[i].assignedLocation
      ? `${label} · ${rows[i].assignedLocation}`
      : label,
  );
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  rows.forEach((row, i) => {
    const label = located[i];
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    labels.set(
      row.portionId,
      count(located, label) > 1 && n > 1 ? `${label} · #${n}` : label,
    );
  });
  return labels;
}
