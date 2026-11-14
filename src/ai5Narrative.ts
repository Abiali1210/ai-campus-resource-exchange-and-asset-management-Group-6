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
  const match = text.match(
    /^Headline: ([^\n]+)\nDemand: ([^\n]+)\nTransfer activity: ([^\n]+)\nInterpretation: ([^\n]+)\nLimitation: ([^\n]+)$/,
  );
  return match
    ? {
        kind: "structured",
        headline: match[1],
        demand: match[2],
        transferActivity: match[3],
        interpretation: match[4],
        limitation: match[5],
      }
    : { kind: "plain", text };
}
