import { useEffect, useState } from "react";
import { api } from "./api";
import { normalizeAi5NumberWords } from "./ai5NumberWords";
import { formatAi5PeriodDate, formatAi5Timestamp } from "./ai5Dates";
import type { Ai5WorkspaceItem } from "./types";

const actor = (name?: string | null, id?: string | null) => name || id || "—";
const validationMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /number|fact|metric|snapshot|validation|check constraint/i.test(
    message,
  )
    ? "Narrative numbers must match the displayed snapshot facts."
    : message || "Could not save the narrative.";
};

export function Ai5ReportPanel({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Ai5WorkspaceItem[]>([]),
    [busy, setBusy] = useState(true),
    [working, setWorking] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [keys, setKeys] = useState<Record<string, string>>({}),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  async function load(): Promise<boolean> {
    setBusy(true);
    try {
      setRows(
        isAdmin ? await api.ai5Workspace() : await api.ai5PublishedNarratives(),
      );
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports");
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [isAdmin]);
  async function act(id: string, fn: () => Promise<unknown>, message?: string) {
    setWorking(id);
    setError("");
    setNotice("");
    try {
      await fn();
      if ((await load()) && message) setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report action failed");
    } finally {
      setWorking("");
    }
  }
  const capture = () =>
    act(
      "capture",
      async () => {
        await api.captureAi5Snapshot(crypto.randomUUID());
      },
      "Snapshot captured.",
    );
  const generate = (id: string) =>
    act(
      id,
      async () => {
        const attempt = keys[id] || crypto.randomUUID();
        setKeys((current) => ({ ...current, [id]: attempt }));
        await api.generateAi5(id, attempt);
        setKeys((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      },
      "Narrative draft generated; review it before publication.",
    );
  return (
    <section className="workflow-panel" aria-label="Reports">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice success">
          {notice}
        </p>
      )}
      {isAdmin && (
        <>
          <button className="button" disabled={!!working} onClick={capture}>
            {working === "capture" ? "Capturing…" : "Capture snapshot"}
          </button>
          <p>
            Drafts can be edited. Ready reports are locked after review;
            publishing makes them visible to users.
          </p>
        </>
      )}
      {busy ? (
        <p role="status">Loading reports…</p>
      ) : rows.length === 0 ? (
        <p className="empty-state">
          {isAdmin ? "No snapshots." : "No published reports."}
        </p>
      ) : (
        rows.map(({ snapshot: s, narrative: n }) => {
          const value = n
            ? (drafts[n.narrative_id] ?? n.current_text ?? "")
            : "";
          const dirty = !!n && value !== (n.current_text ?? "");
          const facts = [
            s.facts.requests_submitted,
            s.facts.open_requests,
            s.facts.completed_transfers,
            s.facts.units_successfully_transferred,
          ];
          return (
            <article className="workflow-card ai5-card" key={s.snapshot_id}>
              <header className="workflow-card-header">
                <h3>
                  Report · {formatAi5PeriodDate(s.period_start)} –{" "}
                  {formatAi5PeriodDate(s.period_end)}
                </h3>
                {n ? (
                  <span className="badge">{n.status}</span>
                ) : isAdmin ? (
                  <button
                    className="button small"
                    disabled={!!working}
                    onClick={() => generate(s.snapshot_id)}
                  >
                    {working === s.snapshot_id
                      ? "Generating…"
                      : "Generate summary"}
                  </button>
                ) : null}
              </header>
              <dl className="workflow-facts ai5-facts">
                {Object.entries(s.facts).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replaceAll("_", " ")}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              {n && (
                <>
                  <section className="ai5-narrative">
                    <h4>{isAdmin ? "Narrative" : "Published narrative"}</h4>
                    {isAdmin && n.status === "Draft" ? (
                      <>
                        <label className="workflow-field">
                          Draft narrative
                          <textarea
                            required
                            maxLength={600}
                            value={value}
                            onChange={(e) =>
                              setDrafts({
                                ...drafts,
                                [n.narrative_id]: e.target.value,
                              })
                            }
                            aria-describedby={`ai5-help-${n.narrative_id}`}
                          />
                          <small id={`ai5-help-${n.narrative_id}`}>
                            Up to 600 characters. Numbers must match the four
                            snapshot facts; database validation is final.
                          </small>
                        </label>
                        <div className="workflow-card-actions">
                          <button
                            className="button small"
                            disabled={!!working || !dirty || !value.trim()}
                            onClick={() => {
                              const normalized = normalizeAi5NumberWords(
                                value,
                                facts,
                              );
                              void act(
                                n.narrative_id,
                                async () => {
                                  try {
                                    await api.editAi5Narrative(
                                      n.narrative_id,
                                      normalized.text,
                                    );
                                  } catch (e) {
                                    throw new Error(validationMessage(e));
                                  }
                                  setDrafts((current) => ({
                                    ...current,
                                    [n.narrative_id]: normalized.text,
                                  }));
                                },
                                normalized.normalized
                                  ? "Saved; metric number words were normalized to digits."
                                  : "Draft saved.",
                              );
                            }}
                          >
                            {working === n.narrative_id
                              ? "Saving…"
                              : "Save edit"}
                          </button>
                          <button
                            className="button secondary small"
                            disabled={!!working || dirty}
                            title={
                              dirty
                                ? "Save your edits before marking ready."
                                : undefined
                            }
                            onClick={() =>
                              act(n.narrative_id, () =>
                                api.markAi5Ready(n.narrative_id),
                              )
                            }
                          >
                            Mark ready
                          </button>
                          {dirty && (
                            <small>Save edits before marking ready.</small>
                          )}
                        </div>
                      </>
                    ) : (
                      <p>{n.current_text || n.generated_text}</p>
                    )}
                  </section>
                  <p className="ai5-attribution">
                    {n.status === "Published" ? (
                      <>
                        Reviewed by {actor(n.reviewer_name, n.reviewed_by)}
                        {n.reviewed_at
                          ? ` · ${formatAi5Timestamp(n.reviewed_at)}`
                          : ""}{" "}
                        · Published by {actor(n.publisher_name, n.published_by)}
                        {n.published_at
                          ? ` · ${formatAi5Timestamp(n.published_at)}`
                          : ""}
                      </>
                    ) : (
                      <>
                        Created by {actor(n.creator_name, n.created_by)}
                        {n.created_at
                          ? ` · ${formatAi5Timestamp(n.created_at)}`
                          : ""}
                        {n.reviewed_at
                          ? ` · Reviewed by ${actor(n.reviewer_name, n.reviewed_by)} · ${formatAi5Timestamp(n.reviewed_at)}`
                          : ""}
                      </>
                    )}
                  </p>
                  {isAdmin && (
                    <details className="ai5-technical">
                      <summary>Technical details</summary>
                      <small>
                        Model: {n.model_id || "Not recorded"} · Edited by{" "}
                        {actor(n.editor_name, n.edited_by)}
                        {n.edited_at
                          ? ` · ${formatAi5Timestamp(n.edited_at)}`
                          : ""}
                      </small>
                      <p>
                        Generated: {n.generated_text || "No generated text"}
                      </p>
                    </details>
                  )}
                  {isAdmin && n.status === "Ready" && (
                    <div className="workflow-card-actions">
                      <button
                        className="button small"
                        disabled={!!working}
                        onClick={() => {
                          if (window.confirm("Publish this narrative?"))
                            void act(n.narrative_id, () =>
                              api.publishAi5Narrative(n.narrative_id),
                            );
                        }}
                      >
                        Publish
                      </button>
                    </div>
                  )}
                </>
              )}
              <details className="ai5-technical">
                <summary>Snapshot details</summary>
                <small>
                  Captured by {actor(s.creator_name, s.created_by)} ·{" "}
                  {formatAi5Timestamp(s.captured_at)} · Calculation{" "}
                  {s.calculation_version} · Schema {s.schema_version} · Snapshot{" "}
                  {s.snapshot_id}
                </small>
              </details>
            </article>
          );
        })
      )}
    </section>
  );
}
