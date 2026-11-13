import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "./api";
import universityLogo from "./assets/branding/khalifa-university-colour-white-background.jpg";
import {
  CONDITIONS,
  ROLES,
  type AccountInput,
  type AssetDetail,
  type AssetInput,
  type AssetView,
  type Bootstrap,
  type Filters,
  type Profile,
  type Role,
} from "./types";
import "./styles.css";

const WorkflowPanel = lazy(() =>
  import("./WorkflowPanel").then((module) => ({
    default: module.WorkflowPanel,
  })),
);

const ROLE_NAMES: Record<Role, string> = {
  requester: "Requester",
  representative: "Representative / Custodian",
  business_administrator: "Business Administrator",
  maintenance: "Maintenance Staff",
  facilities: "Facilities Staff",
  procurement: "Procurement Officer",
  finance: "Finance Officer",
  sustainability: "Sustainability Officer",
  system_administrator: "System Administrator",
};
const emptyMetadata: Bootstrap = {
  categories: [],
  departments: [],
  profiles: [],
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Your entered information has been kept. Please try again.";
const fmtMoney = (value: number | null) =>
  value === null
    ? "Unavailable or not recorded"
    : new Intl.NumberFormat("en-AE", {
        style: "currency",
        currency: "AED",
        maximumFractionDigits: 0,
      }).format(value);
const dateLabel = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
const isRepresentative = (profile: Profile | null) =>
  !!profile?.roles.includes("representative");
const financialAccess = (profile: Profile | null) =>
  !!profile?.roles.some((r) =>
    [
      "representative",
      "business_administrator",
      "finance",
      "maintenance",
    ].includes(r),
  );

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    box: (
      <>
        <path d="m3 7 9-4 9 4v10l-9 4-9-4Z" />
        <path d="m3 7 9 4 9-4M12 11v10M7 5l10 4" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v2" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    leaf: (
      <>
        <path d="M5 18C0 9 10 3 21 3c0 11-7 21-16 15ZM5 18 17 7" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.box}
    </svg>
  );
}

function AssetArt({ asset }: { asset: AssetView }) {
  const chair = /chair/i.test(asset.categoryName + " " + asset.name),
    projector = /projector/i.test(asset.categoryName + " " + asset.name);
  return (
    <div
      className={`asset-art ${chair ? "chairs" : projector ? "projector" : ""}`}
    >
      <div className="art-grid" />
      <span className="category-label">
        {asset.categoryName || "Uncategorized"}
      </span>
      <svg viewBox="0 0 180 130" aria-hidden="true">
        {chair ? (
          <>
            <path
              d="M61 50V17q0-8 8-8h40q8 0 8 8v33"
              fill="#bcae91"
              stroke="#6d725b"
              strokeWidth="2"
            />
            <path
              d="M56 58h67l5 15H51Z"
              fill="#c7bca0"
              stroke="#6d725b"
              strokeWidth="2"
            />
            <path
              d="m59 74-8 44m69-44 9 44M65 73l2 40m46-40-2 40"
              stroke="#6d725b"
              strokeWidth="4"
            />
            <path d="M70 23h37M70 34h37" stroke="#d8d1ba" strokeWidth="2" />
          </>
        ) : projector ? (
          <>
            <path
              d="m39 52 94-9 18 20-4 36-111 2Z"
              fill="#d4dcd1"
              stroke="#6c7c69"
              strokeWidth="2"
            />
            <path
              d="m38 53 109 10M39 81h38M44 88h31"
              stroke="#92a28a"
              strokeWidth="2"
            />
            <ellipse cx="119" cy="79" rx="19" ry="16" fill="#55735b" />
            <ellipse cx="119" cy="79" rx="11" ry="9" fill="#aec8bb" />
            <path d="M48 103v6m86-9v7" stroke="#6c7c69" strokeWidth="4" />
          </>
        ) : (
          <>
            <rect
              x="31"
              y="11"
              width="118"
              height="79"
              rx="4"
              fill="#466550"
              stroke="#36543e"
              strokeWidth="2"
            />
            <rect x="37" y="17" width="106" height="65" rx="1" fill="#cfddc6" />
            <path d="m38 69 40-33 33 24 32-22v44H38Z" fill="#b6c9a9" />
            <path
              d="M80 91v19m19-19v19M66 114h48"
              stroke="#55734e"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="132" cy="28" r="6" fill="#e8eecb" />
          </>
        )}
      </svg>
      <span className="qty-label">
        {asset.qty} {asset.qty === 1 ? "unit" : "units"} ·{" "}
        {asset.trackingMode === "batch" ? "batch" : "individual"}
      </span>
    </div>
  );
}

