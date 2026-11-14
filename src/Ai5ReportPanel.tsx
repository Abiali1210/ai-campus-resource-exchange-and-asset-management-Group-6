import { useEffect, useState } from "react";
import { api } from "./api";
import type { Ai5Snapshot } from "./types";

export function Ai5ReportPanel() {
  const [rows, setRows] = useState<Ai5Snapshot[]>([]),
    [busy, setBusy] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    try {
      setRows(await api.ai5Snapshots());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function capture() {
    setWorking(true);
    setError("");
    try {
      await api.captureAi5Snapshot(crypto.randomUUID());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setWorking(false);
    }
  }
  return (
    <section aria-label="Deterministic reports">
      <div className="notice">
        Deterministic report · No AI-generated content
      </div>
      <button className="button" disabled={working} onClick={capture}>
        {working ? "Capturing…" : "Capture all-time snapshot"}
      </button>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status">Loading snapshots…</p>
      ) : rows.length === 0 ? (
        <p className="empty-state">No report snapshots yet.</p>
      ) : (
        rows.map((r) => (
          <article className="detail-section" key={r.snapshot_id}>
            <h2>All-time through {new Date(r.period_end).toLocaleString()}</h2>
            <p>
              Period start: {new Date(r.period_start).toLocaleString()} ·
              Captured: {new Date(r.captured_at).toLocaleString()}
            </p>
            <p>
              Calculation {r.calculation_version} · Schema {r.schema_version}
            </p>
            <dl className="detail-facts">
              {Object.entries(r.facts).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))
      )}
    </section>
  );
}
