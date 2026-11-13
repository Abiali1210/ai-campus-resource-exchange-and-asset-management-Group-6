import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { AssetView, Bootstrap, Profile, SelectedResource } from "./types";
import {
  clearHandoffPortion,
  compatibleRequests,
  eligiblePortions,
  selectedPortionIsStale,
} from "./resourceHandoff";
import {
  groupRequests,
  groupTransfers,
  transferActions,
} from "./workflowPresentation";
import { formatSpecifications } from "./requestRequirements";
import {
  beginRequestMatch,
  clampReviewQty,
  failMatch,
  fallbackCopy,
  getRecommendations,
  settleMatch,
  reviewRecommendation,
  visibleRecommendations,
  isWeakRecommendation,
  type Recommendation,
  type MatchState,
} from "./ai2";
import {
  serializeRequirements,
  type RequirementRow,
} from "./requestRequirements";
import {
  WorkflowOperation,
  workflows,
  type WorkflowAction,
  type WorkflowCommand,
  type WorkflowWorkspace,
  type Transfer,
} from "./workflows";

const empty: WorkflowWorkspace = {
  requests: [],
  interests: [],
  transfers: [],
  decisions: [],
  facilities: [],
  history: [],
};
const labelDate = (s: string) => new Date(s).toLocaleString();
const labelDay = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString();
const terminal = ["Completed", "Canceled", "Returned"];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const eventLabels: Record<string, string> = {
  "request.submitted": "Request submitted",
  "interest.recorded": "Interest recorded",
  "reservation.approved": "Reservation approved",
  "reservation.rejected": "Reservation rejected",
  "transfer.approveRelease": "Release approved",
  "transfer.rejectRelease": "Release rejected",
  "transfer.schedule": "Pickup scheduled",
  "transfer.dispatch": "Dispatched",
  "transfer.receive": "Receipt recorded",
  "transfer.reconcile": "Dispute reconciled and accepted",
  "transfer.confirmReturn": "Supplier confirmed return",
  "transfer.cancelTransfer": "Transfer canceled before dispatch",
  "request.closeRequest": "Unmet need closed",
  "request.cancelRequest": "Request canceled",
};
const transferActionCopy: Record<string, string> = {
  "Pending Approval": "Supplier representative: approve or reject release.",
  Approved: "Assigned Facilities staff: arrange pickup.",
  Scheduled: "Assigned Facilities staff: record dispatch.",
  "In Transit":
    "Receiving representative: confirm received quantity and condition.",
  Disputed:
    "Receiving representative: reconcile full acceptance, or supplier representative: confirm full physical return.",
};
function Input({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="workflow-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function ActionForm({
  action,
  base,
  workspace,
  onDone,
  qty,
  initialLocation,
  button,
  holders = [],
}: {
  action: WorkflowAction;
  base: Record<string, unknown>;
  workspace: WorkflowWorkspace;
  onDone: () => void;
  qty?: number;
  initialLocation?: string;
  button: string;
  holders?: { userId: string; name: string }[];
}) {
  const [reason, setReason] = useState(""),
    [amount, setAmount] = useState(qty ?? 1);
  const [facilities, setFacilities] = useState(""),
    [slot, setSlot] = useState(""),
    [arrangements, setArrangements] = useState("");
  const [condition, setCondition] = useState("Good"),
    [location, setLocation] = useState(initialLocation ?? "");
  const [accept, setAccept] = useState(true),
    [handling, setHandling] = useState(""),
    [transport, setTransport] = useState("");
  const [holderId, setHolderId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<WorkflowOperation | null>(null);
  const observation = ["receive", "reconcile", "confirmReturn"].includes(
    action,
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const command: WorkflowCommand = { action, ...base, reason };
    if (
      ["approveReservation", "dispatch", "recordInterest"].includes(action) ||
      observation
    )
      command.qty = amount;
    if (action === "approveRelease") command.facilitiesId = facilities;
    if (action === "schedule")
      Object.assign(command, {
        scheduledAt: new Date(slot).toISOString(),
        arrangements,
        handlingCost: handling === "" ? null : Number(handling),
        transportCost: transport === "" ? null : Number(transport),
      });
    if (observation)
      Object.assign(command, {
        condition,
        location,
        accept,
        holderId: holderId || null,
      });
    if (action === "dispatch") command.location = location;
    if (!pending.current?.matches(command))
      pending.current = new WorkflowOperation(command);
    try {
      await workflows.execute(pending.current);
      pending.current = null;
      onDone();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Change could not be confirmed. Retry the same action.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="workflow-action" onSubmit={submit}>
      {error && (
        <p className="notice error" role="alert">
          {error} Your entries are retained. Reload for stale versions; retry
          unchanged entries after a network failure.
        </p>
      )}
      {(["approveReservation", "recordInterest", "dispatch"].includes(action) ||
        observation) && (
        <Input label="Quantity">
          <input
            type="number"
            min={observation ? 0 : 1}
            max={qty}
            step="1"
            required
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </Input>
      )}
      {action === "approveRelease" && (
        <Input label="Assigned Facilities">
          <select
            required
            value={facilities}
            onChange={(e) => setFacilities(e.target.value)}
          >
            <option value="">Choose assignee</option>
            {workspace.facilities.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
        </Input>
      )}
      {action === "schedule" && (
        <>
          <Input label="Pickup date and time">
            <input
              type="datetime-local"
              required
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            />
          </Input>
          <Input label="Transport arrangements">
            <input
              required
              maxLength={2000}
              value={arrangements}
              onChange={(e) => setArrangements(e.target.value)}
            />
          </Input>
          <Input label="Handling cost AED (optional)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={handling}
              onChange={(e) => setHandling(e.target.value)}
            />
          </Input>
          <Input label="Transport cost AED (optional)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
            />
          </Input>
        </>
      )}
      {(observation || action === "dispatch") && (
        <Input label="Actual physical location">
          <input
            maxLength={200}
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Input>
      )}
      {observation && (
        <>
          <Input label="Actual physical holder">
            <select
              value={holderId}
              onChange={(e) => setHolderId(e.target.value)}
            >
              <option value="">Me, the observing representative</option>
              {holders.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </select>
          </Input>
          <Input label="Observed condition">
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {["Excellent", "Good", "Fair", "Poor", "Unknown"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Input>
          {action === "receive" && (
            <label>
              <input
                type="checkbox"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
              />{" "}
              Accept if full quantity and suitable condition are confirmed
            </label>
          )}
          <p className="muted">
            A short or unsuitable receipt stays disputed and allocated. Full
            physical return requires supplier confirmation. Record who
            physically holds the stock separately from the observing
            representative.
          </p>
        </>
      )}
      <Input label={action === "recordInterest" ? "Selection note" : "Reason"}>
        <input
          required
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Input>
      <button className="button small" disabled={busy}>
        {busy ? "Saving…" : button}
      </button>
    </form>
  );
}
function TransferCard({
  t,
  w,
  profile,
  department,
  done,
}: {
  t: Transfer;
  w: WorkflowWorkspace;
  profile: Profile;
  department: (id: string) => string;
  done: () => void;
}) {
  const [action, setAction] = useState<WorkflowAction | "">("");
  const i = w.interests.find((i) => i.interestId === t.interestId),
    q = w.requests.find((q) => q.requestId === t.requestId);
  const actions = transferActions(t, w, profile);
  const personName = (id: string | null) =>
    t.holders.find((p) => p.userId === id)?.name ??
    (id ? `User ${id.slice(0, 8)}` : "Not recorded");
  return (
    <article className="workflow-card" aria-label={`Transfer ${t.assetName}`}>
      <h3>
        {t.assetName} · {t.qty} unit{t.qty === 1 ? "" : "s"}{" "}
        <span className="badge">{t.state}</span>
      </h3>
      <p>
        Supplier: {department(t.supplierDepartmentId)} · Receiver:{" "}
        {department(t.receiverDepartmentId)} · Request: {q?.purpose}
      </p>
      <p className="workflow-next-action">
        <strong>Next action:</strong>{" "}
        {terminal.includes(t.state)
          ? "No action required."
          : (transferActionCopy[t.state] ??
            "Follow this transfer's current status and history.")}
      </p>
      {t.state === "Disputed" && (
        <p className="muted">
          Physical tracking shows the latest observation. Missing units remain
          unresolved; their location is not established by a short receipt.
        </p>
      )}
      <dl className="workflow-facts">
        <div>
          <dt>Formal owner department</dt>
          <dd>{department(t.ownerDepartmentId)}</dd>
        </div>
        <div>
          <dt>Formal custodian</dt>
          <dd title={t.custodianId}>{personName(t.custodianId)}</dd>
        </div>
        <div>
          <dt>Assigned location</dt>
          <dd>{t.assignedLocation}</dd>
        </div>
        <div>
          <dt>Physical holder</dt>
          <dd title={t.holderId ?? ""}>{personName(t.holderId)}</dd>
        </div>
        <div>
          <dt>Physical location</dt>
          <dd>{t.physicalLocation}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>
            {t.scheduledAt ? labelDate(t.scheduledAt) : "Awaiting schedule"}
          </dd>
        </div>
      </dl>
      {t.arrangements && <p>{t.arrangements}</p>}
      {"handlingCost" in t && "transportCost" in t && (
        <p>
          Handling: {t.handlingCost ?? "unrecorded"} AED · Transport:{" "}
          {t.transportCost ?? "unrecorded"} AED
        </p>
      )}
      <footer className="workflow-card-actions">
        {actions.length > 0 && (
          <Input label="Transfer action">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as WorkflowAction)}
            >
              <option value="">Choose action</option>
              {actions.map(([a, l]) => (
                <option key={a} value={a}>
                  {l}
                </option>
              ))}
            </select>
          </Input>
        )}
        {action && actions.some(([a]) => a === action) && (
          <ActionForm
            key={action + ":" + t.version}
            action={action}
            base={{ transferId: t.transferId, expectedVersion: t.version }}
            qty={t.qty}
            initialLocation={q?.destination}
            workspace={w}
            holders={t.holders}
            button={actions.find(([a]) => a === action)![1]}
            onDone={() => {
              setAction("");
              done();
            }}
          />
        )}
      </footer>
      <details>
        <summary>Decisions and physical handovers</summary>
        {t.approvals.map((a) => (
          <p key={a.approval_id}>
            {a.decision_type}: {a.decision} · {personName(a.actor_id)} ·{" "}
            {labelDate(a.decided_at)} · {a.reason}
          </p>
        ))}
        {t.handovers.map((h) => (
          <p key={h.handover_id}>
            {h.kind}: {h.qty} units, {h.condition},{" "}
            {h.accepted ? "accepted" : "not accepted"} · {h.location} · observed
            by {personName(h.recorded_by)} · held by {personName(h.holder_id)} ·{" "}
            {labelDate(h.recorded_at)} · {h.reason}
          </p>
        ))}
      </details>
    </article>
  );
}
function RecommendationCard({
  row,
  maxQty,
  view,
  done,
  onReviewed,
}: {
  row: Recommendation;
  maxQty: number;
  view: () => void;
  done: () => void;
  onReviewed: (decision: "accepted" | "rejected", interestId?: string) => void;
}) {
  const [note, setNote] = useState(""),
    [amount, setAmount] = useState(1),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const operationKeys = useRef<
    Partial<Record<"accepted" | "rejected", string>>
  >({});
  async function review(decision: "accepted" | "rejected") {
    setBusy(true);
    setMessage("");
    try {
      const result = await reviewRecommendation({
        operationKey:
          operationKeys.current[decision] ??
          (operationKeys.current[decision] = crypto.randomUUID()),
        recommendationId: row.recommendationId,
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(decision === "accepted"
          ? { qty: clampReviewQty(amount, row.availableQty, maxQty) }
          : {}),
      });
      operationKeys.current[decision] = undefined;
      onReviewed(decision, result.interestId);
      setMessage(decision === "accepted" ? "Accepted" : "Rejected");
      done();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className="workflow-card"
      aria-label={`AI recommendation ${row.assetName}`}
    >
      <header className="workflow-card-header">
        <h4>
          {row.rank}. {row.assetName}{" "}
          <span className="badge">{row.reviewState}</span>
        </h4>
      </header>
      <p>Ranking indicator, not a probability.</p>
      <p>
        Ranking score: {row.finalRankScore.toFixed(1)}
        {isWeakRecommendation(row.finalRankScore) && (
          <span className="badge warn">Weak match</span>
        )}{" "}
        · Compatibility: {row.compatibilityScore.toFixed(1)} · {row.condition} ·{" "}
        {row.availableQty} available
      </p>
      <p>{row.reason}</p>
      {row.missingEvidence.length > 0 && (
        <p className="notice">
          Evidence to verify: {row.missingEvidence.join(", ")}
        </p>
      )}
      <div className="workflow-card-actions">
        <button type="button" className="button secondary small" onClick={view}>
          View resource
        </button>
        {row.reviewState === "pending" && (
          <>
            <label className="workflow-field">
              Quantity
              <input
                type="number"
                min="1"
                max={maxQty}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <label className="workflow-field">
              Optional note
              <input
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="button small"
              disabled={busy || amount < 1 || amount > maxQty}
              onClick={() => review("accepted")}
            >
              {busy ? "Saving…" : "Accept"}
            </button>
            <button
              type="button"
              className="button secondary small"
              disabled={busy}
              onClick={() => review("rejected")}
            >
              Reject
            </button>
          </>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </article>
  );
}
export function WorkflowPanel({
  profile,
  metadata,
  selectedResource = null,
  onClearResource,
  onViewResource,
}: {
  profile: Profile;
  metadata: Bootstrap;
  selectedResource?: SelectedResource | null;
  onClearResource?: () => void;
  onViewResource?: () => void;
}) {
  const [w, setW] = useState(empty),
    [catalogue, setCatalogue] = useState<AssetView[]>([]),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [success, setSuccess] = useState("");
  const [activeSection, setActiveSection] = useState("requests");
  const [ai2, setAi2] = useState<Record<string, MatchState>>({});
  const ai2Ref = useRef<Record<string, MatchState>>({});
  const updateAi2 = (
    update: (current: Record<string, MatchState>) => Record<string, MatchState>,
  ) => {
    const next = update(ai2Ref.current);
    ai2Ref.current = next;
    setAi2(next);
  };
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [purpose, setPurpose] = useState(""),
    [category, setCategory] = useState(""),
    [qty, setQty] = useState(1);
  const [condition, setCondition] = useState("Good"),
    [urgency, setUrgency] = useState("Normal"),
    [required, setRequired] = useState("");
  const [destination, setDestination] = useState(""),
    [specs, setSpecs] = useState<RequirementRow[]>([]),
    [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(""),
    [portionId, setPortionId] = useState("");
  const pending = useRef<WorkflowOperation | null>(null);
  const requestPurposeRef = useRef<HTMLInputElement>(null);
  const requestOpenRef = useRef<HTMLButtonElement>(null);
  const canRequest = profile.roles.some((r) =>
    ["requester", "representative"].includes(r),
  );
  const rep = profile.roles.includes("representative");
  const department = (id: string) =>
    metadata.departments.find((d) => d.departmentId === id)?.name ?? id;
  const personName = (id: string | null) =>
    id === profile.userId
      ? profile.name
      : (metadata.profiles.find((p) => p.userId === id)?.name ??
        w.facilities.find((p) => p.userId === id)?.name ??
        w.transfers.flatMap((t) => t.holders).find((p) => p.userId === id)
          ?.name ??
        (id ? `User ${id.slice(0, 8)}` : "System"));
  const done = () => {
    setSuccess("Change saved with its audit history.");
    setRevision((n) => n + 1);
  };
  const findMatches = async (id: string) => {
    const started = beginRequestMatch(ai2Ref, id);
    if (!started) return;
    updateAi2((s) => ({ ...s, [id]: started }));
    try {
      const result = await getRecommendations(id, started.operationKey);
      updateAi2((s) => ({
        ...s,
        [id]: settleMatch(s[id] ?? started, started.generation, result),
      }));
    } catch {
      updateAi2((s) => ({
        ...s,
        [id]: failMatch(s[id] ?? started, started.generation),
      }));
    }
  };
  useEffect(() => {
    let live = true;
    setLoaded(false);
    setError("");
    Promise.all([
      workflows.workspace(),
      canRequest ? api.catalogue() : Promise.resolve([]),
    ])
      .then(([data, assets]) => {
        if (live) {
          setW(data);
          setCatalogue(assets);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [revision, canRequest, profile.userId]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const specifications = serializeRequirements(specs);
      const command: WorkflowCommand = {
        action: "submitRequest",
        purpose,
        categoryId: category,
        qty,
        condition,
        urgency,
        requiredDate: required,
        destination,
        specifications,
      };
      if (!pending.current?.matches(command))
        pending.current = new WorkflowOperation(command);
      const result = await workflows.execute(pending.current);
      pending.current = null;
      setPurpose("");
      setSpecs([]);
      if (selectedResource) {
        setActiveSection("interests");
        setRequestFormOpen(false);
        if (result.requestId) setRequestId(result.requestId);
        else {
          setRequestId("");
          setSuccess(
            "Request submitted, but its ID was not returned. Choose a request manually to continue with this resource.",
          );
        }
        setRevision((n) => n + 1);
      }
      if (!selectedResource) done();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Request could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const own = w.requests.filter(
    (q) =>
      q.requesterId === profile.userId ||
      (rep && q.departmentId === profile.departmentId),
  );
  const selected = own.find((q) => q.requestId === requestId);
  const selectedAsset = catalogue.find((a) => a.portionId === portionId);
  const staleHandoff =
    loaded && selectedPortionIsStale(selectedResource, catalogue);
  const availableHandoffPortions = eligiblePortions(
    catalogue,
    selectedResource?.assetId ?? "",
  );
  const compatible = compatibleRequests(
    w.requests,
    profile.userId,
    profile.departmentId,
    rep,
    selectedResource?.categoryId ?? null,
  );
  useEffect(() => {
    if (!selectedResource) return;
    setActiveSection("interests");
    setPortionId(selectedResource.portionId);
    if (!selectedResource.categoryId)
      setSuccess(
        "This resource has no category. Correct its catalogue category before creating or matching a request.",
      );
  }, [selectedResource?.portionId]);
  useEffect(() => {
    if (selectedResource)
      setRequestId((current) =>
        compatible.length === 1
          ? compatible[0].requestId
          : compatible.some((request) => request.requestId === current)
            ? current
            : "",
      );
  }, [
    selectedResource?.portionId,
    compatible.map((r) => r.requestId).join("|"),
  ]);
  const transferGroups = groupTransfers(w.transfers, w, profile);
  const requestGroups = groupRequests(w.requests);
  return (
    <section aria-label="Requests and transfers" className="workflow-panel">
      <div className="results-heading">
        <h2>Requests and transfers</h2>
        <button
          className="button secondary small"
          onClick={() => setRevision((n) => n + 1)}
        >
          Reload workflows
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error} Your form entries are retained.
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      {selectedResource && (
        <article className="workflow-card selected-resource-card">
          <h3>Selected resource: {selectedResource.name}</h3>
          <p>
            {selectedResource.departmentName} · {selectedResource.qty} available
            · {selectedResource.condition} · {selectedResource.assignedLocation}
          </p>
          {staleHandoff && (
            <p className="notice error" role="alert">
              This selected resource is no longer available in the current
              catalogue. Return to the catalogue to choose another resource or
              clear this selection.
            </p>
          )}
          <div className="workflow-card-actions">
            <button
              type="button"
              className="button secondary small"
              onClick={onViewResource}
            >
              View resource
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setPortionId(clearHandoffPortion({ portionId }).portionId);
                onClearResource?.();
              }}
            >
              Clear selection
            </button>
          </div>
        </article>
      )}
      {loaded && (
        <div className="workflow-summary" aria-label="Workflow summary">
          {[
            ["requests", requestGroups.open.length, "Open requests"],
            [
              "interests",
              w.interests.filter((i) => i.status === "Pending").length,
              "Interests awaiting action",
            ],
            [
              "transfers",
              w.transfers.filter((t) => !terminal.includes(t.state)).length,
              "Active transfers",
            ],
            [
              "transfers",
              w.transfers.filter((t) => t.state === "Completed").length,
              "Completed transfers",
            ],
          ].map(([section, count, label], index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveSection(String(section))}
              aria-label={`${count} ${label}`}
            >
              <strong>{count}</strong>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      <nav className="workflow-sections" aria-label="Workflow sections">
        {[
          ["requests", "Requests"],
          ["interests", "Interests"],
          ["transfers", "Transfers"],
          ["history", "History"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`workflow-section-button${activeSection === id ? " active" : ""}`}
            aria-pressed={activeSection === id}
            aria-controls={`workflow-${id}`}
            onClick={() => setActiveSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {!loaded ? (
        <p role="status">Loading permitted workflows…</p>
      ) : (
        <>
          <section
            id="workflow-requests"
            aria-labelledby="workflow-requests-title"
            hidden={activeSection !== "requests"}
          >
            <h2 id="workflow-requests-title">Requests</h2>
            {canRequest && (
              <>
                <button
                  type="button"
                  className="button"
                  ref={requestOpenRef}
                  aria-expanded={requestFormOpen}
                  aria-controls="new-request-form"
                  onClick={() => {
                    setRequestFormOpen((v) => {
                      if (!v)
                        requestAnimationFrame(() =>
                          requestPurposeRef.current?.focus(),
                        );
                      return !v;
                    });
                  }}
                >
                  {requestFormOpen ? "Close request form" : "New request"}
                </button>
                <div id="new-request-form" hidden={!requestFormOpen}>
                  <form onSubmit={submit} className="workflow-form">
                    <fieldset>
                      <legend>What is needed</legend>
                      <div className="workflow-form-fields">
                        <div className="workflow-field-full">
                          <Input label="Purpose">
                            <input
                              required
                              maxLength={2000}
                              ref={requestPurposeRef}
                              value={purpose}
                              onChange={(e) => setPurpose(e.target.value)}
                            />
                          </Input>
                        </div>
                        <Input label="Request category">
                          <select
                            required
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          >
                            <option value="">Choose category</option>
                            {metadata.categories.map((c) => (
                              <option key={c.categoryId} value={c.categoryId}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Input>
                        <Input label="Requested quantity">
                          <input
                            required
                            type="number"
                            min="1"
                            step="1"
                            value={qty}
                            onChange={(e) => setQty(Number(e.target.value))}
                          />
                        </Input>
                        <Input label="Minimum suitable condition">
                          <select
                            value={condition}
                            onChange={(e) => setCondition(e.target.value)}
                          >
                            {["Excellent", "Good", "Fair"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </Input>
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>When and where</legend>
                      <div className="workflow-form-fields">
                        <Input label="Urgency">
                          <select
                            value={urgency}
                            onChange={(e) => setUrgency(e.target.value)}
                          >
                            {["Low", "Normal", "High"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </Input>
                        <Input label="Required date">
                          <input
                            required
                            type="date"
                            value={required}
                            onChange={(e) => setRequired(e.target.value)}
                          />
                        </Input>
                        <div className="workflow-field-full">
                          <Input label="Receiving destination">
                            <input
                              required
                              maxLength={200}
                              value={destination}
                              onChange={(e) => setDestination(e.target.value)}
                            />
                          </Input>
                        </div>
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>Technical requirements</legend>
                      <p className="muted">
                        Add measurable requirements such as Connector — HDMI or
                        Minimum lumens — 3000.
                      </p>
                      {specs.map((row, index) => (
                        <div className="specification-row" key={row.id}>
                          <Input label="Requirement">
                            <input
                              value={row.name}
                              onChange={(e) =>
                                setSpecs((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id
                                      ? { ...r, name: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </Input>
                          <Input label="Required value">
                            <input
                              value={row.value}
                              onChange={(e) =>
                                setSpecs((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id
                                      ? { ...r, value: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </Input>
                          <button
                            type="button"
                            aria-label={`Remove requirement ${index + 1}`}
                            onClick={() =>
                              setSpecs((rows) =>
                                rows.filter((r) => r.id !== row.id),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() =>
                          setSpecs((rows) => [
                            ...rows,
                            { id: crypto.randomUUID(), name: "", value: "" },
                          ])
                        }
                      >
                        Add requirement
                      </button>
                    </fieldset>
                    <div className="workflow-form-actions">
                      <button className="button" disabled={busy}>
                        {busy ? "Submitting…" : "Submit request"}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setRequestFormOpen(false);
                          requestOpenRef.current?.focus();
                        }}
                      >
                        Close form
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
            <h3>Request tracking</h3>
            {w.requests.length === 0 && (
              <p>No requests are visible in your current scope.</p>
            )}
            {[...requestGroups.open, ...requestGroups.completed].map(
              (q, index) => {
                const requirements = formatSpecifications(q.specifications);
                return (
                  <div key={q.requestId}>
                    {index === requestGroups.open.length &&
                      requestGroups.completed.length > 0 && (
                        <h3>Completed requests</h3>
                      )}
                    <article
                      className="workflow-card"
                      aria-label={`Request ${q.purpose}`}
                    >
                      <header className="workflow-card-header">
                        <h3>
                          {q.purpose} <span className="badge">{q.status}</span>{" "}
                          <span
                            className={`badge ${q.urgency === "High" ? "warn" : "muted"}`}
                          >
                            {q.urgency} urgency
                          </span>
                        </h3>
                        <p>
                          Need by{" "}
                          <time dateTime={q.requiredDate}>
                            {labelDay(q.requiredDate)}
                          </time>
                        </p>
                      </header>
                      <dl className="workflow-facts workflow-quantities">
                        <div>
                          <dt>Requested</dt>
                          <dd>{q.requestedQty}</dd>
                        </div>
                        <div>
                          <dt>Accepted</dt>
                          <dd>{q.acceptedQty}</dd>
                        </div>
                        <div>
                          <dt>Allocated</dt>
                          <dd>{q.allocatedQty}</dd>
                        </div>
                        <div>
                          <dt>Remaining</dt>
                          <dd>{q.remainingQty}</dd>
                        </div>
                      </dl>
                      <p className="workflow-next-action">
                        <strong>Next action:</strong>{" "}
                        {["Closed", "Canceled", "Fulfilled"].includes(q.status)
                          ? "No action required."
                          : q.remainingQty > 0
                            ? "Requester or receiving representative: choose an item in Interests. The supplier representative then reviews the reservation."
                            : "Follow the active transfers in Transfers for release, delivery and receipt."}
                      </p>
                      <dl className="workflow-facts request-facts">
                        <div>
                          <dt>Department</dt>
                          <dd>{department(q.departmentId)}</dd>
                        </div>
                        <div>
                          <dt>Destination</dt>
                          <dd>{q.destination}</dd>
                        </div>
                        <div>
                          <dt>Minimum condition</dt>
                          <dd>{q.condition}</dd>
                        </div>
                      </dl>
                      <h4>Technical requirements</h4>
                      {requirements.length === 0 ? (
                        <p>None specified.</p>
                      ) : (
                        <dl className="workflow-facts request-facts">
                          {requirements.map((s, index) => (
                            <div key={`${index}:${s.label}`}>
                              <dt>{s.label}</dt>
                              <dd>{s.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {own.includes(q) &&
                        q.status === "Open" &&
                        q.remainingQty > 0 && (
                          <div className="ai2-panel">
                            <p className="muted">
                              AI recommendations rank catalogue matches; scores
                              are ranking signals, not probabilities. Catalogue
                              search remains available regardless of AI results.
                            </p>
                            <div className="workflow-card-actions">
                              <button
                                type="button"
                                className="button secondary small"
                                onClick={() => {
                                  setActiveSection("interests");
                                  setRequestId(q.requestId);
                                }}
                              >
                                Find catalogue items
                              </button>
                              <button
                                type="button"
                                className="button small"
                                disabled={ai2[q.requestId]?.loading}
                                onClick={() => findMatches(q.requestId)}
                              >
                                {ai2[q.requestId]?.loading
                                  ? "Finding recommendations…"
                                  : "Get AI recommendations"}
                              </button>
                            </div>
                            {ai2[q.requestId]?.loading && (
                              <p role="status">
                                Preparing recommendations. The first run may
                                take longer while the service starts.
                              </p>
                            )}
                            {ai2[q.requestId]?.error && (
                              <p className="notice" role="status">
                                {fallbackCopy}{" "}
                                <button
                                  type="button"
                                  className="button secondary small"
                                  onClick={() => {
                                    setActiveSection("interests");
                                    setRequestId(q.requestId);
                                  }}
                                >
                                  Find catalogue items
                                </button>
                              </p>
                            )}
                            {ai2[q.requestId]?.outcome === "no_candidates" && (
                              <p>
                                No catalogue matches were found. You can still
                                search the catalogue.
                              </p>
                            )}
                            {visibleRecommendations(
                              ai2[q.requestId]?.rows ?? [],
                            ).map((r) => (
                              <RecommendationCard
                                key={r.recommendationId}
                                row={r}
                                maxQty={Math.min(
                                  q.remainingQty,
                                  r.availableQty,
                                )}
                                view={() => {
                                  setActiveSection("interests");
                                  setRequestId(q.requestId);
                                  setPortionId(r.portionId);
                                }}
                                done={done}
                                onReviewed={(decision, interestId) =>
                                  updateAi2((s) => ({
                                    ...s,
                                    [q.requestId]: {
                                      ...s[q.requestId],
                                      rows: s[q.requestId].rows.map((item) =>
                                        item.recommendationId ===
                                        r.recommendationId
                                          ? {
                                              ...item,
                                              reviewState: decision,
                                              interestId,
                                            }
                                          : item,
                                      ),
                                    },
                                  }))
                                }
                              />
                            ))}
                          </div>
                        )}
                      {own.includes(q) &&
                        !["Closed", "Canceled", "Fulfilled"].includes(
                          q.status,
                        ) &&
                        q.allocatedQty === 0 && (
                          <footer className="workflow-card-actions">
                            <details>
                              <summary>Close or cancel remaining need</summary>
                              <ActionForm
                                action={
                                  q.acceptedQty > 0
                                    ? "closeRequest"
                                    : "cancelRequest"
                                }
                                base={{
                                  requestId: q.requestId,
                                  expectedVersion: q.version,
                                }}
                                workspace={w}
                                button={
                                  q.acceptedQty > 0
                                    ? "Close unmet need"
                                    : "Cancel request"
                                }
                                onDone={done}
                              />
                            </details>
                          </footer>
                        )}
                    </article>
                  </div>
                );
              },
            )}
          </section>
          <section
            id="workflow-interests"
            aria-labelledby="workflow-interests-title"
            hidden={activeSection !== "interests"}
          >
            <h2 id="workflow-interests-title">Interests</h2>
            {selectedResource && (
              <p className="notice">
                Selected resource: {selectedResource.name}. It remains selected
                while you record an interest; this does not reserve it.
              </p>
            )}
            {canRequest && (
              <details open className="interest-create">
                <summary>Record an interest</summary>
                <p>
                  {selectedResource
                    ? "Recording Interest does not reserve the resource. The supplier must approve it."
                    : "Recording Interest links a published item to an open request; it does not reserve stock. A supplier representative must separately approve a reservation."}
                </p>
                <fieldset>
                  <legend>Requested resource</legend>
                  <Input label="Open request">
                    <select
                      value={requestId}
                      onChange={(e) => {
                        setRequestId(e.target.value);
                        if (!selectedResource) setPortionId("");
                      }}
                    >
                      <option value="">Choose request</option>
                      {(selectedResource
                        ? compatible
                        : own.filter(
                            (q) =>
                              q.remainingQty > 0 &&
                              !["Closed", "Canceled", "Fulfilled"].includes(
                                q.status,
                              ),
                          )
                      ).map((q) => (
                        <option key={q.requestId} value={q.requestId}>
                          {q.purpose} ({q.remainingQty} remaining)
                        </option>
                      ))}
                    </select>
                  </Input>
                </fieldset>
                {selectedResource && compatible.length === 0 && (
                  <div className="detail-section">
                    <p>
                      {selectedResource.categoryId
                        ? "No compatible request is available for this resource."
                        : "This resource has no category. Correct its catalogue category before creating or matching a request."}
                    </p>
                    <button
                      type="button"
                      className="button"
                      disabled={!selectedResource.categoryId}
                      onClick={() => {
                        setActiveSection("requests");
                        setRequestFormOpen(true);
                        setCategory(selectedResource.categoryId ?? "");
                        setQty(1);
                        if (
                          ["Excellent", "Good", "Fair"].includes(
                            selectedResource.condition,
                          )
                        )
                          setCondition(selectedResource.condition);
                      }}
                    >
                      Create a request for this resource
                    </button>
                  </div>
                )}
                <fieldset>
                  <legend>Offered resource</legend>
                  <Input label="Published item">
                    <select
                      value={portionId}
                      onChange={(e) => setPortionId(e.target.value)}
                    >
                      <option value="">Choose current portion</option>
                      {(selectedResource
                        ? availableHandoffPortions
                        : catalogue.filter(
                            (a) =>
                              a.state === "Available" &&
                              a.qty > 0 &&
                              (!selected ||
                                selected.categoryId === a.categoryId),
                          )
                      ).map((a) => (
                        <option key={a.portionId} value={a.portionId}>
                          {a.name} · {a.departmentName} · {a.qty} available ·{" "}
                          {a.condition} · {a.portionId.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </Input>
                </fieldset>
                {selected && selectedAsset && !staleHandoff && (
                  <ActionForm
                    key={
                      selected.requestId +
                      ":" +
                      selected.version +
                      ":" +
                      portionId
                    }
                    action="recordInterest"
                    base={{
                      requestId: selected.requestId,
                      portionId,
                      expectedVersion: selected.version,
                    }}
                    workspace={w}
                    qty={Math.min(selected.remainingQty, selectedAsset.qty)}
                    button="Record Interest"
                    onDone={done}
                  />
                )}
              </details>
            )}
            {w.interests.length === 0 && <p>No linked interests yet.</p>}
            {w.interests.map((i) => (
              <article
                className="workflow-card"
                aria-label={`Interest ${i.assetName}`}
                key={i.interestId}
              >
                <header className="workflow-card-header">
                  <h3>{i.assetName}</h3>
                  <span className="badge">{i.status}</span>
                </header>
                <dl className="workflow-facts interest-facts">
                  <div>
                    <dt>Requested resource</dt>
                    <dd>
                      {w.requests.find((q) => q.requestId === i.requestId)
                        ?.purpose ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{i.qty}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>
                      <time dateTime={i.submittedAt}>
                        {labelDate(i.submittedAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
                <p>
                  <strong>Requester selection note:</strong>{" "}
                  {(() => {
                    const event = w.history.find(
                      (h) =>
                        h.event === "interest.recorded" &&
                        record(h.after).interest_id === i.interestId &&
                        typeof record(h.after).reason === "string" &&
                        String(record(h.after).reason).trim(),
                    );
                    return event
                      ? String(record(event.after).reason)
                      : "Not available in this view";
                  })()}
                </p>
                {i.status === "Pending" && (
                  <p className="workflow-next-action">
                    <strong>Supplier action:</strong> Pending, awaiting supplier
                    review.
                  </p>
                )}
                {!i.currentAvailable && i.status === "Pending" && (
                  <p className="notice">
                    This source portion has changed. Select its current
                    Available child from the catalogue before approval.
                  </p>
                )}
                {rep &&
                  i.supplierDepartmentId === profile.departmentId &&
                  i.status === "Pending" &&
                  profile.userId !== i.createdBy &&
                  profile.userId !==
                    w.requests.find((q) => q.requestId === i.requestId)
                      ?.requesterId && (
                    <footer className="workflow-card-actions">
                      <details>
                        <summary>Approve reservation</summary>
                        <p>
                          Review suitability and submission order. Explain any
                          urgency or suitability override in the reason.
                        </p>
                        <ActionForm
                          action="approveReservation"
                          base={{
                            interestId: i.interestId,
                            expectedVersion: i.version,
                          }}
                          workspace={w}
                          qty={i.qty}
                          button="Approve reservation"
                          onDone={done}
                        />
                      </details>
                      <details>
                        <summary>Reject reservation</summary>
                        <ActionForm
                          action="rejectReservation"
                          base={{
                            interestId: i.interestId,
                            expectedVersion: i.version,
                          }}
                          workspace={w}
                          button="Reject reservation"
                          onDone={done}
                        />
                      </details>
                    </footer>
                  )}
                {w.decisions
                  .filter((a) => a.interest_id === i.interestId)
                  .map((a) => (
                    <p key={a.approval_id}>
                      {a.decision}: {a.reason} · {personName(a.actor_id)} ·{" "}
                      {labelDate(a.decided_at)}
                    </p>
                  ))}
              </article>
            ))}
          </section>
          <section
            id="workflow-transfers"
            aria-labelledby="workflow-transfers-title"
            hidden={activeSection !== "transfers"}
          >
            <h2 id="workflow-transfers-title">Transfers</h2>
            {w.transfers.length === 0 && <p>No approved allocations yet.</p>}
            <h3>Needs your action</h3>
            {transferGroups.needsAction.length === 0 && (
              <p>No transfers currently need action from your roles.</p>
            )}
            {transferGroups.needsAction.map((t) => (
              <TransferCard
                key={t.transferId}
                t={t}
                w={w}
                profile={profile}
                department={department}
                done={done}
              />
            ))}
            <h3>In progress</h3>
            {transferGroups.inProgress.length === 0 && (
              <p>No transfers are currently in progress.</p>
            )}
            {transferGroups.inProgress.map((t) => (
              <TransferCard
                key={t.transferId}
                t={t}
                w={w}
                profile={profile}
                department={department}
                done={done}
              />
            ))}
            <h3>Completed</h3>
            <p className="muted">
              Completed transfers are shown here. Canceled and Returned
              transfers are also terminal records and remain available below.
            </p>
            {transferGroups.completed.length === 0 && (
              <p>No completed or other terminal transfers yet.</p>
            )}
            {transferGroups.completed.map((t) => (
              <TransferCard
                key={t.transferId}
                t={t}
                w={w}
                profile={profile}
                department={department}
                done={done}
              />
            ))}
          </section>
          <section
            id="workflow-history"
            aria-labelledby="workflow-history-title"
            hidden={activeSection !== "history"}
          >
            <h2 id="workflow-history-title">History</h2>
            {w.history.length === 0 && (
              <p>No workflow history is available in your current scope.</p>
            )}
            <ol className="workflow-timeline">
              {w.history.map((h) => {
                const before = record(h.before),
                  after = record(h.after),
                  bp = record(before.portion),
                  ap = record(after.portion);
                const previous =
                  record(before.transfer).state ??
                  before.status ??
                  before.state ??
                  record(before).transfer_state;
                const current =
                  record(after.transfer).state ?? after.status ?? after.state;
                return (
                  <li className="workflow-history" key={h.auditId}>
                    <h3>{eventLabels[h.event] ?? h.event}</h3>
                    <p className="workflow-history-meta">
                      <span>{personName(h.actorId)}</span> ·{" "}
                      <time dateTime={h.occurredAt}>
                        {labelDate(h.occurredAt)}
                      </time>
                    </p>
                    {after.reason != null &&
                      String(after.reason).trim() !== "" && (
                        <p>
                          <strong>Reason:</strong> {String(after.reason)}
                        </p>
                      )}
                    {(previous != null || current != null) && (
                      <div className="workflow-state-change">
                        <h4>State change</h4>
                        <dl className="workflow-transition">
                          <div>
                            <dt>Previous</dt>
                            <dd>
                              {previous == null
                                ? "Not recorded"
                                : String(previous)}
                            </dd>
                          </div>
                          <div className="workflow-transition-arrow-cell">
                            <span
                              className="workflow-transition-arrow"
                              aria-hidden="true"
                            >
                              →
                            </span>
                          </div>
                          <div>
                            <dt>New</dt>
                            <dd>
                              {current == null
                                ? "Not recorded"
                                : String(current)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )}
                    {bp.physical_location !== ap.physical_location &&
                      ap.physical_location != null && (
                        <p>
                          Physical location:{" "}
                          {String(bp.physical_location ?? "Not recorded")} →{" "}
                          {String(ap.physical_location)}
                        </p>
                      )}
                    {bp.owner_department_id !== ap.owner_department_id &&
                      ap.owner_department_id != null && (
                        <p>
                          Formal department:{" "}
                          {bp.owner_department_id == null
                            ? "Not recorded"
                            : department(String(bp.owner_department_id))}{" "}
                          → {department(String(ap.owner_department_id))}
                        </p>
                      )}
                    {(
                      [
                        "custodian_id",
                        "assigned_location",
                        "holder_id",
                      ] as const
                    ).map((key) =>
                      bp[key] !== ap[key] && ap[key] != null ? (
                        <p key={key}>
                          {
                            {
                              custodian_id: "Formal custodian",
                              assigned_location: "Assigned location",
                              holder_id: "Physical holder",
                            }[key]
                          }
                          :{" "}
                          {key === "custodian_id" || key === "holder_id"
                            ? bp[key] == null
                              ? "Not recorded"
                              : personName(String(bp[key]))
                            : bp[key] == null
                              ? "Not recorded"
                              : String(bp[key])}{" "}
                          →{" "}
                          {key === "custodian_id" || key === "holder_id"
                            ? personName(String(ap[key]))
                            : String(ap[key])}
                        </p>
                      ) : null,
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </section>
  );
}
