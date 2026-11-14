const units: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const tens: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const numberWord =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|and)";
const metricContext = String.raw`(?:requests?|open\s+requests?|completed\s+transfers?|transfers?|units?(?:\s+successfully\s+transferred)?)`;
const candidate = new RegExp(
  String.raw`(?<![\p{L}\p{N}_-])(${numberWord}(?:[\s-]+${numberWord})*)(?=\s+${metricContext}\b)`,
  "giu",
);

function parsePhrase(phrase: string): number | undefined {
  const words = phrase.toLowerCase().split(/[\s-]+/);
  let index = 0;
  let total = 0;

  if (words[index] === "zero") return words.length === 1 ? 0 : undefined;
  if (words[index] === "and" || words[index] === "hundred") return undefined;

  if (words[index + 1] === "hundred") {
    const digit = units[words[index]];
    if (digit === undefined || digit < 1 || digit > 9) return undefined;
    total = digit * 100;
    index += 2;
    if (index === words.length) return total;
    if (words[index] === "and") index += 1;
    if (index === words.length) return undefined;
  }

  const rest = words.slice(index);
  if (rest.length === 1) {
    const value = units[rest[0]] ?? tens[rest[0]];
    return value === undefined ? undefined : total + value;
  }
  if (rest.length === 2 && tens[rest[0]] !== undefined) {
    const unit = units[rest[1]];
    if (unit !== undefined && unit >= 1 && unit <= 9) {
      return total + tens[rest[0]] + unit;
    }
  }
  return undefined;
}

export type NumberWordNormalization = { text: string; normalized: boolean };

/** Converts complete number-word phrases only when their value is in the supplied facts. */
export function normalizeAi5NumberWords(
  text: string,
  facts: Iterable<number> | number,
  ...additionalFacts: number[]
): NumberWordNormalization {
  const allowed =
    typeof facts === "number" ? [facts, ...additionalFacts] : [...facts];
  let normalized = false;
  const result = text.replace(
    candidate,
    (phrase: string, _capture: string, offset: number) => {
      if (/minus\s+$/i.test(text.slice(0, offset))) return phrase;
      const value = parsePhrase(phrase);
      const followingMetric = text
        .slice(offset + phrase.length)
        .match(/^\s+([\p{L}]+(?:\s+[\p{L}]+)*)/u)?.[1]
        .toLowerCase();
      const singular =
        /^(?:request|open request|completed transfer|transfer|unit)(?: successfully transferred)?$/;
      if (
        value === undefined ||
        !allowed.includes(value) ||
        (value === 1) !== singular.test(followingMetric || "")
      )
        return phrase;
      normalized = true;
      return String(value);
    },
  );
  return { text: result, normalized };
}
