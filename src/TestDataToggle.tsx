import { hiddenTestRecordsLabel } from "./testData";

/** Shared "Show test data" checkbox with a muted note of how many records are hidden. */
export function TestDataToggle({
  checked,
  onChange,
  hidden,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  hidden: number;
}) {
  const note = checked ? "" : hiddenTestRecordsLabel(hidden);
  return (
    <span className="test-data-toggle">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />{" "}
        Show test data
      </label>
      {note && (
        <small className="muted" role="status">
          {note}
        </small>
      )}
    </span>
  );
}
