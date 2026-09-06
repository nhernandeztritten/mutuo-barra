/**
 * es-ES formatting. Comma decimals, 24 h clock, tabular figures everywhere.
 * Pure: no DOM, no Dexie.
 */
import type { RecipeUnit } from '../data/types';

const LOCALE = 'es-ES';

function nf(min: number, max: number): Intl.NumberFormat {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max });
}

const MONEY = nf(2, 2);
const UP_TO_1 = nf(0, 1);
const UP_TO_2 = nf(0, 2);
const INT = nf(0, 0);

/** `1.5 → "1,50 €"`. Plain space before the sign, not a narrow no-break one. */
export function formatMoney(value: number): string {
  return `${MONEY.format(value)} €`;
}

/** Money without the sign, for table columns that carry it in the header. */
export function formatMoneyPlain(value: number): string {
  return MONEY.format(value);
}

/**
 * Quantity in recipe units, promoted to the stock unit when it is big enough.
 * `3250, 'g' → "3,25 kg"` · `17500, 'ml' → "17,5 L"` · `180, 'ud' → "180 ud"`.
 */
export function formatQty(qty: number, unit: RecipeUnit): string {
  if (unit === 'ud') return `${Number.isInteger(qty) ? INT.format(qty) : UP_TO_1.format(qty)} ud`;
  if (unit === 'g') {
    return Math.abs(qty) >= 1000 ? `${UP_TO_2.format(qty / 1000)} kg` : `${UP_TO_1.format(qty)} g`;
  }
  return Math.abs(qty) >= 1000 ? `${UP_TO_2.format(qty / 1000)} L` : `${UP_TO_1.format(qty)} ml`;
}

/** `47.3 → "47/h"`. Drinks per hour, always whole. */
export function formatRate(drinksPerHour: number): string {
  return `${INT.format(Math.round(drinksPerHour))}/h`;
}

/** `12.34 → "12,3 %"`. */
export function formatPct(value: number): string {
  return `${UP_TO_1.format(value)} %`;
}

/** Signed percentage, for deviations: `-4.2 → "−4,2 %"`. */
export function formatDeviation(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${UP_TO_1.format(Math.abs(value))} %`;
}

export function formatInt(value: number): string {
  return INT.format(value);
}

/** `1.2 → "1,2"`, for drinks per guest. */
export function formatDecimal(value: number, max = 2): string {
  return nf(0, max).format(value);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

const TIME = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DATE = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
const DATE_LONG = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

/** 24 h, `"18:30"`. */
export function formatTime(value: Date | string): string {
  return TIME.format(toDate(value));
}

/** `"12/09/2026"`. */
export function formatDate(value: Date | string): string {
  return DATE.format(toDate(value));
}

/** `"sábado, 12 de septiembre"`. */
export function formatDateLong(value: Date | string): string {
  return DATE_LONG.format(toDate(value));
}

export function formatDateTime(value: Date | string): string {
  const d = toDate(value);
  return `${DATE.format(d)} ${TIME.format(d)}`;
}

/** Elapsed time as `"4 h 35 min"`, for the real duration of an event. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${INT.format(m)} min`;
  if (m === 0) return `${INT.format(h)} h`;
  return `${INT.format(h)} h ${INT.format(m)} min`;
}
