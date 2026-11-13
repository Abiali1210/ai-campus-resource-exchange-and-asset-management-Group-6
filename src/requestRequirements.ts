export type RequirementRow = { id: string; name: string; value: string };

export function serializeRequirements(
  rows: RequirementRow[],
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  const names = new Set<string>();

  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name && !value) continue;
    if (!name) throw new Error("Enter a name for each requirement.");
    if (!value) throw new Error(`Enter a value for “${name}”.`);

    const normalizedName = name.toLocaleLowerCase();
    if (names.has(normalizedName))
      throw new Error(`Requirement name “${name}” is duplicated.`);
    names.add(normalizedName);

    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
      const number = Number(value);
      if (Number.isFinite(number)) {
        Object.defineProperty(result, name, {
          value: number,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        continue;
      }
    }

    const lowered = value.toLowerCase();
    const converted =
      lowered === "true" ? true : lowered === "false" ? false : value;
    Object.defineProperty(result, name, {
      value: converted,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number")
    return new Intl.NumberFormat("en", {
      maximumSignificantDigits: 21,
    }).format(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return (
      value.map((item) => displayValue(item)).join(", ") || "Not specified"
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      entries
        .map(([key, item]) => `${humanize(key)}: ${displayValue(item)}`)
        .join("; ") || "Not specified"
    );
  }
  return String(value);
}

export function formatSpecifications(
  specifications: Record<string, unknown>,
): { label: string; value: string }[] {
  return Object.entries(specifications).map(([key, value]) => ({
    label: humanize(key),
    value: displayValue(value),
  }));
}
