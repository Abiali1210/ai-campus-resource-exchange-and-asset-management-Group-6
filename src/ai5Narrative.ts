export type Ai5Narrative =
  | {
      kind: "structured";
      headline: string;
      demand: string;
      transferActivity: string;
      interpretation: string;
      limitation: string;
    }
  | { kind: "plain"; text: string };

export function parseAi5Narrative(text: string): Ai5Narrative {
  const values = new Map<string, string>();
  const labels: Record<string, string> = {
    Headline: "headline",
    Demand: "demand",
    "Transfer activity": "transferActivity",
    Interpretation: "interpretation",
    Limitation: "limitation",
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.match(
      /^(Headline|Demand|Transfer activity|Interpretation|Limitation):\s*(.+)$/,
    );
    if (!match || values.has(labels[match[1]])) return { kind: "plain", text };
    values.set(labels[match[1]], match[2]);
  }
  if (values.size !== 5) return { kind: "plain", text };
  return {
    kind: "structured",
    headline: values.get("headline")!,
    demand: values.get("demand")!,
    transferActivity: values.get("transferActivity")!,
    interpretation: values.get("interpretation")!,
    limitation: values.get("limitation")!,
  };
}
