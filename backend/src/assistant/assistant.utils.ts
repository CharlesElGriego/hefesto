import type { Vehicle } from '@hefesto/shared';

/**
 * Pure, deterministic guardrail logic for the assistant pipeline.
 * Kept free of I/O so it can be unit-tested exhaustively — these functions
 * are the safety net between the model's output and the database.
 */

/** Cheap language sniff for the deterministic (non-AI) replies. */
export function isSpanish(text: string): boolean {
  if (/[áéíóúñ¿¡]/i.test(text)) return true;
  return /\b(el|la|los|las|que|de|una?|mi|le|hoy|ayer|carro|coche|fue|en|cambie|cuanto|gaste|nuevo|nueva)\b/i.test(
    text,
  );
}

/**
 * Anti-fabrication: a numeric field from the model is only trusted if its
 * value literally appears in the user's current message. Thousands
 * separators are stripped first ("62.400 km" / "62,400 km" → 62400).
 */
export function verifiedNumber(
  value: number | null | undefined,
  text: string,
): number | undefined {
  if (value == null) return undefined;
  const normalized = text.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const numbers = (normalized.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) =>
    parseFloat(n.replace(',', '.')),
  );
  return numbers.includes(value) ? value : undefined;
}

/**
 * Dates from the model are never trusted blindly: invalid or future values
 * fall back to "now" (maintenance already happened).
 */
export function safeDate(input?: string | null, now = new Date()): Date {
  if (!input) return now;
  const date = new Date(input);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime()) || date > tomorrow) return now;
  return date;
}

/**
 * Resolves a free-text answer ("hilux", "the corolla", a plate) to exactly
 * one vehicle in the garage — or null when it's absent or ambiguous.
 */
export function matchVehicle(text: string, garage: Vehicle[]): Vehicle | null {
  const t = text.toLowerCase();
  const matches = garage.filter(
    (v) =>
      t.includes(v.model.toLowerCase()) ||
      (v.plate && t.includes(v.plate.toLowerCase())),
  );
  return matches.length === 1 ? matches[0] : null;
}
