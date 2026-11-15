type DateOptions = { locale?: string; timeZone?: string };

function formatDate(
  input: string,
  options: DateOptions,
  withTime: boolean,
): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  try {
    return new Intl.DateTimeFormat(options.locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
  } catch {
    return input;
  }
}

export const formatAi5PeriodDate = (input: string, options: DateOptions = {}) =>
  formatDate(input, options, false);

export const formatAi5Timestamp = (input: string, options: DateOptions = {}) =>
  formatDate(input, options, true);
