import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { AssetView, Bootstrap, Profile } from "./types";
import {
  nextRequestAction,
  nextTransferAction,
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
  const rep = profile.roles.includes("representative"),
    supplier = rep && profile.departmentId === t.supplierDepartmentId;
  const receiver = rep && profile.departmentId === t.receiverDepartmentId;
  const i = w.interests.find((i) => i.interestId === t.interestId),
    q = w.requests.find((q) => q.requestId === t.requestId);
  const self =
    profile.userId === i?.createdBy || profile.userId === q?.requesterId;
  const assigned =
    profile.roles.includes("facilities") && profile.userId === t.facilitiesId;
  const personName = (id: string | null) =>
    t.holders.find((p) => p.userId === id)?.name ??
    (id ? `User ${id.slice(0, 8)}` : "Not recorded");
  const actions: [WorkflowAction, string][] = [];
  if (supplier && !self && t.state === "Pending Approval")
    actions.push(
      ["approveRelease", "Approve release"],
      ["rejectRelease", "Reject release"],
    );
  if (assigned && ["Approved", "Scheduled"].includes(t.state))
    actions.push(["schedule", "Schedule pickup"]);
  if (assigned && t.state === "Scheduled")
    actions.push(["dispatch", "Record dispatch"]);
  if (receiver && t.state === "In Transit")
    actions.push(["receive", "Record receipt"]);
  if (receiver && t.state === "Disputed")
    actions.push(["reconcile", "Accept reconciled receipt"]);
  if (supplier && t.state === "Disputed")
    actions.push(["confirmReturn", "Confirm physical return"]);
  if (
    (supplier || receiver || profile.userId === q?.requesterId) &&
    ["Pending Approval", "Approved", "Scheduled"].includes(t.state)
  )
    actions.push(["cancelTransfer", "Cancel before dispatch"]);
  return (
    <article className="workflow-card" aria-label={`Transfer ${t.assetName}`}>
      <h3>
        {t.assetName} · {t.qty} unit{t.qty === 1 ? "" : "s"}{" "}
        <span className="badge">{t.state}</span>
      </h3>
      <p>
        {department(t.supplierDepartmentId)} →{" "}
        {department(t.receiverDepartmentId)} · Request: {q?.purpose}
      </p>
      <p>
        <strong>Next action:</strong> {nextTransferAction(t.state)}
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
      {t.arrangements && (
        <p>
          {t.arrangements} · Handling: {t.handlingCost ?? "unrecorded"} AED ·
          Transport: {t.transportCost ?? "unrecorded"} AED
        </p>
      )}
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
export function WorkflowPanel({
  profile,
  metadata,
}: {
  profile: Profile;
  metadata: Bootstrap;
}) {
  const [w, setW] = useState(empty),
    [catalogue, setCatalogue] = useState<AssetView[]>([]),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [success, setSuccess] = useState("");
  const [purpose, setPurpose] = useState(""),
    [category, setCategory] = useState(""),
    [qty, setQty] = useState(1);
  const [condition, setCondition] = useState("Good"),
    [urgency, setUrgency] = useState("Normal"),
    [required, setRequired] = useState("");
  const [destination, setDestination] = useState(""),
    [specs, setSpecs] = useState("{}"),
    [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(""),
    [portionId, setPortionId] = useState("");
  const pending = useRef<WorkflowOperation | null>(null);
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
      const specifications = JSON.parse(specs);
      if (
        !specifications ||
        Array.isArray(specifications) ||
        typeof specifications !== "object"
      )
        throw new Error("Specifications must be a JSON object.");
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
      await workflows.execute(pending.current);
      pending.current = null;
      setPurpose("");
      done();
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
      {canRequest && (
        <details>
          <summary>Submit a resource request</summary>
          <form onSubmit={submit} className="workflow-form">
            <Input label="Purpose">
              <input
                required
                maxLength={2000}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </Input>
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
            <Input label="Receiving destination">
              <input
                required
                maxLength={200}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </Input>
            <Input label="Mandatory specifications (JSON object)">
              <textarea
                value={specs}
                onChange={(e) => setSpecs(e.target.value)}
              />
            </Input>
            <p className="muted">
              Use exact requirements, for example{" "}
              {JSON.stringify({ connector: "HDMI" })}. Leave an empty object
              when no mandatory specifications apply. Missing evidence blocks
              supplier allocation.
            </p>
            <button className="button" disabled={busy}>
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </form>
        </details>
      )}
      {!loaded ? (
        <p role="status">Loading permitted workflows…</p>
      ) : (
        <>
          <h2>Request tracking</h2>
          {w.requests.length === 0 && (
            <p>No requests are visible in your current scope.</p>
          )}
          {w.requests.map((q) => (
            <article
              className="workflow-card"
              aria-label={`Request ${q.purpose}`}
              key={q.requestId}
            >
              <h3>
                {q.purpose} <span className="badge">{q.status}</span>
              </h3>
              <p>
                {department(q.departmentId)} · Need by {q.requiredDate} ·{" "}
                {q.urgency} urgency · {q.destination}
              </p>
              <p className="workflow-quantities">
                Requested <strong>{q.requestedQty}</strong> · Accepted{" "}
                <strong>{q.acceptedQty}</strong> · Actively allocated{" "}
                <strong>{q.allocatedQty}</strong> · Remaining{" "}
                <strong>{q.remainingQty}</strong>
              </p>
              <p>
                <strong>Next action:</strong> {nextRequestAction(q)}
              </p>
              <p>
                Minimum condition: {q.condition} · Mandatory specifications:{" "}
                <code>{JSON.stringify(q.specifications)}</code>
              </p>
              {own.includes(q) &&
                !["Closed", "Canceled", "Fulfilled"].includes(q.status) &&
                q.allocatedQty === 0 && (
                  <details>
                    <summary>Close or cancel remaining need</summary>
                    <ActionForm
                      action={
                        q.acceptedQty > 0 ? "closeRequest" : "cancelRequest"
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
                )}
            </article>
          ))}
          {canRequest && (
            <details>
              <summary>Select a published item for Interest</summary>
              <p>
                Selection creates linked Interest. Stock and demand remain
                unallocated until a supplier representative approves.
              </p>
              <Input label="Open request">
                <select
                  value={requestId}
                  onChange={(e) => {
                    setRequestId(e.target.value);
                    setPortionId("");
                  }}
                >
                  <option value="">Choose request</option>
                  {own
                    .filter(
                      (q) =>
                        q.remainingQty > 0 &&
                        !["Closed", "Canceled", "Fulfilled"].includes(q.status),
                    )
                    .map((q) => (
                      <option key={q.requestId} value={q.requestId}>
                        {q.purpose} ({q.remainingQty} remaining)
                      </option>
                    ))}
                </select>
              </Input>
              <Input label="Published item">
                <select
                  value={portionId}
                  onChange={(e) => setPortionId(e.target.value)}
                >
                  <option value="">Choose current portion</option>
                  {catalogue
                    .filter(
                      (a) =>
                        a.state === "Available" &&
                        (!selected || selected.categoryId === a.categoryId),
                    )
                    .map((a) => (
                      <option key={a.portionId} value={a.portionId}>
                        {a.name} · {a.departmentName} · {a.qty} available ·{" "}
                        {a.condition} · {a.portionId.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </Input>
              {selected && selectedAsset && (
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
          <h2>Interests and reservation decisions</h2>
          {w.interests.length === 0 && <p>No linked interests yet.</p>}
          {w.interests.map((i) => (
            <article
              className="workflow-card"
              aria-label={`Interest ${i.assetName}`}
              key={i.interestId}
            >
              <h3>
                {i.assetName} · {i.qty} selected{" "}
                <span className="badge">{i.status}</span>
              </h3>
              <p>
                Request:{" "}
                {w.requests.find((q) => q.requestId === i.requestId)?.purpose} ·
                Submitted {labelDate(i.submittedAt)}
              </p>
              {!i.currentAvailable && i.status === "Pending" && (
                <p className="notice">
                  This source portion has changed. Select its current Available
                  child from the catalogue before approval.
                </p>
              )}
              {rep &&
                i.supplierDepartmentId === profile.departmentId &&
                i.status === "Pending" &&
                profile.userId !== i.createdBy &&
                profile.userId !==
                  w.requests.find((q) => q.requestId === i.requestId)
                    ?.requesterId && (
                  <>
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
                  </>
                )}
              {w.decisions
                .filter((a) => a.interest_id === i.interestId)
                .map((a) => (
                  <p key={a.approval_id}>
                    {a.decision}: {a.reason} · {a.actor_id} ·{" "}
                    {labelDate(a.decided_at)}
                  </p>
                ))}
            </article>
          ))}
          <h2>Transfers</h2>
          {w.transfers.length === 0 && <p>No approved allocations yet.</p>}
          {w.transfers
            .filter((t) => !terminal.includes(t.state))
            .concat(w.transfers.filter((t) => terminal.includes(t.state)))
            .map((t) => (
              <TransferCard
                key={t.transferId}
                t={t}
                w={w}
                profile={profile}
                department={department}
                done={done}
              />
            ))}
          <details>
            <summary>Workflow history: who did what and when</summary>
            {w.history.map((h) => {
              const before = record(h.before),
                after = record(h.after),
                bp = record(before.portion),
                ap = record(after.portion);
              const previous =
                record(before.transfer).state ?? before.status ?? before.state;
              const current = record(after.transfer).state ?? after.status;
              return (
                <div className="workflow-history" key={h.auditId}>
                  <p>
                    <strong>{eventLabels[h.event] ?? h.event}</strong> ·{" "}
                    <span title={h.actorId ?? ""}>{personName(h.actorId)}</span>{" "}
                    · {labelDate(h.occurredAt)}
                  </p>
                  {after.reason != null && (
                    <p>Reason: {String(after.reason)}</p>
                  )}
                  {(previous != null || current != null) && (
                    <p>
                      State: {String(previous ?? "New record")} →{" "}
                      {String(current ?? "Decision recorded")}
                    </p>
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
                        {department(String(bp.owner_department_id))} →{" "}
                        {department(String(ap.owner_department_id))}
                      </p>
                    )}
                </div>
              );
            })}
          </details>
        </>
      )}
    </section>
  );
}
