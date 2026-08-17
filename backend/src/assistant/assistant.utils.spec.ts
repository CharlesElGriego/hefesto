import type { Vehicle } from '@hefesto/shared';
import {
  isSpanish,
  matchVehicle,
  safeDate,
  verifiedNumber,
} from './assistant.utils';

describe('verifiedNumber (anti-fabrication net)', () => {
  it('accepts a number that appears verbatim in the message', () => {
    expect(verifiedNumber(45, 'changed the oil, $45')).toBe(45);
  });

  it('accepts numbers written with dot thousands separators (es-VE style)', () => {
    expect(verifiedNumber(62400, 'iba por 62.400 km')).toBe(62400);
  });

  it('accepts numbers written with comma thousands separators (en-US style)', () => {
    expect(verifiedNumber(62400, 'at 62,400 km')).toBe(62400);
  });

  it('accepts decimal costs', () => {
    expect(verifiedNumber(45.5, 'me costó $45.50')).toBe(45.5);
  });

  it('REJECTS a number the user never wrote (carried over from history)', () => {
    // The real bug: "cambié las bujías, $60" logged with 32,000 km from context.
    expect(
      verifiedNumber(32000, 'cambié las bujías, me costó $60'),
    ).toBeUndefined();
  });

  it('rejects when the message has no numbers at all', () => {
    expect(verifiedNumber(400, 'hilux')).toBeUndefined();
  });

  it('passes through null/undefined untouched', () => {
    expect(verifiedNumber(null, 'anything')).toBeUndefined();
    expect(verifiedNumber(undefined, 'anything')).toBeUndefined();
  });

  it('never matches partial digits inside another number', () => {
    // "$45" must verify 45 only — not 4, not 5.
    expect(verifiedNumber(5, 'me costó $45')).toBeUndefined();
    expect(verifiedNumber(4, 'me costó $45')).toBeUndefined();
  });

  it('accepts comma-decimal costs (es-VE style)', () => {
    expect(verifiedNumber(45.5, 'me costó 45,50')).toBe(45.5);
  });
});

describe('safeDate (date guard)', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  it('keeps valid past dates', () => {
    expect(safeDate('2026-08-14', now).toISOString().slice(0, 10)).toBe(
      '2026-08-14',
    );
  });

  it('falls back to now for garbage input', () => {
    expect(safeDate('banana', now)).toBe(now);
  });

  it('falls back to now for future dates', () => {
    expect(safeDate('2030-01-01', now)).toBe(now);
  });

  it('falls back to now when missing', () => {
    expect(safeDate(undefined, now)).toBe(now);
    expect(safeDate(null, now)).toBe(now);
  });

  it('keeps same-day dates (24h grace absorbs timezone offsets)', () => {
    expect(safeDate('2026-08-15', now).toISOString().slice(0, 10)).toBe(
      '2026-08-15',
    );
  });
});

describe('isSpanish (language sniff for deterministic replies)', () => {
  it('detects Spanish by accents and punctuation', () => {
    expect(isSpanish('cambié el aceite')).toBe(true);
    expect(isSpanish('¿cuánto he gastado?')).toBe(true);
  });

  it('detects Spanish by common stopwords without accents', () => {
    expect(isSpanish('le puse frenos nuevos al carro')).toBe(true);
  });

  it('treats plain English as not Spanish', () => {
    expect(isSpanish('changed the oil filter, twenty bucks')).toBe(false);
  });
});

describe('matchVehicle (which-car answer resolver)', () => {
  const garage: Vehicle[] = [
    {
      id: 'a',
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
      currentMileage: 63500,
      createdAt: '',
    },
    {
      id: 'b',
      make: 'Toyota',
      model: 'Hilux',
      year: 2021,
      plate: 'ABC-123',
      currentMileage: 32000,
      createdAt: '',
    },
  ];

  it('matches by model name, case-insensitive', () => {
    expect(matchVehicle('hilux', garage)?.id).toBe('b');
    expect(matchVehicle('en la Corolla', garage)?.id).toBe('a');
  });

  it('matches by plate', () => {
    expect(matchVehicle('el abc-123', garage)?.id).toBe('b');
  });

  it('returns null when no vehicle is named', () => {
    expect(matchVehicle('no sé', garage)).toBeNull();
  });

  it('returns null when the answer is ambiguous (names both)', () => {
    expect(matchVehicle('la corolla o la hilux', garage)).toBeNull();
  });

  it('does not resolve by make alone when two cars share it (re-asks)', () => {
    // Both are Toyotas: "la toyota" must not guess — null → the backend asks.
    expect(matchVehicle('la toyota', garage)).toBeNull();
  });
});