function Dialog({
  title,
  eyebrow,
  children,
  onClose,
  narrow = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  narrow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${narrow ? "narrow" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={ref}
      >
        <div className="dialog-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button
            className="close-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
  hint?: string;
}) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Login({
  onLogin,
  onClose,
}: {
  onLogin: (profile: Profile) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api.signIn(email, password));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Welcome back"
      eyebrow="Your campus account"
      onClose={onClose}
      narrow
    >
      <p className="login-intro">
        Sign in with the account created by your system administrator.
      </p>
      <form className="login-form" onSubmit={submit}>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <Field label="Email address">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="button" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </Dialog>
  );
}

function AssetEditor({
  asset,
  metadata,
  profile,
  onSave,
  onClose,
}: {
  asset?: AssetView;
  metadata: Bootstrap;
  profile: Profile;
  onSave: (saved: AssetView) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AssetInput>(() =>
    asset
      ? { ...asset, expectedVersion: asset.version }
      : {
          name: "",
          description: "",
          categoryId: null,
          trackingMode: "individual",
          totalQty: 1,
          condition: "Unknown",
          ownerDepartmentId: profile.departmentId,
          custodianId: profile.userId,
          assignedLocation: "",
          purchaseDate: null,
          unitValue: null,
          tags: [],
          materials: [],
          specifications: {},
        },
  );
  const [specs, setSpecs] = useState<[string, string][]>(
    Object.entries(form.specifications).map(([key, value]) => [
      key,
      typeof value === "string" ? value : String(value),
    ]),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = <K extends keyof AssetInput>(key: K, value: AssetInput[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const usable = specs.filter(([key, value]) => key.trim() || value.trim());
      if (usable.some(([key, value]) => !key.trim() || !value.trim()))
        throw new Error("Each specification needs both a name and a value.");
      if (
        new Set(usable.map(([key]) => key.trim().toLowerCase())).size !==
        usable.length
      )
        throw new Error("Use each specification name only once.");
      const saved = await api.saveAsset({
        ...form,
        specifications: Object.fromEntries(
          usable.map(([key, value]) => [key.trim(), value.trim()]),
        ),
      });
      onSave(saved);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const custodians = metadata.profiles.filter(
    (p) =>
      p.active &&
      p.departmentId === form.ownerDepartmentId &&
      p.roles.includes("representative"),
  );
  return (
    <Dialog
      title={asset ? "Edit asset" : "Register a resource"}
      eyebrow="Department inventory"
      onClose={onClose}
    >
      <p className="form-description">
        Register the resource with its category and declared condition.
        Publication is a separate decision from the asset details.
      </p>
      <form onSubmit={submit}>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Asset name *" full>
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Dell 24-inch monitor"
            />
          </Field>
          <Field label="Description" full>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the resource, its intended use and any known limitations."
            />
          </Field>
          <Field label="Category *">
            <select
              required
              value={form.categoryId ?? ""}
              onChange={(e) => set("categoryId", e.target.value || null)}
            >
              <option value="">Choose a category</option>
              {metadata.categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Condition"
            hint={
              asset
                ? "Condition changes require a separate authorized assessment."
                : undefined
            }
          >
            <select
              disabled={!!asset}
              value={form.condition}
              onChange={(e) => set("condition", e.target.value)}
            >
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Tracking mode">
            <select
              disabled={!!asset}
              value={form.trackingMode}
              onChange={(e) => {
                set("trackingMode", e.target.value as "individual" | "batch");
                if (e.target.value === "individual") set("totalQty", 1);
              }}
            >
              <option value="individual">Individual asset</option>
              <option value="batch">Quantity-based batch</option>
            </select>
          </Field>
          <Field
            label="Total quantity *"
            hint="Individual assets always contain one unit."
          >
            <input
              type="number"
              required
              min="1"
              step="1"
              disabled={form.trackingMode === "individual" || !!asset}
              value={form.totalQty}
              onChange={(e) => set("totalQty", Number(e.target.value))}
            />
          </Field>
          <Field label="Owning department *">
            <select
              required
              value={form.ownerDepartmentId}
              disabled
              onChange={(e) => set("ownerDepartmentId", e.target.value)}
            >
              {metadata.departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custodian *">
            <select
              required
              value={form.custodianId}
              onChange={(e) => set("custodianId", e.target.value)}
            >
              {!custodians.some((p) => p.userId === form.custodianId) && (
                <option value={form.custodianId}>
                  {form.custodianId === profile.userId
                    ? profile.name
                    : "Current custodian"}
                </option>
              )}
              {custodians.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assigned location *" full>
            <input
              required
              maxLength={200}
              value={form.assignedLocation}
              onChange={(e) => set("assignedLocation", e.target.value)}
              placeholder="Engineering / Store 1"
            />
          </Field>
          <Field label="Purchase date">
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.purchaseDate ?? ""}
              onChange={(e) => set("purchaseDate", e.target.value || null)}
            />
          </Field>
          <Field
            label="Estimated unit value (AED)"
            hint="Leave blank when unknown."
          >
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unitValue ?? ""}
              onChange={(e) =>
                set(
                  "unitValue",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </Field>
          <div className="field full">
            <span>Technical specifications</span>
            {specs.map(([key, value], index) => (
              <div className="specification-row" key={index}>
                <input
                  aria-label={`Specification ${index + 1} name`}
                  placeholder="e.g. Connector"
                  value={key}
                  onChange={(e) =>
                    setSpecs((rows) =>
                      rows.map((row, i) =>
                        i === index ? [e.target.value, row[1]] : row,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Specification ${index + 1} value`}
                  placeholder="e.g. HDMI"
                  value={value}
                  onChange={(e) =>
                    setSpecs((rows) =>
                      rows.map((row, i) =>
                        i === index ? [row[0], e.target.value] : row,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove specification ${index + 1}`}
                  onClick={() =>
                    setSpecs((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary small"
              onClick={() => setSpecs((rows) => [...rows, ["", ""]])}
            >
              + Add specification
            </button>
            <small>Add a name and value for each relevant feature.</small>
          </div>
        </div>
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save asset record"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function AssetDetails({
  asset,
  profile,
  preview,
  onClose,
  onChanged,
  onEdit,
}: {
  asset: AssetView;
  profile: Profile | null;
  preview: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (asset: AssetView) => void;
}) {
  const [detail, setDetail] = useState<Pick<AssetDetail, "asset" | "history">>({
      asset,
      history: [],
    }),
    [loading, setLoading] = useState(!preview),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const current = detail.asset,
    canEdit =
      !preview &&
      isRepresentative(profile) &&
      profile?.departmentId === current.ownerDepartmentId &&
      current.canEdit === true &&
      current.qty === current.totalQty &&
      ["Registered", "In Use", "Available"].includes(current.state);
  const reload = async () =>
    setDetail(await api.getAsset(asset.assetId, asset.portionId));
  useEffect(() => {
    if (preview) return;
    let active = true;
    api
      .getAsset(asset.assetId, asset.portionId)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [asset.assetId, asset.portionId, preview]);
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await work();
      await reload();
      setSuccess(message);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={current.name} eyebrow="Asset record" onClose={onClose}>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          {success}
        </div>
      )}
      {preview && (
        <div className="notice">
          Synthetic preview. This view is read-only; account permissions and
          file access require the configured backend.
        </div>
      )}
      {loading ? (
        <div className="loading">Loading asset details…</div>
      ) : (
        <>
          <div className="detail-layout">
            <div className="detail-art">
              <AssetArt asset={current} />
              <p className="detail-description">
                {current.description || "No description recorded."}
              </p>
              <div className="tag-list">
                {current.tags.map((tag, i) => (
                  <span className="tag" key={i}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <dl className="detail-facts">
                <div>
                  <dt>Department</dt>
                  <dd>{current.departmentName}</dd>
                </div>
                <div>
                  <dt>Quantity</dt>
                  <dd>
                    {current.qty} / {current.totalQty} units
                  </dd>
                </div>
                <div>
                  <dt>Condition</dt>
                  <dd>
                    <span
                      className={`badge ${current.condition === "Unknown" ? "warn" : ""}`}
                    >
                      {current.condition === "Unknown"
                        ? "Unknown · assess before use"
                        : current.condition}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Life-cycle state</dt>
                  <dd>{current.state}</dd>
                </div>
                <div>
                  <dt>Assigned location</dt>
                  <dd>{current.assignedLocation}</dd>
                </div>
                <div>
                  <dt>Physical location</dt>
                  <dd>{current.physicalLocation}</dd>
                </div>
                <div>
                  <dt>Purchase date</dt>
                  <dd>{current.purchaseDate || "Not recorded"}</dd>
                </div>
                {financialAccess(profile) && (
                  <div>
                    <dt>Unit value</dt>
                    <dd>{fmtMoney(current.unitValue)}</dd>
                  </div>
                )}
                <div>
                  <dt>Record version</dt>
                  <dd>{current.version}</dd>
                </div>
              </dl>
            </div>
          </div>
          <p className="form-description">
            Publication makes a resource discoverable. It does not approve its
            suitability, reservation or transfer.
          </p>
          {Object.keys(current.specifications).length > 0 && (
            <div className="detail-section">
              <h3>Technical specifications</h3>
              <dl className="detail-facts">
                {Object.entries(current.specifications).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {!canEdit &&
            !preview &&
            isRepresentative(profile) &&
            profile?.departmentId === current.ownerDepartmentId && (
              <p className="notice">
                Catalogue actions are unavailable for this split or restricted
                asset. Review its transfer status in Requests and transfers.
              </p>
            )}
          {canEdit && (
            <div className="detail-actions">
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => onEdit(current)}
              >
                Edit record
              </button>
              {current.state === "Available" ? (
                <button
                  disabled={busy}
                  className="button secondary small"
                  onClick={() =>
                    act(
                      () =>
                        api.withdrawAsset(current.portionId, current.version),
                      "Listing withdrawn; history retained.",
                    )
                  }
                >
                  Withdraw listing
                </button>
              ) : (
                ["Registered", "In Use"].includes(current.state) && (
                  <button
                    disabled={busy}
                    className="button small"
                    onClick={() =>
                      act(
                        () =>
                          api.publishAsset(current.portionId, current.version),
                        "Eligible stock published.",
                      )
                    }
                  >
                    Publish surplus
                  </button>
                )
              )}
            </div>
          )}
          <div className="detail-section">
            <h3>Asset history</h3>
            {detail.history.length === 0 ? (
              <p>
                {preview
                  ? "History requires a configured, authenticated backend."
                  : "No history visible for this record."}
              </p>
            ) : (
              detail.history.map((event) => (
                <div className="history-row" key={event.auditId}>
                  <div>
                    <strong>{event.event.replaceAll("_", " ")}</strong>
                    <small>Actor: {event.actorId || "System"}</small>
                    <details>
                      <summary>Change details</summary>
                      <pre className="setup-code">
                        {JSON.stringify(
                          { before: event.before, after: event.after },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                  <small>{dateLabel(event.occurredAt)}</small>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}

function AccountEditor({
  profile,
  metadata,
  onSave,
  onClose,
}: {
  profile?: Profile;
  metadata: Bootstrap;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AccountInput>(
    profile
      ? { ...profile }
      : {
          name: "",
          email: "",
          password: "",
          departmentId:
            metadata.departments.find((d) => d.active)?.departmentId ?? "",
          roles: ["requester"],
          active: true,
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (profile) await api.updateAccount(form);
      else await api.createAccount(form);
      onSave();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={profile ? "Edit account" : "Create campus account"}
      eyebrow="Technical administration"
      onClose={onClose}
    >
      <p className="form-description">
        Assign only the roles this person needs. System Administrator does not
        grant business approval authority.
      </p>
      <form onSubmit={submit}>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Full name *">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Department *">
            <select
              required
              value={form.departmentId}
              onChange={(e) =>
                setForm({ ...form, departmentId: e.target.value })
              }
            >
              {metadata.departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                  {!d.active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </Field>
          {!profile && (
            <>
              <Field label="Email *">
                <input
                  required
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field
                label="Initial password *"
                hint="Share securely outside the repository."
              >
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </Field>
            </>
          )}
          <div className="field full">
            <span>Assigned roles</span>
            <div className="role-options">
              {ROLES.map((role) => (
                <label className="role-option" key={role}>
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        roles: e.target.checked
                          ? [...form.roles, role]
                          : form.roles.filter((r) => r !== role),
                      })
                    }
                  />
                  {ROLE_NAMES[role]}
                </label>
              ))}
            </div>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Account active
          </label>
        </div>
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : profile ? "Save account" : "Create account"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [metadata, setMetadata] = useState<Bootstrap>(emptyMetadata),
    [assets, setAssets] = useState<AssetView[]>([]),
    [view, setView] = useState<"catalogue" | "own" | "admin" | "workflows">(
      "catalogue",
    ),
    [filters, setFilters] = useState<Filters>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [modal, setModal] = useState<
      "login" | "setup" | "asset" | "edit" | "account" | "department" | null
    >(null),
    [selected, setSelected] = useState<AssetView | null>(null),
    [editAccount, setEditAccount] = useState<Profile | undefined>(),
    [editDepartment, setEditDepartment] = useState<
      { departmentId: string; name: string; active: boolean } | undefined
    >(),
    [adminTab, setAdminTab] = useState<"accounts" | "departments">("accounts"),
    [refresh, setRefresh] = useState(0);
  const preview = !api.configured;
  useEffect(() => {
    let live = true;
    async function init() {
      try {
        const p = api.configured ? await api.session() : null;
        if (live) {
          setProfile(p);
          if (
            p?.roles.includes("system_administrator") &&
            !p.roles.some((r) => r !== "system_administrator")
          )
            setView("admin");
        }
        if (p || !api.configured) {
          const m = await api.bootstrap();
          if (live) setMetadata(m);
        }
      } catch (e) {
        if (live) setError(errorText(e));
      } finally {
        if (live) setLoading(false);
      }
    }
    void init();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (view === "admin" || view === "workflows" || (!preview && !profile))
      return;
    let active = true;
    setLoading(true);
    const f = { ...filters, own: view === "own" };
    const request = preview ? api.previewCatalogue(f) : api.catalogue(f);
    request
      .then((rows) => {
        if (active) setAssets(rows);
      })
      .catch((e) => {
        if (active) {
          setAssets([]);
          setError(errorText(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, view, profile, refresh, preview]);
  const close = () => setModal(null);
  const reload = () => setRefresh((n) => n + 1);
  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({
      ...f,
      [key]:
        value === ""
          ? undefined
          : ["minQty", "minAge", "maxAge", "minValue", "maxValue"].includes(key)
            ? Number(value)
            : value,
    }));
  };
  const technical = !!profile?.roles.includes("system_administrator");
  const hasReadRole =
    !profile || profile.roles.some((r) => r !== "system_administrator");
  async function signedIn(p: Profile) {
    setProfile(p);
    setModal(null);
    setError("");
    setView(
      p.roles.includes("system_administrator") &&
        !p.roles.some((r) => r !== "system_administrator")
        ? "admin"
        : "catalogue",
    );
    try {
      setMetadata(await api.bootstrap());
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function signOut() {
    try {
      await api.signOut();
      setProfile(null);
      setAssets([]);
      setView("catalogue");
      setFilters({});
      setMetadata(emptyMetadata);
      setModal(null);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function afterAdminSave() {
    setModal(null);
    try {
      setMetadata(await api.bootstrap());
      setSuccess("Administration change saved and audited.");
    } catch (e) {
      setError(errorText(e));
    }
  }
  function openEdit(asset: AssetView) {
    setSelected(asset);
    setModal("edit");
  }
  const title =
    view === "workflows"
      ? "Follow each request through to receipt."
      : view === "own"
        ? "Keep your department’s resources in circulation."
        : view === "admin"
          ? "The right access, for the right people."
          : "A better home for campus resources.";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img
          className="university-logo"
          src={universityLogo}
          alt="Khalifa University"
          width="5286"
          height="1913"
        />
        <div className="brand">
          <span className="brand-mark">
            <Icon name="leaf" size={21} />
          </span>
          <div>
            circular<small>CAMPUS EXCHANGE</small>
          </div>
        </div>
        <p className="nav-caption">Workspace</p>
        <nav aria-label="Main navigation">
          {profile?.roles.some((r) =>
            ["requester", "representative", "facilities"].includes(r),
          ) && (
            <button
              className={`nav-item ${view === "workflows" ? "active" : ""}`}
              onClick={() => {
                setView("workflows");
                setError("");
              }}
            >
              <span className="nav-symbol">
                <Icon name="arrow" />
              </span>
              Requests and transfers
            </button>
          )}
          {hasReadRole && (
            <button
              className={`nav-item ${view === "catalogue" ? "active" : ""}`}
              onClick={() => {
                setView("catalogue");
                setError("");
              }}
            >
              <span className="nav-symbol">
                <Icon name="grid" />
              </span>
              Resource catalogue
            </button>
          )}
          {isRepresentative(profile) && (
            <button
              className={`nav-item ${view === "own" ? "active" : ""}`}
              onClick={() => {
                setView("own");
                setError("");
              }}
            >
              <span className="nav-symbol">
                <Icon name="box" />
              </span>
              Department inventory
            </button>
          )}
          {technical && (
            <button
              className={`nav-item ${view === "admin" ? "active" : ""}`}
              onClick={() => {
                setView("admin");
                setError("");
              }}
            >
              <span className="nav-symbol">
                <Icon name="people" />
              </span>
              Administration
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            Good resources deserve
            <br />
            more than one useful life.
          </div>
          <div className="profile-mini">
            <div className="avatar">
              {profile
                ? profile.name
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                : "KU"}
            </div>
            <div>
              <strong>{profile?.name || "Campus community"}</strong>
              <small>
                {profile
                  ? ROLE_NAMES[profile.roles[0]] || "Campus account"
                  : preview
                    ? "Read-only preview"
                    : "Sign in to participate"}
              </small>
            </div>
          </div>
          {profile ? (
            <button className="sidebar-link" onClick={signOut}>
              Sign out
            </button>
          ) : (
            <button
              className="sidebar-link"
              onClick={() => setModal(preview ? "setup" : "login")}
            >
              {preview ? "Connection setup" : "Sign in"}
            </button>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-path">
            Workspace <span aria-hidden="true"> / </span>
            <strong>
              {view === "admin"
                ? "Administration"
                : view === "workflows"
                  ? "Requests and transfers"
                  : view === "own"
                    ? "Department inventory"
                    : "Resource catalogue"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="campus-label">
              <span className="status-dot" />
              Khalifa University
            </span>
            {preview ? (
              <span className="preview-pill">Synthetic preview</span>
            ) : profile ? (
              <span className="preview-pill">Signed in</span>
            ) : (
              <button
                className="button secondary small"
                onClick={() => setModal("login")}
              >
                Sign in
              </button>
            )}
          </div>
        </header>
        <main className="page-content">
          <section
            className={`hero${view === "workflows" ? " workflow-hero" : ""}`}
          >
            <div>
              {view !== "workflows" && (
                <p className="eyebrow">
                  {view === "admin"
                    ? "Access & departments"
                    : "Less waste. More possibility."}
                </p>
              )}
              <h1 className="hero-title">{title}</h1>
              <p className="hero-subtitle">
                {view === "admin"
                  ? "Manage departmental membership and explicit role assignments. Every change remains traceable."
                  : view === "workflows"
                    ? "Create requests, review interests and track transfers to receipt."
                    : view === "own"
                      ? "Maintain accurate records, review condition and make surplus resources discoverable across campus."
                      : "Discover useful equipment and furniture already on campus. Explore what’s available before buying something new."}
              </p>
            </div>
            <div className="hero-actions">
              {isRepresentative(profile) &&
                view !== "admin" &&
                view !== "workflows" && (
                  <button
                    className="button"
                    onClick={() => {
                      setSelected(null);
                      setModal("edit");
                    }}
                  >
                    <span className="plus" aria-hidden="true">
                      +
                    </span>
                    Register a resource
                  </button>
                )}
              {view === "admin" && technical && (
                <button
                  className="button"
                  onClick={() => {
                    if (adminTab === "accounts") {
                      setEditAccount(undefined);
                      setModal("account");
                    } else {
                      setEditDepartment(undefined);
                      setModal("department");
                    }
                  }}
                >
                  <span className="plus" aria-hidden="true">
                    +
                  </span>
                  {adminTab === "accounts"
                    ? "Create account"
                    : "Add department"}
                </button>
              )}
            </div>
          </section>
          {preview && (
            <div className="setup-banner">
              <span className="notice-icon">
                <Icon name="leaf" />
              </span>
              <div>
                <strong>
                  You’re exploring a read-only synthetic catalogue.
                </strong>{" "}
                Sign-in and changes require your Supabase connection.{" "}
                <button onClick={() => setModal("setup")}>
                  View setup steps →
                </button>
              </div>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {success && (
            <div className="notice success" role="status">
              {success}
              <button
                aria-label="Dismiss message"
                onClick={() => setSuccess("")}
              >
                ×
              </button>
            </div>
          )}
          {!preview && !profile ? (
            <div className="empty-state">
              <h2>Your campus account opens the catalogue.</h2>
              <p>
                Sign in to see the resources and actions permitted for your
                role.
              </p>
              <button className="button" onClick={() => setModal("login")}>
                Sign in to continue
              </button>
            </div>
          ) : view === "workflows" && profile ? (
            <Suspense fallback={<p role="status">Opening workflows…</p>}>
              <WorkflowPanel profile={profile} metadata={metadata} />
            </Suspense>
          ) : view === "admin" ? (
            <>
              <div
                className="tab-row"
                role="tablist"
                aria-label="Administration"
              >
                <button
                  role="tab"
                  aria-selected={adminTab === "accounts"}
                  className={`tab-button ${adminTab === "accounts" ? "active" : ""}`}
                  onClick={() => setAdminTab("accounts")}
                >
                  Accounts & roles
                </button>
                <button
                  role="tab"
                  aria-selected={adminTab === "departments"}
                  className={`tab-button ${adminTab === "departments" ? "active" : ""}`}
                  onClick={() => setAdminTab("departments")}
                >
                  Departments
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        {adminTab === "accounts" ? "Person" : "Department"}
                      </th>
                      <th>{adminTab === "accounts" ? "Roles" : "Status"}</th>
                      <th>
                        {adminTab === "accounts" ? "Department" : "Manage"}
                      </th>
                      {adminTab === "accounts" && <th>Manage</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {adminTab === "accounts"
                      ? metadata.profiles.map((p) => (
                          <tr key={p.userId}>
                            <td>
                              {p.name}
                              <small>{p.active ? "Active" : "Inactive"}</small>
                            </td>
                            <td>
                              {p.roles.map((r) => ROLE_NAMES[r]).join(", ") ||
                                "No role assigned"}
                            </td>
                            <td>
                              {
                                metadata.departments.find(
                                  (d) => d.departmentId === p.departmentId,
                                )?.name
                              }
                            </td>
                            <td>
                              <button
                                className="button secondary small"
                                onClick={() => {
                                  setEditAccount(p);
                                  setModal("account");
                                }}
                              >
                                Edit account
                              </button>
                            </td>
                          </tr>
                        ))
                      : metadata.departments.map((d) => (
                          <tr key={d.departmentId}>
                            <td>{d.name}</td>
                            <td>
                              <span
                                className={`badge ${d.active ? "" : "muted"}`}
                              >
                                {d.active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="button secondary small"
                                onClick={() => {
                                  setEditDepartment(d);
                                  setModal("department");
                                }}
                              >
                                Edit department
                              </button>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <section className="search-panel" aria-label="Search resources">
                <div className="search-top">
                  <label className="searchbox">
                    <Icon name="search" size={18} />
                    <span className="screen-reader">
                      Search resource name and description
                    </span>
                    <input
                      placeholder="Try ‘monitor’, ‘chairs’ or ‘projector’"
                      value={filters.keyword ?? ""}
                      onChange={(e) => setFilter("keyword", e.target.value)}
                    />
                  </label>
                  <button
                    className="button secondary"
                    onClick={() => setFilters({})}
                  >
                    Clear filters
                  </button>
                </div>
                <div className="filters">
                  <div className="filter-field">
                    <label htmlFor="category">Category</label>
                    <select
                      id="category"
                      value={filters.categoryId ?? ""}
                      onChange={(e) => setFilter("categoryId", e.target.value)}
                    >
                      <option value="">All categories</option>
                      {metadata.categories.map((c) => (
                        <option key={c.categoryId} value={c.categoryId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-field">
                    <label htmlFor="condition">Condition</label>
                    <select
                      id="condition"
                      value={filters.condition ?? ""}
                      onChange={(e) => setFilter("condition", e.target.value)}
                    >
                      <option value="">Any condition</option>
                      {CONDITIONS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-field">
                    <label htmlFor="department">Department</label>
                    <select
                      id="department"
                      value={filters.departmentId ?? ""}
                      onChange={(e) =>
                        setFilter("departmentId", e.target.value)
                      }
                    >
                      <option value="">All departments</option>
                      {metadata.departments.map((d) => (
                        <option key={d.departmentId} value={d.departmentId}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
              <div className="results-heading">
                <h2>
                  {view === "own"
                    ? "Department inventory"
                    : "Available resources"}{" "}
                  <span className="muted">({assets.length})</span>
                </h2>
                <small>
                  {preview
                    ? "Demonstration records only"
                    : "Results follow your access permissions"}
                </small>
              </div>
              {loading ? (
                <div className="loading" role="status">
                  Finding campus resources…
                </div>
              ) : (
                <div className="catalogue-grid">
                  {assets.map((asset) => (
                    <button
                      className="asset-card"
                      key={asset.portionId}
                      onClick={() => {
                        setSelected(asset);
                        setModal("asset");
                      }}
                      aria-label={`View ${asset.name}`}
                    >
                      <AssetArt asset={asset} />
                      <div className="asset-body">
                        <h3>{asset.name}</h3>
                        <div className="asset-dept">
                          <Icon name="pin" size={12} />
                          {asset.departmentName} ·{" "}
                          {asset.assignedLocation.split("/").at(-1)?.trim()}
                        </div>
                        <div className="asset-footer">
                          <span
                            className={`badge ${asset.condition === "Unknown" ? "warn" : asset.state === "Unfit" ? "danger" : ""}`}
                          >
                            {asset.condition === "Unknown"
                              ? "Condition unknown"
                              : asset.condition + " condition"}
                          </span>
                          <span className="asset-arrow">
                            <Icon name="arrow" size={16} />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {assets.length === 0 && (
                    <div className="empty-state">
                      <h3>No resources match these filters.</h3>
                      <p>
                        Try a broader keyword or clear a filter. Searching does
                        not close a resource request.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => setFilters({})}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              )}
              <footer className="catalogue-footnote">
                <span>
                  Reuse starts with reliable information. Confirm suitability
                  before requesting a transfer.
                </span>
                <span>COSC 336 · Group 6</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {modal === "login" && (
        <Login onLogin={(p) => void signedIn(p)} onClose={close} />
      )}{" "}
      {modal === "setup" && (
        <Dialog
          title="Connect your campus prototype"
          eyebrow="Local setup"
          onClose={close}
        >
          <div className="setup-instructions">
            <p className="form-description">
              The catalogue shown here uses synthetic fixtures. No sign-in or
              write action is simulated.
            </p>
            <ol>
              <li>
                Apply the repository’s Supabase migrations and provision the
                synthetic test accounts.
              </li>
              <li>
                Copy <code>.env.example</code> to a local environment file and
                configure the public Supabase URL and publishable key.
              </li>
              <li>
                Restart the application, then sign in with your provisioned test
                account.
              </li>
            </ol>
            <div className="notice">
              Never put a Supabase secret key in frontend environment variables.
              See the repository README for exact setup and verification
              commands.
            </div>
          </div>
        </Dialog>
      )}
      {modal === "asset" && selected && (
        <AssetDetails
          asset={selected}
          profile={profile}
          preview={preview}
          onClose={close}
          onChanged={reload}
          onEdit={openEdit}
        />
      )}{" "}
      {modal === "edit" && profile && (
        <AssetEditor
          asset={selected ?? undefined}
          profile={profile}
          metadata={metadata}
          onClose={close}
          onSave={(saved) => {
            setSelected(saved);
            setModal("asset");
            setSuccess(
              "Asset record saved. Publication is a separate decision.",
            );
            reload();
          }}
        />
      )}
      {modal === "account" && technical && (
        <AccountEditor
          profile={editAccount}
          metadata={metadata}
          onClose={close}
          onSave={() => void afterAdminSave()}
        />
      )}{" "}
      {modal === "department" && technical && (
        <DepartmentEditor
          department={editDepartment}
          onClose={close}
          onSave={() => void afterAdminSave()}
        />
      )}
    </div>
  );
}

function DepartmentEditor({
  department,
  onSave,
  onClose,
}: {
  department?: { departmentId: string; name: string; active: boolean };
  onSave: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(department?.name ?? ""),
    [active, setActive] = useState(department?.active ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.saveDepartment({
        departmentId: department?.departmentId,
        name,
        active,
      });
      onSave();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={department ? "Edit department" : "Add department"}
      eyebrow="Technical administration"
      onClose={onClose}
      narrow
    >
      <form onSubmit={submit}>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <Field label="Department name *">
          <input
            required
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <label className="check-row" style={{ marginTop: 18 }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Department active
        </label>
        <p className="form-description" style={{ marginTop: 15 }}>
          Linked records remain in history. Deactivation is different from
          deleting a department.
        </p>
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save department"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
