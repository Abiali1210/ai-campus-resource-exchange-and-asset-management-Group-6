export function normalizeAi5EditText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function mapAi5Error(message: string): string {
  const match = message.match(
    /AI5_(TEXT_EMPTY|TEXT_TOO_LONG|UNSUPPORTED_NUMBER|INVALID_STATE|FORBIDDEN|NOT_FOUND)/,
  );
  const code = match?.[0];
  const messages: Record<string, string> = {
    AI5_TEXT_EMPTY: "Enter narrative text before saving.",
    AI5_TEXT_TOO_LONG: "Narrative text must be 600 characters or fewer.",
    AI5_UNSUPPORTED_NUMBER:
      "Numeric values must match the displayed snapshot facts.",
    AI5_INVALID_STATE:
      "This narrative is no longer editable in its current state.",
    AI5_FORBIDDEN:
      "Only an authorized business administrator can perform this action.",
    AI5_NOT_FOUND: "The requested narrative was not found.",
  };
  if (code === "AI5_UNSUPPORTED_NUMBER") {
    const token = message.match(/AI5_UNSUPPORTED_NUMBER:\s*([^\s]{1,32})/)?.[1];
    return token
      ? `Numeric value “${token}” must match the displayed snapshot facts.`
      : messages[code];
  }
  return code ? messages[code] : message;
}
