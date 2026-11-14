import { useEffect, useState } from "react";
import { api } from "./api";
import type { Ai5WorkspaceItem } from "./types";

export function Ai5ReportPanel({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Ai5WorkspaceItem[]>([]),
    [busy, setBusy] = useState(true),
    [working, setWorking] = useState(""),
    [error, setError] = useState(""),
    [keys, setKeys] = useState<Record<string, string>>({}),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  async function load() {
    setBusy(true);
    try {
      setRows(
        isAdmin ? await api.ai5Workspace() : await api.ai5PublishedNarratives(),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [isAdmin]);
  async function act(id: string, fn: () => Promise<unknown>) {
    setWorking(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report action failed");
    } finally {
      setWorking("");
    }
  }
  const capture = () =>
    act("capture", async () => {
      await api.captureAi5Snapshot(crypto.randomUUID());
    });
  const generate = (snapshotId: string) =>
    act(snapshotId, async () => {
      const attempt = keys[snapshotId] || crypto.randomUUID();
      setKeys((current) => ({ ...current, [snapshotId]: attempt }));
      await api.generateAi5(snapshotId, attempt);
      setKeys((current) => {
        const next = { ...current };
        delete next[snapshotId];
        return next;
      });
    });
  return (
    <section aria-label="Reports">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {isAdmin && (
        <button className="button" disabled={!!working} onClick={capture}>
          Capture snapshot
        </button>
      )}
      {busy ? (
        <p role="status">Loading reports…</p>
      ) : rows.length === 0 ? (
        <p className="empty-state">
          {isAdmin ? "No snapshots." : "No published reports."}
        </p>
      ) : (
        rows.map(({ snapshot: s, narrative: n }) => (
          <article className="detail-section" key={s.snapshot_id}>
            <h2>
              Report · {new Date(s.period_start).toLocaleDateString()} –{" "}
              {new Date(s.period_end).toLocaleDateString()}
            </h2>
            <p>
              Captured {s.captured_at} · Calculation {s.calculation_version} ·
              Schema {s.schema_version}
            </p>
            <dl className="detail-facts">
              {Object.entries(s.facts).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {!isAdmin ? (
              <>
                <h3>Published narrative</h3>
                <p>{n?.current_text || n?.generated_text}</p>
              </>
            ) : (
              <>
                <p>Narrative: {n?.status ?? "None"}</p>
                {n && (
                  <>
                    <p>
                      Model: {n.model_id || "Not recorded"} · Created by{" "}
                      {n.created_by || "—"} {n.created_at || ""}
                    </p>
                    <p>
                      Editor {n.edited_by || "—"} {n.edited_at || ""} · Reviewer{" "}
                      {n.reviewed_by || "—"} {n.reviewed_at || ""} · Publisher{" "}
                      {n.published_by || "—"} {n.published_at || ""}
                    </p>
                    <p>Generated: {n.generated_text || "No generated text"}</p>
                    {n.status === "Draft" ? (
                      <>
                        <textarea
                          aria-label="Narrative draft"
                          value={drafts[n.narrative_id] ?? n.current_text ?? ""}
                          onChange={(e) =>
                            setDrafts({
                              ...drafts,
                              [n.narrative_id]: e.target.value,
                            })
                          }
                        />
                        <button
                          disabled={!!working}
                          onClick={() =>
                            act(n.narrative_id, () =>
                              api.editAi5Narrative(
                                n.narrative_id,
                                drafts[n.narrative_id] ?? n.current_text ?? "",
                              ),
                            )
                          }
                        >
                          Save edit
                        </button>
                        <button
                          disabled={!!working}
                          onClick={() =>
                            act(n.narrative_id, () =>
                              api.markAi5Ready(n.narrative_id),
                            )
                          }
                        >
                          Mark ready
                        </button>
                      </>
                    ) : (
                      <p>Current text: {n.current_text}</p>
                    )}
                    {n.status === "Ready" && (
                      <button
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
                    )}
                  </>
                )}
                {!n && (
                  <button
                    disabled={!!working}
                    onClick={() => generate(s.snapshot_id)}
                  >
                    {working === s.snapshot_id
                      ? "Generating…"
                      : "Generate summary"}
                  </button>
                )}
              </>
            )}
          </article>
        ))
      )}
      {isAdmin && (
        <p className="notice">
          Generated narratives are advisory summaries; snapshot facts remain
          authoritative. Generation is explicit and is never retried
          automatically.
        </p>
      )}
    </section>
  );
}
