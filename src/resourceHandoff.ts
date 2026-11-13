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

export function clearHandoffPortion<T extends { portionId: string }>(
  state: T,
): T {
  return { ...state, portionId: "" };
}
