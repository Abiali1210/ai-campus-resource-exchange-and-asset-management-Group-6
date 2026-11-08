export type JsonObject = Record<string, unknown>;
export const ROLE_KEYS = ['requester', 'representative', 'business_administrator', 'maintenance', 'facilities', 'procurement', 'finance', 'sustainability', 'system_administrator'] as const;

export class GatewayError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GatewayError('Validation', 'Expected an object.');
  return value as JsonObject;
}

export function text(value: unknown, label: string, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new GatewayError('Validation', `${label} is required and must be at most ${max} characters.`);
  return value.trim();
}

export function uuid(value: unknown, label = 'Identifier'): string {
  const result = text(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new GatewayError('Validation', `${label} must be a UUID.`);
  return result;
}

export function stringList(value: unknown, label: string, maxItems = 20): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new GatewayError('Validation', `Invalid ${label}.`);
  return [...new Set(value.map(item => text(item, label, 500)))];
}

export async function boundedBytes(response: Response, max: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length') ?? 0) > max) throw new GatewayError('Validation', 'Content exceeds the size limit.');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new GatewayError('Validation', 'Content exceeds the size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
