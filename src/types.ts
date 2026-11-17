export const ROLES = [
  "requester",
  "representative",
  "business_administrator",
  "maintenance",
  "facilities",
  "procurement",
  "finance",
  "sustainability",
  "system_administrator",
] as const;
export type Role = (typeof ROLES)[number];
export const STATES = [
  "Registered",
  "In Use",
  "Available",
  "Reserved",
  "In Transfer",
  "Under Maintenance",
  "Unfit",
  "Pending End-of-Life",
  "Retired",
  "Donated",
  "Recycled",
  "Dismantled",
  "Disposed",
] as const;
export const CONDITIONS = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "Unknown",
] as const;
export interface Profile {
  userId: string;
  name: string;
  departmentId: string;
  active: boolean;
  roles: Role[];
  email?: string;
}
export interface Department {
  departmentId: string;
  name: string;
  active: boolean;
}
export interface Category {
  categoryId: string;
  parentCategoryId: string | null;
  name: string;
}
export interface AssetView {
  canEdit?: boolean;
  assetId: string;
  portionId: string;
  name: string;
  description: string;
  categoryId: string | null;
  categoryName: string;
  totalQty: number;
  qty: number;
  trackingMode: "individual" | "batch";
  condition: string;
  state: string;
  ownerDepartmentId: string;
  departmentName: string;
  custodianId: string;
  assignedLocation: string;
  physicalLocation: string;
  purchaseDate: string | null;
  unitValue: number | null;
  tags: string[];
  materials: string[];
  specifications: Record<string, unknown>;
  version: number;
  unitMassKg?: number | null;
}
export interface AuditEvent {
  auditId: string;
  event: string;
  occurredAt: string;
  actorId: string | null;
  before: unknown;
  after: unknown;
}
export interface AssetDetail {
  asset: AssetView;
  history: AuditEvent[];
}
export interface SelectedResource {
  portionId: string;
  assetId: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  departmentName: string;
  qty: number;
  condition: string;
  assignedLocation: string;
  preferredRequestId?: string;
}
export interface AssetInput {
  assetId?: string;
  portionId?: string;
  name: string;
  description: string;
  categoryId: string | null;
  trackingMode: "individual" | "batch";
  totalQty: number;
  condition: string;
  ownerDepartmentId: string;
  custodianId: string;
  assignedLocation: string;
  purchaseDate: string | null;
  unitValue: number | null;
  tags: string[];
  materials: string[];
  specifications: Record<string, unknown>;
  expectedVersion?: number;
  unitMassKg?: number | null;
}
export interface Filters {
  keyword?: string;
  categoryId?: string;
  condition?: string;
  departmentId?: string;
  location?: string;
  minQty?: number;
  availability?: string;
  state?: string;
  minAge?: number;
  maxAge?: number;
  minValue?: number;
  maxValue?: number;
  own?: boolean;
}
export interface AccountInput {
  userId?: string;
  email?: string;
  password?: string;
  name: string;
  departmentId: string;
  roles: Role[];
  active: boolean;
}
export interface Bootstrap {
  categories: Category[];
  departments: Department[];
  profiles: Profile[];
}
export interface Ai5Snapshot {
  snapshot_id: string;
  schema_version: number;
  calculation_version: string;
  period_start: string;
  period_end: string;
  captured_at: string;
  facts: {
    requests_submitted: number;
    open_requests: number;
    completed_transfers: number;
    units_successfully_transferred: number;
  };
  idempotency_key: string;
  created_by: string;
  creator_name?: string | null;
}
export interface Ai5Narrative {
  narrative_id: string;
  snapshot_id: string;
  status: "Draft" | "Ready" | "Published";
  generated_text: string;
  current_text: string;
  model_id: string;
  request_metadata: Record<string, unknown>;
  idempotency_key: string;
  created_by: string | null;
  created_at: string | null;
  edited_by: string | null;
  edited_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_by: string | null;
  published_at: string | null;
  creator_name?: string | null;
  editor_name?: string | null;
  reviewer_name?: string | null;
  publisher_name?: string | null;
}
export interface Ai5WorkspaceItem {
  snapshot: Ai5Snapshot;
  narrative: Ai5Narrative | null;
}

export interface Ai5Outcomes {
  period: { start: string; end: string };
  scope: { departmentId: string | null; departmentName: string };
  basis: string;
  requests: Record<string, number>;
  allocations: Record<string, number>;
  transfers: Record<string, number>;
}
