export type SpecificationRow = [
  string,
  string,
  { value: unknown; text: string }?,
];

export function specificationRows(
  values: Record<string, unknown>,
): SpecificationRow[] {
  return Object.entries(values).map(([key, value]) => {
    const text =
      typeof value === "string" ? value : (JSON.stringify(value) ?? "");
    return [key, text, { value, text }];
  });
}

export function serializeSpecifications(
  rows: SpecificationRow[],
): Record<string, unknown> {
  const usable = rows.filter(([key, value]) => key.trim() || value.trim());
  if (usable.some(([key, value]) => !key.trim() || !value.trim()))
    throw new Error("Each specification needs both a name and a value.");
  if (
    new Set(usable.map(([key]) => key.trim().toLowerCase())).size !==
    usable.length
  )
    throw new Error("Use each specification name only once.");
  return Object.fromEntries(
    usable.map(([key, text, original]) => {
      if (original && text === original.text)
        return [key.trim(), original.value];
      if (original && typeof original.value !== "string") {
        try {
          const value = JSON.parse(text, (_key, value: unknown) => {
            if (typeof value === "number" && !Number.isFinite(value))
              throw new Error("Non-finite number");
            return value;
          });
          return [key.trim(), value];
        } catch {
          throw new Error(
            `Use valid JSON for the non-text specification "${key.trim()}".`,
          );
        }
      }
      return [key.trim(), text.trim()];
    }),
  );
}
