export const illustrationLabels = {
  extinguisher: "Fire extinguisher",
  laptop: "Laptop",
  computer: "Desktop computer",
  printer: "Printer",
  keyboard: "Keyboard",
  mouse: "Computer mouse",
  desk: "Desk or table",
  cabinet: "Storage cabinet",
  bookshelf: "Bookshelf",
  book: "Book",
  microscope: "Microscope",
  tools: "Toolbox",
  whiteboard: "Whiteboard",
  trolley: "Trolley",
  chair: "Chair",
  projector: "Projector",
  monitor: "Monitor",
  generic: "Resource box",
} as const;

export type AssetIllustration = keyof typeof illustrationLabels;

const rules: [AssetIllustration, RegExp][] = [
  ["extinguisher", /\b(?:fire\s+)?extinguishers?\b/i],
  ["laptop", /\b(?:laptops?|notebook\s+computers?|macbooks?|chromebooks?)\b/i],
  [
    "computer",
    /\b(?:desktop(?:\s+computers?)?|computer\s+towers?|workstations?|system\s+units?)\b/i,
  ],
  ["printer", /\b(?:printers?|photocopiers?|copiers?)\b/i],
  ["keyboard", /\bkeyboards?\b/i],
  ["mouse", /\b(?:mouse|mice)\b/i],
  ["bookshelf", /\b(?:bookshel(?:f|ves)|bookcases?|shel(?:f|ves)|shelving)\b/i],
  ["cabinet", /\b(?:cabinets?|lockers?|cupboards?|drawers?)\b/i],
  ["desk", /\b(?:desks?|tables?|workbench(?:es)?)\b/i],
  ["book", /\b(?:books?|textbooks?|manuals?)\b/i],
  ["microscope", /\bmicroscopes?\b/i],
  ["tools", /\b(?:tool\s*(?:box(?:es)?|kits?|sets?)|tools?)\b/i],
  ["whiteboard", /\b(?:whiteboards?|white\s+boards?|noticeboards?)\b/i],
  ["trolley", /\b(?:trolleys?|carts?)\b/i],
  ["chair", /\b(?:chairs?|stools?|seating)\b/i],
  ["projector", /\bprojectors?\b/i],
  ["monitor", /\b(?:monitors?|displays?|screens?)\b/i],
];

/** Prefer the specific item name to a broad or mistaken category. Unknowns stay neutral. */
export function assetIllustration(
  name: string,
  category: string,
): AssetIllustration {
  for (const text of [name, category]) {
    const match = rules.find(([, pattern]) => pattern.test(text));
    if (match) return match[0];
  }
  return "generic";
}
