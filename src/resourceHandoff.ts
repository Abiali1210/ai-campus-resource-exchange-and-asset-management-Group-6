import type { AssetView } from "./types";
import type { ResourceRequest } from "./workflows";

export function eligiblePortions(rows: AssetView[], assetId: string) {
  return rows.filter(
    (row) =>
      row.assetId === assetId && row.state === "Available" && row.qty > 0,
  );
}

export function selectedPortionIsStale(
  selected: { portionId: string } | null,
  catalogue: AssetView[],
) {
  if (!selected) return false;
  const current = catalogue.find((row) => row.portionId === selected.portionId);
  return !current || current.state !== "Available" || current.qty <= 0;
}

export function resolveExactAvailableResource(
  rows: AssetView[],
  assetId: string,
  portionId: string,
) {
  return (
    rows.find(
      (row) =>
        row.assetId === assetId &&
        row.portionId === portionId &&
        row.state === "Available" &&
        row.qty > 0,
    ) ?? null
  );
}

export function compatibleRequests<T extends ResourceRequest>(
  requests: T[],
  userId: string,
  departmentId: string,
  representative: boolean,
  categoryId: string | null,
) {
  if (!categoryId) return [];
  return requests.filter(
    (request) =>
      (request.requesterId === userId ||
        (representative && request.departmentId === departmentId)) &&
      request.categoryId === categoryId &&
      request.remainingQty > 0 &&
      !["Closed", "Canceled", "Fulfilled"].includes(request.status),
  );
}

export function preferredCompatibleRequest<T extends ResourceRequest>(
  preferredId: string | undefined,
  compatible: T[],
  current: string,
) {
  if (preferredId)
    return compatible.some((request) => request.requestId === preferredId)
      ? preferredId
      : "";
  return compatible.length === 1
    ? compatible[0].requestId
    : compatible.some((request) => request.requestId === current)
      ? current
      : "";
}

export function clearHandoffPortion<T extends { portionId: string }>(
  state: T,
): T {
  return { ...state, portionId: "" };
}
