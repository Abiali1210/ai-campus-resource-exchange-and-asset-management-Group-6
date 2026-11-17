import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import {
  REQUEST_COLUMNS,
  TRANSFER_COLUMNS,
  csvFileName,
  downloadCsv,
  toCsv,
  type Column,
} from "./c9Report";
import type { C9ActivityReport, Department } from "./types";

// Local calendar date (the server validates against Asia/Dubai).
const iso = (offsetDays: number) => {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function ReportTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  onExport,
}: {
  caption: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onExport: () => void;
}) {
  return (
    <section className="workflow-card" aria-label={caption}>
      <div className="activity-table-head">
        <h3>
          {caption} <span className="muted">({rows.length})</span>
        </h3>
        <button
          className="button secondary small"
          onClick={onExport}
          disabled={!rows.length}
        >
          Export CSV
        </button>
      </div>
      {rows.length ? (
        <div className="activity-table-scroll">
          <table className="activity-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.header} scope="col">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((c) => (
                    <td key={c.header}>{c.value(row) ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No {caption.toLowerCase()} in this period.</p>
      )}
    </section>
  );
}

// C9: table of requests and transfers with CSV export. Rows are scoped on the
// server to what the signed-in user may already see in Requests and transfers.
export function ActivityReportPanel({
  departments,
}: {
  departments: Department[];
}) {
  const [start, setStart] = useState(iso(30)),
    [end, setEnd] = useState(iso(0)),
    [department, setDepartment] = useState(""),
    [data, setData] = useState<C9ActivityReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      setData(await api.activityReport(start, end, department || null));
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error ? err.message : "Could not load the report.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    // Load once with the default period; later loads are explicit.
  }, []);
  function submit(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="activity-report">
      <section className="workflow-card" aria-label="Report filters">
        <form className="report-controls" onSubmit={submit}>
          <label className="workflow-field">
            From
            <input
              type="date"
              value={start}
              max={end}
              required
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="workflow-field">
            To
            <input
              type="date"
              value={end}
              min={start}
              max={iso(0)}
              required
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="workflow-field">
            Department
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button small" disabled={busy}>
            {busy ? "Loading…" : "Show report"}
          </button>
        </form>
        {data && (
          <p className="muted">
            {data.scope.departmentName}, {data.period.start} to{" "}
            {data.period.end}. {data.basis}.{" "}
            {data.scope.visibility === "institution"
              ? "Showing all departments' records."
              : "Showing only records you can access."}{" "}
            Costs are not included.
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </section>
      {data && (
        <>
          <ReportTable
            caption="Requests"
            rows={data.requests}
            columns={REQUEST_COLUMNS}
            rowKey={(r) => r.requestId}
            onExport={() =>
              downloadCsv(
                csvFileName("requests", data.period.start, data.period.end),
                toCsv(data.requests, REQUEST_COLUMNS),
              )
            }
          />
          <ReportTable
            caption="Transfers"
            rows={data.transfers}
            columns={TRANSFER_COLUMNS}
            rowKey={(t) => t.transferId}
            onExport={() =>
              downloadCsv(
                csvFileName("transfers", data.period.start, data.period.end),
                toCsv(data.transfers, TRANSFER_COLUMNS),
              )
            }
          />
        </>
      )}
    </div>
  );
}
