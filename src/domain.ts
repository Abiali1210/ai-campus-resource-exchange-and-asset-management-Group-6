import type { AssetInput, AssetView, Filters } from "./types";
export class ValidationError extends Error {
  constructor(public fields: Record<string, string>) {
    super(Object.values(fields).join(" "));
    this.name = "ValidationError";
  }
}
export function validateAsset(input: AssetInput): void {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Enter an asset name.";
  if (!Number.isInteger(input.totalQty) || input.totalQty <= 0)
    errors.totalQty = "Quantity must be a positive whole number.";
  else if (input.trackingMode === "individual" && input.totalQty !== 1)
    errors.totalQty = "Individually tracked assets must have quantity one.";
  if (!input.ownerDepartmentId)
    errors.ownerDepartmentId = "Choose an owning department.";
  if (!input.custodianId)
    errors.custodianId = "Choose an authorized custodian.";
  if (!input.assignedLocation.trim())
    errors.assignedLocation = "Enter a location.";
  if (
    input.unitValue !== null &&
    (!Number.isFinite(input.unitValue) || input.unitValue < 0)
  )
    errors.unitValue = "Value must be zero or a positive number.";
  if (
    input.unitMassKg != null &&
    (!Number.isFinite(input.unitMassKg) || input.unitMassKg <= 0)
  )
    errors.unitMassKg = "Mass must be positive when supplied.";
  if (
    input.purchaseDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate) ||
      !Number.isFinite(Date.parse(input.purchaseDate)) ||
      new Date(input.purchaseDate).toISOString().slice(0, 10) !==
        input.purchaseDate)
  )
    errors.purchaseDate = "Enter a valid purchase date.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
}
export function matchesFilters(
  asset: AssetView,
  filters: Filters,
  now = new Date(),
): boolean {
  const keyword = (filters.keyword ?? "").trim().toLowerCase();
  const haystack = [
    asset.name,
    asset.description,
    ...asset.tags,
    JSON.stringify(asset.specifications),
  ]
    .join(" ")
    .toLowerCase();
  if (keyword && !haystack.includes(keyword)) return false;
  if (filters.categoryId && filters.categoryId !== asset.categoryId)
    return false;
  if (filters.condition && filters.condition !== asset.condition) return false;
  if (filters.departmentId && filters.departmentId !== asset.ownerDepartmentId)
    return false;
  if (
    filters.location &&
    !asset.assignedLocation
      .toLowerCase()
      .includes(filters.location.toLowerCase())
  )
    return false;
  if (filters.state && filters.state !== asset.state) return false;
  if (filters.availability === "available" && asset.state !== "Available")
    return false;
  if (filters.minQty !== undefined && asset.qty < filters.minQty) return false;
  const age = asset.purchaseDate
    ? (now.getTime() - Date.parse(asset.purchaseDate)) / (365.25 * 86400000)
    : null;
  if (filters.minAge !== undefined && (age === null || age < filters.minAge))
    return false;
  if (filters.maxAge !== undefined && (age === null || age > filters.maxAge))
    return false;
  if (
    filters.minValue !== undefined &&
    (asset.unitValue === null || asset.unitValue < filters.minValue)
  )
    return false;
  if (
    filters.maxValue !== undefined &&
    (asset.unitValue === null || asset.unitValue > filters.maxValue)
  )
    return false;
  return true;
}
