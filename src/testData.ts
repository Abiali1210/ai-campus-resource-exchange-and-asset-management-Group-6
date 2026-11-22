// UI-only filter for test records on the shared hosted data. Records whose
// name starts with one of these technical prefixes are hidden by default; the
// data itself is never changed. "Show test data" brings them back.

export const TEST_RECORD_PREFIXES = [
  "[Part 2 fixture",
  "LIVE-TEST-",
  "QA-2026-",
] as const;

const LOWER_PREFIXES = TEST_RECORD_PREFIXES.map((p) => p.toLowerCase());

/** True when the trimmed text starts with a test prefix (case-insensitive). */
export function isTestRecordName(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  const value = text.trim().toLowerCase();
  if (!value) return false;
  return LOWER_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Keeps rows that are not test records. Rows for which `keep` returns true
 * (e.g. the record the user currently has open) are always kept.
 */
export function withoutTestRecords<T>(
  rows: readonly T[],
  names: (row: T) => readonly (string | null | undefined)[],
  keep: (row: T) => boolean = () => false,
): T[] {
  return rows.filter(
    (row) => keep(row) || !names(row).some((name) => isTestRecordName(name)),
  );
}

/** Applies the filter only when test data is hidden; reports how many were hidden. */
export function visibleRecords<T>(
  rows: readonly T[],
  showTestData: boolean,
  names: (row: T) => readonly (string | null | undefined)[],
  keep?: (row: T) => boolean,
): { rows: T[]; hidden: number } {
  if (showTestData) return { rows: [...rows], hidden: 0 };
  const kept = withoutTestRecords(rows, names, keep);
  return { rows: kept, hidden: rows.length - kept.length };
}

export const SHOW_TEST_DATA_KEY = "circular-campus:show-test-data";

export function loadShowTestData(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHOW_TEST_DATA_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveShowTestData(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(SHOW_TEST_DATA_KEY, String(value));
  } catch {
    // Storage may be unavailable (private mode, blocked); the toggle still works for this session.
  }
}

/** Short muted note, e.g. "3 test records hidden". Empty when nothing is hidden. */
export function hiddenTestRecordsLabel(hidden: number): string {
  if (hidden <= 0) return "";
  return `${hidden} test record${hidden === 1 ? "" : "s"} hidden`;
}
